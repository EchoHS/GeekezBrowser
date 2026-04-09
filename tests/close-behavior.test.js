const test = require('node:test');
const assert = require('node:assert/strict');

const { CLOSE_BEHAVIOR, normalizeCloseBehavior, resolveCloseBehavior } = require('../src/main/close-behavior');

test('normalizeCloseBehavior defaults invalid values to tray', () => {
    assert.equal(normalizeCloseBehavior('unexpected'), CLOSE_BEHAVIOR.TRAY);
});

test('resolveCloseBehavior keeps tray behavior when tray is available', () => {
    const resolved = resolveCloseBehavior(CLOSE_BEHAVIOR.TRAY, { trayAvailable: true });
    assert.equal(resolved, CLOSE_BEHAVIOR.TRAY);
});

test('resolveCloseBehavior falls back to quit when tray is unavailable', () => {
    const resolved = resolveCloseBehavior(CLOSE_BEHAVIOR.TRAY, { trayAvailable: false });
    assert.equal(resolved, CLOSE_BEHAVIOR.QUIT);
});
