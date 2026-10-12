let passwordQueue = Promise.resolve();
let configPromise;
const totpCache = new Map();
const totpRequests = new Map();
const LOGIN_TTL = 10 * 60 * 1000;

function runPasswordTask(task) {
    const result = passwordQueue.then(task);
    passwordQueue = result.catch(() => {});
    return result;
}

const PASSWORDS_KEY = 'geekez_passwords';
const LEGACY_PASSWORDS_KEY = 'GEEKEZ_PASSWORDS';
const SYNC_KEY = 'geekez_passwords_sync_pending';
const API_REVISIONS_KEY = 'geekez_passwords_api_revisions';
const SNAPSHOT_REVISION_KEY = 'geekez_passwords_snapshot_revision';

function getGuardConfig() {
    if (!configPromise) {
        configPromise = (async () => {
            const response = await fetch(chrome.runtime.getURL('guard-config.json'), { cache: 'no-store' });
            if (!response.ok) throw new Error('无法读取密码管理器配置');
            const config = await response.json();
            if (typeof config.profileId !== 'string' || !config.profileId ||
                !Number.isInteger(config.apiPort) || config.apiPort < 1 || config.apiPort > 65535 ||
                typeof config.apiToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(config.apiToken) ||
                !Array.isArray(config.passwords) || typeof config.snapshotRevision !== 'string') {
                throw new Error('密码管理器配置无效');
            }
            return config;
        })().catch(error => {
            configPromise = undefined;
            throw error;
        });
    }
    return configPromise;
}

async function getPasswords() {
    const config = await getGuardConfig();
    const stored = await chrome.storage.local.get([PASSWORDS_KEY, LEGACY_PASSWORDS_KEY, API_REVISIONS_KEY, SNAPSHOT_REVISION_KEY]);
    const snapshotRevision = config.snapshotRevision;
    const replaceSnapshot = snapshotRevision && stored[SNAPSHOT_REVISION_KEY] !== snapshotRevision;
    // Migrate the uppercase key if the canonical store has not been created yet.
    const storedPasswords = Array.isArray(stored[PASSWORDS_KEY])
        ? stored[PASSWORDS_KEY]
        : stored[LEGACY_PASSWORDS_KEY];
    // An empty list is intentional. Only a missing store is initialized from disk.
    let changed = replaceSnapshot || !Array.isArray(stored[PASSWORDS_KEY]);
    const passwords = replaceSnapshot || !Array.isArray(storedPasswords) ? structuredClone(config.passwords) : storedPasswords;
    const ids = new Set();
    for (const entry of passwords) {
        if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) {
            entry.id = crypto.randomUUID();
            changed = true;
        }
        ids.add(entry.id);
        if (!entry.origin && entry.url) {
            try {
                entry.origin = new URL(entry.url).origin;
                changed = true;
            } catch {}
        }
    }
    const revisions = replaceSnapshot ? {} : { ...stored[API_REVISIONS_KEY] };
    const apiFields = new Set(['url', 'origin', 'username', 'password', 'name', 'notes', 'twoFactorEnabled', 'twoFactorSecret']);
    // Import explicit API changes once, including into an intentionally empty vault.
    for (const seeded of config.passwords) {
        const update = seeded.apiUpdate;
        if (!update?.revision || revisions[seeded.id] === update.revision) continue;
        const incoming = { ...seeded };
        delete incoming.apiUpdate;
        const at = passwords.findIndex(entry => entry.id === incoming.id ||
            (entry.origin === incoming.origin && entry.username === incoming.username));
        if (at < 0) passwords.push(incoming);
        else {
            const fields = {};
            for (const key of update.fields || []) {
                if (apiFields.has(key)) fields[key] = incoming[key];
            }
            passwords[at] = { ...passwords[at], ...fields, id: incoming.id, updatedAt: incoming.updatedAt };
            delete passwords[at].apiUpdate;
        }
        revisions[incoming.id] = update.revision;
        changed = true;
    }
    if (changed) {
        await chrome.storage.local.set({ [PASSWORDS_KEY]: passwords, [SYNC_KEY]: true, [API_REVISIONS_KEY]: revisions, [SNAPSHOT_REVISION_KEY]: snapshotRevision });
        totpCache.clear();
    }
    return passwords;
}

async function postApi(endpoint, payload) {
    const config = await getGuardConfig();
    const response = await fetch('http://127.0.0.1:' + config.apiPort + endpoint, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + config.apiToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...payload, profileId: config.profileId }),
        signal: AbortSignal.timeout(5000)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'HTTP ' + response.status);
    return result;
}

async function syncToElectron(passwords) {
    try {
        const config = await getGuardConfig();
        const state = await chrome.storage.local.get([API_REVISIONS_KEY, SNAPSHOT_REVISION_KEY]);
        await postApi('/api/passwords/sync', { profileId: config.profileId, passwords, apiRevisions: state[API_REVISIONS_KEY] || {}, snapshotRevision: state[SNAPSHOT_REVISION_KEY] || '' });
        await chrome.storage.local.set({ [SYNC_KEY]: false });
    } catch (error) {
        throw new Error('扩展内的修改已保存，但加密文件同步失败：' + error.message);
    }
}

async function persistPasswords(passwords) {
    await chrome.storage.local.set({ [PASSWORDS_KEY]: passwords, [SYNC_KEY]: true });
    totpCache.clear();
    await syncToElectron(passwords);
    return passwords;
}

async function readAndSyncPasswords() {
    const passwords = await getPasswords();
    const state = await chrome.storage.local.get(SYNC_KEY);
    let syncError = '';
    if (state.geekez_passwords_sync_pending) {
        try { await syncToElectron(passwords); } catch (error) { syncError = error.message; }
    }
    return { success: true, passwords, syncError };
}

function hasTwoFactor(entry) {
    return entry.twoFactorEnabled !== false && typeof entry.twoFactorSecret === 'string' && !!entry.twoFactorSecret.trim();
}

function pageOrigin(sender) {
    if (!sender.tab || (sender.frameId !== undefined && sender.frameId !== 0)) throw new Error('无效的页面请求');
    const url = new URL(sender.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('此页面不支持自动填充');
    return url.origin;
}

function isPopup(sender) {
    return sender.url === chrome.runtime.getURL('popup.html');
}

function loginKey(tabId) {
    return 'geekez_login_' + tabId;
}

async function selectPassword(sender, entry) {
    const origin = pageOrigin(sender);
    if (!entry || entry.origin !== origin) throw new Error('此账号不属于当前网站');
    await chrome.storage.session.set({
        [loginKey(sender.tab.id)]: { origin, id: entry.id, selectedAt: Date.now() }
    });
}

async function getLoginPassword(sender, passwords) {
    const origin = pageOrigin(sender);
    const key = loginKey(sender.tab.id);
    const state = (await chrome.storage.session.get(key))[key];
    const matches = passwords.filter(entry => entry.origin === origin);
    if (state && state.origin === origin && Date.now() - state.selectedAt < LOGIN_TTL) {
        const selected = matches.find(entry => entry.id === state.id);
        if (!selected) throw new Error('所选账号已变更，请重新选择');
        return selected;
    }
    if (matches.length !== 1) throw new Error('请先选择要登录的账号');
    return matches[0];
}

async function savePassword(entry, { update = false, sender = null } = {}) {
    if (!entry || typeof entry.url !== 'string' || typeof entry.username !== 'string' || typeof entry.password !== 'string') {
        throw new Error('请填写网址、用户名和密码');
    }
    const url = new URL(entry.url);
    if (!['http:', 'https:'].includes(url.protocol) || !entry.username.trim() || !entry.password) {
        throw new Error('请填写有效的网址、用户名和密码');
    }
    const origin = sender ? pageOrigin(sender) : url.origin;
    if (origin !== url.origin) throw new Error('此账号不属于当前网站');
    const passwords = await getPasswords();
    // Captured credentials update only login fields, preserving notes and 2FA.
    const fields = sender
        ? { url: url.href, origin, username: entry.username.trim(), password: entry.password }
        : { ...entry, url: url.href, origin, name: entry.name?.trim() || url.hostname, username: entry.username.trim() };
    if (!sender && fields.twoFactorEnabled) {
        const result = await postApi('/validate-totp', { secret: fields.twoFactorSecret });
        fields.twoFactorSecret = result.secret;
    } else if (!sender && fields.twoFactorEnabled === false) {
        fields.twoFactorSecret = '';
    }
    const index = fields.id
        ? passwords.findIndex(item => item.id === fields.id)
        : passwords.findIndex(item => item.origin === origin && item.username === fields.username);
    if (update && index === -1) throw new Error('此密码已被删除，请刷新后重试');
    if (fields.id && passwords.some((item, i) => i !== index && item.origin === origin && item.username === fields.username)) {
        throw new Error('该网站和用户名已存在，请编辑已有密码');
    }
    const now = Date.now();
    const saved = index === -1
        ? { name: url.hostname, ...fields, id: fields.id || crypto.randomUUID(), createdAt: now, updatedAt: now }
        : { ...passwords[index], ...fields, id: passwords[index].id, updatedAt: now };
    if (index === -1) passwords.push(saved);
    else passwords[index] = saved;
    if (sender) await selectPassword(sender, saved);
    return persistPasswords(passwords);
}

async function getTotp(secret) {
    const key = secret.replace(/\s+/g, '').toUpperCase().replace(/=+$/, '');
    const now = Date.now();
    for (const [cachedKey, cached] of totpCache) {
        if (cached.expiresAt <= now + 1500) totpCache.delete(cachedKey);
    }
    if (totpCache.has(key)) return totpCache.get(key);
    if (totpRequests.has(key)) return totpRequests.get(key);
    const request = postApi('/generate-totp', { secret: key }).then(result => {
        if (!/^\d{6}$/.test(result.code) || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) {
            throw new Error('验证码已过期，请重试');
        }
        const token = { success: true, code: result.code, expiresAt: result.expiresAt };
        totpCache.set(key, token);
        return token;
    }).finally(() => totpRequests.delete(key));
    totpRequests.set(key, request);
    return request;
}

async function handleMessage(message, sender) {
    if (sender.id !== chrome.runtime.id) throw new Error('无效的扩展请求');
    const popup = isPopup(sender);
    if (message.type === 'GET_ALL_PASSWORDS') {
        if (!popup) throw new Error('仅密码管理窗口可访问全部账号');
        return runPasswordTask(readAndSyncPasswords);
    }
    if (message.type === 'QUERY_PASSWORDS') {
        const origin = pageOrigin(sender);
        const passwords = await runPasswordTask(getPasswords);
        return {
            success: true,
            passwords: passwords.filter(entry => entry.origin === origin).map(entry => ({
                id: entry.id, url: entry.url, origin: entry.origin, name: entry.name,
                username: entry.username, password: entry.password, twoFactorEnabled: hasTwoFactor(entry)
            }))
        };
    }
    if (message.type === 'SELECT_PASSWORD') {
        return runPasswordTask(async () => {
            const passwords = await getPasswords();
            await selectPassword(sender, passwords.find(entry => entry.id === message.id));
            return { success: true };
        });
    }
    if (message.type === 'GET_TOTP') {
        const entry = await runPasswordTask(async () => {
            const passwords = await getPasswords();
            return popup ? passwords.find(item => item.id === message.id) : getLoginPassword(sender, passwords);
        });
        if (!entry || !hasTwoFactor(entry)) throw new Error('此账号未启用 2FA');
        if (!popup && message.id && message.id !== entry.id) throw new Error('请先选择要登录的账号');
        return getTotp(entry.twoFactorSecret);
    }
    if (message.type === 'PREVIEW_TOTP' || message.type === 'VALIDATE_TOTP') {
        if (!popup) throw new Error('仅密码管理窗口可预览密钥');
        if (message.type === 'VALIDATE_TOTP') return postApi('/validate-totp', { secret: message.secret });
        if (typeof message.secret !== 'string') throw new Error('请输入有效的 Base32 密钥');
        return getTotp(message.secret);
    }
    if (message.type === 'SAVE_PASSWORD' || message.type === 'UPDATE_PASSWORD') {
        if (!popup && message.type === 'UPDATE_PASSWORD') throw new Error('仅密码管理窗口可编辑账号');
        const passwords = await runPasswordTask(() => savePassword(message.entry, {
            update: message.type === 'UPDATE_PASSWORD', sender: popup ? null : sender
        }));
        return popup ? { success: true, count: passwords.length, passwords } : { success: true };
    }
    if (message.type === 'DELETE_PASSWORD') {
        if (!popup || !message.id) throw new Error('请选择要删除的密码');
        const passwords = await runPasswordTask(async () => {
            const entries = await getPasswords();
            return persistPasswords(entries.filter(entry => entry.id !== message.id));
        });
        return { success: true, count: passwords.length, passwords };
    }
    throw new Error('未知请求');
}

const messageTypes = new Set([
    'GET_ALL_PASSWORDS', 'QUERY_PASSWORDS', 'SELECT_PASSWORD', 'GET_TOTP',
    'PREVIEW_TOTP', 'VALIDATE_TOTP', 'SAVE_PASSWORD', 'UPDATE_PASSWORD', 'DELETE_PASSWORD'
]);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!messageTypes.has(message?.type)) return;
    handleMessage(message, sender).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
});
chrome.runtime.onInstalled.addListener(() => { runPasswordTask(readAndSyncPasswords).catch(console.error); });
chrome.runtime.onStartup.addListener(() => { runPasswordTask(readAndSyncPasswords).catch(console.error); });
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(loginKey(tabId)).catch(() => {}); });
