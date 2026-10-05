const crypto = require('crypto');

const TOKEN_BYTES = 32;

function createApiToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function extractBearerToken(req) {
    const authorization = String(req?.headers?.authorization || '');
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
    return match ? match[1] : '';
}

function secretsEqual(actual, expected) {
    if (!actual || !expected) return false;
    const actualDigest = crypto.createHash('sha256').update(String(actual)).digest();
    const expectedDigest = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function getRequestOrigin(req) {
    return String(req?.headers?.origin || '').trim();
}

function isChromeExtensionOrigin(origin) {
    return /^chrome-extension:\/\/[a-p]{32}$/i.test(String(origin || ''));
}

function authorizeLocalRequest(req, expectedToken, options = {}) {
    const origin = getRequestOrigin(req);
    const allowChromeExtension = options.allowChromeExtension === true;

    if (origin && !(allowChromeExtension && isChromeExtensionOrigin(origin))) {
        return { ok: false, origin: '' };
    }

    if (!secretsEqual(extractBearerToken(req), expectedToken)) {
        return { ok: false, origin: '' };
    }

    return { ok: true, origin };
}

function isAllowedInternalPreflight(req) {
    const origin = getRequestOrigin(req);
    const requestedHeaders = String(req?.headers?.['access-control-request-headers'] || '')
        .toLowerCase()
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    return isChromeExtensionOrigin(origin) && requestedHeaders.includes('authorization');
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
    extractBearerToken,
    getRequestOrigin,
    isAllowedInternalPreflight,
    isChromeExtensionOrigin,
    secretsEqual,
    sendForbidden,
    setInternalCorsHeaders,
    setJsonSecurityHeaders
};
