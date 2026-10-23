const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');

// utils.js mixes CommonJS requires with an ESM export for electron-vite.
// Adapt only the export so these tests exercise it without starting Electron.
const filename = path.join(__dirname, '../src/main/utils.js');
const source = fs.readFileSync(filename, 'utf8').replace(
    /^export \{ generateXrayConfig, parseProxyLink, getProxyRemark \};\s*$/m,
    'return { generateXrayConfig, parseProxyLink, getProxyRemark };'
);
const { generateXrayConfig } = compileFunction(source, ['require'], { filename })(require);

const preProxy = { preProxies: [{ url: 'socks5://127.0.0.1:1081' }] };
const uuid = '11111111-1111-4111-8111-111111111111';
const trojan = new URL('trojan://127.0.0.1:443?type=ws&security=tls&sni=example.com&path=%2Ftrojan');
trojan.username = 'test-password';
const links = {
    socks: 'socks5://user:password@127.0.0.1:1082',
    http: 'http://user:password@127.0.0.1:8080',
    'host:port': '127.0.0.1:1082',
    shadowsocks: 'ss://aes-128-gcm:password@127.0.0.1:8388',
    vmess: 'vmess://' + Buffer.from(JSON.stringify({
        add: '127.0.0.1', port: 443, id: uuid, net: 'ws', tls: 'tls',
        host: 'example.com', path: '/vmess', sni: 'example.com'
    })).toString('base64'),
    vless: `vless://${uuid}@127.0.0.1:443?type=grpc&security=tls&sni=example.com&serviceName=proxy`,
    trojan: trojan.href
};

for (const [protocol, link] of Object.entries(links)) {
    test(`chained ${protocol} uses dialerProxy and preserves proxy settings`, () => {
        const direct = generateXrayConfig(link, 1080);
        const chained = generateXrayConfig(link, 1080, preProxy);
        const main = chained.outbounds.find(outbound => outbound.tag === 'proxy_main');
        const pre = chained.outbounds.find(outbound => outbound.tag === 'proxy_pre');

        assert.equal(main.streamSettings.sockopt.dialerProxy, 'proxy_pre');
        assert.equal(pre.protocol, 'socks');
        assert.equal(pre.streamSettings?.sockopt?.dialerProxy, undefined);
        assert.ok(chained.outbounds.every(outbound => !Object.hasOwn(outbound, 'proxySettings')));

        const { sockopt, ...streamSettings } = main.streamSettings;
        assert.deepEqual(streamSettings, direct.outbounds[0].streamSettings || {});
        assert.deepEqual(main.settings, direct.outbounds[0].settings);
        assert.deepEqual(chained.routing, direct.routing);
        assert.deepEqual(chained.inbounds, direct.inbounds);
        assert.deepEqual(chained.outbounds.at(-1), direct.outbounds.at(-1));
    });
}

test('TLS fingerprints on both hops survive chaining', () => {
    const config = generateXrayConfig(links.vless, 1080, {
        preProxies: [{ url: links.trojan }]
    }, { browserType: 'edge', browserMajorVersion: 132 });

    for (const outbound of config.outbounds.slice(0, 2)) {
        assert.equal(outbound.streamSettings.tlsSettings.fingerprint, 'edge');
        assert.equal(outbound.streamSettings.tlsSettings.serverName, 'example.com');
    }
    assert.equal(config.outbounds[1].streamSettings.sockopt.dialerProxy, 'proxy_pre');
});

test('missing or empty pre-proxy configuration keeps direct outbound unchanged', () => {
    const expected = generateXrayConfig(links.socks, 1080);
    assert.equal(expected.outbounds.length, 2);
    assert.equal(expected.outbounds[0].streamSettings, undefined);
    for (const config of [null, {}, { preProxies: [] }]) {
        assert.deepEqual(generateXrayConfig(links.socks, 1080, config), expected);
    }
});
