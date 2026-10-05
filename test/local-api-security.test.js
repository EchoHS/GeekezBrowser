const test = require('node:test');
const assert = require('node:assert/strict');
const {
    authorizeLocalRequest,
    createApiToken,
    extractBearerToken,
    isAllowedInternalPreflight,
    isChromeExtensionOrigin,
    secretsEqual,
    setInternalCorsHeaders
} = require('../src/main/local-api-security');

function request(headers = {}) {
    return { headers };
}

test('creates high-entropy API tokens', () => {
    const first = createApiToken();
    const second = createApiToken();
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, second);
});

test('accepts only a matching bearer token', () => {
    const token = createApiToken();
    assert.equal(extractBearerToken(request({ authorization: `Bearer ${token}` })), token);
    assert.equal(authorizeLocalRequest(request({ authorization: `Bearer ${token}` }), token).ok, true);
    assert.equal(authorizeLocalRequest(request(), token).ok, false);
    assert.equal(authorizeLocalRequest(request({ authorization: 'Bearer wrong' }), token).ok, false);
    assert.equal(secretsEqual(token, token), true);
    assert.equal(secretsEqual(token, `${token}x`), false);
});

test('public API rejects browser origins even with a valid token', () => {
    const token = createApiToken();
    const req = request({ authorization: `Bearer ${token}`, origin: 'https://example.test' });
    assert.equal(authorizeLocalRequest(req, token).ok, false);
});

test('internal API accepts authenticated extension requests only', () => {
    const token = createApiToken();
    const extensionOrigin = `chrome-extension://${'a'.repeat(32)}`;
    const headers = { authorization: `Bearer ${token}`, origin: extensionOrigin };
    assert.equal(isChromeExtensionOrigin(extensionOrigin), true);
    assert.equal(authorizeLocalRequest(request(headers), token, { allowChromeExtension: true }).ok, true);
    assert.equal(authorizeLocalRequest(request({ ...headers, origin: 'http://localhost:8899' }), token, { allowChromeExtension: true }).ok, false);
});

test('internal preflight is restricted to extension origins requesting authorization', () => {
    const extensionOrigin = `chrome-extension://${'b'.repeat(32)}`;
    assert.equal(isAllowedInternalPreflight(request({
        origin: extensionOrigin,
        'access-control-request-headers': 'content-type, authorization'
    })), true);
    assert.equal(isAllowedInternalPreflight(request({
        origin: 'https://example.test',
        'access-control-request-headers': 'authorization'
    })), false);
});

test('CORS echoes an allowed extension origin and never emits a wildcard', () => {
    const headers = new Map();
    const res = { setHeader: (name, value) => headers.set(name, value) };
    const origin = `chrome-extension://${'c'.repeat(32)}`;
    setInternalCorsHeaders(res, origin);
    assert.equal(headers.get('Access-Control-Allow-Origin'), origin);
    assert.notEqual(headers.get('Access-Control-Allow-Origin'), '*');
});
