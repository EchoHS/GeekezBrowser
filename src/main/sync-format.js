const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { normalizePasskeyStore } = require('./passkeys');

const scrypt = promisify(crypto.scrypt);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const MAGIC = Buffer.from('GKSC0001');
const MAX_BYTES = 32 * 1024 * 1024;
const PROFILE_FIELDS = ['id', 'name', 'proxyStr', 'tags', 'notes', 'fingerprint', 'preProxyOverride', 'customArgs', 'createdAt'];
const PASSWORD_FIELDS = ['id', 'name', 'url', 'origin', 'username', 'password', 'notes', 'twoFactorEnabled', 'twoFactorSecret', 'createdAt', 'updatedAt'];
const SETTING_FIELDS = ['preProxies', 'subscriptions', 'mode', 'selectedId', 'enablePreProxy', 'notify', 'lang', 'theme', 'watermarkStyle', 'enableUaWebglModify', 'enableCustomArgs', 'enableRemoteDebugging', 'closeBehavior', 'defaultBookmarks', 'defaultBookmarkScope', 'defaultPasswordScope'];

function syncError(code, detail = '') {
    return Object.assign(new Error(code), { code, detail });
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
    }
    return value;
}

function contentHash(value) {
    return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function pick(value, fields) {
    return Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
}

function portableProfile(profile) {
    const result = pick(profile, PROFILE_FIELDS);
    if (result.fingerprint) {
        result.fingerprint = { ...result.fingerprint };
        delete result.fingerprint.secChUa;
        if (result.fingerprint.webgl) result.fingerprint.webgl = { disabled: false, ...result.fingerprint.webgl };
    }
    return result;
}

function portablePasswords(passwords) {
    const entries = passwords.map(entry => pick(entry, PASSWORD_FIELDS));
    const reserved = new Set(entries.map(entry => entry.id).filter(id => typeof id === 'string' && id));
    const used = new Set();
    const occurrences = new Map();
    for (const entry of entries) {
        if (typeof entry.id !== 'string' || !entry.id || used.has(entry.id)) {
            // Legacy Guard records may have no ID. Previews must be stable without writing to the vault.
            const identity = contentHash([entry.url, entry.username]);
            let occurrence = occurrences.get(identity) || 0;
            do { entry.id = `legacy-${identity}-${occurrence++}`; }
            while (reserved.has(entry.id) || used.has(entry.id));
            occurrences.set(identity, occurrence);
        }
        used.add(entry.id);
    }
    return entries;
}

function portableSettings(settings, defaults) {
    const result = { ...pick(settings, SETTING_FIELDS), defaultPasswords: portablePasswords(defaults) };
    result.preProxies = (settings.preProxies || []).map(node => pick(node, ['id', 'remark', 'url', 'enable', 'groupId']));
    result.subscriptions = (settings.subscriptions || []).map(sub => pick(sub, ['id', 'name', 'url', 'updateInterval']));
    return result;
}

function validId(id) {
    return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

function validateRecord(record, key) {
    const location = key === 'settings' ? 'settings' : validId(record?.profile?.id) ? `profile:${record.profile.id}` : 'profile';
    const invalid = field => syncError('syncInvalidData', `${location}.${field}`);
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        !(record.version === 1 || (key !== 'settings' && record.version === 2))) throw invalid('version');
    if (key === 'settings') {
        if (record.kind !== 'settings' || !record.settings || typeof record.settings !== 'object' || Array.isArray(record.settings)) throw invalid('record');
        const settings = record.settings;
        for (const field of ['defaultPasswords', 'defaultBookmarks', 'preProxies', 'subscriptions']) {
            if (!Array.isArray(settings[field]) || settings[field].some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw invalid(field);
        }
        for (const [field, values] of Object.entries({
            theme: ['geek', 'light', 'dark', 'tech-gray'], lang: ['auto', 'cn', 'en'],
            mode: ['single', 'balance', 'failover'], watermarkStyle: ['off', 'enhanced', 'banner'], closeBehavior: ['tray', 'quit']
        })) {
            if (settings[field] !== undefined && !values.includes(settings[field])) throw invalid(field);
        }
        for (const field of ['defaultBookmarkScope', 'defaultPasswordScope']) {
            const scope = settings[field];
            if (!scope || !['all', 'includeTags', 'excludeTags'].includes(scope.mode) ||
                !Array.isArray(scope.tags) || scope.tags.some(tag => typeof tag !== 'string')) throw invalid(field);
        }
        for (const field of ['notify', 'enablePreProxy', 'enableUaWebglModify', 'enableCustomArgs', 'enableRemoteDebugging']) {
            if (settings[field] !== undefined && typeof settings[field] !== 'boolean') throw invalid(field);
        }
        for (const field of ['preProxies', 'subscriptions']) {
            for (const [index, item] of settings[field].entries()) {
                for (const name of ['id', 'url']) {
                    if (typeof item[name] !== 'string') throw invalid(`${field}[${index}].${name}`);
                }
            }
        }
        for (const [index, item] of settings.defaultBookmarks.entries()) {
            try {
                if (typeof item.name !== 'string' || typeof item.id !== 'string' || !['https:', 'http:'].includes(new URL(item.url).protocol)) throw new Error();
            } catch { throw invalid(`defaultBookmarks[${index}]`); }
        }
    } else {
        if (record.kind !== 'profile') throw invalid('kind');
        if (record.version === 2 || record.passkeys !== undefined) {
            if (record.version !== 2) throw invalid('version');
            try { normalizePasskeyStore(record.passkeys); } catch { throw invalid('passkeys'); }
        }
        if (!validId(record.profile?.id) || key !== `profile:${record.profile.id}`) throw invalid('id');
        for (const field of ['name', 'proxyStr']) {
            if (typeof record.profile[field] !== 'string') throw invalid(field);
        }
        if (!Array.isArray(record.passwords)) throw invalid('passwords');
        if (!record.bookmarks || typeof record.bookmarks !== 'object') throw invalid('bookmarks');
        if (record.profile.tags !== undefined && (!Array.isArray(record.profile.tags) || record.profile.tags.some(tag => typeof tag !== 'string'))) throw invalid('tags');
        const ids = new Set();
        for (const [index, entry] of record.passwords.entries()) {
            const fieldPath = `passwords[${index}]`;
            if (!entry || typeof entry !== 'object') throw invalid(fieldPath);
            if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) throw invalid(`${fieldPath}.id`);
            for (const field of ['url', 'username', 'password']) {
                if (typeof entry[field] !== 'string') throw invalid(`${fieldPath}.${field}`);
            }
            for (const field of ['name', 'origin', 'notes', 'twoFactorSecret']) {
                if (entry[field] !== undefined && typeof entry[field] !== 'string') throw invalid(`${fieldPath}.${field}`);
            }
            ids.add(entry.id);
        }
    }
    return record;
}

async function deriveSyncKey(passphrase, salt = crypto.randomBytes(16)) {
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) throw syncError('syncPassphraseLength');
    if (salt.length !== 16) throw syncError('syncInvalidData');
    const key = await scrypt(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return { key, salt };
}

async function encryptSyncData(value, secret) {
    const source = Buffer.from(JSON.stringify(value));
    if (source.length > MAX_BYTES) throw syncError('syncTooLarge');
    const compressed = await gzip(source);
    const nonce = crypto.randomBytes(12);
    const header = Buffer.concat([MAGIC, secret.salt, nonce]);
    const cipher = crypto.createCipheriv('aes-256-gcm', secret.key, nonce);
    cipher.setAAD(header);
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const buffer = Buffer.concat([header, cipher.getAuthTag(), encrypted]);
    if (buffer.length > MAX_BYTES) throw syncError('syncTooLarge');
    return buffer;
}

async function decryptSyncData(buffer, secretOrPassphrase) {
    if (buffer.length < 53 || buffer.length > MAX_BYTES || !buffer.subarray(0, 8).equals(MAGIC)) throw syncError('syncInvalidData');
    const salt = buffer.subarray(8, 24);
    const secret = typeof secretOrPassphrase === 'string' ? await deriveSyncKey(secretOrPassphrase, salt) : secretOrPassphrase;
    if (!secret.salt.equals(salt)) throw syncError('syncDecryptError');
    let decrypted;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', secret.key, buffer.subarray(24, 36));
        decipher.setAAD(buffer.subarray(0, 36));
        decipher.setAuthTag(buffer.subarray(36, 52));
        decrypted = Buffer.concat([decipher.update(buffer.subarray(52)), decipher.final()]);
    } catch { throw syncError('syncDecryptError'); }
    try {
        const data = JSON.parse((await gunzip(decrypted, { maxOutputLength: MAX_BYTES })).toString('utf8'));
        return { data, secret };
    } catch { throw syncError('syncInvalidData'); }
}

module.exports = {
    MAX_BYTES, syncError, contentHash, portableProfile, portablePasswords, portableSettings,
    validId, validateRecord, deriveSyncKey, encryptSyncData, decryptSyncData
};
