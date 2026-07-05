const { Base64 } = require('js-base64');
const { URL } = require('url');

function decodeBase64Content(str) {
    try {
        if (!str) return '';
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4 !== 0) str += '=';
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
        tag: tag
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
                tlsSettings: { serverName: params.get("sni") || urlObj.hostname, fingerprint: "chrome" },
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
                            const colonIdx = decoded.indexOf(':');
                            method = decoded.substring(0, colonIdx);
                            password = decoded.substring(colonIdx + 1);
                        } else {
                            // Fallback or error
                            throw new Error("Invalid SS User Part");
                        }
                    } catch (e) {
                        // Maybe it's not base64, but just a password? Unlikely for standard SS links
                        throw e;
                    }
                } else {
                    const colonIdx = userPart.indexOf(':');
                    method = userPart.substring(0, colonIdx);
                    password = userPart.substring(colonIdx + 1);
                }

                // Host part might be ipv6 [::1]:port or ipv4:port
                let lastColonIndex = hostPart.lastIndexOf(':');
                if (lastColonIndex === -1) {
                    host = hostPart;
                    port = "8388";
                } else {
                    host = hostPart.substring(0, lastColonIndex);
                    port = hostPart.substring(lastColonIndex + 1);
                }
                
                // Remove potential query/fragment from port
                if (port.includes('?')) port = port.split('?')[0];
                if (port.includes('/')) port = port.split('/')[0];

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
            
            // Minimalist settings matching v2rayN format
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

            // Minimalist streamSettings
            outbound.streamSettings = {
                network: "tcp"
            };

            const fullLinkForParams = link.split('#')[0];
            if (fullLinkForParams.includes('?')) {
                const queryStr = fullLinkForParams.split('?')[1];
                const urlParams = new URLSearchParams(queryStr);
                
                // Only add uot if explicitly requested (match v2rayN export which lacks it)
                if (urlParams.get('uot') === '1' || urlParams.get('uot') === 'true') {
                    outbound.settings.servers[0].uot = true;
                }

                const plugin = urlParams.get('plugin');
                if (plugin && plugin.includes('obfs')) {
                    const pluginParts = plugin.split(';');
                    let obfsType = '', obfsHost = '';
                    pluginParts.forEach(p => {
                        const kv = p.split('=');
                        if (kv[0] === 'obfs') obfsType = kv[1];
                        if (kv[0] === 'obfs-host') obfsHost = kv[1];
                    });
                    if (obfsType === 'http') {
                        outbound.streamSettings = {
                            network: "tcp",
                            tcpSettings: {
                                header: {
                                    type: "http",
                                    request: {
                                        version: "1.1",
                                        method: "GET",
                                        path: ["/"],
                                        headers: {
                                            Host: obfsHost ? [obfsHost] : [],
                                            "User-Agent": [],
                                            "Accept-Encoding": ["gzip, deflate"],
                                            Connection: ["keep-alive"],
                                            Pragma: "no-cache"
                                        }
                                    }
                                }
                            }
                        };
                    } else if (obfsType === 'tls') {
                        outbound.streamSettings = {
                            network: "tcp",
                            security: "tls",
                            tlsSettings: {
                                serverName: obfsHost || host
                            }
                        };
                    }
                }
            }

            // Mux 配置
            outbound.mux = {
                enabled: false,
                concurrency: -1
            };
        } else if (link.startsWith('socks')) {
            // Support two SOCKS5 formats:
            // 1. v2rayN format: socks://base64(user:pass)@host:port#remark
            // 2. Standard format: socks://user:pass@host:port

            outbound.protocol = "socks";

            // Remove socks:// or socks5://
            let cleanLink = link.replace(/^socks5?:\/\//, '');

            // Extract remark if exists (after #)
            const hashIndex = cleanLink.indexOf('#');
            if (hashIndex !== -1) {
                cleanLink = cleanLink.substring(0, hashIndex);
            }

            // Split by @ to get auth and server parts
            const atIndex = cleanLink.indexOf('@');
            let username = '';
            let password = '';
            let serverPart = cleanLink;

            if (atIndex !== -1) {
                const authPart = cleanLink.substring(0, atIndex);
                serverPart = cleanLink.substring(atIndex + 1);

                // Standard auth: socks://user:pass@host:port
                const plainColonIndex = authPart.indexOf(':');
                if (plainColonIndex !== -1) {
                    username = authPart.substring(0, plainColonIndex);
                    password = authPart.substring(plainColonIndex + 1);
                } else {
                    // v2rayN auth: socks://base64(user:pass)@host:port
                    const looksBase64 = /^[A-Za-z0-9+/=_-]+$/.test(authPart);
                    if (looksBase64) {
                        const decoded = decodeBase64Content(authPart);
                        const decodedColonIndex = decoded.indexOf(':');
                        if (decodedColonIndex !== -1) {
                            username = decoded.substring(0, decodedColonIndex);
                            password = decoded.substring(decodedColonIndex + 1);
                        } else {
                            username = authPart;
                        }
                    } else {
                        username = authPart;
                    }
                }
            }

            // Parse server part (host:port), keep IPv6 compatibility.
            let address = serverPart;
            let port = 1080;
            try {
                const serverUrl = new URL(`socks://${serverPart}`);
                address = serverUrl.hostname;
                port = serverUrl.port ? parseInt(serverUrl.port) : 1080;
            } catch (e) {
                const colonIndex = serverPart.lastIndexOf(':');
                address = colonIndex !== -1 ? serverPart.substring(0, colonIndex) : serverPart;
                port = colonIndex !== -1 ? parseInt(serverPart.substring(colonIndex + 1)) : 1080;
            }

            outbound.settings = {
                servers: [{
                    address: address,
                    port: port,
                    users: username ? [{ user: username, pass: password }] : []
                }]
            };
        } else if (link.includes(':') && !link.includes('://')) {
            // Handle IP:Port:User:Pass format (e.g., 107.150.98.193:1536:user:pass)
            const parts = link.split(':');
            if (parts.length === 4) {
                outbound.protocol = "socks";
                outbound.settings = {
                    servers: [{
                        address: parts[0],
                        port: parseInt(parts[1]),
                        users: [{ user: parts[2], pass: parts[3] }]
                    }]
                };
            } else if (parts.length === 2) {
                // IP:Port without auth
                outbound.protocol = "socks";
                outbound.settings = {
                    servers: [{
                        address: parts[0],
                        port: parseInt(parts[1]),
                        users: []
                    }]
                };
            } else {
                throw new Error("Invalid IP:Port:User:Pass format");
            }
        } else if (link.startsWith('http')) {
            const urlObj = new URL(link);
            outbound.protocol = "http";
            outbound.settings = { servers: [{ address: urlObj.hostname, port: parseInt(urlObj.port), users: urlObj.username ? [{ user: urlObj.username, pass: urlObj.password }] : [] }] };
        } else { throw new Error("Unsupported protocol"); }
    } catch (e) { console.error("Parse Proxy Error:", link, e); throw e; }
    return outbound;
}

function deriveUtlsFingerprint(profileFingerprint = {}) {
    if (profileFingerprint.uaMode === 'none') return '';

    const browserType = String(profileFingerprint.browserType || '').toLowerCase();
    const major = Number(profileFingerprint.browserMajorVersion) || 0;

    if (browserType === 'edge') {
        if (major >= 132) return 'edge';
        if (major >= 126) return 'chrome';
        return 'randomized';
    }

    if (major >= 134) return 'chrome';
    if (major >= 128) return 'randomized';
    if (major >= 123) return 'hellorandomizednoalpn';
    return 'chrome';
}

function applyUtlsFingerprint(outbound, utlsFingerprint) {
    if (!outbound || !utlsFingerprint || !outbound.streamSettings) return;

    const stream = outbound.streamSettings;
    if (stream.security === 'tls') {
        if (!stream.tlsSettings) stream.tlsSettings = {};
        stream.tlsSettings.fingerprint = utlsFingerprint;
    }

    if (stream.security === 'reality') {
        if (!stream.realitySettings) stream.realitySettings = {};
        stream.realitySettings.fingerprint = utlsFingerprint;
    }
}

function generateXrayConfig(mainProxyStr, localPort, preProxyConfig = null, profileFingerprint = null) {
    const outbounds = [];
    const utlsFingerprint = deriveUtlsFingerprint(profileFingerprint || {});
    const mainOutbound = parseProxyLink(mainProxyStr, "proxy_main");
    applyUtlsFingerprint(mainOutbound, utlsFingerprint);

    if (preProxyConfig && preProxyConfig.preProxies && preProxyConfig.preProxies.length > 0) {
        try {
            const target = preProxyConfig.preProxies[0];
            const preOutbound = parseProxyLink(target.url, "proxy_pre");
            applyUtlsFingerprint(preOutbound, utlsFingerprint);
            outbounds.push(preOutbound);
            mainOutbound.proxySettings = { tag: "proxy_pre" };
        } catch (e) { }
    }

    outbounds.push(mainOutbound);
    outbounds.push({ protocol: "freedom", tag: "direct" });

    return {
        log: { loglevel: "warning" },
        inbounds: [{ 
            port: localPort, 
            listen: "127.0.0.1", 
            protocol: "socks", 
            settings: { udp: true },
            sniffing: {
                enabled: true,
                destOverride: ["http", "tls", "quic"],
                routeOnly: false
            }
        }],
        outbounds: outbounds,
        routing: {
            domainStrategy: "AsIs",
            rules: [{ type: "field", outboundTag: "proxy_main", port: "0-65535" }]
        }
    };
}

export { generateXrayConfig, parseProxyLink, getProxyRemark };
