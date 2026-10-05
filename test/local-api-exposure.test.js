const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8');
const securitySource = fs.readFileSync(path.join(root, 'src/main/local-api-security.js'), 'utf8');
const guardSource = fs.readFileSync(path.join(root, 'src/main/guard/background.js'), 'utf8');

test('local API sources never enable wildcard CORS', () => {
    assert.doesNotMatch(mainSource, /Access-Control-Allow-Origin['"],\s*['"]\*['"]/);
    assert.doesNotMatch(securitySource, /Access-Control-Allow-Origin['"],\s*['"]\*['"]/);
});

test('sensitive export routes are absent from the public API', () => {
    assert.doesNotMatch(mainSource, /\/api\/export\/all/);
    assert.doesNotMatch(mainSource, /\/api\/export\/fingerprint/);
});

test('Guard requests carry the injected bearer token', () => {
    assert.match(guardSource, /['"]Authorization['"]:\s*['"]Bearer ['"]\s*\+\s*API_TOKEN/);
});
