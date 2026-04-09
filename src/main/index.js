const { app, BrowserWindow, ipcMain, dialog, screen, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn, exec, execSync } = require('child_process');
const puppeteer = require('puppeteer'); // 使用原生 puppeteer，不带 extra
const yaml = require('js-yaml');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { getChromiumPath: resolveChromiumPathForApp } = require('./chromium-path');
const { CLOSE_BEHAVIOR, normalizeCloseBehavior, resolveCloseBehavior } = require('./close-behavior');
const { resolveXrayAssetName } = require('./xray-assets');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const initSqlJs = require('sql.js');
const { SocksClient } = require('socks');

const uuidv4 = () => crypto.randomUUID();

let getPortApiPromise = null;
async function resolveGetPortApi() {
    if (!getPortApiPromise) {
        getPortApiPromise = import('get-port').then((mod) => {
            const getPortFn = mod?.default || mod;
            const makeRange = typeof getPortFn?.makeRange === 'function'
                ? getPortFn.makeRange.bind(getPortFn)
                : (typeof mod?.portNumbers === 'function'
                    ? (start, end) => mod.portNumbers(start, end)
                    : (start, end) => Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i));
            return { getPortFn, makeRange };
        });
    }
    return getPortApiPromise;
}

async function getAvailablePort(options) {
    const { getPortFn } = await resolveGetPortApi();
    return await getPortFn(options);
}

let socksProxyAgentCtorPromise = null;
async function createSocksProxyAgent(proxyUrl) {
    if (!socksProxyAgentCtorPromise) {
        socksProxyAgentCtorPromise = import('socks-proxy-agent').then((mod) =>
            mod?.SocksProxyAgent || mod?.default?.SocksProxyAgent || mod?.default
        );
    }
    const SocksProxyAgentCtor = await socksProxyAgentCtorPromise;
    return new SocksProxyAgentCtor(proxyUrl);
}


// Hardware acceleration enabled for better UI performance
// Only disable if GPU compatibility issues occur

import { generateXrayConfig, parseProxyLink, getProxyRemark } from './utils';
import { generateFingerprint, getInjectScript } from './fingerprint';

const isDev = !app.isPackaged;
const RESOURCES_BIN = isDev ? path.join(app.getAppPath(), 'resources', 'bin') : path.join(process.resourcesPath, 'bin');
// Use platform+arch specific directory for xray binary
const PLATFORM_ARCH = `${process.platform}-${process.arch}`; // e.g., darwin-arm64, darwin-x64, win32-x64
const BIN_DIR = path.join(RESOURCES_BIN, PLATFORM_ARCH);
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'xray.exe' : 'xray');
// Fallback to old location for backward compatibility
const BIN_DIR_LEGACY = RESOURCES_BIN;
const BIN_PATH_LEGACY = path.join(BIN_DIR_LEGACY, process.platform === 'win32' ? 'xray.exe' : 'xray');

// 自定义数据目录支持
const APP_CONFIG_FILE = path.join(app.getPath('userData'), 'app-config.json');
const DEFAULT_DATA_PATH = path.join(app.getPath('userData'), 'BrowserProfiles');

// 读取自定义数据目录
function getCustomDataPath() {
    try {
        if (fs.existsSync(APP_CONFIG_FILE)) {
            const config = fs.readJsonSync(APP_CONFIG_FILE);
            if (config.customDataPath && fs.existsSync(config.customDataPath)) {
                return config.customDataPath;
            }
        }
    } catch (e) {
        console.error('Failed to read custom data path:', e);
    }
    return DEFAULT_DATA_PATH;
}

const DATA_PATH = getCustomDataPath();
const TRASH_PATH = path.join(app.getPath('userData'), '_Trash_Bin');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');
const SETTINGS_FILE = path.join(DATA_PATH, 'settings.json');
const USER_EXTENSIONS_DIR = path.join(DATA_PATH, '_extensions');

fs.ensureDirSync(DATA_PATH);
fs.ensureDirSync(TRASH_PATH);
fs.ensureDirSync(USER_EXTENSIONS_DIR);

const EXTENSION_STORE_CATALOG = [
    {
        id: 'bpoadfkcbjbfhfodiogcnhhhpibjhbnh',
        name: '沉浸式翻译 - 网页翻译插件 | PDF翻译 | 免费',
        description: '支持网页、PDF、字幕与双语对照的翻译扩展。',
        homepage: 'https://chromewebstore.google.com/detail/%E6%B2%89%E6%B5%B8%E5%BC%8F%E7%BF%BB%E8%AF%91-%E7%BD%91%E9%A1%B5%E7%BF%BB%E8%AF%91%E6%8F%92%E4%BB%B6-pdf%E7%BF%BB%E8%AF%91-%E5%85%8D%E8%B4%B9/bpoadfkcbjbfhfodiogcnhhhpibjhbnh'
    },
    {
        id: 'amkbmndfnliijdhojkpoglbnaaahippg',
        name: 'Immersive Translate',
        description: 'Bilingual translation for webpages, PDFs and subtitles.',
        homepage: 'https://chromewebstore.google.com/detail/immersive-translate/amkbmndfnliijdhojkpoglbnaaahippg'
    },
    {
        id: 'aapbdbdomjkkjkaonfhkkikfgjllcleb',
        name: 'Google Translate',
        description: 'Translate webpages and quick text snippets.',
        homepage: 'https://chromewebstore.google.com/detail/google-translate/aapbdbdomjkkjkaonfhkkikfgjllcleb'
    },
    {
        id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
        name: 'Dark Reader',
        description: 'Dark mode for every website.',
        homepage: 'https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh'
    },
    {
        id: 'nngceckbapebfimnlniiiahkandclblb',
        name: 'Bitwarden',
        description: 'Password manager with secure vault sync.',
        homepage: 'https://chromewebstore.google.com/detail/bitwarden-free-password-m/nngceckbapebfimnlniiiahkandclblb'
    },
    {
        id: 'ghbmnnjooekpmoecnnnilnnbdlolhkhi',
        name: 'Google Docs Offline',
        description: 'Edit Google Docs/Sheets/Slides offline.',
        homepage: 'https://chromewebstore.google.com/detail/google-docs-offline/ghbmnnjooekpmoecnnnilnnbdlolhkhi'
    },
    {
        id: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
        name: 'uBlock Origin Lite',
        description: 'Manifest V3 edition of uBlock for Chromium.',
        homepage: 'https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh'
    }
];

let activeProcesses = {};
let apiServer = null;
let apiServerRunning = false;
let mainWindow = null; // Global reference for API-to-UI communication
let appTray = null;
let isAppQuitting = false;
let cachedCloseBehavior = CLOSE_BEHAVIOR.TRAY;

// ============================================================================
// REST API Server
// ============================================================================
function createApiServer(port) {
    const server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://localhost:${port}`);
        const pathname = url.pathname;
        const method = req.method;

        // Parse body for POST/PUT
        let body = '';
        if (method === 'POST' || method === 'PUT') {
            body = await new Promise(resolve => {
                let data = '';
                req.on('data', chunk => data += chunk);
                req.on('end', () => resolve(data));
            });
        }

        try {
            const result = await handleApiRequest(method, pathname, body, url.searchParams);
            res.writeHead(result.status || 200);
            res.end(JSON.stringify(result.data || result));
        } catch (err) {
            console.error('API Error:', err);
            res.writeHead(err.status || err.statusCode || 500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
    });

    return server;
}

// 2. 仅用于扩展密码同步的内部服务器 (独立端口 12139，无条件常驻)
let internalApiServer = null;
const INTERNAL_API_PORT = 12139;

function createInternalApiServer() {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        const url = new URL(req.url, `http://localhost:${INTERNAL_API_PORT}`);

        if (req.method === 'POST' && url.pathname === '/api/passwords/sync') {
            let body = await new Promise(resolve => {
                let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => resolve(data));
            });
            try {
                const data = JSON.parse(body);
                if (!data.profileId || !data.passwords) {
                    res.writeHead(400); return res.end(JSON.stringify({ success: false, error: 'profileId and passwords required' }));
                }
                const pwFile = require('path').join(DATA_PATH, data.profileId, 'passwords.json');
                await require('fs-extra').ensureDir(require('path').dirname(pwFile));
                await writeEncryptedPasswords(pwFile, data.passwords, data.profileId);
                res.writeHead(200); res.end(JSON.stringify({ success: true, count: data.passwords.length }));
            } catch (err) {
                res.writeHead(500); res.end(JSON.stringify({ success: false, error: err.message }));
            }
        } else {
            res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
        }
    });
    return server;
}

// --- Browser data backup helper (module scope) ---
const backupExcludeDirs = new Set([
    'Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache',
    'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'Service Worker',
    'component_crx_cache', 'extensions_crx_cache', 'blob_storage',
    'File System', 'IndexedDB', 'CertificateRevocation',
    'Safe Browsing', 'BudgetDatabase', 'Platform Notifications',
    'Storage', 'databases', 'Session Storage'
]);

async function collectDirRecursive(dirPath, basePath) {
    const files = {};
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        // Normalize to forward slashes for cross-platform compatibility (Win -> Mac)
        const relativePath = path.relative(basePath, fullPath).split(path.sep).join('/');
        if (entry.isDirectory()) {
            if (backupExcludeDirs.has(entry.name)) continue;
            const subFiles = await collectDirRecursive(fullPath, basePath);
            Object.assign(files, subFiles);
        } else if (entry.isFile()) {
            try {
                const content = await fs.readFile(fullPath);
                files[relativePath] = content.toString('base64');
            } catch (err) {
                console.error(`Failed to read ${relativePath}:`, err.message);
            }
        }
    }
    return files;
}

function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined) return value;
    }
    return undefined;
}

function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeTags(rawTags) {
    if (Array.isArray(rawTags)) {
        return rawTags
            .map(tag => String(tag || '').trim())
            .filter(Boolean);
    }
    if (typeof rawTags === 'string') {
        return rawTags
            .split(/[,，]/)
            .map(tag => tag.trim())
            .filter(Boolean);
    }
    return [];
}

function sanitizeExtensionStoreId(rawId) {
    const value = String(rawId || '').trim().toLowerCase();
    return /^[a-z]{32}$/.test(value) ? value : '';
}

function parseExtensionStoreIdFromInput(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) return '';
    const fromId = sanitizeExtensionStoreId(raw);
    if (fromId) return fromId;

    const urlDecoded = (() => {
        try { return decodeURIComponent(raw); } catch (e) { return raw; }
    })();
    const match = urlDecoded.match(/chromewebstore\.google\.com\/detail\/[^/]+\/([a-z]{32})/i);
    return match ? match[1].toLowerCase() : '';
}

function parseExtensionStoreInputMeta(rawInput) {
    const raw = String(rawInput || '').trim();
    const decoded = (() => {
        try { return decodeURIComponent(raw); } catch (e) { return raw; }
    })();
    const id = parseExtensionStoreIdFromInput(decoded);
    const slugMatch = decoded.match(/chromewebstore\.google\.com\/detail\/([^/]+)\/([a-z]{32})/i);
    const slugName = slugMatch && slugMatch[1] ? decodeSlugToName(slugMatch[1]) : '';
    return { id, slugName };
}

function makeStableExtensionId(seed) {
    const digest = crypto.createHash('sha1').update(String(seed || '')).digest('hex').slice(0, 16);
    return `ext_${digest}`;
}

function normalizeUserExtensionEntry(entry) {
    if (typeof entry === 'string') {
        const extPath = entry.trim();
        if (!extPath) return null;
        return {
            id: makeStableExtensionId(`folder:${extPath}`),
            name: path.basename(extPath) || 'Extension',
            path: extPath,
            source: 'folder',
            applyMode: 'all',
            profileIds: [],
            storeId: '',
            version: '',
            homepage: '',
            installedAt: Date.now()
        };
    }

    if (!entry || typeof entry !== 'object') return null;
    const extPath = String(firstDefined(entry.path, entry.extPath, '') || '').trim();
    if (!extPath) return null;

    const source = ['folder', 'crx', 'store'].includes(entry.source) ? entry.source : 'folder';
    const applyMode = entry.applyMode === 'selected' ? 'selected' : 'all';
    const profileIds = applyMode === 'selected'
        ? Array.from(new Set((Array.isArray(entry.profileIds) ? entry.profileIds : []).map(id => String(id || '').trim()).filter(Boolean)))
        : [];
    const storeId = sanitizeExtensionStoreId(firstDefined(entry.storeId, entry.extensionId, ''));
    const id = String(entry.id || makeStableExtensionId(`${source}:${extPath}:${storeId || ''}`));

    return {
        id,
        name: String(entry.name || path.basename(extPath) || 'Extension'),
        path: extPath,
        source,
        applyMode,
        profileIds,
        storeId,
        version: String(entry.version || ''),
        homepage: String(entry.homepage || ''),
        installedAt: Number(entry.installedAt) || Date.now()
    };
}

function normalizeUserExtensions(rawExtensions) {
    const list = Array.isArray(rawExtensions) ? rawExtensions : [];
    const result = [];
    const seen = new Set();

    for (const item of list) {
        const normalized = normalizeUserExtensionEntry(item);
        if (!normalized) continue;
        const key = `${normalized.id}|${normalized.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }

    return result;
}

function shouldApplyExtensionToProfile(extensionItem, profileId) {
    if (!extensionItem || !profileId) return false;
    if (extensionItem.applyMode !== 'selected') return true;
    return Array.isArray(extensionItem.profileIds) && extensionItem.profileIds.includes(profileId);
}

function getProfileUserExtensions(settings, profileId) {
    const userExtensions = normalizeUserExtensions(settings?.userExtensions || []);
    return userExtensions.filter((ext) => {
        if (!ext.path || !fs.existsSync(ext.path)) return false;
        try {
            const manifestPath = path.join(ext.path, 'manifest.json');
            if (!fs.existsSync(manifestPath)) return false;
            const manifest = fs.readJsonSync(manifestPath);
            if (Number(manifest?.manifest_version) !== 3) return false;
        } catch (e) {
            return false;
        }
        return shouldApplyExtensionToProfile(ext, profileId);
    });
}

function getExtensionStoreCatalog(query = '') {
    const keyword = String(query || '').trim().toLowerCase();
    if (!keyword) return EXTENSION_STORE_CATALOG;
    const parsedMeta = parseExtensionStoreInputMeta(keyword);
    const parsedStoreId = parsedMeta.id;
    const parsedName = parsedMeta.slugName;

    const matched = EXTENSION_STORE_CATALOG.filter(item =>
        item.name.toLowerCase().includes(keyword) ||
        item.id.includes(keyword) ||
        item.description.toLowerCase().includes(keyword)
    );

    if (!parsedStoreId) return matched;
    const exists = matched.some(item => item.id === parsedStoreId);
    if (exists) return matched;

    return [{
        id: parsedStoreId,
        name: parsedName || `Chrome Web Store (${parsedStoreId.slice(0, 6)}...)`,
        description: '通过输入的商店链接/ID解析得到。',
        homepage: `https://chromewebstore.google.com/detail/${parsedStoreId}`
    }, ...matched];
}

function fetchTextWithRedirect(url, timeoutMs = 10000, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 3) {
            reject(new Error('Too many redirects'));
            return;
        }

        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : new URL(res.headers.location, url).toString();
                resolve(fetchTextWithRedirect(nextUrl, timeoutMs, redirectCount + 1));
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                data += chunk;
                if (data.length > 2_500_000) {
                    req.destroy(new Error('Response too large'));
                }
            });
            res.on('end', () => resolve({ html: data, finalUrl: url }));
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Request timeout'));
        });
        req.on('error', reject);
    });
}

function decodeSlugToName(slug) {
    if (!slug) return '';
    try {
        const decoded = decodeURIComponent(slug)
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return decoded || '';
    } catch (e) {
        return String(slug).replace(/-/g, ' ').trim();
    }
}

function parseStoreSearchEntriesFromHtml(html) {
    const results = [];
    const seen = new Set();
    const regex = /\/detail\/([^/"'?#]+)\/([a-z]{32})/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const slug = match[1];
        const id = match[2].toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);

        const around = html.slice(Math.max(0, match.index - 500), Math.min(html.length, match.index + 800));
        const titleMatch =
            around.match(/aria-label="([^"]+)"/i) ||
            around.match(/"name":"([^"]+)"/i) ||
            around.match(/title="([^"]+)"/i);
        const descMatch =
            around.match(/"description":"([^"]+)"/i) ||
            around.match(/data-tooltip="([^"]+)"/i);
        const name = (titleMatch && titleMatch[1] ? titleMatch[1] : decodeSlugToName(slug)) || `Extension ${id.slice(0, 6)}`;
        const description = (descMatch && descMatch[1] ? descMatch[1] : '').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');

        results.push({
            id,
            name,
            description,
            homepage: `https://chromewebstore.google.com/detail/${slug}/${id}`
        });
        if (results.length >= 20) break;
    }
    return results;
}

function parseStoreDetailName(html, fallbackName = '') {
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    if (ogTitle && ogTitle[1]) return ogTitle[1].trim();
    const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
    if (ogUrl && ogUrl[1]) {
        const slugMatch = ogUrl[1].match(/\/detail\/([^/]+)\/[a-z]{32}/i);
        if (slugMatch && slugMatch[1]) {
            const nameFromSlug = decodeSlugToName(slugMatch[1]);
            if (nameFromSlug) return nameFromSlug;
        }
    }
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    if (canonical && canonical[1]) {
        const slugMatch = canonical[1].match(/\/detail\/([^/]+)\/[a-z]{32}/i);
        if (slugMatch && slugMatch[1]) {
            const nameFromSlug = decodeSlugToName(slugMatch[1]);
            if (nameFromSlug) return nameFromSlug;
        }
    }
    const title = html.match(/<title>([^<]+)<\/title>/i);
    if (title && title[1]) {
        return title[1].replace(/\s*-\s*Chrome Web Store\s*$/i, '').trim();
    }
    return fallbackName;
}

async function searchChromeWebStore(query) {
    const keyword = String(query || '').trim();
    const inputMeta = parseExtensionStoreInputMeta(keyword);
    const localMatches = getExtensionStoreCatalog(keyword);
    const storeId = inputMeta.id;

    const merged = [];
    const isPlaceholderName = (name) => /^chrome web store\s*\(/i.test(String(name || '').trim());
    const pushUnique = (item) => {
        if (!item || !item.id) return;
        const idx = merged.findIndex(x => x.id === item.id);
        if (idx < 0) {
            merged.push(item);
            return;
        }
        const current = merged[idx];
        if (isPlaceholderName(current.name) && !isPlaceholderName(item.name)) {
            merged[idx] = { ...current, ...item };
        }
    };
    localMatches.forEach(pushUnique);

    if (storeId) {
        try {
            const detailUrl = `https://chromewebstore.google.com/detail/${storeId}`;
            const response = await fetchTextWithRedirect(detailUrl, 9000);
            const html = response?.html || '';
            const detailName = parseStoreDetailName(html, inputMeta.slugName || `Chrome Web Store (${storeId.slice(0, 6)}...)`);
            const detailEntries = parseStoreSearchEntriesFromHtml(html);
            const first = detailEntries.find(x => x.id === storeId);
            const finalName = /^chrome web store/i.test(detailName)
                ? (first?.name || inputMeta.slugName || detailName)
                : detailName;
            pushUnique({
                id: storeId,
                name: finalName,
                description: first?.description || '通过商店链接/ID解析',
                homepage: first?.homepage || response?.finalUrl || detailUrl
            });
        } catch (e) {
            pushUnique({
                id: storeId,
                name: inputMeta.slugName || `Chrome Web Store (${storeId.slice(0, 6)}...)`,
                description: '通过输入的商店链接/ID解析得到。',
                homepage: `https://chromewebstore.google.com/detail/${storeId}`
            });
        }
        return merged;
    }

    try {
        const searchUrl = `https://chromewebstore.google.com/search/${encodeURIComponent(keyword)}?hl=zh-CN`;
        const response = await fetchTextWithRedirect(searchUrl, 9000);
        const html = response?.html || '';
        const remoteResults = parseStoreSearchEntriesFromHtml(html);
        remoteResults.forEach(pushUnique);
    } catch (e) { }

    return merged;
}

async function validateExtensionFolder(extPath) {
    const fullPath = String(extPath || '').trim();
    if (!fullPath) throw new Error('扩展路径不能为空');

    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat || !stat.isDirectory()) throw new Error('扩展目录不存在');

    const manifestPath = path.join(fullPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('扩展目录缺少 manifest.json');
    const manifest = await fs.readJson(manifestPath).catch(() => null);
    if (!manifest || !manifest.name) throw new Error('扩展 manifest.json 无效');
    if (Number(manifest.manifest_version) !== 3) {
        throw new Error('仅支持 Manifest V3 扩展，请更换扩展版本');
    }

    return {
        path: fullPath,
        name: String(manifest.name || path.basename(fullPath) || 'Extension'),
        version: String(manifest.version || ''),
        homepage: String(manifest.homepage_url || '')
    };
}

async function extractCrxToDirectory(crxPath, outputDir) {
    const buffer = await fs.readFile(crxPath);
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
    const zipStart = buffer.indexOf(zipHeader);
    if (zipStart < 0) throw new Error('CRX 文件格式无效');

    const zipBuffer = buffer.slice(zipStart);
    const AdmZip = require('adm-zip');
    const tempZipPath = path.join(app.getPath('temp'), `geekez-ext-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
    await fs.writeFile(tempZipPath, zipBuffer);
    try {
        await fs.emptyDir(outputDir);
        const zip = new AdmZip(tempZipPath);
        zip.extractAllTo(outputDir, true);
    } finally {
        await fs.remove(tempZipPath).catch(() => { });
    }

    return validateExtensionFolder(outputDir);
}

function toManifestPath(input) {
    return String(input || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function toRelativeWorkerPath(fromRelPath, targetRelPath) {
    const fromDir = path.posix.dirname(toManifestPath(fromRelPath));
    let rel = path.posix.relative(fromDir, toManifestPath(targetRelPath));
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel;
}

function buildExtensionInstallShimSource(wrapperRelPath, originalWorkerRelPath, isModuleType) {
    const importTarget = toRelativeWorkerPath(wrapperRelPath, originalWorkerRelPath)
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'");

    const shim = `/* __geekez_oninstalled_shim__ */
/* __geekez_original_worker__:${originalWorkerRelPath} */
(() => {
  try {
    const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
    const storage = globalThis.chrome?.storage?.local || globalThis.browser?.storage?.local;
    if (!runtime?.onInstalled?.addListener || !storage?.get || !storage?.set) return;

    const KEY = '__geekez_extension_seen_once__';
    const originalAddListener = runtime.onInstalled.addListener.bind(runtime.onInstalled);

    const readSeen = (callback) => {
      try {
        if (storage.get.length >= 2) {
          storage.get([KEY], (result) => callback(!!(result && result[KEY])));
          return;
        }
        Promise.resolve(storage.get(KEY))
          .then((result) => callback(!!(result && result[KEY])))
          .catch(() => callback(false));
      } catch (e) {
        callback(false);
      }
    };

    const markSeen = () => {
      try {
        if (storage.set.length >= 2) {
          storage.set({ [KEY]: Date.now() }, () => {});
          return;
        }
        storage.set({ [KEY]: Date.now() });
      } catch (e) {}
    };

    runtime.onInstalled.addListener = (listener) => {
      if (typeof listener !== 'function') {
        return originalAddListener(listener);
      }

      const wrapped = (details) => {
        const originalDetails = details;
        const emit = (payload) => {
          try {
            listener(payload);
          } catch (e) {
            try { listener(originalDetails); } catch (inner) {}
          }
        };

        readSeen((seen) => {
          if (!seen) {
            markSeen();
            emit(originalDetails);
            return;
          }

          if (originalDetails && originalDetails.reason === 'install') {
            const mapped = Object.assign({}, originalDetails, { reason: 'update' });
            if (!mapped.previousVersion) {
              try {
                mapped.previousVersion = runtime.getManifest?.().version || '';
              } catch (e) {}
            }
            emit(mapped);
            return;
          }

          emit(originalDetails);
        });
      };

      return originalAddListener(wrapped);
    };
  } catch (e) {}
})();
`;

    if (isModuleType) {
        return `${shim}\nimport '${importTarget}';\n`;
    }
    return `${shim}\ntry { importScripts('${importTarget}'); } catch (e) {}\n`;
}

async function patchExtensionInstallBehavior(extensionDir) {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return false;

    const manifest = await fs.readJson(manifestPath).catch(() => null);
    if (!manifest || Number(manifest.manifest_version) !== 3) return false;

    const bg = manifest.background || {};
    const currentServiceWorker = toManifestPath(bg.service_worker || '');
    if (!currentServiceWorker) return false;

    const bootstrapPattern = /(^|\/)__geekez_sw_bootstrap__\.js$/;
    const isBootstrapWorker = bootstrapPattern.test(currentServiceWorker);
    const wrapperRelPath = isBootstrapWorker
        ? currentServiceWorker
        : (path.posix.dirname(currentServiceWorker) === '.'
            ? '__geekez_sw_bootstrap__.js'
            : `${path.posix.dirname(currentServiceWorker)}/__geekez_sw_bootstrap__.js`);
    const wrapperAbsPath = path.join(extensionDir, ...wrapperRelPath.split('/'));

    let workerRelPath = currentServiceWorker;
    if (isBootstrapWorker && fs.existsSync(wrapperAbsPath)) {
        const wrapperText = await fs.readFile(wrapperAbsPath, 'utf8').catch(() => '');
        const originalMatch = wrapperText.match(/__geekez_original_worker__:(.+?)\s*\*\//);
        if (originalMatch && originalMatch[1]) {
            workerRelPath = toManifestPath(originalMatch[1]);
        } else {
            const importMatch =
                wrapperText.match(/import\s+['"]([^'"]+)['"]/i) ||
                wrapperText.match(/importScripts\(\s*['"]([^'"]+)['"]\s*\)/i);
            if (importMatch && importMatch[1]) {
                const resolved = path.posix.normalize(
                    path.posix.join(path.posix.dirname(wrapperRelPath), toManifestPath(importMatch[1]))
                );
                if (!bootstrapPattern.test(resolved)) {
                    workerRelPath = resolved;
                }
            }
        }
    }

    if (!workerRelPath || bootstrapPattern.test(workerRelPath)) return false;
    const workerAbsPath = path.join(extensionDir, ...workerRelPath.split('/'));
    if (!fs.existsSync(workerAbsPath)) return false;

    const isModuleType = String(bg.type || '').toLowerCase() === 'module';
    const wrapperSource = buildExtensionInstallShimSource(wrapperRelPath, workerRelPath, isModuleType);

    let changed = false;
    let currentWrapperSource = '';
    if (fs.existsSync(wrapperAbsPath)) {
        currentWrapperSource = await fs.readFile(wrapperAbsPath, 'utf8').catch(() => '');
    }
    if (currentWrapperSource !== wrapperSource) {
        await fs.outputFile(wrapperAbsPath, wrapperSource, 'utf8');
        changed = true;
    }

    if (toManifestPath(bg.service_worker) !== wrapperRelPath) {
        manifest.background = {
            ...bg,
            service_worker: wrapperRelPath
        };
        await fs.writeJson(manifestPath, manifest);
        changed = true;
    }

    return changed;
}

async function patchKnownExtensionOnboarding(extensionDir, storeId = '') {
    const id = String(storeId || '').toLowerCase();
    if (!['bpoadfkcbjbfhfodiogcnhhhpibjhbnh', 'amkbmndfnliijdhojkpoglbnaaahippg'].includes(id)) {
        return false;
    }

    const jsFiles = [];
    const walk = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
                continue;
            }
            if (entry.isFile() && /\.(js|mjs|cjs)$/i.test(entry.name)) {
                jsFiles.push(full);
            }
        }
    };
    await walk(extensionDir);

    let changed = false;
    for (const filePath of jsFiles) {
        let content;
        try {
            content = await fs.readFile(filePath, 'utf8');
        } catch (e) {
            continue;
        }
        if (!/onboarding|GUIDE_BASE|onboardingDisplayTime/i.test(content)) continue;

        let next = content;
        // Immersive Translate unpacked extension may fire onInstalled on every launch.
        // Force onboarding link creation to run only once when onboardingDisplayTime is empty.
        next = next.replace(
            /([a-zA-Z_$][\w$]*)\?([a-zA-Z_$][\w$]*)\|\|\(await _e\("onboardingDisplayTime",new Date\(\)\.toISOString\(\)\),([a-zA-Z_$][\w$]*\.tabs\.create\(\{url:[a-zA-Z_$][\w$]*\.toString\(\)\}\))\):([a-zA-Z_$][\w$]*\.tabs\.create\(\{url:[a-zA-Z_$][\w$]*\.toString\(\)\}\))/g,
            (_m, _platformFlag, onboardingFlag, createOnceExpr) => `${onboardingFlag}||(await _e("onboardingDisplayTime",new Date().toISOString()),${createOnceExpr})`
        );
        next = next.replace(
            'a?o||(await _e("onboardingDisplayTime",new Date().toISOString()),w.tabs.create({url:s.toString()})):w.tabs.create({url:s.toString()})',
            'o||(await _e("onboardingDisplayTime",new Date().toISOString()),w.tabs.create({url:s.toString()}))'
        );
        next = next.replace(
            /(?:chrome|browser)\.tabs\.create\(\s*\{[\s\S]{0,260}?onboarding\.immersivetranslate\.com[\s\S]{0,260}?\}\s*\)\s*;?/g,
            'Promise.resolve()'
        );
        next = next.replace(
            /(?:chrome|browser)\.tabs\.create\(\s*\{[\s\S]{0,260}?(?:\?t=i&v=|onboarding\\?\.immersivetranslate\\?\.com)[\s\S]{0,260}?\}\s*\)\s*;?/g,
            'Promise.resolve()'
        );

        if (next !== content) {
            await fs.writeFile(filePath, next);
            changed = true;
        }
    }

    return changed;
}

function buildChromeStoreCrxUrl(extensionId) {
    return `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=147.0.0.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
}

async function readSettingsForExtensionMutation() {
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    return normalizeSettingsSnapshot(settings);
}

async function saveSettingsWithNormalizedExtensions(settings) {
    const nextSettings = normalizeSettingsSnapshot(settings || {});
    await fs.writeJson(SETTINGS_FILE, nextSettings);
    cachedCloseBehavior = normalizeCloseBehavior(nextSettings.closeBehavior);
    return nextSettings;
}

function normalizeSettingsSnapshot(settings) {
    const nextSettings = settings || {};
    if (!Array.isArray(nextSettings.preProxies)) nextSettings.preProxies = [];
    if (!Array.isArray(nextSettings.subscriptions)) nextSettings.subscriptions = [];
    if (!['single', 'balance', 'failover'].includes(nextSettings.mode)) nextSettings.mode = 'single';
    nextSettings.enablePreProxy = !!nextSettings.enablePreProxy;
    nextSettings.notify = !!nextSettings.notify;
    nextSettings.userExtensions = normalizeUserExtensions(nextSettings.userExtensions || []);
    nextSettings.closeBehavior = normalizeCloseBehavior(nextSettings.closeBehavior);
    return nextSettings;
}

function isDirectProxy(proxyStr) {
    const value = String(proxyStr || '').trim().toLowerCase();
    return value === 'direct' || value === 'direct://';
}

function ensureProxyStrValid(proxyStr) {
    const raw = String(proxyStr || '').trim();
    if (!raw) {
        throw new Error('代理链接错误：不能为空');
    }
    if (isDirectProxy(raw)) return;

    try {
        parseProxyLink(raw, 'proxy_validate');
    } catch (err) {
        const msg = String(err && err.message ? err.message : '');
        if (msg.includes('Unsupported protocol')) {
            throw new Error('代理链接错误：不支持的协议或格式');
        }
        throw new Error(`代理链接错误：${msg || '格式不正确'}`);
    }
}

function normalizeScreen(rawScreen, rawWidth, rawHeight) {
    const width = Number(rawScreen?.width ?? rawWidth);
    const height = Number(rawScreen?.height ?? rawHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }
    return {
        width: Math.floor(width),
        height: Math.floor(height)
    };
}

function normalizeDebugPort(rawPort) {
    if (rawPort === undefined || rawPort === null || rawPort === '') return null;
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) return null;
    return parsed;
}

function hasRestorableSession(userDataDir) {
    const defaultDir = path.join(userDataDir, 'Default');
    const sessionsDir = path.join(defaultDir, 'Sessions');

    try {
        if (fs.existsSync(sessionsDir)) {
            const files = fs.readdirSync(sessionsDir);
            const hasSessionFile = files.some((name) => {
                if (!/^(Session_|Tabs_)/.test(name)) return false;
                try {
                    const stat = fs.statSync(path.join(sessionsDir, name));
                    return stat.isFile() && stat.size > 0;
                } catch (e) {
                    return false;
                }
            });
            if (hasSessionFile) return true;
        }
    } catch (e) { }

    const legacyFiles = ['Last Session', 'Last Tabs', 'Current Session', 'Current Tabs'];
    for (const name of legacyFiles) {
        try {
            const filePath = path.join(defaultDir, name);
            if (!fs.existsSync(filePath)) continue;
            const stat = fs.statSync(filePath);
            if (stat.isFile() && stat.size > 0) return true;
        } catch (e) { }
    }

    return false;
}

function buildUniqueProfileName(profiles, baseName) {
    const safeBaseName = (baseName || '').toString().trim() || `Profile-${Date.now()}`;
    if (!profiles.find(p => p.name === safeBaseName)) return safeBaseName;
    let suffix = 2;
    while (profiles.find(p => p.name === `${safeBaseName}-${String(suffix).padStart(2, '0')}`)) {
        suffix++;
    }
    return `${safeBaseName}-${String(suffix).padStart(2, '0')}`;
}

function parseApiBody(body) {
    if (!body) return {};
    if (typeof body !== 'string') return body || {};
    try {
        return JSON.parse(body);
    } catch (err) {
        const parseError = new Error('Invalid JSON body');
        parseError.status = 400;
        throw parseError;
    }
}

function normalizeFingerprintOptions(data = {}) {
    const inputFp = data.fingerprint && typeof data.fingerprint === 'object' ? data.fingerprint : {};
    const hasTopLevelWebgl = hasOwn(data, 'webgl');
    const hasFingerprintWebgl = hasOwn(data.fingerprint, 'webgl');
    const requestedWebglProfile = firstDefined(data.webglProfile, inputFp.webglProfile, inputFp.webgl?.profileId);

    let explicitWebgl = undefined;
    if (hasTopLevelWebgl) {
        explicitWebgl = data.webgl;
    } else if (hasFingerprintWebgl) {
        // Ignore stale generated WebGL metadata when a profile is specified.
        // Edit modal submits full fingerprint payload; without this guard, old WebGL stays unchanged.
        if (!requestedWebglProfile || requestedWebglProfile === 'custom') {
            explicitWebgl = data.fingerprint.webgl;
        }
    } else if (!requestedWebglProfile && inputFp.webgl) {
        // Backward compatibility: keep legacy custom WebGL only when no profile id is present.
        explicitWebgl = inputFp.webgl;
    }

    const screen = normalizeScreen(
        firstDefined(data.screen, inputFp.screen),
        firstDefined(data.resW, inputFp.resW, inputFp.screen?.width),
        firstDefined(data.resH, inputFp.resH, inputFp.screen?.height)
    );

    const normalized = {
        ...inputFp,
        uaMode: firstDefined(data.uaMode, inputFp.uaMode),
        timezone: firstDefined(data.timezone, inputFp.timezone),
        city: firstDefined(data.city, inputFp.city),
        geolocation: firstDefined(data.geolocation, inputFp.geolocation),
        language: firstDefined(data.language, inputFp.language),
        languages: firstDefined(data.languages, inputFp.languages),
        platform: firstDefined(data.platform, inputFp.platform),
        hardwareConcurrency: firstDefined(data.hardwareConcurrency, inputFp.hardwareConcurrency),
        deviceMemory: firstDefined(data.deviceMemory, inputFp.deviceMemory),
        canvasNoise: firstDefined(data.canvasNoise, inputFp.canvasNoise),
        audioNoise: firstDefined(data.audioNoise, inputFp.audioNoise),
        noiseSeed: firstDefined(data.noiseSeed, inputFp.noiseSeed),
        browserType: firstDefined(data.browserType, inputFp.browserType),
        browserMajorVersion: firstDefined(data.browserMajorVersion, inputFp.browserMajorVersion),
        browserFullVersion: firstDefined(data.browserFullVersion, inputFp.browserFullVersion),
        tlsClientHello: firstDefined(data.tlsClientHello, inputFp.tlsClientHello),
        userAgent: firstDefined(data.userAgent, inputFp.userAgent),
        userAgentMetadata: firstDefined(data.userAgentMetadata, inputFp.userAgentMetadata),
        webgl: explicitWebgl,
        webglProfile: requestedWebglProfile
    };

    if (screen) {
        normalized.screen = screen;
        normalized.window = { ...screen };
    } else if (inputFp.window && inputFp.window.width && inputFp.window.height) {
        normalized.window = inputFp.window;
    }

    if (normalized.uaMode === 'none' && !hasOwn(data, 'tlsClientHello')) {
        normalized.tlsClientHello = 'none';
    }

    return normalized;
}

function normalizeFingerprint(data = {}) {
    const options = normalizeFingerprintOptions(data);
    const generated = generateFingerprint(options);

    return {
        ...options,
        ...generated,
        screen: generated.screen,
        window: generated.window,
        webgl: generated.webgl,
        webglProfile: generated.webglProfile,
        userAgent: generated.userAgent,
        userAgentMetadata: generated.userAgentMetadata,
        secChUa: generated.secChUa,
        browserType: generated.browserType,
        browserMajorVersion: generated.browserMajorVersion,
        browserFullVersion: generated.browserFullVersion
    };
}

async function allocateDebugPortIfNeeded(settings, profiles, requestedPort) {
    const requested = normalizeDebugPort(requestedPort);
    if (requested) return requested;
    if (!settings?.enableRemoteDebugging) return null;

    const usedPorts = new Set(
        (profiles || [])
            .map(p => normalizeDebugPort(p?.debugPort))
            .filter(Boolean)
    );

    const { makeRange } = await resolveGetPortApi();
    for (let i = 0; i < 10; i++) {
        const candidate = await getAvailablePort({ port: makeRange(24000, 65000) });
        if (!usedPorts.has(candidate)) return candidate;
    }

    return await getAvailablePort();
}

async function buildProfileFromInput(rawData, profiles, settings, existingProfile = null) {
    const data = rawData || {};
    const baseName = firstDefined(data.name, existingProfile?.name, `Profile-${Date.now()}`);
    const uniqueName = existingProfile && baseName === existingProfile.name
        ? existingProfile.name
        : buildUniqueProfileName(profiles, baseName);
    const proxyStr = firstDefined(data.proxyStr, existingProfile?.proxyStr, '') || '';
    const proxyChanged = !existingProfile || (hasOwn(data, 'proxyStr') && proxyStr !== (existingProfile?.proxyStr || ''));
    if (proxyChanged) {
        ensureProxyStrValid(proxyStr);
    }

    const incomingFingerprint = data.fingerprint && typeof data.fingerprint === 'object' ? data.fingerprint : {};
    const previousFingerprint = existingProfile?.fingerprint || {};
    const mergedFingerprintSource = {
        ...(existingProfile?.fingerprint || {}),
        ...incomingFingerprint,
        ...data
    };
    // Flattened source above already merged nested fingerprint values.
    // Remove nested object to avoid stale fields (from edit payload spreads) overriding updates.
    delete mergedFingerprintSource.fingerprint;

    const requestedWebglProfile = firstDefined(
        data.webglProfile,
        incomingFingerprint.webglProfile,
        incomingFingerprint.webgl?.profileId
    );
    const previousWebglProfile = firstDefined(
        previousFingerprint.webglProfile,
        previousFingerprint.webgl?.profileId
    );
    const webglProfileChanged = requestedWebglProfile !== undefined && requestedWebglProfile !== previousWebglProfile;
    if (webglProfileChanged && !hasOwn(data, 'webgl')) {
        delete mergedFingerprintSource.webgl;
    }

    const requestedBrowserType = firstDefined(data.browserType, incomingFingerprint.browserType, previousFingerprint.browserType);
    const requestedBrowserMajor = firstDefined(data.browserMajorVersion, incomingFingerprint.browserMajorVersion, previousFingerprint.browserMajorVersion);
    const requestedUaMode = firstDefined(data.uaMode, incomingFingerprint.uaMode, previousFingerprint.uaMode);
    const requestedPlatform = firstDefined(data.platform, incomingFingerprint.platform, previousFingerprint.platform);
    const browserIdentityChanged =
        requestedBrowserType !== undefined &&
        (requestedBrowserType !== previousFingerprint.browserType ||
            Number(requestedBrowserMajor) !== Number(previousFingerprint.browserMajorVersion) ||
            requestedPlatform !== previousFingerprint.platform);
    const uaModeChanged = requestedUaMode !== undefined && requestedUaMode !== previousFingerprint.uaMode;

    // Browser major/type changes must regenerate derived UA fields,
    // otherwise detectors can see stale version artifacts.
    if (browserIdentityChanged || uaModeChanged) {
        if (!hasOwn(data, 'browserFullVersion')) {
            delete mergedFingerprintSource.browserFullVersion;
        }
        if (!hasOwn(data, 'userAgent')) {
            delete mergedFingerprintSource.userAgent;
        }
        if (!hasOwn(data, 'userAgentMetadata')) {
            delete mergedFingerprintSource.userAgentMetadata;
        }
        if (!hasOwn(data, 'secChUa')) {
            delete mergedFingerprintSource.secChUa;
        }
        if (!hasOwn(data, 'tlsClientHello')) {
            delete mergedFingerprintSource.tlsClientHello;
        }
    }

    const fingerprint = normalizeFingerprint(mergedFingerprintSource);
    const debugPort = await allocateDebugPortIfNeeded(settings, profiles, firstDefined(data.debugPort, existingProfile?.debugPort));

    return {
        ...(existingProfile || {}),
        id: existingProfile?.id || uuidv4(),
        name: uniqueName,
        proxyStr,
        tags: normalizeTags(firstDefined(data.tags, existingProfile?.tags, [])),
        fingerprint,
        preProxyOverride: firstDefined(data.preProxyOverride, existingProfile?.preProxyOverride, 'default'),
        debugPort,
        customArgs: firstDefined(data.customArgs, existingProfile?.customArgs, '') || '',
        isSetup: existingProfile?.isSetup || false,
        createdAt: existingProfile?.createdAt || Date.now()
    };
}

// --- Chrome 密码解密辅助函数 ---
// 解密 Chrome 主密钥 (平台相关)
async function handleApiRequest(method, pathname, body, params) {
    let profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};

    // Helper: Find profile by ID or Name
    const findProfile = (idOrName) => {
        return profiles.find(p => p.id === idOrName || p.name === idOrName);
    };

    const resolveRemoteDebugPortForProfile = async (profileId, fallbackPort = null) => {
        if (!settings.enableRemoteDebugging) return null;

        const fromFallback = normalizeDebugPort(fallbackPort);
        if (fromFallback) return fromFallback;

        const latestProfiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE).catch(() => []) : [];
        const latest = Array.isArray(latestProfiles) ? latestProfiles.find(p => p.id === profileId) : null;
        return normalizeDebugPort(latest?.debugPort);
    };

    // GET /api/status
    if (method === 'GET' && pathname === '/api/status') {
        return { success: true, running: Object.keys(activeProcesses), count: Object.keys(activeProcesses).length };
    }

    // GET /api/profiles
    if (method === 'GET' && pathname === '/api/profiles') {
        const tagFilter = (params.get('tag') || '').trim().toLowerCase();
        const filteredProfiles = tagFilter
            ? profiles.filter(profile => (profile.tags || []).some(tag => (tag || '').toLowerCase() === tagFilter))
            : profiles;
        return { success: true, profiles: filteredProfiles.map(p => ({ id: p.id, name: p.name, tags: p.tags, running: !!activeProcesses[p.id] })) };
    }

    // GET /api/profiles/:idOrName
    const profileMatch = pathname.match(/^\/api\/profiles\/([^\/]+)$/);
    if (method === 'GET' && profileMatch) {
        const profile = findProfile(decodeURIComponent(profileMatch[1]));
        if (!profile) return { status: 404, data: { success: false, error: 'Profile not found' } };
        return { success: true, profile: { ...profile, running: !!activeProcesses[profile.id] } };
    }

    // POST /api/profiles - Create with unique name
    if (method === 'POST' && pathname === '/api/profiles') {
        const data = parseApiBody(body);
        const newProfile = await buildProfileFromInput(data, profiles, settings);
        profiles.push(newProfile);
        await fs.writeJson(PROFILES_FILE, profiles);
        notifyUIRefresh(); // Notify UI to refresh
        return {
            success: true,
            profile: newProfile,
            remoteDebugPort: settings.enableRemoteDebugging ? newProfile.debugPort : null
        };
    }

    // PUT /api/profiles/:idOrName - Edit
    if (method === 'PUT' && profileMatch) {
        const profile = findProfile(decodeURIComponent(profileMatch[1]));
        if (!profile) return { status: 404, data: { success: false, error: 'Profile not found' } };
        const idx = profiles.findIndex(p => p.id === profile.id);
        const data = parseApiBody(body);
        const otherProfiles = profiles.filter(p => p.id !== profile.id);
        profiles[idx] = await buildProfileFromInput(data, otherProfiles, settings, profile);
        await fs.writeJson(PROFILES_FILE, profiles);
        notifyUIRefresh();
        return {
            success: true,
            profile: profiles[idx],
            remoteDebugPort: settings.enableRemoteDebugging ? profiles[idx].debugPort : null
        };
    }

    // DELETE /api/profiles/:idOrName
    if (method === 'DELETE' && profileMatch) {
        const profile = findProfile(decodeURIComponent(profileMatch[1]));
        if (!profile) return { status: 404, data: { success: false, error: 'Profile not found' } };
        profiles = profiles.filter(p => p.id !== profile.id);
        await fs.writeJson(PROFILES_FILE, profiles);
        notifyUIRefresh(); // Notify UI to refresh
        return { success: true, message: 'Profile deleted' };
    }

    // GET /api/open/:idOrName - Launch profile
    const openMatch = pathname.match(/^\/api\/open\/([^\/]+)$/);
    if (method === 'GET' && openMatch) {
        const profile = findProfile(decodeURIComponent(openMatch[1]));
        if (!profile) return { status: 404, data: { success: false, error: 'Profile not found' } };
        if (activeProcesses[profile.id]) {
            const runningPort = await resolveRemoteDebugPortForProfile(profile.id, profile.debugPort);
            const runningPayload = {
                success: true,
                message: 'Already running',
                profileId: profile.id,
                name: profile.name
            };
            if (runningPort) {
                runningPayload['remote port'] = runningPort;
            }
            return runningPayload;
        }
        const launchEvent = (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed())
            ? { sender: mainWindow.webContents }
            : {
                sender: {
                    send: () => { },
                    isDestroyed: () => true
                }
            };
        const launchMessage = await launchProfileHandler(launchEvent, profile.id, settings.watermarkStyle || 'enhanced');
        const launchedPort = await resolveRemoteDebugPortForProfile(profile.id, profile.debugPort);
        const launchedPayload = {
            success: true,
            message: launchMessage || 'Launched',
            profileId: profile.id,
            name: profile.name
        };
        if (launchedPort) {
            launchedPayload['remote port'] = launchedPort;
        }
        return launchedPayload;
    }

    // POST /api/profiles/:idOrName/stop - Stop profile
    const stopMatch = pathname.match(/^\/api\/profiles\/([^\/]+)\/stop$/);
    if (method === 'POST' && stopMatch) {
        const profile = findProfile(decodeURIComponent(stopMatch[1]));
        if (!profile) return { status: 404, data: { success: false, error: 'Profile not found' } };
        const stopped = await stopRunningProfile(profile.id);
        if (!stopped) return { status: 404, data: { success: false, error: 'Profile not running' } };
        return { success: true, message: 'Profile stopped' };
    }



    // GET /api/export/all?password=xxx - Export full backup (v2)
    if (method === 'GET' && pathname === '/api/export/all') {
        const password = params.get('password');
        if (!password) return { status: 400, data: { success: false, error: 'Password required. Use ?password=yourpassword' } };

        const backupData = {
            version: 2,
            createdAt: Date.now(),
            profiles: profiles.map(p => ({ ...p, fingerprint: cleanFingerprint ? cleanFingerprint(p.fingerprint) : p.fingerprint })),
            preProxies: settings.preProxies || [],
            subscriptions: settings.subscriptions || [],
            browserData: {}
        };

        // 1. 文件拷贝
        const filesToBackup = [
            'Bookmarks', 'Bookmarks.bak', 'History', 'History-journal',
            'Favicons', 'Favicons-journal', 'Preferences', 'Secure Preferences',
            'Top Sites', 'Top Sites-journal', 'Web Data', 'Web Data-journal'
        ];
        const chromePath = getChromiumPath();
        for (const profile of profiles) {
            const profileDataDir = path.join(DATA_PATH, profile.id, 'browser_data');
            const defaultDir = path.join(profileDataDir, 'Default');
            if (!fs.existsSync(defaultDir)) continue;
            const browserFiles = {};
            for (const f of filesToBackup) {
                const fp = path.join(defaultDir, f);
                if (fs.existsSync(fp)) {
                    try { browserFiles[f] = (await fs.readFile(fp)).toString('base64'); } catch (e) { }
                }
            }
            if (Object.keys(browserFiles).length > 0) backupData.browserData[profile.id] = browserFiles;

            // 2. CDP Cookie + 密码解密
            if (!backupData.browserData[profile.id]) backupData.browserData[profile.id] = {};
            try {
                const browser = await puppeteer.launch({
                    headless: 'new', executablePath: chromePath, userDataDir: profileDataDir,
                    args: ['--no-first-run', '--disable-extensions', '--disable-sync', '--disable-gpu'],
                    defaultViewport: null, ignoreDefaultArgs: ['--enable-automation'],
                });
                const page = (await browser.pages())[0] || await browser.newPage();
                const client = await page.createCDPSession();
                const { cookies } = await client.send('Network.getAllCookies');
                await browser.close();
                backupData.browserData[profile.id]._cookies = cookies;
            } catch (err) { }
            try {
                const pwJsonFile = path.join(DATA_PATH, profile.id, 'passwords.json');
                const passwords = await readEncryptedPasswords(pwJsonFile, profile.id);
                if (passwords.length > 0) backupData.browserData[profile.id]._passwords = passwords;
            } catch (err) { }
        }

        const jsonStr = JSON.stringify(backupData);
        const compressed = await gzip(Buffer.from(jsonStr, 'utf8'));
        const encrypted = encryptData(compressed, password);

        return {
            success: true,
            data: encrypted.toString('base64'),
            filename: `GeekEZ_FullBackup_${Date.now()}.geekez`,
            profileCount: profiles.length
        };
    }

    // GET /api/export/fingerprint - Export YAML fingerprints
    if (method === 'GET' && pathname === '/api/export/fingerprint') {
        const exportData = profiles.map(p => ({
            id: p.id,
            name: p.name,
            proxyStr: p.proxyStr,
            tags: p.tags,
            fingerprint: cleanFingerprint ? cleanFingerprint(p.fingerprint) : p.fingerprint
        }));
        const yamlStr = yaml.dump(exportData, { lineWidth: -1, noRefs: true });
        return {
            success: true,
            data: yamlStr,
            filename: `GeekEZ_Profiles_${Date.now()}.yaml`,
            profileCount: profiles.length
        };
    }

    // POST /api/import - Import backup (YAML or encrypted)
    if (method === 'POST' && pathname === '/api/import') {
        try {
            const data = JSON.parse(body);
            const content = data.content;
            const password = data.password;

            if (!content) return { status: 400, data: { success: false, error: 'Content required' } };

            // Try YAML first
            try {
                const yamlData = yaml.load(content);
                if (Array.isArray(yamlData)) {
                    let imported = 0;
                    for (const item of yamlData) {
                        const name = generateUniqueName(item.name || `Imported-${Date.now()}`);
                        const newProfile = {
                            id: uuidv4(),
                            name,
                            proxyStr: item.proxyStr || '',
                            tags: item.tags || [],
                            fingerprint: item.fingerprint || await generateFingerprint({}),
                            createdAt: Date.now()
                        };
                        profiles.push(newProfile);
                        imported++;
                    }
                    await fs.writeJson(PROFILES_FILE, profiles);
                    notifyUIRefresh(); // Notify UI to refresh
                    return { success: true, message: `Imported ${imported} profiles from YAML`, count: imported };
                }
            } catch (yamlErr) { }

            // Try encrypted backup
            if (!password) return { status: 400, data: { success: false, error: 'Password required for encrypted backup' } };

            try {
                const encrypted = Buffer.from(content, 'base64');
                const decrypted = decryptData(encrypted, password);
                const decompressed = await gunzip(decrypted);
                const backupData = JSON.parse(decompressed.toString('utf8'));

                let imported = 0;
                for (const profile of backupData.profiles || []) {
                    const name = generateUniqueName(profile.name);
                    const newProfile = { ...profile, id: uuidv4(), name };
                    profiles.push(newProfile);
                    imported++;
                }
                await fs.writeJson(PROFILES_FILE, profiles);
                notifyUIRefresh(); // Notify UI to refresh
                return { success: true, message: `Imported ${imported} profiles from backup`, count: imported };
            } catch (decryptErr) {
                return { status: 400, data: { success: false, error: 'Invalid password or corrupted backup' } };
            }
        } catch (err) {
            return { status: 400, data: { success: false, error: err.message } };
        }
    }

    return { status: 404, data: { success: false, error: 'Endpoint not found' } };
}

// API Server IPC handlers
ipcMain.handle('start-api-server', async (e, { port }) => {
    if (apiServerRunning) {
        return { success: false, error: 'API server already running' };
    }
    try {
        apiServer = createApiServer(port);
        await new Promise((resolve, reject) => {
            apiServer.listen(port, '127.0.0.1', () => resolve());
            apiServer.on('error', reject);
        });
        apiServerRunning = true;
        console.log(`🔌 API Server started on http://localhost:${port}`);
        return { success: true, port };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('stop-api-server', async () => {
    if (!apiServer) return { success: true };
    return new Promise(resolve => {
        apiServer.close(() => {
            apiServer = null;
            apiServerRunning = false;
            console.log('🔌 API Server stopped');
            resolve({ success: true });
        });
    });
});

ipcMain.handle('get-api-status', () => {
    return { running: apiServerRunning };
});


function forceKill(pid) {
    return new Promise((resolve) => {
        if (!pid) return resolve();
        try {
            if (process.platform === 'win32') exec(`taskkill /pid ${pid} /T /F`, () => resolve());
            else { process.kill(pid, 'SIGKILL'); resolve(); }
        } catch (e) { resolve(); }
    });
}

function getChromiumPath() {
    return resolveChromiumPathForApp({
        isDev,
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
        platform: process.platform,
        env: process.env
    });
}

// Settings management
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return normalizeSettingsSnapshot(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return {
        enableRemoteDebugging: false,
        enableUaWebglModify: false,
        closeBehavior: CLOSE_BEHAVIOR.TRAY
    };
}

function saveSettings(settings) {
    try {
        const normalized = normalizeSettingsSnapshot(settings || {});
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(normalized, null, 2));
        cachedCloseBehavior = normalizeCloseBehavior(normalized.closeBehavior);
        return true;
    } catch (e) {
        console.error('Failed to save settings:', e);
        return false;
    }
}

function readSettingsSync() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return normalizeSettingsSnapshot({});
        const raw = fs.readJsonSync(SETTINGS_FILE);
        return normalizeSettingsSnapshot(raw);
    } catch (e) {
        return normalizeSettingsSnapshot({});
    }
}

function getCloseBehavior() {
    return normalizeCloseBehavior(cachedCloseBehavior);
}

function isTrayAvailable() {
    return !!appTray && (typeof appTray.isDestroyed !== 'function' || !appTray.isDestroyed());
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
    }
    if (!mainWindow) return;

    try {
        if (process.platform === 'darwin' && app.dock && typeof app.dock.show === 'function') {
            const showRet = app.dock.show();
            if (showRet && typeof showRet.catch === 'function') {
                showRet.catch(() => { });
            }
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
    } catch (e) { }
}

function getProfileLaunchEventSender() {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        return { sender: mainWindow.webContents };
    }
    return {
        sender: {
            send: () => { },
            isDestroyed: () => true
        }
    };
}

async function focusRunningProfileWindow(profileId) {
    const proc = activeProcesses[profileId];
    if (!proc || !proc.browser) return false;

    try {
        const pages = await proc.browser.pages();
        if (!pages || pages.length === 0) return false;

        const preferred = pages.find((page) => {
            try {
                const url = String(page.url() || '').toLowerCase();
                return url && url !== 'about:blank' && url !== 'chrome://newtab/' && url !== 'chrome://new-tab-page/';
            } catch (e) {
                return false;
            }
        }) || pages[0];

        if (!preferred) return false;
        await preferred.bringToFront();
        try { app.focus({ steal: true }); } catch (e) { }
        return true;
    } catch (e) {
        return false;
    }
}

async function readAllProfilesSafe() {
    if (!fs.existsSync(PROFILES_FILE)) return [];
    const profiles = await fs.readJson(PROFILES_FILE).catch(() => []);
    return Array.isArray(profiles) ? profiles : [];
}

function quitApplication() {
    isAppQuitting = true;
    app.quit();
}

function broadcastProfileStopped(profileId) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
        try {
            if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) continue;
            win.webContents.send('profile-status', { id: profileId, status: 'stopped' });
            win.webContents.send('profile-stopped', profileId);
        } catch (e) { }
    }
}

async function stopRunningProfile(profileId, options = {}) {
    const { refreshMenu = true } = options;
    const proc = activeProcesses[profileId];
    if (!proc) return false;

    await forceKill(proc.xrayPid);
    try { await proc.browser.close(); } catch (e) { }
    if (proc.logFd !== undefined) {
        try { fs.closeSync(proc.logFd); } catch (e) { }
    }

    delete activeProcesses[profileId];
    broadcastProfileStopped(profileId);
    if (refreshMenu) {
        refreshTrayMenu().catch(() => { });
    }
    return true;
}

async function stopAllRunningProfilesFromTray() {
    const runningIds = Object.keys(activeProcesses);
    if (runningIds.length === 0) return;

    for (const profileId of runningIds) {
        // eslint-disable-next-line no-await-in-loop
        await stopRunningProfile(profileId, { refreshMenu: false });
    }
    await refreshTrayMenu();
}

async function confirmStopAllRunningProfilesFromTray() {
    const runningCount = Object.keys(activeProcesses).length;
    if (runningCount === 0) return false;

    const options = {
        type: 'warning',
        buttons: ['取消', '关闭全部环境'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: '确认关闭',
        message: `确认关闭全部已启动环境吗？`,
        detail: `当前共有 ${runningCount} 个环境正在运行。此操作会关闭全部环境窗口。`
    };

    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const result = await dialog.showMessageBox(mainWindow, options);
            return result.response === 1;
        }
        const result = await dialog.showMessageBox(options);
        return result.response === 1;
    } catch (e) {
        return false;
    }
}

async function launchOrFocusProfileFromTray(profileId) {
    const profiles = await readAllProfilesSafe();
    const profile = profiles.find((item) => item && item.id === profileId);
    if (!profile) return;

    if (activeProcesses[profile.id]) {
        const focused = await focusRunningProfileWindow(profile.id);
        if (!focused) {
            try {
                const settings = readSettingsSync();
                const launchEvent = getProfileLaunchEventSender();
                await launchProfileHandler(launchEvent, profile.id, settings.watermarkStyle || 'enhanced');
            } catch (e) { }
        }
        await refreshTrayMenu();
        return;
    }

    try {
        const settings = readSettingsSync();
        const launchEvent = getProfileLaunchEventSender();
        await launchProfileHandler(launchEvent, profile.id, settings.watermarkStyle || 'enhanced');
    } catch (err) {
        dialog.showErrorBox('启动环境失败', String(err?.message || err || '未知错误'));
    }
    await refreshTrayMenu();
}

async function buildTrayMenuTemplate() {
    const profiles = await readAllProfilesSafe();
    const runningIds = new Set(Object.keys(activeProcesses));

    const createProfileMenuItem = (profile) => ({
        label: `${runningIds.has(profile.id) ? '🟢 ' : ''}${profile.name || profile.id}`,
        click: () => {
            launchOrFocusProfileFromTray(profile.id).catch(() => { });
        }
    });

    const tags = Array.from(new Set(
        profiles.flatMap((profile) => (Array.isArray(profile.tags) ? profile.tags : []).map(tag => String(tag || '').trim()).filter(Boolean))
    )).sort((a, b) => a.localeCompare(b));

    const groupedMenus = [{
        label: '全部',
        profiles
    }, ...tags.map((tag) => ({
        label: tag,
        profiles: profiles.filter((profile) => Array.isArray(profile.tags) && profile.tags.includes(tag))
    }))].map((group) => ({
        label: group.label,
        submenu: group.profiles.length > 0
            ? group.profiles.map(createProfileMenuItem)
            : [{ label: '暂无环境', enabled: false }]
    }));

    const runningProfiles = profiles.filter(profile => runningIds.has(profile.id));
    const runningMenu = runningProfiles.length > 0
        ? [
            {
                label: '关闭所有环境',
                click: async () => {
                    const confirmed = await confirmStopAllRunningProfilesFromTray();
                    if (!confirmed) return;
                    stopAllRunningProfilesFromTray().catch(() => { });
                }
            },
            { type: 'separator' },
            ...runningProfiles.map(createProfileMenuItem)
        ]
        : [{ label: '暂无已启动环境', enabled: false }];

    return [
        {
            label: '打开主界面',
            click: () => showMainWindow()
        },
        { type: 'separator' },
        {
            label: '环境列表',
            submenu: groupedMenus
        },
        {
            label: '已启动环境列表',
            submenu: runningMenu
        },
        { type: 'separator' },
        {
            label: '退出软件',
            click: () => quitApplication()
        }
    ];
}

function createFallbackTrayImage() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><rect width="18" height="18" rx="4" fill="#00E0FF"/><path d="M5 9h8M9 5v8" stroke="#0B1324" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function normalizeTrayImage(image) {
    if (!image || image.isEmpty()) return image;

    try {
        if (process.platform === 'darwin') {
            const normalized = image.resize({ width: 18, height: 18, quality: 'best' });
            if (normalized && !normalized.isEmpty()) {
                normalized.setTemplateImage(true);
                return normalized;
            }
        }

        if (process.platform === 'linux') {
            const normalized = image.resize({ width: 22, height: 22, quality: 'best' });
            if (normalized && !normalized.isEmpty()) return normalized;
        }

        if (process.platform === 'win32') {
            const normalized = image.resize({ width: 16, height: 16, quality: 'best' });
            if (normalized && !normalized.isEmpty()) return normalized;
        }
    } catch (e) { }

    return image;
}

async function resolveTrayIconImage() {
    const platformCandidates = process.platform === 'darwin'
        ? [
            path.join(app.getAppPath(), 'resources', 'logo.svg'),
            path.join(process.resourcesPath, 'logo.svg'),
            path.join(app.getAppPath(), 'src', 'renderer', 'icon.png')
        ]
        : [
            path.join(app.getAppPath(), 'resources', 'logo.ico'),
            path.join(app.getAppPath(), 'resources', 'icon.ico'),
            path.join(app.getAppPath(), 'resources', 'logo.svg')
        ];

    const candidates = [
        ...platformCandidates,
        path.join(app.getAppPath(), 'resources', 'logo.ico'),
        path.join(app.getAppPath(), 'resources', 'icon.ico'),
        path.join(app.getAppPath(), 'resources', 'logo.svg'),
        path.join(app.getAppPath(), 'src', 'renderer', 'icon.png'),
        path.join(process.resourcesPath, 'logo.svg'),
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(process.resourcesPath, 'logo.ico'),
        path.join(process.resourcesPath, 'icon.png'),
        path.join(__dirname, '..', 'renderer', 'icon.png')
    ];

    for (const candidate of candidates) {
        try {
            if (!fs.existsSync(candidate)) continue;
            const image = nativeImage.createFromPath(candidate);
            if (image && !image.isEmpty()) return normalizeTrayImage(image);
        } catch (e) { }
    }

    try {
        const appIcon = await app.getFileIcon(process.execPath, { size: 'small' });
        if (appIcon && !appIcon.isEmpty()) return normalizeTrayImage(appIcon);
    } catch (e) { }

    return normalizeTrayImage(createFallbackTrayImage());
}

function resolveWindowIconPath() {
    const candidates = [
        path.join(app.getAppPath(), 'src', 'renderer', 'icon.png'),
        path.join(app.getAppPath(), 'resources', 'logo.ico'),
        path.join(app.getAppPath(), 'resources', 'icon.ico'),
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(__dirname, '..', 'renderer', 'icon.png')
    ];
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch (e) { }
    }
    return undefined;
}

async function refreshTrayMenu(popUp = false) {
    const trayDestroyed = !appTray || (typeof appTray.isDestroyed === 'function' && appTray.isDestroyed());
    if (trayDestroyed) return;
    const template = await buildTrayMenuTemplate();
    const menu = Menu.buildFromTemplate(template);
    appTray.setContextMenu(menu);
    if (popUp) {
        appTray.popUpContextMenu(menu);
    }
}

async function createTray() {
    if (appTray && (typeof appTray.isDestroyed !== 'function' || !appTray.isDestroyed())) return appTray;

    const trayImage = await resolveTrayIconImage();
    appTray = new Tray(trayImage);
    appTray.setToolTip('GeekEZ Browser');
    await refreshTrayMenu();

    appTray.on('click', () => {
        refreshTrayMenu(true).catch(() => { });
    });
    appTray.on('right-click', () => {
        refreshTrayMenu(true).catch(() => { });
    });
    appTray.on('double-click', () => {
        showMainWindow();
    });

    return appTray;
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const win = new BrowserWindow({
        width: Math.round(width * 0.5), height: Math.round(height * 0.601), minWidth: 900, minHeight: 600,
        title: "GeekEZ Browser", backgroundColor: '#1e1e2d',
        icon: resolveWindowIconPath(),
        titleBarOverlay: { color: '#1e1e2d', symbolColor: '#ffffff', height: 35 },
        titleBarStyle: 'hidden',
        webPreferences: { 
            preload: path.join(__dirname, '../preload/index.js'), 
            contextIsolation: true, 
            nodeIntegration: false, 
            spellcheck: false 
        }
    });
    win.setMenuBarVisibility(false);
    
    // electron-vite Dev Server URL injection
    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
    
    mainWindow = win; // Store global reference for API
    win.on('close', (event) => {
        if (isAppQuitting) return;

        const effectiveCloseBehavior = resolveCloseBehavior(getCloseBehavior(), {
            trayAvailable: isTrayAvailable()
        });

        if (effectiveCloseBehavior === CLOSE_BEHAVIOR.QUIT) {
            event.preventDefault();
            quitApplication();
            return;
        }

        event.preventDefault();
        win.hide();
        if (process.platform === 'darwin' && app.dock && typeof app.dock.hide === 'function') {
            app.dock.hide();
        }
    });
    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null;
        }
    });
    return win;
}

// Helper to notify UI to refresh profiles
function notifyUIRefresh() {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
        try {
            if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return;
            win.webContents.send('refresh-profiles');
        } catch (e) { }
    });
    refreshTrayMenu().catch(() => { });
}

async function generateExtension(profilePath, fingerprint, profileName, watermarkStyle, profileId) {
    const extDir = path.join(profilePath, 'extension');
    await fs.ensureDir(extDir);

    // 读取已保存的密码 (解密)
    const pwFile = path.join(DATA_PATH, profileId, 'passwords.json');
    const passwords = await readEncryptedPasswords(pwFile, profileId);

    // 内部扩展固定使用独立端口 12139
    const apiPort = 12139;

    const manifest = {
        manifest_version: 3,
        name: "GeekEZ Guard",
        version: "1.1.0",
        description: "Privacy & Password Protection",
        permissions: ["storage", "activeTab"],
        host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
        background: { service_worker: "background.js" },
        content_scripts: [
            {
                matches: ["<all_urls>"],
                js: ["content.js"],
                run_at: "document_start",
                all_frames: true,
                match_about_blank: true,
                match_origin_as_fallback: true,
                world: "MAIN"
            },
            {
                matches: ["<all_urls>"],
                js: ["content_pw.js"],
                run_at: "document_idle",
                all_frames: false,
                match_about_blank: true,
                match_origin_as_fallback: true,
                world: "ISOLATED"
            }
        ],
        action: { default_popup: "popup.html" }
    };
    const style = watermarkStyle || 'enhanced';
    const scriptContent = getInjectScript(fingerprint, profileName, style);
    await fs.writeJson(path.join(extDir, 'manifest.json'), manifest);
    await fs.writeFile(path.join(extDir, 'content.js'), scriptContent);

    // --- background.js ---
    const backgroundJs = `
const PROFILE_ID = ${JSON.stringify(profileId || '')};
const API_PORT = ${apiPort};
const INIT_PASSWORDS = ${JSON.stringify(passwords)};

// 初始化密码数据
chrome.runtime.onInstalled.addListener(() => { initPasswords(); });
chrome.runtime.onStartup.addListener(() => { initPasswords(); });

async function initPasswords() {
    const { geekez_passwords } = await chrome.storage.local.get('geekez_passwords');
    if (!geekez_passwords || geekez_passwords.length === 0) {
        if (INIT_PASSWORDS.length > 0) {
            await chrome.storage.local.set({ geekez_passwords: INIT_PASSWORDS });
        }
    }
}

async function getPasswords() {
    const { geekez_passwords } = await chrome.storage.local.get('geekez_passwords');
    return geekez_passwords || [];
}

async function savePassword(entry) {
    const pws = await getPasswords();
    const idx = pws.findIndex(p => p.origin === entry.origin && p.username === entry.username);
    const now = Date.now();
    if (idx > -1) {
        pws[idx] = { ...pws[idx], ...entry, updatedAt: now };
    } else {
        pws.push({ ...entry, createdAt: now, updatedAt: now });
    }
    await chrome.storage.local.set({ geekez_passwords: pws });
    syncToElectron(pws);
    return pws;
}

async function deletePassword(origin, username) {
    let pws = await getPasswords();
    pws = pws.filter(p => !(p.origin === origin && p.username === username));
    await chrome.storage.local.set({ geekez_passwords: pws });
    syncToElectron(pws);
    return pws;
}

function syncToElectron(passwords) {
    fetch(\`http://127.0.0.1:\${API_PORT}/api/passwords/sync\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: PROFILE_ID, passwords })
    }).then(r => r.json())
      .then(res => console.log('Sync to Electron success:', res))
      .catch(err => console.error('Sync to Electron falied:', err));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'QUERY_PASSWORDS') {
        getPasswords().then(pws => {
            const matches = pws.filter(p => msg.origin && p.origin === msg.origin);
            sendResponse({ passwords: matches });
        });
        return true;
    }
    if (msg.type === 'SAVE_PASSWORD') {
        savePassword(msg.entry).then(pws => sendResponse({ success: true, count: pws.length }));
        return true;
    }
    if (msg.type === 'DELETE_PASSWORD') {
        deletePassword(msg.origin, msg.username).then(pws => sendResponse({ success: true, count: pws.length }));
        return true;
    }
    if (msg.type === 'GET_ALL_PASSWORDS') {
        getPasswords().then(pws => sendResponse({ passwords: pws }));
        return true;
    }
});
`;
    await fs.writeFile(path.join(extDir, 'background.js'), backgroundJs);

    // --- content_pw.js (密码自动填充 + 保存检测) ---
    const contentPwJs = `
(function() {
    'use strict';
    let fillAttempted = false;

    function getOrigin() { return location.origin; }

    function findPasswordFields() {
        return Array.from(document.querySelectorAll('input[type="password"]:not([data-geekez-processed])'));
    }

    function findUsernameField(pwField) {
        const form = pwField.closest('form') || document.body;
        const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])'));
        const pwIdx = inputs.indexOf(pwField);
        for (let i = pwIdx - 1; i >= 0; i--) {
            const inp = inputs[i];
            const t = (inp.type || '').toLowerCase();
            const n = (inp.name || '').toLowerCase();
            const id = (inp.id || '').toLowerCase();
            const ac = (inp.autocomplete || '').toLowerCase();
            if (t === 'email' || t === 'text' || t === 'tel' ||
                ac.includes('username') || ac.includes('email') ||
                n.includes('user') || n.includes('email') || n.includes('login') || n.includes('account') ||
                id.includes('user') || id.includes('email') || id.includes('login') || id.includes('account')) {
                return inp;
            }
        }
        if (pwIdx > 0) return inputs[pwIdx - 1];
        return null;
    }

    function createFillButton(pwField, passwords) {
        if (passwords.length === 0) return;
        const btn = document.createElement('div');
        btn.setAttribute('data-geekez-fill', 'true');
        btn.style.cssText = 'position:absolute;width:20px;height:20px;cursor:pointer;z-index:999999;background:#4285f4;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);';
        btn.textContent = 'G';
        btn.title = 'GeeKez 自动填充';

        const rect = pwField.getBoundingClientRect();
        btn.style.position = 'absolute';
        btn.style.left = (rect.right - 25 + window.scrollX) + 'px';
        btn.style.top = (rect.top + (rect.height - 20) / 2 + window.scrollY) + 'px';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (passwords.length === 1) {
                doFill(pwField, passwords[0]);
            } else {
                showDropdown(btn, pwField, passwords);
            }
        });
        document.body.appendChild(btn);
    }

    function showDropdown(anchor, pwField, passwords) {
        const existing = document.querySelector('[data-geekez-dropdown]');
        if (existing) existing.remove();
        const dd = document.createElement('div');
        dd.setAttribute('data-geekez-dropdown', 'true');
        dd.style.cssText = 'position:absolute;z-index:9999999;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:200px;max-height:200px;overflow-y:auto;';
        const r = anchor.getBoundingClientRect();
        dd.style.left = (r.left + window.scrollX) + 'px';
        dd.style.top = (r.bottom + 4 + window.scrollY) + 'px';
        passwords.forEach(pw => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;';
            item.textContent = pw.username;
            item.addEventListener('mouseenter', () => item.style.background = '#f5f5f5');
            item.addEventListener('mouseleave', () => item.style.background = '#fff');
            item.addEventListener('click', () => { doFill(pwField, pw); dd.remove(); });
            dd.appendChild(item);
        });
        document.body.appendChild(dd);
        setTimeout(() => document.addEventListener('click', () => dd.remove(), { once: true }), 100);
    }

    function doFill(pwField, pw) {
        const userField = findUsernameField(pwField);
        if (userField) setVal(userField, pw.username);
        setVal(pwField, pw.password);
    }

    function setVal(el, val) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        if(nativeSetter) nativeSetter.call(el, val);
        else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 保存最后输入的凭据
    let lastCreds = { origin: getOrigin(), url: location.href, name: location.hostname };

    function processPage() {
        const pwFields = findPasswordFields();
        if (pwFields.length === 0) return;
        
        pwFields.forEach(pwField => {
            if (pwField.hasAttribute('data-geekez-processed')) return;
            pwField.setAttribute('data-geekez-processed', 'true');
            
            // 记录用户输入，即使没有form submit也能捕获
            pwField.addEventListener('blur', () => {
                if (pwField.value) {
                    lastCreds.password = pwField.value;
                    const uField = findUsernameField(pwField);
                    if (uField && uField.value) lastCreds.username = uField.value;
                }
            });
            const uField = findUsernameField(pwField);
            if (uField) {
                uField.addEventListener('blur', () => {
                   if (uField.value) lastCreds.username = uField.value; 
                });
            }
        });

        chrome.runtime.sendMessage({ type: 'QUERY_PASSWORDS', origin: getOrigin() }, (resp) => {
            if (!resp || !resp.passwords) return;
            pwFields.forEach(pwField => {
                if(!pwField.hasAttribute('data-geekez-btn-added')) {
                    pwField.setAttribute('data-geekez-btn-added', 'true');
                    createFillButton(pwField, resp.passwords);
                }
                if (!fillAttempted && resp.passwords.length === 1) {
                    fillAttempted = true;
                    doFill(pwField, resp.passwords[0]);
                }
            });
        });
    }

    // 监听表单提交 - 提示保存密码
    function monitorSubmit() {
        function attemptSave(pwField) {
            let uVal = lastCreds.username, pVal = lastCreds.password;
            if (pwField && pwField.value) pVal = pwField.value;
            if (pwField) {
                const uField = findUsernameField(pwField);
                if (uField && uField.value) uVal = uField.value;
            }
            if (uVal && pVal) {
                chrome.runtime.sendMessage({ type: 'SAVE_PASSWORD', entry: { ...lastCreds, username: uVal, password: pVal } });
            }
        }

        document.addEventListener('submit', (e) => {
            const form = e.target;
            const pwField = form.querySelector('input[type="password"]') || Array.from(document.querySelectorAll('input[type="password"]')).pop();
            attemptSave(pwField);
        }, true);

        // 也监听点击登录按钮 (扩大范围，捕获 div/span 等模拟按钮)
        document.addEventListener('click', (e) => {
            const el = e.target;
            const text = (el.innerText || el.textContent || '').toLowerCase();
            const btn = el.closest('button, input[type="submit"], input[type="button"], .btn, .button');
            
            if (btn || text.includes('log in') || text.includes('login') || text.includes('sign in') || text.includes('signin') || text.includes('登录') || text.includes('登入')) {
                const pwField = (btn ? btn.closest('form') : null)?.querySelector('input[type="password"]') || Array.from(document.querySelectorAll('input[type="password"]')).pop();
                attemptSave(pwField);
            }
        }, true);
        
        // 离开页面前如果有输入也尝试保存
        window.addEventListener('beforeunload', () => {
            if (lastCreds.username && lastCreds.password) {
                chrome.runtime.sendMessage({ type: 'SAVE_PASSWORD', entry: lastCreds });
            }
        });
    }

    processPage();
    monitorSubmit();
    const obs = new MutationObserver(() => { setTimeout(processPage, 500); });
    obs.observe(document.body, { childList: true, subtree: true });
})();
`;
    await fs.writeFile(path.join(extDir, 'content_pw.js'), contentPwJs);

    // --- popup.html ---
    const popupHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:320px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#1a1a2e;color:#e0e0e0;font-size:13px}
.header{padding:12px 16px;background:linear-gradient(135deg,#16213e,#0f3460);display:flex;align-items:center;gap:8px}
.header h1{font-size:15px;font-weight:600;color:#e94560}
.header span{font-size:11px;color:#888;margin-left:auto}
.list{max-height:300px;overflow-y:auto;padding:4px 0}
.item{padding:10px 16px;border-bottom:1px solid #222;cursor:pointer;transition:background .15s}
.item:hover{background:#16213e}
.item .site{font-weight:500;color:#e94560;font-size:12px;margin-bottom:2px}
.item .user{color:#ccc;font-size:12px}
.item .actions{display:flex;gap:6px;margin-top:4px}
.item .actions button{background:none;border:1px solid #444;color:#aaa;font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer}
.item .actions button:hover{border-color:#e94560;color:#e94560}
.empty{padding:24px 16px;text-align:center;color:#666;font-size:12px}
.add-form{padding:12px 16px;border-top:1px solid #333}
.add-form input{width:100%;padding:6px 8px;margin:3px 0;background:#16213e;border:1px solid #333;border-radius:4px;color:#e0e0e0;font-size:12px}
.add-form button{width:100%;padding:6px;margin-top:6px;background:#e94560;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500}
.add-form button:hover{background:#c73450}
.add-pw-btn{display:block;width:100%;padding:8px;background:none;border:none;border-top:1px solid #333;color:#e94560;cursor:pointer;font-size:12px}
</style></head>
<body>
<div class="header"><h1>🔑 GeeKez</h1><span>密码管理</span></div>
<div class="list" id="list"></div>
<button class="add-pw-btn" id="addPwBtn">+ 添加密码</button>
<div class="add-form" id="addForm" style="display:none">
<input id="addUrl" placeholder="网址 URL"><input id="addUser" placeholder="用户名"><input id="addPw" type="password" placeholder="密码">
<button id="addBtn">保存</button>
</div>
<script src="popup.js"></script>
</body></html>`;
    await fs.writeFile(path.join(extDir, 'popup.html'), popupHtml);

    // --- popup.js ---
    const popupJs = `
document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('list');
    const addPwBtn = document.getElementById('addPwBtn');
    const addForm = document.getElementById('addForm');
    const addBtn = document.getElementById('addBtn');

    addPwBtn.addEventListener('click', () => {
        addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
    });

    addBtn.addEventListener('click', () => {
        const url = document.getElementById('addUrl').value.trim();
        const user = document.getElementById('addUser').value.trim();
        const pw = document.getElementById('addPw').value;
        if (!url || !user || !pw) return;
        let origin;
        try { origin = new URL(url).origin; } catch { origin = url; }
        chrome.runtime.sendMessage({
            type: 'SAVE_PASSWORD',
            entry: { url, origin, username: user, password: pw, name: new URL(url).hostname || url }
        }, () => { loadList(); addForm.style.display = 'none'; });
    });

    function loadList() {
        chrome.runtime.sendMessage({ type: 'GET_ALL_PASSWORDS' }, (resp) => {
            const pws = (resp && resp.passwords) || [];
            if (pws.length === 0) {
                list.innerHTML = '<div class="empty">暂无保存的密码</div>';
                return;
            }
            list.innerHTML = pws.map(pw => \`
                <div class="item">
                    <div class="site">\${esc(pw.name || pw.origin)}</div>
                    <div class="user">\${esc(pw.username)}</div>
                    <div class="actions">
                        <button data-action="copy" data-pw="\${esc(pw.password)}">复制密码</button>
                        <button data-action="delete" data-origin="\${esc(pw.origin)}" data-user="\${esc(pw.username)}">删除</button>
                    </div>
                </div>
            \`).join('');

            list.querySelectorAll('[data-action="copy"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    navigator.clipboard.writeText(btn.dataset.pw).then(() => { btn.textContent = '✓ 已复制'; setTimeout(() => btn.textContent = '复制密码', 1500); });
                });
            });
            list.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    chrome.runtime.sendMessage({ type: 'DELETE_PASSWORD', origin: btn.dataset.origin, username: btn.dataset.user }, () => loadList());
                });
            });
        });
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    loadList();
});
`;
    await fs.writeFile(path.join(extDir, 'popup.js'), popupJs);

    return extDir;
}

app.whenReady().then(async () => {
    cachedCloseBehavior = normalizeCloseBehavior(readSettingsSync().closeBehavior);
    createWindow();
    await createTray().catch((err) => {
        console.error('Failed to initialize tray:', err);
    });

    // Auto-start internal API server explicitly for GeekEZ Guard
    try {
        internalApiServer = createInternalApiServer();
        internalApiServer.listen(INTERNAL_API_PORT, '127.0.0.1', () => {
            console.log(`🛡️ Internal Guard Server auto-started on http://localhost:${INTERNAL_API_PORT}`);
        });
        internalApiServer.on('error', (err) => {
            console.error('Internal Guard Server failed to start:', err);
        });
    } catch (e) {
        console.error('Failed to auto-start Internal Guard Server:', e);
    }

    // Auto-start public API server if enabled
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const settings = await fs.readJson(SETTINGS_FILE);
            if (settings.enableApiServer && !apiServerRunning) {
                const port = settings.apiPort || 12138;
                apiServer = createApiServer(port);
                apiServer.listen(port, '127.0.0.1', () => {
                    apiServerRunning = true;
                    console.log(`🔌 Public API Server auto-started on http://localhost:${port}`);
                });
                apiServer.on('error', (err) => {
                    console.error('Public API Server failed to auto-start:', err);
                });
            }
        }
    } catch (e) {
        console.error('Failed to auto-start Public API server:', e);
    }

    setTimeout(() => { fs.emptyDir(TRASH_PATH).catch(() => { }); }, 10000);
});

app.on('activate', () => {
    showMainWindow();
});

// IPC Handles
ipcMain.handle('get-app-info', () => { return { name: app.getName(), version: app.getVersion() }; });

// Check for updates via GitHub Releases API
ipcMain.handle('check-updates', async () => {
    try {
        const currentVersion = app.getVersion();
        // Notify UI that check is in progress
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('update-status', { type: 'checking' });
        }

        const https = require('https');
        const data = await new Promise((resolve, reject) => {
            const req = https.get('https://api.github.com/repos/EchoHS/GeekezBrowser/releases/latest', {
                headers: { 'User-Agent': 'GeekezBrowser/' + currentVersion }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Invalid response')); }
                });
            });
            req.on('error', reject);
            req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
        });

        const latestVersion = (data.tag_name || '').replace(/^v/, '');
        if (!latestVersion) {
            return { hasUpdate: false, message: 'noUpdate' };
        }

        // Simple version comparison
        const current = currentVersion.split('.').map(Number);
        const latest = latestVersion.split('.').map(Number);
        let hasUpdate = false;
        for (let i = 0; i < Math.max(current.length, latest.length); i++) {
            const c = current[i] || 0;
            const l = latest[i] || 0;
            if (l > c) { hasUpdate = true; break; }
            if (c > l) break;
        }

        if (hasUpdate) {
            return {
                hasUpdate: true,
                currentVersion,
                latestVersion,
                downloadUrl: data.html_url || 'https://github.com/EchoHS/GeekezBrowser/releases',
                message: 'appUpdateFound'
            };
        }

        return { hasUpdate: false, currentVersion, latestVersion, message: 'noUpdate' };
    } catch (err) {
        console.error('Check updates failed:', err.message);
        return { hasUpdate: false, error: err.message, message: 'updateError' };
    }
});
ipcMain.handle('get-proxy-remark', (event, link) => { return getProxyRemark(link) || ''; });
ipcMain.handle('fetch-url', async (e, url) => { try { const res = await fetch(url); if (!res.ok) throw new Error('HTTP ' + res.status); return await res.text(); } catch (e) { throw e.message; } });
async function waitForLocalPortReady(port, timeoutMs = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ok = await new Promise((resolve) => {
            const socket = net.connect({ host: '127.0.0.1', port });
            const finish = (value) => {
                try { socket.destroy(); } catch (e) { }
                resolve(value);
            };
            socket.once('connect', () => finish(true));
            socket.once('error', () => finish(false));
            socket.setTimeout(200, () => finish(false));
        });
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 50));
    }
    return false;
}

async function measureSocksConnectLatency(socksPort, timeoutMs = 4000) {
    const targets = [
        { host: 'cp.cloudflare.com', port: 443, servername: 'cp.cloudflare.com' },
        { host: 'www.cloudflare.com', port: 443, servername: 'www.cloudflare.com' },
        { host: 'www.gstatic.com', port: 443, servername: 'www.gstatic.com' }
    ];

    let lastError = 'Timeout';
    for (const target of targets) {
        const start = process.hrtime.bigint();
        let socksSocket = null;
        let tlsSocket = null;
        try {
            const result = await Promise.race([
                SocksClient.createConnection({
                    command: 'connect',
                    proxy: {
                        host: '127.0.0.1',
                        port: socksPort,
                        type: 5
                    },
                    destination: {
                        host: target.host,
                        port: target.port
                    }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
            ]);

            socksSocket = result?.socket || null;
            if (!socksSocket) throw new Error('No socket');

            const latency = await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (err, value) => {
                    if (settled) return;
                    settled = true;
                    try { tlsSocket?.destroy(); } catch (e) { }
                    try { socksSocket?.destroy(); } catch (e) { }
                    if (err) reject(err);
                    else resolve(value);
                };

                tlsSocket = tls.connect({
                    socket: socksSocket,
                    servername: target.servername || target.host,
                    rejectUnauthorized: false,
                    ALPNProtocols: ['http/1.1']
                });

                tlsSocket.once('secureConnect', () => {
                    const handshakeLatency = Number(process.hrtime.bigint() - start) / 1e6;
                    finish(null, Math.max(1, Math.round(handshakeLatency)));
                });
                tlsSocket.once('error', (err) => finish(err));
                tlsSocket.setTimeout(timeoutMs, () => finish(new Error('Timeout')));
            });

            return { success: true, latency };
        } catch (err) {
            lastError = err?.code || err?.message || 'Connect failed';
            try { tlsSocket?.destroy(); } catch (e) { }
            try { socksSocket?.destroy(); } catch (e) { }
        }
    }

    return { success: false, msg: lastError };
}

async function runProxyLatencyTest(proxyStr) {
    const tempPort = await getAvailablePort();
    const tempConfigPath = path.join(app.getPath('userData'), `test_config_${tempPort}.json`);
    let xrayProcess = null;
    try {
        let outbound;
        try {
            outbound = parseProxyLink(proxyStr, "proxy_test");
        } catch (err) {
            return { success: false, msg: "Format Err" };
        }
        const config = {
            log: { loglevel: "warning" },
            inbounds: [{
                port: tempPort,
                listen: "127.0.0.1",
                protocol: "socks",
                settings: {
                    auth: "noauth",
                    udp: false
                }
            }],
            outbounds: [outbound, { protocol: "freedom", tag: "direct" }],
            routing: {
                domainStrategy: "AsIs",
                rules: [{ type: "field", outboundTag: "proxy_test", port: "0-65535" }]
            }
        };
        await fs.writeJson(tempConfigPath, config);

        xrayProcess = spawn(BIN_PATH, ['-c', tempConfigPath], { cwd: BIN_DIR, env: { ...process.env, 'XRAY_LOCATION_ASSET': RESOURCES_BIN }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let xrayErr = '';
        xrayProcess.stderr.on('data', d => {
            const chunk = d.toString();
            xrayErr += chunk;
            if (xrayErr.length > 5000) xrayErr = xrayErr.substring(xrayErr.length - 5000);
        });
        xrayProcess.stdout.on('data', () => { });

        const ready = await waitForLocalPortReady(tempPort, 1500);
        if (!ready || xrayProcess.exitCode !== null) {
            return { success: false, msg: `Xray crashed: ${xrayErr.substring(0, 150) || 'unknown'}` };
        }

        const result = await measureSocksConnectLatency(tempPort, 4000);
        if (!result.success && !result.xrayLog && xrayErr) {
            result.xrayLog = xrayErr.substring(0, 500);
        }
        await forceKill(xrayProcess.pid);
        xrayProcess = null;
        try { fs.unlinkSync(tempConfigPath); } catch (e) { }
        return result;
    } catch (err) {
        if (xrayProcess) try { await forceKill(xrayProcess.pid); } catch (e) { }
        try { fs.unlinkSync(tempConfigPath); } catch (e) { }
        return { success: false, msg: err.message };
    }
}

async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(runners);
    return results;
}

ipcMain.handle('test-proxy-latency', async (_e, proxyStr) => {
    return await runProxyLatencyTest(proxyStr);
});
ipcMain.handle('test-proxy-latency-batch', async (_e, entries) => {
    const list = Array.isArray(entries) ? entries : [];
    const concurrency = Math.min(6, Math.max(1, list.length));
    return await mapWithConcurrency(list, concurrency, async (entry) => {
        const id = entry?.id;
        const url = String(entry?.url || '');
        const result = await runProxyLatencyTest(url);
        return { id, ...result };
    });
});
ipcMain.handle('set-title-bar-color', (e, colors) => { const win = BrowserWindow.fromWebContents(e.sender); if (win) { if (process.platform === 'win32') try { win.setTitleBarOverlay({ color: colors.bg, symbolColor: colors.symbol }); } catch (e) { } win.setBackgroundColor(colors.bg); } });
ipcMain.handle('check-app-update', async () => { try { const data = await fetchJson('https://api.github.com/repos/EchoHS/GeekezBrowser/releases/latest'); if (!data || !data.tag_name) return { update: false }; const remote = data.tag_name.replace('v', ''); if (compareVersions(remote, app.getVersion()) > 0) { return { update: true, remote, url: 'https://browser.geekez.net/#downloads', notes: data.body }; } return { update: false }; } catch (e) { return { update: false, error: e.message }; } });
ipcMain.handle('check-xray-update', async () => { try { const data = await fetchJson('https://api.github.com/repos/XTLS/Xray-core/releases/latest'); if (!data || !data.tag_name) return { update: false }; const remoteVer = data.tag_name; const currentVer = await getLocalXrayVersion(); if (remoteVer !== currentVer) { const assetName = resolveXrayAssetName({ platform: os.platform(), arch: os.arch() }); if (!assetName) return { update: false, error: `Unsupported platform/arch: ${os.platform()}-${os.arch()}` }; const downloadUrl = `https://gh-proxy.com/https://github.com/XTLS/Xray-core/releases/download/${remoteVer}/${assetName}`; return { update: true, remote: remoteVer.replace(/^v/, ''), downloadUrl }; } return { update: false }; } catch (e) { return { update: false }; } });
ipcMain.handle('download-xray-update', async (e, url) => {
    const exeName = process.platform === 'win32' ? 'xray.exe' : 'xray';
    const tempBase = os.tmpdir();
    const updateId = `xray_update_${Date.now()}`;
    const tempDir = path.join(tempBase, updateId);
    const zipPath = path.join(tempDir, 'xray.zip');
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        await downloadFile(url, zipPath);
        if (process.platform === 'win32') await new Promise((resolve) => exec('taskkill /F /IM xray.exe', () => resolve()));
        activeProcesses = {};
        await new Promise(r => setTimeout(r, 3000));
        const extractDir = path.join(tempDir, 'extracted');
        fs.mkdirSync(extractDir, { recursive: true });
        await extractZip(zipPath, extractDir);
        function findXrayBinary(dir) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    const found = findXrayBinary(fullPath);
                    if (found) return found;
                } else if (file === exeName) {
                    return fullPath;
                }
            }
            return null;
        }
        const xrayBinary = findXrayBinary(extractDir);
        console.log('[Update Debug] Searched in:', extractDir);
        console.log('[Update Debug] Found binary:', xrayBinary);
        if (!xrayBinary) {
            // 列出所有文件帮助调试
            const allFiles = [];
            function listAllFiles(dir, prefix = '') {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const fullPath = path.join(dir, file);
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        allFiles.push(prefix + file + '/');
                        listAllFiles(fullPath, prefix + file + '/');
                    } else {
                        allFiles.push(prefix + file);
                    }
                });
            }
            listAllFiles(extractDir);
            console.log('[Update Debug] All extracted files:', allFiles);
            throw new Error('Xray binary not found in package');
        }

        // Windows文件锁规避：先重命名旧文件，再复制新文件
        const oldPath = BIN_PATH + '.old';
        if (fs.existsSync(BIN_PATH)) {
            try {
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            } catch (e) { }
            fs.renameSync(BIN_PATH, oldPath);
        }
        fs.ensureDirSync(BIN_DIR);
        fs.copyFileSync(xrayBinary, BIN_PATH);
        if (process.platform !== 'win32') fs.chmodSync(BIN_PATH, '755');
        // 删除旧文件
        try {
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (e) { }
        if (process.platform !== 'win32') fs.chmodSync(BIN_PATH, '755');
        // 清理临时目录（即使失败也不影响更新）
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
            console.warn('[Cleanup Warning] Failed to remove temp dir:', cleanupErr.message);
        }
        return true;
    } catch (e) {
        console.error('Xray update failed:', e);
        try {
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (err) { }
        return false;
    }
});
ipcMain.handle('get-running-ids', () => Object.keys(activeProcesses));
ipcMain.handle('get-profiles', async () => { if (!fs.existsSync(PROFILES_FILE)) return []; return fs.readJson(PROFILES_FILE); });
ipcMain.handle('update-profile', async (event, updatedProfile) => {
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const index = profiles.findIndex(p => p.id === updatedProfile.id);
    if (index === -1) return false;

    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    const others = profiles.filter((_, i) => i !== index);
    const rebuilt = await buildProfileFromInput(updatedProfile, others, settings, profiles[index]);
    profiles[index] = rebuilt;
    await fs.writeJson(PROFILES_FILE, profiles);
    notifyUIRefresh();
    return true;
});
ipcMain.handle('save-profile', async (event, data) => {
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    const newProfile = await buildProfileFromInput(data, profiles, settings);
    profiles.push(newProfile);
    await fs.writeJson(PROFILES_FILE, profiles);
    notifyUIRefresh();
    return newProfile;
});
ipcMain.handle('delete-profile', async (event, id) => {
    // 关闭正在运行的进程
    if (activeProcesses[id]) {
        await stopRunningProfile(id, { refreshMenu: false });
        // Windows 需要更长的等待时间让文件释放
        await new Promise(r => setTimeout(r, 1000));
    }

    // 从 profiles.json 中删除
    let profiles = await fs.readJson(PROFILES_FILE);
    profiles = profiles.filter(p => p.id !== id);
    await fs.writeJson(PROFILES_FILE, profiles);
    notifyUIRefresh();

    // 永久删除 profile 文件夹（带重试机制）
    const profileDir = path.join(DATA_PATH, id);
    let deleted = false;

    // 尝试删除 3 次
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (fs.existsSync(profileDir)) {
                // 使用 fs-extra 的 remove，它会递归删除
                await fs.remove(profileDir);
                console.log(`Deleted profile folder: ${profileDir}`);
                deleted = true;
                break;
            } else {
                deleted = true;
                break;
            }
        } catch (err) {
            console.error(`Delete attempt ${attempt} failed:`, err.message);
            if (attempt < 3) {
                // 等待后重试
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    }

    // 如果删除失败，移到回收站作为后备方案
    if (!deleted && fs.existsSync(profileDir)) {
        console.warn(`Failed to delete, moving to trash: ${profileDir}`);
        const trashDest = path.join(TRASH_PATH, `${id}_${Date.now()}`);
        try {
            await fs.move(profileDir, trashDest);
            console.log(`Moved to trash: ${trashDest}`);
        } catch (err) {
            console.error(`Failed to move to trash:`, err);
        }
    }

    return true;
});
ipcMain.handle('get-settings', async () => {
    if (!fs.existsSync(SETTINGS_FILE)) {
        return {
            preProxies: [],
            mode: 'single',
            enablePreProxy: false,
            enableRemoteDebugging: false,
            enableUaWebglModify: false,
            closeBehavior: CLOSE_BEHAVIOR.TRAY,
            userExtensions: []
        };
    }
    const settings = await fs.readJson(SETTINGS_FILE);
    return normalizeSettingsSnapshot(settings);
});
ipcMain.handle('save-settings', async (e, settings) => {
    const incoming = (settings && typeof settings === 'object')
        ? JSON.parse(JSON.stringify(settings))
        : {};
    const existing = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    const merged = { ...(existing || {}), ...(incoming || {}) };
    await saveSettingsWithNormalizedExtensions(merged);
    refreshTrayMenu().catch(() => { });
    return true;
});
ipcMain.handle('select-extension-folder', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Extension Folder'
    });
    return filePaths && filePaths.length > 0 ? filePaths[0] : null;
});
ipcMain.handle('select-extension-crx', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'Select CRX File',
        filters: [{ name: 'CRX Extension', extensions: ['crx'] }]
    });
    return filePaths && filePaths.length > 0 ? filePaths[0] : null;
});
ipcMain.handle('search-extension-store', async (e, query) => {
    return await searchChromeWebStore(query);
});
ipcMain.handle('add-user-extension', async (e, payload) => {
    const sendProgress = (percent, message, done = false, error = '') => {
        try {
            if (!e?.sender || e.sender.isDestroyed()) return;
            e.sender.send('extension-install-progress', {
                percent: Math.max(0, Math.min(100, Number(percent) || 0)),
                message: String(message || ''),
                done: !!done,
                error: String(error || '')
            });
        } catch (err) { }
    };

    try {
        sendProgress(5, '准备安装扩展...');
        const input = typeof payload === 'string' ? { type: 'folder', path: payload } : (payload || {});
        const installType = String(input.type || 'folder');
        const settings = await readSettingsForExtensionMutation();
        const extensions = settings.userExtensions || [];

        let installed;
        if (installType === 'folder') {
            sendProgress(30, '校验扩展目录...');
            const validated = await validateExtensionFolder(input.path);
            sendProgress(48, '正在优化扩展安装行为...');
            await patchExtensionInstallBehavior(validated.path).catch(() => { });
            installed = {
                id: makeStableExtensionId(`folder:${validated.path}`),
                name: validated.name,
                path: validated.path,
                source: 'folder',
                applyMode: 'all',
                profileIds: [],
                storeId: '',
                version: validated.version,
                homepage: validated.homepage,
                installedAt: Date.now()
            };
            sendProgress(80, '扩展目录已校验');
        } else if (installType === 'crx') {
            const crxPath = String(input.path || '').trim();
            if (!crxPath) throw new Error('CRX 文件路径不能为空');
            const crxBaseName = path.basename(crxPath, path.extname(crxPath));
            const extensionId = makeStableExtensionId(`crx:${crxPath}:${Date.now()}`);
            const outputDir = path.join(USER_EXTENSIONS_DIR, extensionId);
            sendProgress(25, '正在解压 CRX...');
            const extracted = await extractCrxToDirectory(crxPath, outputDir);
            sendProgress(60, '正在优化扩展安装行为...');
            await patchExtensionInstallBehavior(outputDir).catch(() => { });
            sendProgress(75, 'CRX 解压完成');
            installed = {
                id: extensionId,
                name: extracted.name || crxBaseName || 'CRX Extension',
                path: outputDir,
                source: 'crx',
                applyMode: 'all',
                profileIds: [],
                storeId: '',
                version: extracted.version,
                homepage: extracted.homepage,
                installedAt: Date.now()
            };
        } else if (installType === 'store') {
            const rawStore = firstDefined(input.storeId, input.id, input.query, '');
            const storeId = parseExtensionStoreIdFromInput(rawStore);
            if (!storeId) throw new Error('扩展商店 ID 无效，请输入完整商店链接或 32 位扩展 ID');

            const outputDir = path.join(USER_EXTENSIONS_DIR, `store_${storeId}`);
            const crxPath = path.join(app.getPath('temp'), `geekez-store-${storeId}-${Date.now()}.crx`);
            try {
                sendProgress(15, '正在从商店下载扩展...');
                await downloadFile(buildChromeStoreCrxUrl(storeId), crxPath, (ratio) => {
                    const pct = 15 + Math.floor(Math.max(0, Math.min(1, ratio || 0)) * 50);
                    sendProgress(pct, '正在下载扩展...');
                });
                sendProgress(70, '下载完成，正在解压...');
                const extracted = await extractCrxToDirectory(crxPath, outputDir);
                sendProgress(80, '正在优化扩展安装行为...');
                await patchExtensionInstallBehavior(outputDir).catch(() => { });
                sendProgress(82, '正在优化扩展首次启动体验...');
                await patchKnownExtensionOnboarding(outputDir, storeId).catch(() => { });
                sendProgress(90, '扩展解析完成');
                installed = {
                    id: `store_${storeId}`,
                    name: String(input.name || extracted.name || storeId),
                    path: outputDir,
                    source: 'store',
                    applyMode: 'all',
                    profileIds: [],
                    storeId,
                    version: extracted.version,
                    homepage: String(input.homepage || extracted.homepage || `https://chromewebstore.google.com/detail/${storeId}`),
                    installedAt: Date.now()
                };
            } finally {
                await fs.remove(crxPath).catch(() => { });
            }
        } else {
            throw new Error(`Unsupported extension install type: ${installType}`);
        }

        const existsById = extensions.findIndex(ext => ext.id === installed.id);
        const existsByPath = extensions.findIndex(ext => ext.path === installed.path);
        if (existsById >= 0) {
            const prev = extensions[existsById];
            extensions[existsById] = {
                ...prev,
                ...installed,
                applyMode: prev.applyMode || 'all',
                profileIds: Array.isArray(prev.profileIds) ? prev.profileIds : []
            };
        } else if (existsByPath >= 0) {
            const prev = extensions[existsByPath];
            extensions[existsByPath] = {
                ...prev,
                ...installed,
                applyMode: prev.applyMode || 'all',
                profileIds: Array.isArray(prev.profileIds) ? prev.profileIds : []
            };
        } else {
            extensions.push(installed);
        }

        settings.userExtensions = normalizeUserExtensions(extensions);
        await saveSettingsWithNormalizedExtensions(settings);
        sendProgress(100, '扩展安装完成', true);
        return installed;
    } catch (err) {
        sendProgress(100, '扩展安装失败', true, err.message || '未知错误');
        throw err;
    }
});
ipcMain.handle('update-user-extension-scope', async (e, payload) => {
    const id = String(payload?.id || '').trim();
    if (!id) throw new Error('扩展 ID 不能为空');
    const applyMode = payload?.applyMode === 'selected' ? 'selected' : 'all';
    const profileIds = applyMode === 'selected'
        ? Array.from(new Set((Array.isArray(payload?.profileIds) ? payload.profileIds : []).map(v => String(v || '').trim()).filter(Boolean)))
        : [];

    const settings = await readSettingsForExtensionMutation();
    const idx = settings.userExtensions.findIndex(ext => ext.id === id);
    if (idx < 0) throw new Error('扩展不存在');
    settings.userExtensions[idx] = {
        ...settings.userExtensions[idx],
        applyMode,
        profileIds
    };
    await saveSettingsWithNormalizedExtensions(settings);
    return settings.userExtensions[idx];
});
ipcMain.handle('remove-user-extension', async (e, payload) => {
    if (!fs.existsSync(SETTINGS_FILE)) return true;
    const settings = await readSettingsForExtensionMutation();
    const removeId = typeof payload === 'object' && payload !== null ? String(payload.id || '') : '';
    const removePath = typeof payload === 'string'
        ? payload
        : (typeof payload === 'object' && payload !== null ? String(payload.path || '') : '');

    const matched = settings.userExtensions.find(ext =>
        (removeId && ext.id === removeId) ||
        (removePath && ext.path === removePath)
    );
    if (!matched) return true;

    settings.userExtensions = settings.userExtensions.filter(ext => ext.id !== matched.id);
    await saveSettingsWithNormalizedExtensions(settings);

    if ((matched.source === 'crx' || matched.source === 'store') && matched.path.startsWith(USER_EXTENSIONS_DIR)) {
        await fs.remove(matched.path).catch(() => { });
    }
    return true;
});
ipcMain.handle('get-user-extensions', async () => {
    if (!fs.existsSync(SETTINGS_FILE)) return [];
    const settings = await readSettingsForExtensionMutation();
    return settings.userExtensions || [];
});
ipcMain.handle('open-url', async (e, url) => { await shell.openExternal(url); });

// --- 自定义数据目录 ---
ipcMain.handle('get-data-path-info', async () => {
    return {
        currentPath: DATA_PATH,
        defaultPath: DEFAULT_DATA_PATH,
        isCustom: DATA_PATH !== DEFAULT_DATA_PATH
    };
});

ipcMain.handle('select-data-directory', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Data Directory'
    });
    return filePaths && filePaths.length > 0 ? filePaths[0] : null;
});

ipcMain.handle('set-data-directory', async (e, { newPath, migrate }) => {
    try {
        // 验证路径
        if (!newPath) {
            return { success: false, error: 'Invalid path' };
        }

        // 确保目录存在
        await fs.ensureDir(newPath);

        // 检查是否有写入权限
        const testFile = path.join(newPath, '.geekez-test');
        try {
            await fs.writeFile(testFile, 'test');
            await fs.remove(testFile);
        } catch (e) {
            return { success: false, error: 'No write permission to selected directory' };
        }

        // 如果需要迁移数据
        if (migrate && DATA_PATH !== newPath) {
            const oldProfiles = path.join(DATA_PATH, 'profiles.json');
            const oldSettings = path.join(DATA_PATH, 'settings.json');

            // 迁移 profiles.json
            if (fs.existsSync(oldProfiles)) {
                await fs.copy(oldProfiles, path.join(newPath, 'profiles.json'));
            }
            // 迁移 settings.json
            if (fs.existsSync(oldSettings)) {
                await fs.copy(oldSettings, path.join(newPath, 'settings.json'));
            }

            // 迁移所有环境数据目录
            const profiles = fs.existsSync(oldProfiles) ? await fs.readJson(oldProfiles) : [];
            for (const profile of profiles) {
                const oldDir = path.join(DATA_PATH, profile.id);
                const newDir = path.join(newPath, profile.id);
                if (fs.existsSync(oldDir)) {
                    console.log(`Migrating profile ${profile.id}...`);
                    await fs.copy(oldDir, newDir);
                }
            }
        }

        // 保存新路径到配置
        await fs.writeJson(APP_CONFIG_FILE, { customDataPath: newPath });

        return { success: true, requiresRestart: true };
    } catch (err) {
        console.error('Failed to set data directory:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('reset-data-directory', async () => {
    try {
        // 删除自定义配置
        if (fs.existsSync(APP_CONFIG_FILE)) {
            const config = await fs.readJson(APP_CONFIG_FILE);
            delete config.customDataPath;
            await fs.writeJson(APP_CONFIG_FILE, config);
        }
        return { success: true, requiresRestart: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// --- 导出/导入功能 (重构版) ---

// 辅助函数：清理 fingerprint 中的无用字段
function cleanFingerprint(fp) {
    if (!fp) return fp;
    const cleaned = { ...fp };
    // secChUa can be regenerated from userAgentMetadata at runtime.
    delete cleaned.secChUa;
    if (!cleaned.webglProfile && cleaned.webgl?.profileId) {
        cleaned.webglProfile = cleaned.webgl.profileId;
    }
    return cleaned;
}

// 加密辅助函数
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MAGIC_HEADER = Buffer.from('GKEZ'); // GeekEZ magic bytes

function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
}

function encryptData(data, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(password, salt);

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 格式: MAGIC(4) + VERSION(4) + SALT(16) + IV(12) + AUTH_TAG(16) + ENCRYPTED_DATA
    const version = Buffer.alloc(4);
    version.writeUInt32LE(1, 0); // Version 1

    return Buffer.concat([MAGIC_HEADER, version, salt, iv, authTag, encrypted]);
}

function decryptData(encryptedBuffer, password) {
    // 验证 magic header
    const magic = encryptedBuffer.slice(0, 4);
    if (!magic.equals(MAGIC_HEADER)) {
        throw new Error('Invalid backup file format');
    }

    let offset = 4;
    const version = encryptedBuffer.readUInt32LE(offset);
    offset += 4;

    if (version !== 1) {
        throw new Error(`Unsupported backup version: ${version}`);
    }

    const salt = encryptedBuffer.slice(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;

    const iv = encryptedBuffer.slice(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    const authTag = encryptedBuffer.slice(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;

    const encrypted = encryptedBuffer.slice(offset);

    const key = deriveKey(password, salt);
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// --- 密码加密存储辅助函数 ---
async function readEncryptedPasswords(pwFile, profileId) {
    if (!fs.existsSync(pwFile)) return [];
    try {
        const encrypted = await fs.readFile(pwFile);
        const decrypted = decryptData(encrypted, 'GeekEZ_PW_' + profileId);
        return JSON.parse(decrypted.toString('utf8'));
    } catch (e) {
        try {
            // 兼容之前明文保存的 JSON，透明升级到加密
            const plain = await fs.readJson(pwFile);
            if (Array.isArray(plain)) {
                writeEncryptedPasswords(pwFile, plain, profileId).catch(() => { });
                return plain;
            }
        } catch (e2) { }
    }
    return [];
}

async function writeEncryptedPasswords(pwFile, passwords, profileId) {
    const data = Buffer.from(JSON.stringify(passwords), 'utf8');
    const encrypted = encryptData(data, 'GeekEZ_PW_' + profileId);
    await fs.writeFile(pwFile, encrypted);
}

// 获取用于选择器的环境列表
ipcMain.handle('get-export-profiles', async () => {
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    return profiles.map(p => ({ id: p.id, name: p.name, tags: p.tags || [] }));
});

// 导出选定环境 (精简版，不含浏览器数据)
ipcMain.handle('export-selected-data', async (e, { type, profileIds }) => {
    const allProfiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] };

    // 过滤选中的环境
    const selectedProfiles = allProfiles
        .filter(p => profileIds.includes(p.id))
        .map(p => ({
            ...p,
            fingerprint: cleanFingerprint(p.fingerprint)
        }));

    let exportObj = {};

    if (type === 'all' || type === 'profiles') {
        exportObj.profiles = selectedProfiles;
    }
    if (type === 'all' || type === 'proxies') {
        exportObj.preProxies = settings.preProxies || [];
        exportObj.subscriptions = settings.subscriptions || [];
    }

    if (Object.keys(exportObj).length === 0) return { success: false, error: 'No data to export' };

    const typeNames = { all: 'profiles', profiles: 'profiles', proxies: 'proxies' };
    const { filePath } = await dialog.showSaveDialog({
        title: 'Export Data',
        defaultPath: `GeekEZ_Backup_${typeNames[type] || type}_${Date.now()}.yaml`,
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
    });

    if (filePath) {
        await fs.writeFile(filePath, yaml.dump(exportObj));
        return { success: true, count: selectedProfiles.length };
    }
    return { success: false, cancelled: true };
});

// 完整备份 (v2 跨平台方案 - 含浏览器数据，加密)
ipcMain.handle('select-save-full-backup', async () => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Export Full Backup',
        defaultPath: `GeekEZ_FullBackup_${Date.now()}.geekez`,
        filters: [{ name: 'GeekEZ Backup', extensions: ['geekez'] }]
    });
    return filePath || null;
});

ipcMain.handle('export-full-backup', async (e, { profileIds, password, filePath }) => {
    currentImportProgress = { percent: 0, message: 'Initializing Export...', processing: true };
    try {
        if (!filePath) {
            currentImportProgress.processing = false;
            return { success: false, cancelled: true };
        }
        
        currentImportProgress = { percent: 5, message: 'Preparing Profiles...', processing: true };
        const allProfiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
        const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] };

        const selectedProfiles = allProfiles
            .filter(p => profileIds.includes(p.id))
            .map(p => ({ ...p, fingerprint: cleanFingerprint(p.fingerprint) }));

        const backupData = {
            version: 2,
            createdAt: Date.now(),
            profiles: selectedProfiles,
            preProxies: settings.preProxies || [],
            subscriptions: settings.subscriptions || [],
            browserData: {}
        };

        // --- 1. 文件/目录拷贝：书签、历史记录、扩展数据等 ---
        const filesToBackup = [
            'Bookmarks', 'Bookmarks.bak',
            'History', 'History-journal',
            'Favicons', 'Favicons-journal',
            'Preferences', 'Secure Preferences',
            'Top Sites', 'Top Sites-journal',
            'Web Data', 'Web Data-journal'
        ];

        currentImportProgress = { percent: 10, message: 'Exporting Browser Data...', processing: true };
        let profileIndex = 0;
        for (const profile of selectedProfiles) {
            profileIndex++;
            currentImportProgress = { percent: 10 + Math.floor((profileIndex / selectedProfiles.length) * 40), message: `Exporting Files (${profileIndex}/${selectedProfiles.length})...`, processing: true };
            const defaultDir = path.join(DATA_PATH, profile.id, 'browser_data', 'Default');
            if (!fs.existsSync(defaultDir)) continue;
            const browserFiles = {};
            for (const fileName of filesToBackup) {
                const filePath = path.join(defaultDir, fileName);
                if (fs.existsSync(filePath)) {
                    try {
                        const content = await fs.readFile(filePath);
                        browserFiles[fileName] = content.toString('base64');
                    } catch (err) {
                        console.error(`备份文件失败 ${fileName}:`, err.message);
                    }
                }
            }
            if (Object.keys(browserFiles).length > 0) {
                backupData.browserData[profile.id] = browserFiles;
            }
        }

        // --- 2. CDP 获取 Cookie + 解密密码 ---
        currentImportProgress = { percent: 50, message: 'Extracting Browser Cookies & Passwords...', processing: true };
        const chromePath = getChromiumPath();
        profileIndex = 0;
        for (const profile of selectedProfiles) {
            profileIndex++;
            currentImportProgress = { percent: 50 + Math.floor((profileIndex / selectedProfiles.length) * 30), message: `Extracting Cookies (${profileIndex}/${selectedProfiles.length})...`, processing: true };
            const profileDataDir = path.join(DATA_PATH, profile.id, 'browser_data');
            if (!fs.existsSync(profileDataDir)) continue;
            if (!backupData.browserData[profile.id]) backupData.browserData[profile.id] = {};

            // 2a. Cookie: 无头启动浏览器 → CDP 获取明文 Cookie
            try {
                const browser = await puppeteer.launch({
                    headless: 'new',
                    executablePath: chromePath,
                    userDataDir: profileDataDir,
                    args: ['--no-first-run', '--disable-extensions', '--disable-sync', '--disable-gpu'],
                    defaultViewport: null,
                    ignoreDefaultArgs: ['--enable-automation'],
                });
                const page = (await browser.pages())[0] || await browser.newPage();
                const client = await page.createCDPSession();
                const { cookies } = await client.send('Network.getAllCookies');
                await browser.close();
                backupData.browserData[profile.id]._cookies = cookies;
                console.log(`已导出 ${cookies.length} 个 Cookie (${profile.id})`);
            } catch (err) {
                console.error(`CDP Cookie 导出失败 (${profile.id}):`, err.message);
            }

            // 2b. 密码: 读取 passwords.json (GeeKez 扩展，解密)
            try {
                const pwJsonFile = path.join(DATA_PATH, profile.id, 'passwords.json');
                const passwords = await readEncryptedPasswords(pwJsonFile, profile.id);
                if (passwords.length > 0) {
                    backupData.browserData[profile.id]._passwords = passwords;
                    console.log(`已导出 ${passwords.length} 个密码 from passwords.json (${profile.id})`);
                }
            } catch (err) {
                console.error(`密码导出失败 (${profile.id}):`, err.message);
            }
        }

        // 压缩并加密
        currentImportProgress = { percent: 80, message: 'Compressing Backup...', processing: true };
        const jsonData = JSON.stringify(backupData);
        const compressed = await gzip(Buffer.from(jsonData, 'utf8'));
        
        currentImportProgress = { percent: 90, message: 'Encrypting Backup...', processing: true };
        const encrypted = encryptData(compressed, password);

        currentImportProgress = { percent: 98, message: 'Writing to Disk...', processing: true };
        await fs.writeFile(filePath, encrypted);
        currentImportProgress = { percent: 100, message: 'Finish!', processing: false };
        return { success: true, count: selectedProfiles.length };

    } catch (err) {
        currentImportProgress.processing = false;
        console.error('Full backup failed:', err);
        return { success: false, error: err.message };
    }
});

// --- 进度跟踪机制 ---
let currentImportProgress = { percent: 0, message: 'Initializing...', processing: false };

ipcMain.handle('get-import-progress', () => {
    return currentImportProgress;
});

// 专门拆分出来的选择文件弹窗接口，让渲染层能够先选文件再输入密码
ipcMain.handle('select-backup-file', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'GeekEZ Backup', extensions: ['geekez'] }]
    });

    if (!filePaths || filePaths.length === 0) {
        return null;
    }
    return filePaths[0];
});

// 导入完整备份 (支持 v1 旧格式 + v2 跨平台格式)
ipcMain.handle('import-full-backup', async (e, { filePath, password }) => {
    currentImportProgress = { percent: 0, message: 'Reading File...', processing: true };
    try {
        if (!filePath) {
            currentImportProgress.processing = false;
            return { success: false, cancelled: true };
        }

        const encrypted = await fs.readFile(filePath);
        currentImportProgress = { percent: 10, message: 'Decrypting Backup...', processing: true };
        const decrypted = decryptData(encrypted, password);
        currentImportProgress = { percent: 20, message: 'Decompressing Data...', processing: true };
        const decompressed = await gunzip(decrypted);
        currentImportProgress = { percent: 30, message: 'Parsing Backup JSON...', processing: true };
        const backupData = JSON.parse(decompressed.toString('utf8'));

        if (backupData.version !== 1 && backupData.version !== 2) {
            throw new Error(`不支持的备份版本: ${backupData.version}`);
        }

        // 还原 profiles
        currentImportProgress = { percent: 40, message: 'Restoring Profiles...', processing: true };
        const currentProfiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
        let importedCount = 0;
        for (const profile of backupData.profiles) {
            const idx = currentProfiles.findIndex(cp => cp.id === profile.id);
            if (idx > -1) { currentProfiles[idx] = profile; } else { currentProfiles.push(profile); }
            importedCount++;
        }
        await fs.writeJson(PROFILES_FILE, currentProfiles);

        // 还原代理和订阅
        currentImportProgress = { percent: 50, message: 'Restoring Proxies & Settings...', processing: true };
        const currentSettings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] };
        if (backupData.preProxies) {
            if (!currentSettings.preProxies) currentSettings.preProxies = [];
            for (const p of backupData.preProxies) {
                if (!currentSettings.preProxies.find(cp => cp.id === p.id)) currentSettings.preProxies.push(p);
            }
        }
        if (backupData.subscriptions) {
            if (!currentSettings.subscriptions) currentSettings.subscriptions = [];
            for (const s of backupData.subscriptions) {
                if (!currentSettings.subscriptions.find(cs => cs.id === s.id)) currentSettings.subscriptions.push(s);
            }
        }
        await fs.writeJson(SETTINGS_FILE, currentSettings);

        // 还原浏览器数据
        currentImportProgress = { percent: 60, message: 'Restoring Browser Data...', processing: true };
        const chromePath = getChromiumPath();
        const profileIds = Object.keys(backupData.browserData || {});
        let profileIndex = 0;

        for (const profileId of profileIds) {
            profileIndex++;
            const browserFiles = backupData.browserData[profileId];
            currentImportProgress = { percent: 60 + Math.floor((profileIndex / profileIds.length) * 30), message: `Restoring Browser (${profileIndex}/${profileIds.length})...`, processing: true };
            
            const profileDataDir = path.join(DATA_PATH, profileId, 'browser_data');
            const defaultDir = path.join(profileDataDir, 'Default');
            await fs.ensureDir(defaultDir);

            // 1. 还原文件拷贝数据 (书签、历史记录等)
            for (const [fileName, content] of Object.entries(browserFiles)) {
                if (fileName.startsWith('_')) continue; // 跳过 _cookies, _passwords
                if (typeof content !== 'string') continue;
                try {
                    // v2: 直接文件名 → Default/ 下
                    // v1 兼容: 带路径的文件名
                    if (fileName.includes('/') || fileName.includes('\\')) {
                        const targetPath = path.join(profileDataDir, fileName);
                        await fs.ensureDir(path.dirname(targetPath));
                        await fs.writeFile(targetPath, Buffer.from(content, 'base64'));
                    } else {
                        await fs.writeFile(path.join(defaultDir, fileName), Buffer.from(content, 'base64'));
                    }
                } catch (err) {
                    console.error(`还原文件失败 ${fileName}:`, err.message);
                }
            }

            // 2. v2 格式: 还原 Cookie (CDP) - 必须先于密码写入
            const hasCookies = browserFiles._cookies && browserFiles._cookies.length > 0;
            const hasPasswords = browserFiles._passwords && browserFiles._passwords.length > 0;

            if (hasCookies || hasPasswords) {
                // 先启动浏览器处理 Cookie（这也会生成 Local State 和加密密钥）
                try {
                    const browser = await puppeteer.launch({
                        headless: 'new', executablePath: chromePath, userDataDir: profileDataDir,
                        args: ['--no-first-run', '--disable-extensions', '--disable-sync', '--disable-gpu'],
                        defaultViewport: null, ignoreDefaultArgs: ['--enable-automation'],
                    });
                    if (hasCookies) {
                        const page = (await browser.pages())[0] || await browser.newPage();
                        const client = await page.createCDPSession();
                        let cookieCount = 0;
                        for (const cookie of browserFiles._cookies) {
                            try {
                                const params = {
                                    name: cookie.name, value: cookie.value,
                                    domain: cookie.domain, path: cookie.path,
                                    secure: cookie.secure, httpOnly: cookie.httpOnly,
                                    sameSite: cookie.sameSite || 'Lax',
                                };
                                if (cookie.expires > 0) params.expires = cookie.expires;
                                await client.send('Network.setCookie', params);
                                cookieCount++;
                            } catch (ce) { }
                        }
                        console.log(`已导入 ${cookieCount}/${browserFiles._cookies.length} 个 Cookie (${profileId})`);
                    }
                    await browser.close();
                    // 等待浏览器完全释放文件锁
                    await new Promise(r => setTimeout(r, 1000));
                } catch (err) {
                    console.error(`CDP Cookie 导入失败 (${profileId}):`, err.message);
                }
            }

            // 3. v2 格式: 密码写入 passwords.json (加密)
            if (hasPasswords) {
                try {
                    const pwFile = path.join(DATA_PATH, profileId, 'passwords.json');
                    await writeEncryptedPasswords(pwFile, browserFiles._passwords, profileId);
                    console.log(`已恢复 ${browserFiles._passwords.length} 个密码到 passwords.json (${profileId})`);
                } catch (err) {
                    console.error(`密码恢复失败 (${profileId}):`, err.message);
                }
            }
        }

        return { success: true, count: importedCount };
    } catch (err) {
        console.error('Import full backup failed:', err);
        if (err.message.includes('Unsupported state') || err.message.includes('bad decrypt')) {
            return { success: false, error: '密码错误或文件已损坏' };
        }
        return { success: false, error: err.message };
    }
});

// 导入普通备份 (YAML)
ipcMain.handle('import-data', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
    });

    if (filePaths && filePaths.length > 0) {
        try {
            const content = await fs.readFile(filePaths[0], 'utf8');
            const data = yaml.load(content);
            let updated = false;

            if (data.profiles || data.preProxies || data.subscriptions) {
                if (Array.isArray(data.profiles)) {
                    const currentProfiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
                    data.profiles.forEach(p => {
                        const idx = currentProfiles.findIndex(cp => cp.id === p.id);
                        if (idx > -1) currentProfiles[idx] = p;
                        else {
                            if (!p.id) p.id = uuidv4();
                            currentProfiles.push(p);
                        }
                    });
                    await fs.writeJson(PROFILES_FILE, currentProfiles);
                    updated = true;
                }
                if (Array.isArray(data.preProxies) || Array.isArray(data.subscriptions)) {
                    const currentSettings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] };
                    if (data.preProxies) {
                        if (!currentSettings.preProxies) currentSettings.preProxies = [];
                        data.preProxies.forEach(p => {
                            if (!currentSettings.preProxies.find(cp => cp.id === p.id)) currentSettings.preProxies.push(p);
                        });
                    }
                    if (data.subscriptions) {
                        if (!currentSettings.subscriptions) currentSettings.subscriptions = [];
                        data.subscriptions.forEach(s => {
                            if (!currentSettings.subscriptions.find(cs => cs.id === s.id)) currentSettings.subscriptions.push(s);
                        });
                    }
                    await fs.writeJson(SETTINGS_FILE, currentSettings);
                    updated = true;
                }
            } else if (data.name && data.proxyStr && data.fingerprint) {
                // 单个环境导入
                const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
                const newProfile = { ...data, id: uuidv4(), isSetup: false, createdAt: Date.now() };
                profiles.push(newProfile);
                await fs.writeJson(PROFILES_FILE, profiles);
                updated = true;
            }
            return updated;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
    return false;
});

// 保留旧的 export-data 用于向后兼容 (deprecated)
ipcMain.handle('export-data', async (e, type) => {
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] };

    // 清理 fingerprint
    const cleanedProfiles = profiles.map(p => ({
        ...p,
        fingerprint: cleanFingerprint(p.fingerprint)
    }));

    let exportObj = {};
    if (type === 'all' || type === 'profiles') exportObj.profiles = cleanedProfiles;
    if (type === 'all' || type === 'proxies') {
        exportObj.preProxies = settings.preProxies || [];
        exportObj.subscriptions = settings.subscriptions || [];
    }
    if (Object.keys(exportObj).length === 0) return false;

    const { filePath } = await dialog.showSaveDialog({
        title: 'Export Data',
        defaultPath: `GeekEZ_Backup_${type}_${Date.now()}.yaml`,
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
    });
    if (filePath) {
        await fs.writeFile(filePath, yaml.dump(exportObj));
        return true;
    }
    return false;
});

// --- 核心启动逻辑 ---
const launchProfileHandler = async (event, profileId, watermarkStyle) => {
    const sender = event.sender;

    if (activeProcesses[profileId]) {
        const proc = activeProcesses[profileId];
        if (proc.browser && proc.browser.isConnected()) {
            try {
                const targets = await proc.browser.targets();
                const pageTarget = targets.find(t => t.type() === 'page');
                if (pageTarget) {
                    const page = await pageTarget.page();
                    if (page) {
                        const session = await pageTarget.createCDPSession();
                        const { windowId } = await session.send('Browser.getWindowForTarget');
                        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
                        setTimeout(async () => {
                            try { await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); } catch (e) { }
                        }, 100);
                        await page.bringToFront();
                    }
                }
                return "环境已唤醒";
            } catch (e) {
                await forceKill(proc.xrayPid);
                delete activeProcesses[profileId];
            }
        } else {
            await forceKill(proc.xrayPid);
            delete activeProcesses[profileId];
        }
        if (activeProcesses[profileId]) return "环境已唤醒";
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // Load settings early for userExtensions and remote debugging
    const settings = await fs.readJson(SETTINGS_FILE).catch(() => ({
        enableRemoteDebugging: false,
        enableUaWebglModify: false,
        userExtensions: [],
        preProxies: [],
        mode: 'single',
        enablePreProxy: false
    }));

    const profiles = await fs.readJson(PROFILES_FILE);
    const profileIndex = profiles.findIndex(p => p.id === profileId);
    const profile = profileIndex > -1 ? profiles[profileIndex] : null;
    if (!profile) throw new Error('Profile not found');

    ensureProxyStrValid(profile.proxyStr);
    profile.fingerprint = normalizeFingerprint(profile.fingerprint || {});

    // Auto-assign a stable remote debugging port when feature is enabled and no explicit port exists.
    if (settings.enableRemoteDebugging && !normalizeDebugPort(profile.debugPort)) {
        profile.debugPort = await allocateDebugPortIfNeeded(settings, profiles, null);
        profiles[profileIndex] = profile;
        await fs.writeJson(PROFILES_FILE, profiles);
    }

    const useDirectNetwork = isDirectProxy(profile.proxyStr);

    // Pre-proxy settings (settings already loaded above)
    const override = profile.preProxyOverride || 'default';
    const shouldUsePreProxy = (override === 'on' || (override === 'default' && settings.enablePreProxy));
    let finalPreProxyConfig = null;
    let activePreProxy = null;
    let switchMsg = null;
    if (shouldUsePreProxy && settings.preProxies && settings.preProxies.length > 0) {
        const active = settings.preProxies.filter(p => p.enable !== false);
        if (active.length > 0) {
            if (settings.mode === 'single') {
                activePreProxy = active.find(p => p.id === settings.selectedId) || active[0];
                finalPreProxyConfig = { preProxies: [activePreProxy] };
            } else if (settings.mode === 'balance') {
                activePreProxy = active[Math.floor(Math.random() * active.length)];
                finalPreProxyConfig = { preProxies: [activePreProxy] };
                if (settings.notify) switchMsg = `Balance: [${activePreProxy.remark}]`;
            } else if (settings.mode === 'failover') {
                activePreProxy = active[0];
                finalPreProxyConfig = { preProxies: [activePreProxy] };
                if (settings.notify) switchMsg = `Failover: [${activePreProxy.remark}]`;
            }
        }
    }

    let xrayProcess = null;
    let logFd;
    let browser = null;
    try {
        const profileDir = path.join(DATA_PATH, profileId);
        const userDataDir = path.join(profileDir, 'browser_data');
        fs.ensureDirSync(userDataDir);

        let localPort = null;

        try {
            const defaultProfileDir = path.join(userDataDir, 'Default');
            fs.ensureDirSync(defaultProfileDir);
            const preferencesPath = path.join(defaultProfileDir, 'Preferences');
            let preferences = {};
            if (fs.existsSync(preferencesPath)) preferences = await fs.readJson(preferencesPath);
            if (!preferences.bookmark_bar) preferences.bookmark_bar = {};
            preferences.bookmark_bar.show_on_all_tabs = true;
            if (preferences.protection) delete preferences.protection;
            if (!preferences.profile) preferences.profile = {};
            preferences.profile.name = profile.name;
            if (!preferences.webrtc) preferences.webrtc = {};
            preferences.webrtc.ip_handling_policy = 'disable_non_proxied_udp';
            await fs.writeJson(preferencesPath, preferences);
        } catch (e) { }

        const shouldLaunchXray = (!useDirectNetwork) || !!activePreProxy;
        if (shouldLaunchXray) {
            localPort = await getAvailablePort();
            const xrayConfigPath = path.join(profileDir, 'config.json');
            const xrayLogPath = path.join(profileDir, 'xray_run.log');
            const upstreamProxy = useDirectNetwork ? activePreProxy?.url : profile.proxyStr;
            const chainedPreProxy = useDirectNetwork ? null : finalPreProxyConfig;
            const config = generateXrayConfig(upstreamProxy, localPort, chainedPreProxy, profile.fingerprint);
            fs.writeJsonSync(xrayConfigPath, config);
            logFd = fs.openSync(xrayLogPath, 'a');
            xrayProcess = spawn(BIN_PATH, ['-c', xrayConfigPath], { cwd: BIN_DIR, env: { ...process.env, 'XRAY_LOCATION_ASSET': RESOURCES_BIN }, stdio: ['ignore', logFd, logFd], windowsHide: true });

            // 优化：减少等待时间，Xray 通常 300ms 内就能启动
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // 0. Resolve language override
        const configuredLang = profile.fingerprint?.language;
        const hasLanguageOverride = typeof configuredLang === 'string' && configuredLang && configuredLang !== 'auto';
        const localeFromSystem = (() => {
            try {
                const rawLocale = app.getLocale ? app.getLocale() : '';
                const normalized = String(rawLocale || '')
                    .replace(/[._].*$/, '')
                    .replace('_', '-')
                    .trim();
                return normalized || 'en-US';
            } catch (e) {
                return 'en-US';
            }
        })();
        const targetLang = hasLanguageOverride ? configuredLang : localeFromSystem;

        // Update in-memory profile only for explicit language override.
        if (hasLanguageOverride) {
            profile.fingerprint.language = targetLang;
            profile.fingerprint.languages = [targetLang, targetLang.split('-')[0]];
        } else {
            profile.fingerprint.language = 'auto';
            profile.fingerprint.languages = [];
        }

        // 1. 生成 GeekEZ Guard 扩展（使用传递的水印样式）
        const style = watermarkStyle || 'enhanced'; // 默认使用增强水印
        const extPath = await generateExtension(profileDir, profile.fingerprint, profile.name, style, profileId);

        // 2. 获取当前环境需要加载的用户扩展
        const userExtensions = getProfileUserExtensions(settings, profileId);
        for (const ext of userExtensions) {
            await patchExtensionInstallBehavior(ext.path).catch(() => { });
            const extStoreId = sanitizeExtensionStoreId(ext.storeId) || sanitizeExtensionStoreId(String(ext.id || '').replace(/^store_/, ''));
            await patchKnownExtensionOnboarding(ext.path, extStoreId).catch(() => { });
        }
        const userExtPaths = userExtensions.map(ext => ext.path);

        // 3. 合并所有扩展路径
        const extPaths = [extPath, ...userExtPaths].join(',');
        const shouldRestoreSession = hasRestorableSession(userDataDir);

        // 4. 构建启动参数（性能优化）

        const disabledFeatures = [
            'IsolateOrigins',
            'site-per-process',
            'ExtensionsMenuAccessControl',
            'WebGPU'
        ];
        if (process.platform === 'win32') {
            disabledFeatures.push('StartupLaunch', 'StartupBoost');
        }

        const launchArgs = [
            `--user-data-dir=${userDataDir}`,
            `--window-size=${profile.fingerprint?.window?.width || 1280},${profile.fingerprint?.window?.height || 800}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            `--disable-features=${disabledFeatures.join(',')}`,
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
            `--disable-extensions-except=${extPaths}`,
            `--load-extension=${extPaths}`,
            // 性能优化参数
            '--no-first-run',                    // 跳过首次运行向导
            '--no-default-browser-check',        // 跳过默认浏览器检查
            '--disable-session-crashed-bubble',  // 隐藏恢复会话提示气泡
            '--disable-background-timer-throttling', // 防止后台标签页被限速
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-dev-shm-usage',           // 减少共享内存使用
            '--disk-cache-size=52428800',        // 限制磁盘缓存为 50MB
            '--media-cache-size=52428800'        // 限制媒体缓存为 50MB
        ];
        if (shouldRestoreSession) {
            launchArgs.push('--restore-last-session');
        }

        if (localPort) {
            launchArgs.unshift(`--proxy-server=socks5://127.0.0.1:${localPort}`);
        } else {
            launchArgs.unshift('--no-proxy-server');
        }

        if (profile.fingerprint?.userAgent) {
            launchArgs.push(`--user-agent=${profile.fingerprint.userAgent}`);
        }
        if (hasLanguageOverride) {
            launchArgs.push(`--lang=${targetLang}`);
            launchArgs.push(`--accept-lang=${targetLang}`);
        }

        // 5. Remote Debugging Port (if enabled)
        const remoteDebugPort = normalizeDebugPort(profile.debugPort);
        if (settings.enableRemoteDebugging && remoteDebugPort) {
            launchArgs.push(`--remote-debugging-port=${remoteDebugPort}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('⚠️  REMOTE DEBUGGING ENABLED');
            console.log(`📡 Port: ${remoteDebugPort}`);
            console.log(`🔗 Connect: chrome://inspect or ws://localhost:${remoteDebugPort}`);
            console.log('⚠️  WARNING: May increase automation detection risk!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

        // 6. Custom Launch Arguments (if enabled)
        if (settings.enableCustomArgs && profile.customArgs) {
            const customArgsList = profile.customArgs
                .split(/[\n\s]+/)
                .map(arg => arg.trim())
                .filter(arg => arg && arg.startsWith('--'));

            if (customArgsList.length > 0) {
                launchArgs.push(...customArgsList);
                console.log('⚡ Custom Args:', customArgsList.join(' '));
            }
        }

        // 5. 启动浏览器
        const chromePath = getChromiumPath();
        if (!chromePath) {
            if (xrayProcess && xrayProcess.pid) {
                await forceKill(xrayProcess.pid);
            }
            throw new Error("Chrome binary not found.");
        }

        // 时区设置
        const env = { ...process.env };
        if (profile.fingerprint?.timezone && profile.fingerprint.timezone !== 'Auto') {
            env.TZ = profile.fingerprint.timezone;
        }

        browser = await puppeteer.launch({
            headless: false,
            executablePath: chromePath,
            userDataDir: userDataDir,
            args: launchArgs,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation'],
            pipe: false,
            dumpio: false,
            env: env  // 注入环境变量
        });

        const shortLang = targetLang.includes('-') ? targetLang.split('-')[0] : targetLang;
        const acceptLanguageHeader = shortLang && shortLang !== targetLang
            ? `${targetLang},${shortLang};q=0.9`
            : targetLang;
        const fingerprintInjectScript = getInjectScript(profile.fingerprint, profile.name, style);
        const enableWebglOverride = !!(
            profile.fingerprint?.webglProfile !== 'none' &&
            profile.fingerprint?.webgl &&
            !profile.fingerprint?.webgl?.disabled
        );
        const webglOverrideScript = (() => {
            if (!enableWebglOverride) return '(()=>{})();';
            const webglJson = JSON.stringify(profile.fingerprint?.webgl || {});
            return `
(() => {
  try {
    const webglInfo = ${webglJson};
    const PATCHED_KEY = '__geekezDirectWebglPatched__';
    const debugExt = { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };

    const caps = (() => {
      const renderer = String(webglInfo.unmaskedRenderer || webglInfo.renderer || '').toLowerCase();
      const vendor = String(webglInfo.unmaskedVendor || webglInfo.vendor || '').toLowerCase();
      const isHigh = renderer.includes('apple') || renderer.includes('nvidia') || renderer.includes('amd') || renderer.includes('radeon') || vendor.includes('apple') || vendor.includes('nvidia') || vendor.includes('ati');
      const texture = isHigh ? 32768 : 16384;
      const vertexUniforms = isHigh ? 4096 : 2048;
      const fragmentUniforms = isHigh ? 2048 : 1024;
      const varying = isHigh ? 32 : 30;
      return {
        3379: texture,
        34076: texture,
        34024: texture,
        34921: 16,
        34930: 16,
        35660: 16,
        35661: 32,
        36347: vertexUniforms,
        36348: varying,
        36349: fragmentUniforms,
        3386: new Int32Array([texture, texture]),
        33901: new Float32Array([1, 1024]),
        33902: new Float32Array([1, 1]),
        34852: 8,
        36063: 8
      };
    })();

    const cloneCap = (value) => {
      if (value instanceof Int32Array) return new Int32Array(value);
      if (value instanceof Float32Array) return new Float32Array(value);
      return value;
    };

    const patchProto = (proto) => {
      if (!proto || proto[PATCHED_KEY]) return;
      try {
        const originalGetParameter = proto.getParameter;
        const originalGetExtension = proto.getExtension;
        const originalGetSupportedExtensions = proto.getSupportedExtensions;
        proto.getParameter = function(param) {
          if (param === 37445) return webglInfo.unmaskedVendor || webglInfo.vendor || 'Google Inc.';
          if (param === 37446) return webglInfo.unmaskedRenderer || webglInfo.renderer || 'ANGLE (Unknown GPU)';
          if (param === 7936) return webglInfo.vendor || 'Google Inc.';
          if (param === 7937) return webglInfo.renderer || 'ANGLE (Unknown GPU)';
          if (param === 7938) return webglInfo.version || 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
          if (param === 35724) return webglInfo.shadingLanguageVersion || 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
          if (Object.prototype.hasOwnProperty.call(caps, param)) return cloneCap(caps[param]);
          return originalGetParameter.apply(this, arguments);
        };
        proto.getExtension = function(name) {
          if (name === 'WEBGL_debug_renderer_info') return debugExt;
          return originalGetExtension.apply(this, arguments);
        };
        if (originalGetSupportedExtensions) {
          proto.getSupportedExtensions = function() {
            const list = originalGetSupportedExtensions.apply(this, arguments) || [];
            if (Array.isArray(list) && !list.includes('WEBGL_debug_renderer_info')) return list.concat(['WEBGL_debug_renderer_info']);
            return list;
          };
        }
        Object.defineProperty(proto, PATCHED_KEY, { value: true, configurable: true });
      } catch (e) {}
    };

    const patchFactory = (factoryProto) => {
      if (!factoryProto || !factoryProto.getContext || factoryProto.__geekezCtxPatched__) return;
      try {
        const originalGetContext = factoryProto.getContext;
        factoryProto.getContext = function(type) {
          const ctx = originalGetContext.apply(this, arguments);
          const name = String(type || '').toLowerCase();
          if (name === 'webgl' || name === 'experimental-webgl' || name === 'webgl2') {
            try { patchProto(Object.getPrototypeOf(ctx)); } catch (e) {}
          }
          return ctx;
        };
        Object.defineProperty(factoryProto, '__geekezCtxPatched__', { value: true, configurable: true });
      } catch (e) {}
    };

    patchProto(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
    patchProto(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);
    patchFactory(window.HTMLCanvasElement && window.HTMLCanvasElement.prototype);
    patchFactory(window.OffscreenCanvas && window.OffscreenCanvas.prototype);
  } catch (e) {}
})();
            `;
        })();

        // Keep network headers, Intl locale and runtime fingerprint hooks aligned with profile settings.
        const applyPageOverrides = async (page) => {
            if (!page) return;
            try {
                try {
                    await page.evaluateOnNewDocument(fingerprintInjectScript);
                } catch (e) { }
                try {
                    await page.evaluateOnNewDocument(webglOverrideScript);
                } catch (e) { }

                try {
                    await page.evaluate(fingerprintInjectScript);
                } catch (e) { }
                try {
                    await page.evaluate(webglOverrideScript);
                } catch (e) { }

                const session = await page.createCDPSession();
                try {
                    await session.send('Page.enable');
                    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: webglOverrideScript });
                } catch (e) { }
                try { await session.send('Network.enable'); } catch (e) { }

                if (hasLanguageOverride) {
                    try {
                        await session.send('Network.setExtraHTTPHeaders', {
                            headers: {
                                'Accept-Language': acceptLanguageHeader
                            }
                        });
                    } catch (e) { }

                    try {
                        await session.send('Emulation.setLocaleOverride', { locale: targetLang });
                    } catch (e) { }
                }

                if (profile.fingerprint?.timezone && profile.fingerprint.timezone !== 'Auto') {
                    try {
                        await session.send('Emulation.setTimezoneOverride', { timezoneId: profile.fingerprint.timezone });
                    } catch (e) { }
                }

                if (profile.fingerprint?.userAgent) {
                    const payload = {
                        userAgent: profile.fingerprint.userAgent
                    };
                    if (hasLanguageOverride) {
                        payload.acceptLanguage = targetLang;
                    }
                    if (profile.fingerprint?.platform) {
                        payload.platform = profile.fingerprint.platform;
                    }

                    const metadata = profile.fingerprint?.userAgentMetadata;
                    if (metadata && typeof metadata === 'object') {
                        const md = {
                            mobile: !!metadata.mobile
                        };
                        if (Array.isArray(metadata.brands)) md.brands = metadata.brands;
                        if (Array.isArray(metadata.fullVersionList)) md.fullVersionList = metadata.fullVersionList;
                        if (metadata.platform) md.platform = metadata.platform;
                        if (metadata.platformVersion) md.platformVersion = metadata.platformVersion;
                        if (metadata.architecture) md.architecture = metadata.architecture;
                        if (metadata.model !== undefined) md.model = metadata.model;
                        if (metadata.bitness) md.bitness = metadata.bitness;
                        if (metadata.wow64 !== undefined) md.wow64 = !!metadata.wow64;
                        if (metadata.uaFullVersion) md.fullVersion = metadata.uaFullVersion;
                        payload.userAgentMetadata = md;
                    }

                    await session.send('Network.setUserAgentOverride', payload);
                }
            } catch (err) {
                const msg = String(err && err.message ? err.message : '');
                if (msg.includes('No target with given id found') || msg.includes('Target closed')) {
                    return;
                }
                console.warn('Page override failed:', msg);
            }
        };

        try {
            const startupPages = await browser.pages();
            for (const page of startupPages) {
                await applyPageOverrides(page);
            }
        } catch (e) { }

        const isBlankPageUrl = (url) => {
            const value = String(url || '').trim().toLowerCase();
            return value === 'about:blank' || value === 'chrome://newtab/' || value === 'chrome://new-tab-page/';
        };
        const blankCleanupDeadline = Date.now() + 1500;
        const inBlankCleanupWindow = () => Date.now() <= blankCleanupDeadline;
        const ensureAtLeastOnePage = async () => {
            try {
                const pages = await browser.pages();
                if (pages.length === 0) {
                    await browser.newPage();
                }
            } catch (e) { }
        };
        const cleanupRestoredBlankPages = async () => {
            if (!shouldRestoreSession || !inBlankCleanupWindow()) return;
            try {
                const pages = await browser.pages();
                const hasRealPage = pages.some((page) => {
                    const url = page.url();
                    return !isBlankPageUrl(url);
                });
                if (!hasRealPage) return;

                for (const page of pages) {
                    const url = page.url();
                    if (!isBlankPageUrl(url)) continue;
                    try { await page.close(); } catch (e) { }
                }
            } catch (e) { }
        };
        const handlePageCreated = async (page) => {
            if (!page) return;

            try {
                const url = page.url();
                if (shouldRestoreSession && inBlankCleanupWindow() && isBlankPageUrl(url)) {
                    await cleanupRestoredBlankPages();
                    await ensureAtLeastOnePage();
                }
            } catch (e) { }

            await applyPageOverrides(page);
        };

        browser.on('targetcreated', async (target) => {
            if (target.type() !== 'page') return;
            try {
                const page = await target.page();
                await handlePageCreated(page);
            } catch (e) { }
        });

        try {
            const startupPages = await browser.pages();
            for (const page of startupPages) {
                await handlePageCreated(page);
            }

            const monitor = setInterval(async () => {
                if (!inBlankCleanupWindow()) {
                    clearInterval(monitor);
                    return;
                }

                try {
                    if (shouldRestoreSession) {
                        await cleanupRestoredBlankPages();
                    }
                    await ensureAtLeastOnePage();
                } catch (e) { }
            }, 500);

            await ensureAtLeastOnePage();
        } catch (e) {
            console.error('Failed to process startup pages:', e);
        }

        activeProcesses[profileId] = {
            xrayPid: xrayProcess ? xrayProcess.pid : null,
            browser,
            logFd: logFd  // 存储日志文件描述符，用于后续关闭
        };
        sender.send('profile-status', { id: profileId, status: 'running' });
        refreshTrayMenu().catch(() => { });

        // CDP Timezone Override (Windows only)
        // On macOS/Linux, TZ env var changes V8's timezone natively.
        // On Windows, V8 ignores TZ and uses Win32 API, so we use CDP instead.
        // This changes V8's internal timezone at the engine level - all Date methods
        // (toString, getTimezoneOffset, getHours, etc.) and Intl APIs work correctly.
        const targetTimezone = profile.fingerprint?.timezone;
        if (process.platform === 'win32' && targetTimezone && targetTimezone !== 'Auto') {
            try {
                const pages = await browser.pages();
                for (const page of pages) {
                    try { await page.emulateTimezone(targetTimezone); } catch (e) { }
                }
                browser.on('targetcreated', async (target) => {
                    if (target.type() === 'page') {
                        try {
                            const page = await target.page();
                            if (page) await page.emulateTimezone(targetTimezone);
                        } catch (e) { }
                    }
                });
            } catch (e) {
                console.error('CDP timezone override failed:', e.message);
            }
        }

        browser.on('disconnected', async () => {
            if (activeProcesses[profileId]) {
                const pid = activeProcesses[profileId].xrayPid;
                const logFd = activeProcesses[profileId].logFd;

                // 关闭日志文件描述符
                if (logFd !== undefined) {
                    try {
                        fs.closeSync(logFd);
                    } catch (e) { }
                }

                delete activeProcesses[profileId];
                await forceKill(pid);

                // 性能优化：清理缓存文件，节省磁盘空间
                try {
                    const cacheDir = path.join(userDataDir, 'Default', 'Cache');
                    const codeCacheDir = path.join(userDataDir, 'Default', 'Code Cache');
                    if (fs.existsSync(cacheDir)) await fs.emptyDir(cacheDir);
                    if (fs.existsSync(codeCacheDir)) await fs.emptyDir(codeCacheDir);
                } catch (e) {
                    // 忽略清理错误
                }

                if (!sender.isDestroyed()) sender.send('profile-status', { id: profileId, status: 'stopped' });
                refreshTrayMenu().catch(() => { });
            }
        });

        return switchMsg;
    } catch (err) {
        try {
            if (browser) await browser.close();
        } catch (e) { }

        if (xrayProcess && xrayProcess.pid) {
            await forceKill(xrayProcess.pid);
        }

        if (logFd !== undefined) {
            try {
                fs.closeSync(logFd);
            } catch (e) { }
        }

        delete activeProcesses[profileId];
        if (!sender.isDestroyed()) {
            sender.send('profile-status', { id: profileId, status: 'stopped' });
        }
        refreshTrayMenu().catch(() => { });

        console.error(err);
        throw err;
    }
};
ipcMain.handle('launch-profile', launchProfileHandler);

app.on('before-quit', () => {
    isAppQuitting = true;
});

app.on('window-all-closed', () => {
    if (!isAppQuitting) return;
    Object.values(activeProcesses).forEach(p => forceKill(p.xrayPid));
    if (appTray && (typeof appTray.isDestroyed !== 'function' || !appTray.isDestroyed())) {
        try { appTray.destroy(); } catch (e) { }
        appTray = null;
    }
    if (process.platform !== 'darwin') app.quit();
});
// Helpers (Same)
function fetchJson(url) { return new Promise((resolve, reject) => { const req = https.get(url, { headers: { 'User-Agent': 'GeekEZ-Browser' } }, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }); }); req.on('error', reject); }); }
function getLocalXrayVersion() { return new Promise((resolve) => { if (!fs.existsSync(BIN_PATH)) return resolve('v0.0.0'); try { const proc = spawn(BIN_PATH, ['-version']); let output = ''; proc.stdout.on('data', d => output += d.toString()); proc.on('close', () => { const match = output.match(/Xray\s+v?(\d+\.\d+\.\d+)/i); resolve(match ? (match[1].startsWith('v') ? match[1] : 'v' + match[1]) : 'v0.0.0'); }); proc.on('error', () => resolve('v0.0.0')); } catch (e) { resolve('v0.0.0'); } }); }
function compareVersions(v1, v2) { const p1 = v1.split('.').map(Number); const p2 = v2.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((p1[i] || 0) > (p2[i] || 0)) return 1; if ((p1[i] || 0) < (p2[i] || 0)) return -1; } return 0; }
function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, dest, onProgress).then(resolve).catch(reject);
                return;
            }

            const total = Number(response.headers['content-length'] || 0);
            let downloaded = 0;
            if (typeof onProgress === 'function' && total > 0) {
                onProgress(0);
            }

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                if (typeof onProgress === 'function' && total > 0) {
                    onProgress(downloaded / total);
                }
            });

            response.pipe(file);
            file.on('finish', () => {
                try { file.close(resolve); } catch (e) { resolve(); }
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}
function extractZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
        if (os.platform() === 'win32') {
            // Windows: 使用 adm-zip（可靠）
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(destDir, true);
                console.log('[Extract Success] Extracted to:', destDir);
                resolve();
            } catch (err) {
                console.error('[Extract Error]', err);
                reject(err);
            }
        } else {
            // macOS/Linux: 使用原生 unzip 命令
            exec(`unzip -o "${zipPath}" -d "${destDir}"`, (err, stdout, stderr) => {
                if (err) {
                    console.error('[Extract Error]', err);
                    console.error('[Extract stderr]', stderr);
                    reject(err);
                } else {
                    console.log('[Extract Success]', stdout);
                    resolve();
                }
            });
        }
    });
}
