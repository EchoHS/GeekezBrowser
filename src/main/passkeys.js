const crypto = require('crypto');

const CREDENTIAL_FIELDS = ['credentialId', 'isResidentCredential', 'rpId', 'privateKey', 'userHandle', 'signCount', 'largeBlob', 'backupEligibility', 'backupState', 'userName', 'userDisplayName'];
const AUTHENTICATOR_OPTIONS = {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, hasLargeBlob: true,
    automaticPresenceSimulation: true, isUserVerified: true,
    defaultBackupEligibility: true, defaultBackupState: false
};

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
    return { version: 1, enabled: true, credentials: normalizePasskeys(value.credentials) };
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

async function createPasskeyManager({ browser, readStore, writeStore, onChange = () => {} }) {
    let store = normalizePasskeyStore(await readStore());
    let queue = Promise.resolve();
    let error = '';
    let closing = false;
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
    const keepAuthenticatorActive = async state => {
        clearTimeout(state.timer);
        state.timer = null;
        state.authorizedUntil = 0;
        if (state.page.isClosed()) return;
        if (!state.id) return;
        await state.session.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: state.id, enabled: true });
        await state.session.send('WebAuthn.setUserVerified', { authenticatorId: state.id, isUserVerified: true });
    };
    const hydrate = async (state, credentials = store.credentials) => {
        state.hydrating = true;
        try {
            await state.session.send('WebAuthn.clearCredentials', { authenticatorId: state.id });
            for (const credential of credentials) await state.session.send('WebAuthn.addCredential', { authenticatorId: state.id, credential });
        } finally { state.hydrating = false; }
    };
    const initializeAuthenticator = async state => {
        // CDP WebAuthn with UI disabled suppresses platform/iCloud discovery;
        // the only authenticator exposed to the page is this profile-local one.
        await state.session.send('WebAuthn.enable', { enableUI: false });
        const result = await state.session.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR_OPTIONS });
        state.id = result.authenticatorId;
        await hydrate(state);
    };
    const fail = async () => {
        error = 'Passkey 保存或认证器更新失败，已暂停环境接管；请关闭环境后检查数据并重新启动';
        for (const state of states.values()) await keepAuthenticatorActive(state).catch(() => {});
    };
    const handleCredential = (state, kind, event) => {
        if (state.hydrating || closing || error || event.authenticatorId !== state.id) return;
        void task(async () => {
            if (closing) return;
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
            await persist({ ...store, credentials });
            for (const other of states.values()) {
                if (!other.page.isClosed()) await hydrate(other);
            }
        }).catch(fail);
    };
    const attach = async page => {
        if (closing || states.has(page) || page.isClosed() || /^(chrome-extension|devtools):/.test(page.url())) return;
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
                    if (frame === page.mainFrame()) void keepAuthenticatorActive(state).catch(() => {});
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
            if (enabled !== true) throw new Error('环境级 Passkey 接管不可关闭');
            if (!store.enabled) {
                store = { ...store, enabled: true };
                await persist(store);
            }
            await initialize();
            return summary();
        }),
        authorize: () => task(summary),
        revoke: () => task(summary),
        remove: credentialId => task(async () => {
            if (closing || error) throw new Error('Passkey 不可修改');
            if (!store.credentials.some(entry => entry.credentialId === credentialId)) throw new Error('Passkey 不存在');
            try {
                await persist({ ...store, credentials: store.credentials.filter(entry => entry.credentialId !== credentialId) });
                for (const state of states.values()) await hydrate(state);
                return summary();
            } catch (failure) { await fail(); throw failure; }
        }),
        flush,
        close: async () => {
            browser.off('targetcreated', handleTarget);
            browser.off('targetchanged', handleChangedTarget);
            await flush();
            closing = true;
            for (const state of states.values()) {
                clearTimeout(state.timer);
                state.page.off('framenavigated', state.onNavigation);
                state.page.off('close', state.onClose);
                await keepAuthenticatorActive(state).catch(() => {});
                await state.session.send('WebAuthn.disable').catch(() => {});
                await state.session.detach().catch(() => {});
            }
            states.clear();
        }
    };
}

module.exports = { normalizePasskeys, normalizePasskeyStore, createPasskeyManager };
