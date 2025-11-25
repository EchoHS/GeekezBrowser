// utils.js (完整替换)
const { Base64 } = require('js-base64');
const { URL } = require('url');

function decodeBase64Content(str) {
    try {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(str, 'base64').toString('utf8');
    } catch (e) { return str; }
}

function getProxyRemark(link) {
    if (!link) return '';
    link = link.trim();
    try {
        if (link.startsWith('vmess://')) {
            const base64Str = link.replace('vmess://', '');
            const configStr = decodeBase64Content(base64Str);
            const vmess = JSON.parse(configStr);
            return vmess.ps || '';
        } else if (link.includes('#')) {
            return decodeURIComponent(link.split('#')[1]).trim();
        }
    } catch (e) { return ''; }
    return '';
}

function parseProxyLink(link, tag) {
    let outbound = { tag: tag };
    link = link.trim();

    try {
        if (link.startsWith('vmess://')) {
            const base64Str = link.replace('vmess://', '');
            const configStr = decodeBase64Content(base64Str);
            const vmess = JSON.parse(configStr);
            outbound.protocol = "vmess";
            outbound.settings = {
                vnext: [{
                    address: vmess.add, port: parseInt(vmess.port),
                    users: [{ id: vmess.id, alterId: parseInt(vmess.aid || 0), security: vmess.scy || "auto" }]
                }]
            };
            outbound.streamSettings = {
                network: vmess.net || "tcp",
                security: vmess.tls || "none",
                wsSettings: vmess.net === "ws" ? { path: vmess.path, headers: { Host: vmess.host } } : undefined,
                tlsSettings: vmess.tls === 'tls' ? { serverName: vmess.sni || vmess.host, allowInsecure: true } : undefined,
                grpcSettings: vmess.net === 'grpc' ? { serviceName: vmess.path } : undefined
            };
        } 
        else if (link.startsWith('vless://')) {
            const urlObj = new URL(link);
            const params = urlObj.searchParams;
            const security = params.get("security") || "none";

            outbound.protocol = "vless";
            outbound.settings = {
                vnext: [{
                    address: urlObj.hostname,
                    port: parseInt(urlObj.port),
                    users: [{
                        id: urlObj.username,
                        encryption: params.get("encryption") || "none",
                        flow: params.get("flow") || "" // XTLS Vision 必须参数
                    }]
                }]
            };

            outbound.streamSettings = {
                network: params.get("type") || "tcp",
                security: security,
                wsSettings: params.get("type") === 'ws' ? { path: params.get("path"), headers: { Host: params.get("host") } } : undefined,
                grpcSettings: params.get("type") === 'grpc' ? { serviceName: params.get("serviceName") } : undefined
            };

            if (security === 'tls') {
                outbound.streamSettings.tlsSettings = {
                    serverName: params.get("sni") || urlObj.hostname,
                    allowInsecure: true,
                    alpn: params.get("alpn") ? params.get("alpn").split(',') : undefined
                };
            }
            else if (security === 'reality') {
                // Reality 核心配置
                outbound.streamSettings.realitySettings = {
                    show: false,
                    fingerprint: params.get("fp") || "chrome",
                    serverName: params.get("sni") || "",
                    publicKey: params.get("pbk") || "", // 必须有
                    shortId: params.get("sid") || "",
                    spiderX: params.get("spx") || ""
                };
            }
        }
        else if (link.startsWith('trojan://')) {
            const urlObj = new URL(link);
            const params = urlObj.searchParams;
            outbound.protocol = "trojan";
            outbound.settings = { servers: [{ address: urlObj.hostname, port: parseInt(urlObj.port), password: urlObj.username }] };
            outbound.streamSettings = {
                network: params.get("type") || "tcp", security: "tls",
                tlsSettings: { serverName: params.get("sni") || urlObj.hostname, allowInsecure: true },
                wsSettings: params.get("type") === 'ws' ? { path: params.get("path") } : undefined,
                grpcSettings: params.get("type") === 'grpc' ? { serviceName: params.get("serviceName") } : undefined
            };
        }
        else if (link.startsWith('ss://')) {
            let raw = link.replace('ss://', '');
            if (raw.includes('#')) raw = raw.split('#')[0]; 
            let method, password, host, port;
            if (raw.includes('@')) {
                const parts = raw.split('@');
                const userPart = parts[0];
                const hostPart = parts[1];
                if (!userPart.includes(':')) { const decoded = decodeBase64Content(userPart); [method, password] = decoded.split(':'); } 
                else { [method, password] = userPart.split(':'); }
                [host, port] = hostPart.split(':');
            } else {
                const decoded = decodeBase64Content(raw);
                const match = decoded.match(/^(.*?):(.*?)@(.*?):(\d+)$/);
                if(match) { [, method, password, host, port] = match; } 
                else { const parts = decoded.split(':'); if(parts.length >= 3) { method=parts[0]; password=parts[1]; host=parts[2]; port=parts[3]; } }
            }
            outbound.protocol = "shadowsocks";
            outbound.settings = { servers: [{ address: host, port: parseInt(port), method, password }] };
        } else if (link.startsWith('socks5://') || link.startsWith('socks://')) {
            const urlObj = new URL(link.replace('socks5://', 'http://').replace('socks://', 'http://'));
            outbound.protocol = "socks";
            outbound.settings = { servers: [{ address: urlObj.hostname, port: parseInt(urlObj.port), users: urlObj.username ? [{ user: urlObj.username, pass: urlObj.password }] : [] }] };
        } else if (link.startsWith('http://') || link.startsWith('https://')) {
            const urlObj = new URL(link);
            outbound.protocol = "http";
            outbound.settings = { servers: [{ address: urlObj.hostname, port: parseInt(urlObj.port), users: urlObj.username ? [{ user: urlObj.username, pass: urlObj.password }] : [] }] };
        } else { throw new Error("Unsupported protocol"); }
    } catch (e) { console.error("Parse Proxy Error:", link, e); throw e; }
    return outbound;
}

function generateXrayConfig(mainProxyStr, localPort, preProxyConfig = null) {
    const outbounds = [];
    let mainOutbound;
    try { mainOutbound = parseProxyLink(mainProxyStr, "proxy_main"); } 
    catch (e) { mainOutbound = { protocol: "freedom", tag: "proxy_main" }; }

    if (preProxyConfig && preProxyConfig.preProxies && preProxyConfig.preProxies.length > 0) {
        try {
            const target = preProxyConfig.preProxies[0];
            const preOutbound = parseProxyLink(target.url, "proxy_pre");
            outbounds.push(preOutbound);
            mainOutbound.proxySettings = { tag: "proxy_pre" };
        } catch (e) {}
    }

    outbounds.push(mainOutbound);
    outbounds.push({ protocol: "freedom", tag: "direct" });

    return {
        log: { loglevel: "warning" }, // 改为 warning 减少垃圾日志，但关键错误会显示
        inbounds: [{ port: localPort, listen: "127.0.0.1", protocol: "socks", settings: { udp: true } }],
        outbounds: outbounds,
        routing: { rules: [{ type: "field", outboundTag: "proxy_main", port: "0-65535" }] }
    };
}

module.exports = { generateXrayConfig, parseProxyLink, getProxyRemark };