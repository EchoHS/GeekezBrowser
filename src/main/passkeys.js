const crypto = require('crypto');

const CREDENTIAL_FIELDS = ['credentialId', 'isResidentCredential', 'rpId', 'privateKey', 'userHandle', 'signCount', 'largeBlob', 'backupEligibility', 'backupState', 'userName', 'userDisplayName'];
const AUTHENTICATOR_OPTIONS = {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, hasLargeBlob: true,
    automaticPresenceSimulation: false, isUserVerified: false,
    defaultBackupEligibility: true, defaultBackupState: false
};

function missingAuthenticator(failure) {
    return /Virtual Authenticator Environment has not been enabled|[Aa]uthenticator.*(?:not found|does not exist)|Invalid authenticatorId/.test(failure.message);
}

function invalidPasskey() {
    return new Error('Passkey 数据无效，未覆盖已有凭据');
}

function decodeBase64(value, maxBytes, allowEmpty = false) {
    if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw invalidPasskey();
    const bytes = Buffer.from(value, 'base64');
    if ((!allowEmpty && !bytes.length) || bytes.length > maxBytes || bytes.toString('base64') !== value) throw invalidPasskey();
    return bytes;
}

function normalizePasskeys(credentials) {
    if (!Array.isArray(credentials) || credentials.length > 1000) throw invalidPasskey();
    const ids = new Set();
    return credentials.map(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalidPasskey();
        decodeBase64(entry.credentialId, 1024);
        if (ids.has(entry.credentialId)) throw invalidPasskey();
        ids.add(entry.credentialId);
        if (typeof entry.rpId !== 'string' || !entry.rpId || entry.rpId.length > 253) throw invalidPasskey();
        let host;
        try { host = new URL('https://' + entry.rpId).hostname; } catch { throw invalidPasskey(); }
        if (host !== entry.rpId || /[\s/:@?#]/.test(entry.rpId)) throw invalidPasskey();
        if (typeof entry.isResidentCredential !== 'boolean' || !Number.isInteger(entry.signCount) ||
            entry.signCount < 0 || entry.signCount > 0xffffffff) throw invalidPasskey();
        try {
            const key = crypto.createPrivateKey({ key: decodeBase64(entry.privateKey, 4096), type: 'pkcs8', format: 'der' });
            if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw invalidPasskey();
        } catch { throw invalidPasskey(); }
        if (entry.userHandle !== undefined) decodeBase64(entry.userHandle, 64, true);
        if (entry.isResidentCredential && !entry.userHandle) throw invalidPasskey();
        if (entry.largeBlob !== undefined) decodeBase64(entry.largeBlob, 16384, true);
        for (const key of ['backupEligibility', 'backupState']) {
            if (entry[key] !== undefined && typeof entry[key] !== 'boolean') throw invalidPasskey();
        }
        if (entry.backupState && !entry.backupEligibility) throw invalidPasskey();
        for (const key of ['userName', 'userDisplayName']) {
            if (entry[key] !== undefined && (typeof entry[key] !== 'string' || entry[key].length > 1024)) throw invalidPasskey();
        }
        return Object.fromEntries(CREDENTIAL_FIELDS.filter(key => entry[key] !== undefined).map(key => [key, entry[key]]));
    }).sort((first, second) => first.credentialId < second.credentialId ? -1 : first.credentialId > second.credentialId ? 1 : 0);
}

function normalizePasskeyStore(value) {
    if (!value || value.version !== 1 || typeof value.enabled !== 'boolean') throw invalidPasskey();
    return { version: 1, enabled: value.enabled, credentials: normalizePasskeys(value.credentials) };
}

function publicCredential(entry) {
    return {
        credentialId: entry.credentialId, rpId: entry.rpId, userName: entry.userName || '',
        userDisplayName: entry.userDisplayName || '', signCount: entry.signCount,
        isResidentCredential: entry.isResidentCredential
    };
}

function eligiblePage(page) {
    try {
        const url = new URL(page.url());
        return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    } catch { return false; }
}

async function createPasskeyManager({ browser, readStore, writeStore, confirm, onChange = () => {} }) {
    let store = normalizePasskeyStore(await readStore());
    let queue = Promise.resolve();
    let error = '';
    let closing = false;
    let confirming = false;
    let pendingStore = null;
    const states = new Map();
    const attaching = new Map();
    const pageIds = new WeakMap();
    const task = operation => {
        const result = queue.then(operation);
        queue = result.catch(() => {});
        return result;
    };
    const persist = async next => {
        const normalized = normalizePasskeyStore(next);
        pendingStore = normalized;
        await writeStore(normalized);
        store = normalized;
        pendingStore = null;
        onChange();
    };
    const revoke = async state => {
        clearTimeout(state.timer);
        state.timer = null;
        state.authorizedUntil = 0;
        if (state.page.isClosed()) return;
        try {
            await state.session.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: state.id, enabled: false });
        } catch (failure) {
            if (!missingAuthenticator(failure)) throw failure;
            await initializeAuthenticator(state);
        }
        await state.session.send('WebAuthn.setUserVerified', { authenticatorId: state.id, isUserVerified: false });
    };
    const hydrate = async (state, credentials = store.credentials) => {
        state.hydrating = true;
        try {
            await state.session.send('WebAuthn.clearCredentials', { authenticatorId: state.id });
            for (const credential of credentials) await state.session.send('WebAuthn.addCredential', { authenticatorId: state.id, credential });
        } finally { state.hydrating = false; }
    };
    const initializeAuthenticator = async state => {
        await state.session.send('WebAuthn.enable', { enableUI: false });
        const result = await state.session.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR_OPTIONS });
        state.id = result.authenticatorId;
        await hydrate(state);
    };
    const fail = async () => {
        error = 'Passkey 保存或认证器更新失败，已暂停授权；请关闭环境后检查数据并重新启动';
        for (const state of states.values()) await revoke(state).catch(() => {});
    };
    const handleCredential = (state, kind, event) => {
        if (state.hydrating || closing || error || event.authenticatorId !== state.id) return;
        const revoked = revoke(state).catch(() => {});
        void task(async () => {
            await revoked;
            if (closing || !store.enabled) return;
            let credentials = store.credentials;
            if (kind === 'deleted') {
                credentials = credentials.filter(entry => entry.credentialId !== event.credentialId);
            } else {
                const incoming = normalizePasskeys([event.credential])[0];
                const current = credentials.find(entry => entry.credentialId === incoming.credentialId);
                if (current && (current.privateKey !== incoming.privateKey || current.rpId !== incoming.rpId)) throw invalidPasskey();
                if (current) incoming.signCount = Math.max(current.signCount, incoming.signCount);
                credentials = credentials.filter(entry => entry.credentialId !== incoming.credentialId).concat(incoming);
            }
            await revoke(state);
            await persist({ ...store, credentials });
            for (const other of states.values()) {
                await revoke(other);
                if (!other.page.isClosed()) await hydrate(other);
            }
        }).catch(fail);
    };
    const attach = async page => {
        if (closing || !store.enabled || states.has(page) || page.isClosed() || /^(chrome-extension|devtools):/.test(page.url())) return;
        if (attaching.has(page)) return attaching.get(page);
        const pending = (async () => {
            const session = await page.createCDPSession();
            const state = { page, session, id: '', hydrating: false, authorizedUntil: 0, timer: null };
            try {
                const { targetInfo } = await session.send('Target.getTargetInfo');
                pageIds.set(page, targetInfo.targetId);
                for (const [event, kind] of [['credentialAdded', 'added'], ['credentialAsserted', 'asserted'], ['credentialUpdated', 'updated'], ['credentialDeleted', 'deleted']]) {
                    session.on('WebAuthn.' + event, payload => handleCredential(state, kind, payload));
                }
                await initializeAuthenticator(state);
                states.set(page, state);
                state.onNavigation = frame => {
                    if (frame === page.mainFrame()) void revoke(state).catch(() => {});
                };
                state.onClose = () => { clearTimeout(state.timer); states.delete(page); };
                page.on('framenavigated', state.onNavigation);
                page.once('close', state.onClose);
            } catch (failure) {
                await session.send('WebAuthn.disable').catch(() => {});
                await session.detach().catch(() => {});
                if (page.isClosed() || /Target closed|Session closed|detached|No target/.test(failure.message)) return;
                throw new Error('当前浏览器无法初始化环境级 Passkey');
            }
        })();
        attaching.set(page, pending);
        try { await pending; } finally { attaching.delete(page); }
    };
    const handleTarget = target => {
        if (target.type() !== 'page') return;
        void task(async () => {
            const page = await target.page();
            if (page) await attach(page);
        }).catch(fail);
    };
    const handleChangedTarget = target => handleTarget(target);
    browser.on('targetcreated', handleTarget);
    browser.on('targetchanged', handleChangedTarget);
    const initialize = async () => {
        for (const page of await browser.pages()) await attach(page);
    };
    try { await initialize(); } catch (failure) {
        browser.off('targetcreated', handleTarget);
        browser.off('targetchanged', handleChangedTarget);
        throw failure;
    }
    const pageId = async page => {
        if (pageIds.has(page)) return pageIds.get(page);
        const session = await page.createCDPSession();
        try {
            const { targetInfo } = await session.send('Target.getTargetInfo');
            pageIds.set(page, targetInfo.targetId);
            return targetInfo.targetId;
        } finally { await session.detach().catch(() => {}); }
    };
    const summary = async () => {
        const pages = (await browser.pages()).filter(eligiblePage);
        return {
            enabled: store.enabled, error, credentials: store.credentials.map(publicCredential),
            pages: await Promise.all(pages.map(async page => ({ id: await pageId(page), url: page.url(), authorizedUntil: states.get(page)?.authorizedUntil || 0 })))
        };
    };
    const flush = async () => {
        await queue;
        if (pendingStore) await persist(pendingStore);
    };
    return {
        summary: () => task(summary),
        setEnabled: enabled => task(async () => {
            if (typeof enabled !== 'boolean' || closing || error) throw new Error('Passkey 状态不可修改');
            if (enabled === store.enabled) return summary();
            if (enabled) {
                store.enabled = true;
                try { await initialize(); await persist(store); }
                catch (failure) { await fail(); throw failure; }
            } else {
                for (const state of states.values()) await revoke(state);
                for (const state of states.values()) {
                    state.page.off('framenavigated', state.onNavigation);
                    state.page.off('close', state.onClose);
                    await state.session.send('WebAuthn.disable');
                    await state.session.detach();
                }
                states.clear();
                await persist({ ...store, enabled: false });
            }
            return summary();
        }),
        authorize: async (targetId, credentialId, mode = 'use') => {
            if (mode !== 'register' && mode !== 'use') throw new Error('无效的 Passkey 操作');
            if (typeof targetId !== 'string' || !targetId || (credentialId !== undefined && typeof credentialId !== 'string')) throw new Error('无效的 Passkey 授权');
            if (confirming) throw new Error('已有 Passkey 授权等待确认');
            const pages = await browser.pages();
            const ids = await Promise.all(pages.map(pageId));
            const page = pages[ids.indexOf(targetId)];
            if (!page || !eligiblePage(page) || closing || !store.enabled || error) throw new Error('请选择当前环境的安全网页');
            const origin = new URL(page.url()).origin;
            const hostname = new URL(origin).hostname;
            const credential = credentialId ? store.credentials.find(entry => entry.credentialId === credentialId) : null;
            if (credentialId && (!credential || !(hostname === credential.rpId || hostname.endsWith('.' + credential.rpId)))) {
                throw new Error('该 Passkey 不属于所选网站');
            }
            if (confirming) throw new Error('已有 Passkey 授权等待确认');
            confirming = true;
            const requestedAt = Date.now();
            let accepted;
            try { accepted = await confirm(origin, credential ? publicCredential(credential) : null, mode); }
            finally { confirming = false; }
            if (!accepted) throw new Error('已取消 Passkey 授权');
            return task(async () => {
                if (closing || error || !store.enabled || Date.now() - requestedAt > 60000 || page.isClosed() || new URL(page.url()).origin !== origin) throw new Error('授权已过期或网页已变化，请重新授权');
                await attach(page);
                for (const state of states.values()) await revoke(state);
                const state = states.get(page);
                const latest = credentialId ? store.credentials.find(entry => entry.credentialId === credentialId) : null;
                if (credentialId && !latest) throw new Error('Passkey 已被删除，请重新选择');
                const allowed = latest
                    ? [latest]
                    : store.credentials.filter(entry => hostname === entry.rpId || hostname.endsWith('.' + entry.rpId));
                if (mode === 'use' && !allowed.length) throw new Error('当前网站没有可用的 Passkey');
                await hydrate(state, allowed);
                await state.session.send('WebAuthn.setUserVerified', { authenticatorId: state.id, isUserVerified: true });
                state.authorizedUntil = Date.now() + 60000;
                state.timer = setTimeout(() => { void task(() => revoke(state)).catch(fail); }, 60000);
                state.timer.unref?.();
                await state.session.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: state.id, enabled: true });
                return summary();
            });
        },
        revoke: () => task(async () => { for (const state of states.values()) await revoke(state); return summary(); }),
        remove: credentialId => task(async () => {
            if (closing || error) throw new Error('Passkey 不可修改');
            if (!store.credentials.some(entry => entry.credentialId === credentialId)) throw new Error('Passkey 不存在');
            try {
                for (const state of states.values()) await revoke(state);
                await persist({ ...store, credentials: store.credentials.filter(entry => entry.credentialId !== credentialId) });
                for (const state of states.values()) await hydrate(state);
                return summary();
            } catch (failure) { await fail(); throw failure; }
        }),
        flush,
        close: async () => {
            browser.off('targetcreated', handleTarget);
            browser.off('targetchanged', handleChangedTarget);
            for (const state of states.values()) await revoke(state).catch(() => {});
            await flush();
            closing = true;
            for (const state of states.values()) {
                clearTimeout(state.timer);
                state.page.off('framenavigated', state.onNavigation);
                state.page.off('close', state.onClose);
                await revoke(state).catch(() => {});
                await state.session.send('WebAuthn.disable').catch(() => {});
                await state.session.detach().catch(() => {});
            }
            states.clear();
        }
    };
}

module.exports = { normalizePasskeys, normalizePasskeyStore, createPasskeyManager };
