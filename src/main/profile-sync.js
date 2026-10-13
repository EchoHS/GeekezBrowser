const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { normalizePasskeyStore } = require('./passkeys');
const { WebDavSync } = require('./webdav-sync');
const { syncError, contentHash, portableProfile, portablePasswords, portableSettings, validateRecord, validId, MAX_BYTES } = require('./sync-format');

function bookmarkTree(document) {
    let count = 0;
    const visit = (node, depth = 0, position = '') => {
        if (depth > 64 || ++count > 50000 || !node || !['url', 'folder'].includes(node.type) || typeof node.name !== 'string') throw syncError('syncInvalidData');
        const identity = String(node.guid || node.id || position);
        const hex = crypto.createHash('sha256').update(identity).digest('hex');
        const id = /^[a-f0-9-]{36}$/i.test(identity) ? identity : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
        const value = { id, type: node.type, name: node.name };
        if (node.type === 'url') {
            if (typeof node.url !== 'string') throw syncError('syncInvalidData');
            value.url = node.url;
        } else {
            if (!Array.isArray(node.children)) throw syncError('syncInvalidData');
            value.children = node.children.map((child, index) => visit(child, depth + 1, `${position}/${index}`));
        }
        return value;
    };
    return Object.fromEntries(['bookmark_bar', 'other', 'synced'].map(key => [key, document.roots[key].children.map((node, index) => visit(node, 0, `${key}/${index}`))]));
}

function restoreBookmarks(tree, normalizeBookmarksDocument) {
    const document = normalizeBookmarksDocument({});
    let nextId = 3, count = 0;
    const visit = (node, depth = 0) => {
        if (depth > 64 || ++count > 50000 || !node || !['url', 'folder'].includes(node.type) || typeof node.name !== 'string') throw syncError('syncInvalidData');
        const result = {
            id: String(++nextId), guid: /^[a-f0-9-]{36}$/i.test(node.id) ? node.id : crypto.randomUUID(),
            type: node.type, name: node.name, date_added: String((Date.now() + 11644473600000) * 1000)
        };
        if (node.type === 'url') {
            if (typeof node.url !== 'string' || node.url.length > 65536) throw syncError('syncInvalidData');
            try { new URL(node.url); } catch { throw syncError('syncInvalidData'); }
            result.url = node.url;
        } else {
            if (!Array.isArray(node.children)) throw syncError('syncInvalidData');
            result.children = node.children.map(child => visit(child, depth + 1));
        }
        return result;
    };
    for (const key of ['bookmark_bar', 'other', 'synced']) {
        if (!Array.isArray(tree[key])) throw syncError('syncInvalidData');
        document.roots[key].children = tree[key].map(node => visit(node));
    }
    document.checksum = '';
    return document;
}

function createProfileSync({ app, safeStorage, ipcMain, dialog, paths, helpers, broadcast, fetchImpl }) {
    const { DATA_PATH, PROFILES_FILE, SETTINGS_FILE, DEFAULT_PASSWORDS_FILE } = paths;
    const {
        runProfileApiTask, readEncryptedPasswords, readDefaultPasswordSettings, normalizeDefaultPasswords, readPasskeyStore,
        normalizeSettingsSnapshot, normalizeBookmarksDocument, buildProfileFromInput, encryptData,
        commitProfileFiles, profileResourceWrites, busyProfileIds, notifyUIRefresh, onSettingsApplied = () => {}
    } = helpers;
    const readJson = async (file, fallback) => await fs.pathExists(file) ? fs.readJson(file) : fallback;

    async function readSnapshot() {
        const profiles = await readJson(PROFILES_FILE, []);
        const ids = busyProfileIds();
        const reserved = profiles.filter(profile => !ids.includes(profile.id) && !profileResourceWrites.has(profile.id)).map(profile => profile.id);
        reserved.forEach(id => profileResourceWrites.add(id));
        try {
            const settings = normalizeSettingsSnapshot(await readJson(SETTINGS_FILE, {}));
            const defaults = await readDefaultPasswordSettings({ strict: true });
            const records = {};
            const busy = ids.map(id => `profile:${id}`);
            if (ids.length) busy.push('settings');
            records.settings = {
                version: 1, kind: 'settings', settings: portableSettings({
                    preProxies: [], subscriptions: [], mode: 'single', selectedId: null,
                    enableUaWebglModify: false, enableRemoteDebugging: false, enableCustomArgs: false, closeBehavior: 'tray',
                    lang: 'auto', theme: 'geek', watermarkStyle: 'enhanced', ...settings
                }, defaults.passwords)
            };
            for (const profile of profiles) {
                if (!validId(profile.id)) throw syncError('syncInvalidData');
                if (ids.includes(profile.id)) continue;
                const directory = path.join(DATA_PATH, profile.id);
                const passwords = await readEncryptedPasswords(path.join(directory, 'passwords.json'), profile.id, { strict: true });
                const passkeys = await fs.pathExists(path.join(directory, 'passkeys.json'))
                    ? await readPasskeyStore(profile.id) : null;
                const file = path.join(directory, 'browser_data', 'Default', 'Bookmarks');
                const bookmarks = await fs.pathExists(file)
                    ? normalizeBookmarksDocument(await fs.readJson(file), { strict: true }) : normalizeBookmarksDocument({});
                records[`profile:${profile.id}`] = {
                    version: passkeys ? 2 : 1, kind: 'profile', profile: portableProfile(profile),
                    passwords: portablePasswords(passwords), bookmarks: bookmarkTree(bookmarks),
                    ...(passkeys ? { passkeys: normalizePasskeyStore(passkeys) } : {})
                };
            }
            for (const [key, record] of Object.entries(records)) {
                try { validateRecord(record, key); }
                catch (error) {
                    if (error.code === 'syncInvalidData') throw syncError('syncLocalInvalidData', error.detail);
                    throw error;
                }
            }
            return { records, busy };
        } finally { reserved.forEach(id => profileResourceWrites.delete(id)); }
    }

    async function applyRecords(changes) {
        return runProfileApiTask(async () => {
            if (!changes.length) return;
            const busy = busyProfileIds();
            if (changes.some(entry => entry.key === 'settings' ? busy.length : busy.includes(entry.key.slice(8)))) throw syncError('syncProfilesBusy');
            const reserved = changes.filter(entry => entry.key !== 'settings').map(entry => entry.key.slice(8));
            if (changes.some(entry => entry.key === 'settings')) {
                const profiles = await readJson(PROFILES_FILE, []);
                if (busyProfileIds().length) throw syncError('syncProfilesBusy');
                reserved.push(...profiles.map(profile => profile.id));
            }
            reserved.forEach(id => profileResourceWrites.add(id));
            try {
                const current = await readSnapshot();
                for (const entry of changes) {
                    validateRecord(entry.record, entry.key);
                    if (current.busy.includes(entry.key)) throw syncError('syncProfilesBusy');
                    const currentHash = current.records[entry.key] ? contentHash(current.records[entry.key]) : null;
                    if (currentHash !== entry.expectedHash) throw syncError('syncPlanExpired');
                }
                const files = [];
                const profiles = await readJson(PROFILES_FILE, []);
                const settings = normalizeSettingsSnapshot(await readJson(SETTINGS_FILE, {}));
                let settingsUpdate = null;
                for (const { record, key } of changes) {
                    if (key === 'settings') {
                        const defaults = normalizeDefaultPasswords(record.settings.defaultPasswords);
                        const portable = portableSettings(record.settings, defaults);
                        delete portable.defaultPasswords;
                        settingsUpdate = normalizeSettingsSnapshot({ ...settings, ...portable });
                        files.push({ file: SETTINGS_FILE, data: Buffer.from(JSON.stringify(settingsUpdate)) });
                        files.push({ file: DEFAULT_PASSWORDS_FILE, data: encryptData(Buffer.from(JSON.stringify({ version: 1, passwords: defaults, scope: settingsUpdate.defaultPasswordScope })), 'GeekEZ_PW_defaults') });
                        continue;
                    }
                    const input = portableProfile(record.profile);
                    const at = profiles.findIndex(entry => entry.id === input.id);
                    const previous = at < 0 ? null : profiles[at];
                    const profile = await buildProfileFromInput({ ...input.fingerprint, ...input }, profiles.filter(entry => entry.id !== input.id), settings, previous);
                    profile.id = input.id;
                    profile.createdAt = input.createdAt || profile.createdAt;
                    profile.defaultBookmarksAppliedAt = previous?.defaultBookmarksAppliedAt || Date.now();
                    profile.defaultPasswordsAppliedAt = previous?.defaultPasswordsAppliedAt || Date.now();
                    if (at < 0) profiles.push(profile); else profiles[at] = profile;
                    const passwords = portablePasswords(record.passwords);
                    const directory = path.join(DATA_PATH, profile.id);
                    if (record.version === 2) {
                        const passkeys = normalizePasskeyStore(record.passkeys);
                        const existing = current.records[key]?.passkeys?.credentials || [];
                        for (const credential of passkeys.credentials) {
                            const previous = existing.find(entry => entry.credentialId === credential.credentialId);
                            if (previous) {
                                if (previous.privateKey !== credential.privateKey || previous.rpId !== credential.rpId) {
                                    throw syncError('syncInvalidData', `profile:${profile.id}.passkeys`);
                                }
                                credential.signCount = Math.max(credential.signCount, previous.signCount);
                            }
                        }
                        files.push({ file: path.join(directory, 'passkeys.json'), data: encryptData(Buffer.from(JSON.stringify(passkeys)), 'GeekEZ_PK_' + profile.id) });
                    } else if (await fs.pathExists(path.join(directory, 'passkeys.json'))) {
                        throw syncError('syncInvalidData', `profile:${profile.id}.passkeys: older snapshot cannot replace a Passkey-enabled environment`);
                    }
                    files.push({ file: path.join(directory, 'passwords.json'), data: encryptData(Buffer.from(JSON.stringify(passwords)), 'GeekEZ_PW_' + profile.id) });
                    files.push({ file: path.join(directory, 'passwords-sync-state.json'), data: Buffer.from(JSON.stringify({ revision: crypto.randomUUID() })) });
                    files.push({ file: path.join(directory, 'browser_data', 'Default', 'Bookmarks'), data: Buffer.from(JSON.stringify(restoreBookmarks(record.bookmarks, normalizeBookmarksDocument))) });
                }
                if (changes.some(entry => entry.key !== 'settings')) files.push({ file: PROFILES_FILE, data: Buffer.from(JSON.stringify(profiles)) });
                await commitProfileFiles(files);
                if (settingsUpdate) {
                    onSettingsApplied(settingsUpdate);
                    broadcast('sync-settings-applied', { theme: settingsUpdate.theme, lang: settingsUpdate.lang });
                }
                notifyUIRefresh();
            } finally { reserved.forEach(id => profileResourceWrites.delete(id)); }
        });
    }

    const sync = new WebDavSync({
        directory: path.join(app.getPath('userData'), 'config-sync', contentHash(DATA_PATH).slice(0, 16)),
        safeStorage, readSnapshot: () => runProfileApiTask(readSnapshot), applyRecords,
        notify: status => broadcast('config-sync-status', status), fetchImpl
    });
    const register = (name, handler) => ipcMain.handle(name, async (event, input) => {
        try { return { success: true, data: await handler(input || {}) }; }
        catch (error) { return { success: false, error: error.code?.startsWith('sync') ? error.code : 'syncLocalError', detail: error.detail || '' }; }
    });
    register('config-sync-status', () => sync.getStatus());
    register('config-sync-save', input => sync.saveConfig(input));
    register('config-sync-disconnect', () => sync.disconnect());
    register('config-sync-cancel', input => sync.cancelPreview(input.id));
    register('config-sync-test', () => sync.test());
    register('config-sync-preview', () => sync.preview());
    register('config-sync-apply', input => sync.sync(input.id, input.choices));
    register('config-sync-history', () => sync.history());
    register('config-sync-restore', input => sync.restore(input.version));
    register('config-sync-export', async input => {
        const { filePath } = await dialog.showSaveDialog({ defaultPath: `GeekEZ_Config_${Date.now()}.gksync`, filters: [{ name: 'GeekEZ encrypted configuration', extensions: ['gksync'] }] });
        if (!filePath) return { cancelled: true };
        const buffer = await sync.exportFile(input.passphrase);
        await fs.writeFile(filePath, buffer, { mode: 0o600 });
        return { path: filePath };
    });
    register('config-sync-import-preview', async input => {
        const { filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'GeekEZ encrypted configuration', extensions: ['gksync'] }] });
        if (!filePaths?.length) return { cancelled: true };
        if ((await fs.stat(filePaths[0])).size > MAX_BYTES) throw syncError('syncTooLarge');
        return sync.previewImport(await fs.readFile(filePaths[0]), input.passphrase);
    });
    register('config-sync-import-apply', input => sync.importFile(input.id, input.choices));
    return sync;
}

module.exports = { createProfileSync, bookmarkTree, restoreBookmarks };
