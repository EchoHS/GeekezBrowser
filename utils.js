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
    let outbound = {
        tag: tag,
        sniffing: {
            enabled: true,
            destOverride: ["http", "tls", "quic"],
            routeOnly: true
        }
    };
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

            const net = vmess.net || "tcp";
            outbound.streamSettings = {
                network: net,
                security: vmess.tls || "none",
                wsSettings: net === "ws" ? { path: vmess.path, headers: { Host: vmess.host } } : undefined,
                grpcSettings: net === "grpc" ? { serviceName: vmess.path || vmess.serviceName } : undefined,
                httpSettings: net === "h2" ? { path: vmess.path, host: vmess.host ? vmess.host.split(',') : [] } : undefined,
                kcpSettings: net === "kcp" ? { header: { type: vmess.type || "none" }, seed: vmess.path } : undefined,
                quicSettings: net === "quic" ? { security: vmess.host, key: vmess.path, header: { type: vmess.type } } : undefined
            };

            if (vmess.tls === 'tls') {
                outbound.streamSettings.tlsSettings = {
                    serverName: vmess.sni || vmess.host,
                    fingerprint: "chrome",
                    allowInsecure: true,
                    alpn: vmess.alpn ? vmess.alpn.split(',') : undefined
                };
            }
        }
        else if (link.startsWith('vless://')) {
            const urlObj = new URL(link);
            const params = urlObj.searchParams;
            const security = params.get("security") || "none";
            let type = params.get("type") || "tcp";

            outbound.protocol = "vless";
            outbound.settings = {
                vnext: [{
                    address: urlObj.hostname,
                    port: parseInt(urlObj.port),
                    users: [{
                        id: urlObj.username,
                        encryption: params.get("encryption") || "none",
                        flow: params.get("flow") || ""
                    }]
                }]
            };

            outbound.streamSettings = { network: type, security: security };

            if (type === 'ws') {
                outbound.streamSettings.wsSettings = { path: params.get("path"), headers: { Host: params.get("host") } };
            } else if (type === 'grpc') {
                outbound.streamSettings.grpcSettings = { serviceName: params.get("serviceName") };
            } else if (type === 'xhttp' || type === 'splithttp') {
                outbound.streamSettings.network = "xhttp";
                outbound.streamSettings.xhttpSettings = {
                    path: params.get("path") || "/",
                    host: params.get("host") || "",
                    mode: params.get("mode") || "stream-up"
                };
            } else if (type === 'kcp') {
                outbound.streamSettings.kcpSettings = { header: { type: params.get("headerType") || "none" }, seed: params.get("seed") };
            } else if (type === 'h2') {
                outbound.streamSettings.httpSettings = { path: params.get("path") || "/", host: params.get("host") ? params.get("host").split(',') : [] };
            }

            if (security === 'tls') {
                outbound.streamSettings.tlsSettings = {
                    serverName: params.get("sni") || params.get("host") || urlObj.hostname,
                    fingerprint: params.get("fp") || "chrome",
                    allowInsecure: true,
                    alpn: params.get("alpn") ? params.get("alpn").split(',') : undefined
                };
            } else if (security === 'reality') {
                outbound.streamSettings.realitySettings = {
                    show: false,
                    fingerprint: params.get("fp") || "chrome",
                    serverName: params.get("sni") || params.get("host") || "",
                    publicKey: params.get("pbk") || "",
                    shortId: params.get("sid") || "",
                    spiderX: params.get("spx") || ""
                };
            }
        }
        else if (link.startsWith('trojan://')) {
            const urlObj = new URL(link);
            const params = urlObj.searchParams;
            const type = params.get("type") || "tcp";

            outbound.protocol = "trojan";
            outbound.settings = { servers: [{ address: urlObj.hostname, port: parseInt(urlObj.port), password: urlObj.username }] };
            outbound.streamSettings = {
                network: type,
                security: params.get("security") || "tls",
                tlsSettings: { serverName: params.get("sni") || urlObj.hostname, fingerprint: "chrome", allowInsecure: true },
                wsSettings: type === 'ws' ? { path: params.get("path"), headers: { Host: params.get("host") } } : undefined,
                grpcSettings: type === 'grpc' ? { serviceName: params.get("serviceName") } : undefined
            };
        }
        else if (link.startsWith('ss://')) {
            let raw = link.replace('ss://', '');
            if (raw.includes('#')) raw = raw.split('#')[0];
            let method, password, host, port;

            // Handle new ss format (user:pass@host:port) and legacy format (base64)
            if (raw.includes('@')) {
                const parts = raw.split('@');
                const userPart = parts[0];
                const hostPart = parts[1];

                // Check if userPart is base64 encoded (legacy with @) or plain text
                // Shadowsocks-2022 often uses long keys which might look like base64 but are just strings
                // A simple heuristic: if it contains ':', it's likely method:password. 
                // If it doesn't, it might be base64 encoded method:password
                if (!userPart.includes(':')) {
                    try {
                        const decoded = decodeBase64Content(userPart);
                        if (decoded.includes(':')) {
                            [method, password] = decoded.split(':');
                        } else {
                            // Fallback or error
                            throw new Error("Invalid SS User Part");
                        }
                    } catch (e) {
                        // Maybe it's not base64, but just a password? Unlikely for standard SS links
                        throw e;
                    }
                } else {
                    [method, password] = userPart.split(':');
                }

                // Host part might be ipv6 [::1]:port or ipv4:port
                const lastColonIndex = hostPart.lastIndexOf(':');
                host = hostPart.substring(0, lastColonIndex);
                port = hostPart.substring(lastColonIndex + 1);

                // Remove brackets from IPv6
                if (host.startsWith('[') && host.endsWith(']')) {
                    host = host.slice(1, -1);
                }
            } else {
                // Legacy base64 encoded link
                const decoded = decodeBase64Content(raw);
                const match = decoded.match(/^(.*?):(.*?)@(.*?):(\d+)$/);
                if (match) {
                    [, method, password, host, port] = match;
                } else {
                    const parts = decoded.split(':');
                    if (parts.length >= 3) {
                        method = parts[0];
                        password = parts[1];
                        host = parts[2];
                        port = parts[3];
                    }
                }
            }

            outbound.protocol = "shadowsocks";
            outbound.settings = {
                servers: [{
                    address: host,
                    port: parseInt(port),
                    method: method,
                    password: password,
                    ota: false,
                    level: 1
                }]
            };
            // Shadowsocks streamSettings
            outbound.streamSettings = {
                network: "tcp"
            };
            // Mux 配置
            outbound.mux = {
                enabled: false,
                concurrency: -1
            };
        } else if (link.startsWith('socks')) {
            const urlObj = new URL(link.replace(/^socks5?:\/\//, 'http://'));
            outbound.protocol = "socks";
            outbound.settings = { servers: [{ address: urlObj.hostname, port: parseInt(urlObj.port), users: urlObj.username ? [{ user: urlObj.username, pass: urlObj.password }] : [] }] };
        } else if (link.startsWith('http')) {
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
        } catch (e) { }
    }

    outbounds.push(mainOutbound);
    outbounds.push({ protocol: "freedom", tag: "direct" });

    return {
        log: { loglevel: "warning" },
        inbounds: [{ port: localPort, listen: "127.0.0.1", protocol: "socks", settings: { udp: true } }],
        outbounds: outbounds,
        routing: {
            domainStrategy: "IPIfNonMatch",
            rules: [{ type: "field", outboundTag: "proxy_main", port: "0-65535" }]
        }
    };
}

module.exports = { generateXrayConfig, parseProxyLink, getProxyRemark };