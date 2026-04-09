const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveChromiumPath } = require('../src/main/chromium-path');

function makeExecutable(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(filePath, 0o755);
    return filePath;
}

test('resolveChromiumPath finds the bundled Linux Chrome binary', (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-path-'));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const basePath = path.join(tempRoot, 'puppeteer');
    const bundledChrome = makeExecutable(
        path.join(basePath, 'chrome', 'linux-147.0.7727.50', 'chrome-linux64', 'chrome')
    );
    makeExecutable(path.join(tempRoot, 'bin', 'chromium'));

    const resolved = resolveChromiumPath({
        basePath,
        platform: 'linux',
        env: { PATH: path.join(tempRoot, 'bin') }
    });

    assert.equal(resolved, bundledChrome);
});

test('resolveChromiumPath falls back to PATH on Linux when no bundled browser exists', (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-path-'));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const binDir = path.join(tempRoot, 'bin');
    const pathChrome = makeExecutable(path.join(binDir, 'google-chrome'));

    const resolved = resolveChromiumPath({
        basePath: path.join(tempRoot, 'missing-puppeteer'),
        platform: 'linux',
        env: { PATH: binDir }
    });

    assert.equal(resolved, pathChrome);
});
