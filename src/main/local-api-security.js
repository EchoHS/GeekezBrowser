const crypto = require('crypto');

const TOKEN_BYTES = 32;

function createApiToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function extractBearerToken(req) {
    const value = String(req?.headers?.authorization || '');
    const match = value.match(/^Bearer\s+([^\s]+)$/i);
    return match ? match[1] : '';
}

function secretsEqual(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string' || !actual || !expected) return false;
    const actualDigest = crypto.createHash('sha256').update(actual).digest();
    const expectedDigest = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function getRequestOrigin(req) {
    return String(req?.headers?.origin || '').trim();
}

function isChromeExtensionOrigin(origin) {
    return /^chrome-extension:\/\/[a-p]{32}$/i.test(String(origin || ''));
}

function isLocalHost(req) {
    try {
        const host = new URL('http://' + String(req?.headers?.host || ''));
        return ['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) &&
            !host.username && !host.password && host.pathname === '/' && !host.search && !host.hash &&
            Number(host.port || 80) === req.socket.localPort;
    } catch { return false; }
}

function extensionOriginForPath(directory) {
    const normalized = process.platform === 'win32' ? directory.replace(/^[a-z]:/, value => value.toUpperCase()) : directory;
    const bytes = Buffer.from(normalized, process.platform === 'win32' ? 'utf16le' : 'utf8');
    const id = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)
        .replace(/[0-9a-f]/g, value => String.fromCharCode(97 + parseInt(value, 16)));
    return 'chrome-extension://' + id;
}

function authorizeLocalRequest(req, expectedToken, { allowChromeExtension = false, extensionOrigin } = {}) {
    const origin = getRequestOrigin(req);
    if (!isLocalHost(req) || (origin && !(allowChromeExtension && isChromeExtensionOrigin(origin) && origin === extensionOrigin))) {
        return { ok: false, origin: '' };
    }
    if (!secretsEqual(extractBearerToken(req), expectedToken)) {
        return { ok: false, origin: '' };
    }
    return { ok: true, origin };
}

function isAllowedInternalPreflight(req, origins = []) {
    const origin = getRequestOrigin(req);
    const requestedHeaders = String(req?.headers?.['access-control-request-headers'] || '')
        .toLowerCase()
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const method = String(req?.headers?.['access-control-request-method'] || '');
    return isLocalHost(req) && isChromeExtensionOrigin(origin) && origins.includes(origin) &&
        ['GET', 'POST'].includes(method) && requestedHeaders.includes('authorization') &&
        requestedHeaders.every(value => ['authorization', 'content-type'].includes(value));
}

async function readRequestBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let settled = false;
        const fail = error => {
            if (settled) return;
            settled = true;
            chunks.length = 0;
            req.resume();
            reject(error);
        };
        const contentLength = Number(req?.headers?.['content-length']);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            return fail(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        }
        req.on('data', chunk => {
            if (settled) return;
            size += chunk.length;
            if (size > maxBytes) {
                fail(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!settled) {
                settled = true;
                resolve(Buffer.concat(chunks).toString('utf8'));
            }
        });
        req.on('error', error => fail(error));
        req.on('aborted', () => fail(Object.assign(new Error('Request aborted'), { statusCode: 400 })));
    });
}

function setJsonSecurityHeaders(res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
}

function setInternalCorsHeaders(res, origin) {
    if (!isChromeExtensionOrigin(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Vary', 'Origin');
}

function sendForbidden(res) {
    setJsonSecurityHeaders(res);
    res.writeHead(403);
    res.end(JSON.stringify({ success: false, error: 'Forbidden' }));
}

module.exports = {
    authorizeLocalRequest,
    createApiToken,
    extensionOriginForPath,
    extractBearerToken,
    getRequestOrigin,
    isAllowedInternalPreflight,
    isChromeExtensionOrigin,
    isLocalHost,
    readRequestBody,
    secretsEqual,
    sendForbidden,
    setInternalCorsHeaders,
    setJsonSecurityHeaders
};
