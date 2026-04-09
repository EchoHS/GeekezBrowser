const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLinuxXrayAssetName, resolveXrayAssetName } = require('../src/main/xray-assets');

test('resolveLinuxXrayAssetName maps x64 and arm64 to the correct Xray packages', () => {
    assert.equal(resolveLinuxXrayAssetName({ arch: 'x64' }), 'Xray-linux-64.zip');
    assert.equal(resolveLinuxXrayAssetName({ arch: 'arm64' }), 'Xray-linux-arm64-v8a.zip');
});

test('resolveLinuxXrayAssetName maps 32-bit ARM variants explicitly', () => {
    assert.equal(resolveLinuxXrayAssetName({ arch: 'arm', armVersion: 7 }), 'Xray-linux-arm32-v7a.zip');
    assert.equal(resolveLinuxXrayAssetName({ arch: 'arm', armVersion: 6 }), 'Xray-linux-arm32-v6.zip');
    assert.equal(resolveLinuxXrayAssetName({ arch: 'arm', armVersion: 5 }), 'Xray-linux-arm32-v5.zip');
});

test('resolveLinuxXrayAssetName defaults unknown 32-bit ARM variants to v7a', () => {
    assert.equal(resolveLinuxXrayAssetName({ arch: 'arm' }), 'Xray-linux-arm32-v7a.zip');
});

test('resolveXrayAssetName returns null for unsupported Linux architectures', () => {
    assert.equal(resolveXrayAssetName({ platform: 'linux', arch: 'riscv64' }), null);
});
