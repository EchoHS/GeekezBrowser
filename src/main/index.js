const { app, BrowserWindow, ipcMain, dialog, screen, shell, Tray, Menu, nativeImage, powerMonitor, safeStorage } = require('electron');
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
const chromiumLocator = require('./chromium-path');
const { CLOSE_BEHAVIOR, decideCloseAction, normalizeCloseBehavior } = require('./close-behavior');
const { fetchLatestGitHubReleaseInfo } = require('./release-check');
const xrayRelease = require('./xray-assets');
const { supportsNativeGlass, getMainWindowMaterialOptions } = require('./native-glass');
const { allocateLocalProxyPort, isXrayLocalBindFailure } = require('./local-proxy-port');
const { createProfileSync } = require('./profile-sync');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const initSqlJs = require('sql.js');
const { SocksClient } = require('socks');

function handleProcessStreamError(error) {
    if (error?.code === 'EPIPE') return;
    throw error;
}

process.stdout?.on?.('error', handleProcessStreamError);
process.stderr?.on?.('error', handleProcessStreamError);

const uuidv4 = () => crypto.randomUUID();

const PROFILE_SHORTCUT_ARG_PREFIX = '--geekez-profile=';
const initialProfileShortcutId = getProfileShortcutId(process.argv);
const pendingProfileShortcutIds = new Set();
let profileShortcutReady = false;
let profileShortcutFlushRunning = false;
let suppressProfileShortcutActivate = Boolean(initialProfileShortcutId);

function getProfileShortcutId(argv = []) {
    if (!Array.isArray(argv)) return '';
    const arg = argv.find((value) => typeof value === 'string' && value.startsWith(PROFILE_SHORTCUT_ARG_PREFIX));
    return arg ? arg.slice(PROFILE_SHORTCUT_ARG_PREFIX.length).trim() : '';
}

function queueProfileShortcutLaunch(profileId) {
    const normalized = String(profileId || '').trim();
    if (!normalized) return;
    pendingProfileShortcutIds.add(normalized);
    if (profileShortcutReady) {
        setImmediate(() => flushProfileShortcutLaunches().catch((error) => {
            console.error('[Profile Shortcut] Failed to flush launch queue:', error);
        }));
    }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
}

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
import guardBackground from './guard/background.js?raw';
import guardPasswordContent from './guard/content-passwords.js?raw';
import guardPopupHtml from './guard/popup.html?raw';
import guardPopupScript from './guard/popup.js?raw';
import {
    prepareMacProfileChromium,
    removeMacProfileApp,
    restoreMacProfileLauncher,
    restoreMacProfileLauncherSync
} from './macos-profile-app';

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
const DEFAULT_PASSWORDS_FILE = path.join(DATA_PATH, 'default-passwords.json');
const USER_EXTENSIONS_DIR = path.join(DATA_PATH, '_extensions');
const MAC_PROFILE_APPS_DIR = path.join(app.getPath('userData'), 'ProfileApps');

fs.ensureDirSync(DATA_PATH);
fs.ensureDirSync(TRASH_PATH);
fs.ensureDirSync(USER_EXTENSIONS_DIR);
if (process.platform === 'darwin') fs.ensureDirSync(MAC_PROFILE_APPS_DIR);

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
let launchingProfiles = new Set();
const profileResourceWrites = new Set();
let profileApiQueue = Promise.resolve();
let configSync = null;

function runProfileApiTask(task) {
    const result = profileApiQueue.then(task);
    profileApiQueue = result.catch(() => { });
    return result;
}

const runtimeProfileLanguageStates = new Map();
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
            const result = await handleApiRequest(method, pathname, body, url.searchParams, { req, res });
            if (result && result.__streamHandled) {
                return;
            }
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

function resolveApiPreferredLang(params, settings = {}) {
    const rawLang = String(params?.get('lang') || '').trim().toLowerCase();
    if (rawLang === 'en') return 'en';
    if (rawLang === 'cn' || rawLang === 'zh' || rawLang === 'zh-cn') return 'cn';
    return settings.lang === 'en' ? 'en' : 'cn';
}

function shouldStreamApiOpenRequest(req, params) {
    const streamParam = String(params?.get('stream') || '').trim().toLowerCase();
    if (['0', 'false', 'off', 'json'].includes(streamParam)) return false;
    if (['1', 'true', 'on', 'text', 'plain'].includes(streamParam)) return true;

    const userAgent = String(req?.headers?.['user-agent'] || '').toLowerCase();
    if (userAgent.includes('curl/') || userAgent.includes('wget/')) {
        return true;
    }

    const accept = String(req?.headers?.accept || '').toLowerCase();
    return accept.includes('text/plain');
}

function parseCliLikeArgs(rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return [];

    const matches = text.match(/"[^"]*"|'[^']*'|[^\s]+/g) || [];
    return matches
        .map((part) => String(part || '').trim())
        .map((part) => {
            if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
                return part.slice(1, -1);
            }
            return part;
        })
        .filter(Boolean);
}

function normalizeLaunchOverrideArgs(input) {
    const source = Array.isArray(input) ? input : [input];
    const flat = [];

    for (const item of source) {
        if (Array.isArray(item)) {
            flat.push(...normalizeLaunchOverrideArgs(item));
            continue;
        }
        flat.push(...parseCliLikeArgs(item));
    }

    const seen = new Set();
    return flat.filter((arg) => {
        const normalized = String(arg || '').trim();
        if (!normalized || !normalized.startsWith('--')) return false;
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

function resolveApiLaunchOverrideArgs(params) {
    const rawArgs = params?.getAll?.('args') || [];
    return normalizeLaunchOverrideArgs(rawArgs);
}

function normalizeStoredCustomArgs(input, fallbackValue = '') {
    if (input === undefined) return fallbackValue;
    if (input === null || input === '') return '';
    const normalizedArgs = normalizeLaunchOverrideArgs(input);
    return normalizedArgs.join('\n');
}

function createCompositeSender(targets = []) {
    const validTargets = targets.filter(target => target && typeof target.send === 'function');
    return {
        send(channel, payload) {
            for (const target of validTargets) {
                try {
                    if (typeof target.isDestroyed === 'function' && target.isDestroyed()) continue;
                    target.send(channel, payload);
                } catch (e) { }
            }
        },
        isDestroyed() {
            if (validTargets.length === 0) return true;
            return validTargets.every((target) => {
                try {
                    return typeof target.isDestroyed === 'function' ? target.isDestroyed() : false;
                } catch (e) {
                    return true;
                }
            });
        }
    };
}

function createApiOpenStreamSender(req, res, profileName, lang) {
    let closed = false;
    let lastLine = '';

    const markClosed = () => {
        closed = true;
    };

    req.on('close', markClosed);
    res.on('close', markClosed);
    res.on('finish', markClosed);

    const writeLine = (line) => {
        if (closed || !res.writable || res.writableEnded) return;
        const normalized = String(line || '').trim();
        if (!normalized || normalized === lastLine) return;
        lastLine = normalized;
        try {
            res.write(`${normalized}\n`);
        } catch (e) {
            closed = true;
        }
    };

    const progressPrefix = lang === 'en'
        ? `${profileName} is starting... `
        : `${profileName} 环境启动中... `;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    return {
        send(channel, payload) {
            if (channel !== 'profile-launch-progress') return;
            if (!payload || payload.visible === false) return;
            writeLine(`${progressPrefix}${payload.message || (lang === 'en' ? 'Please wait...' : '请稍候...')}`);
        },
        isDestroyed() {
            return closed;
        },
        writeLine,
        close() {
            if (!closed && !res.writableEnded) {
                try {
                    res.end();
                } catch (e) { }
            }
            closed = true;
        }
    };
}

function getApiLaunchUiSender() {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        return mainWindow.webContents;
    }
    return null;
}

async function streamApiOpenProfile({ req, res, params, settings, profile, resolveRemoteDebugPortForProfile, launchOverrideArgs = [] }) {
    const lang = resolveApiPreferredLang(params, settings);
    const profileName = profile.name || profile.id || (lang === 'en' ? 'Profile' : '环境');
    const streamSender = createApiOpenStreamSender(req, res, profileName, lang);
    const uiSender = getApiLaunchUiSender();
    const sender = createCompositeSender(uiSender ? [uiSender, streamSender] : [streamSender]);

    try {
        if (activeProcesses[profile.id]) {
            streamSender.writeLine(lang === 'en'
                ? `${profileName} is already running.`
                : `${profileName} 已在运行中。`);
            const runningPort = await resolveRemoteDebugPortForProfile(profile.id, profile.debugPort);
            if (runningPort) {
                streamSender.writeLine(lang === 'en'
                    ? `Remote debugging port: ${runningPort}`
                    : `远程调试端口：${runningPort}`);
            }
            streamSender.close();
            return { __streamHandled: true };
        }

        if (launchOverrideArgs.length > 0) {
            streamSender.writeLine(lang === 'en'
                ? `Temporary launch args: ${launchOverrideArgs.join(' ')}`
                : `本次临时启动参数：${launchOverrideArgs.join(' ')}`);
        }

        const launchMessage = await launchProfileHandler(
            { sender },
            profile.id,
            settings.watermarkStyle === 'banner' || settings.watermarkStyle === 'off' ? settings.watermarkStyle : 'enhanced',
            lang,
            { launchArgsOverride: launchOverrideArgs }
        );

        streamSender.writeLine(lang === 'en'
            ? `${profileName} started successfully.`
            : `${profileName} 启动成功。`);
        if (launchMessage) {
            streamSender.writeLine(lang === 'en'
                ? `Launch note: ${launchMessage}`
                : `启动提示：${launchMessage}`);
        }

        const launchedPort = await resolveRemoteDebugPortForProfile(profile.id, profile.debugPort);
        if (launchedPort) {
            streamSender.writeLine(lang === 'en'
                ? `Remote debugging port: ${launchedPort}`
                : `远程调试端口：${launchedPort}`);
        }
    } catch (err) {
        streamSender.writeLine(lang === 'en'
            ? `${profileName} failed to start: ${err.message || err}`
            : `${profileName} 启动失败：${err.message || err}`);
    } finally {
        streamSender.close();
    }

    return { __streamHandled: true };
}

// 2. 扩展密码同步与 2FA 的内部服务器 (独立端口 12139，无条件常驻)
let internalApiServer = null;
const INTERNAL_API_PORT = 12139;

function normalizeTotpSecret(value) {
    const invalidSecret = () => Object.assign(new Error('请输入有效的 Base32 密钥（至少 16 个字符）'), { statusCode: 400 });
    if (typeof value !== 'string') throw invalidSecret();
    const secret = value.replace(/\s+/g, '').toUpperCase().replace(/=+$/, '');
    if (!/^[A-Z2-7]{16,103}$/.test(secret)) throw invalidSecret();
    const { ScureBase32Plugin } = require('otplib');
    let bytes;
    try {
        bytes = new ScureBase32Plugin().decode(secret);
    } catch {
        throw invalidSecret();
    }
    if (bytes.length < 10 || bytes.length > 64) throw invalidSecret();
    return secret;
}

function createInternalApiServer() {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        const url = new URL(req.url, `http://localhost:${INTERNAL_API_PORT}`);

        if (req.method === 'POST' && url.pathname === '/api/profile-shortcut') {
            if (req.headers['x-geekez-profile-shortcut'] !== '1') {
                res.writeHead(403);
                return res.end(JSON.stringify({ success: false, error: 'Forbidden' }));
            }
            const profileId = String(url.searchParams.get('profileId') || '').trim();
            if (!profileId || !/^[a-zA-Z0-9_-]+$/.test(profileId)) {
                res.writeHead(400);
                return res.end(JSON.stringify({ success: false, error: 'valid profileId required' }));
            }
            const profiles = await readAllProfilesSafe();
            if (!profiles.some(profile => profile.id === profileId)) {
                res.writeHead(404);
                return res.end(JSON.stringify({ success: false, error: 'Profile not found' }));
            }
            queueProfileShortcutLaunch(profileId);
            res.writeHead(202);
            return res.end(JSON.stringify({ success: true, profileId }));
        }

        if (req.method === 'GET' && url.pathname === '/api/runtime/language') {
            const profileId = String(url.searchParams.get('profileId') || '').trim();
            if (!profileId) {
                res.writeHead(400);
                return res.end(JSON.stringify({ success: false, error: 'profileId required' }));
            }

            const state = getProfileRuntimeLanguageState(profileId);
            res.writeHead(200);
            return res.end(JSON.stringify({
                success: true,
                profileId,
                enabled: !!state.enabled,
                language: state.language || '',
                languages: state.languages || [],
                acceptLanguage: state.acceptLanguageHeader || '',
                acceptLanguageHeader: state.acceptLanguageHeader || '',
                updatedAt: state.updatedAt || 0
            }));
        }

        if (req.method === 'POST' && ['/generate-totp', '/validate-totp'].includes(url.pathname)) {
            let body = await new Promise(resolve => {
                let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => resolve(data));
            });
            try {
                const data = JSON.parse(body);
                const secret = normalizeTotpSecret(data?.secret);
                if (url.pathname === '/validate-totp') {
                    res.writeHead(200); return res.end(JSON.stringify({ success: true, secret }));
                }
                const { generate, createGuardrails } = require('otplib');
                // 仅在请求验证码时等待将到期的周期，避免填入后立即失效。
                const remaining = 30000 - Date.now() % 30000;
                if (remaining < 1500) await new Promise(resolve => setTimeout(resolve, remaining + 20));
                const epoch = Math.floor(Date.now() / 1000);
                const period = 30;
                const code = await generate({
                    secret, epoch, period, digits: 6, algorithm: 'sha1',
                    // 兼容既有的 80-bit 服务端密钥；此接口不负责创建新密钥。
                    guardrails: createGuardrails({ MIN_SECRET_BYTES: 10 })
                });
                const expiresAt = (Math.floor(epoch / period) + 1) * period * 1000;
                res.writeHead(200); res.end(JSON.stringify({ success: true, code, expiresAt }));
            } catch (err) {
                res.writeHead(err.statusCode || (err instanceof SyntaxError ? 400 : 500));
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        } else if (req.method === 'POST' && url.pathname === '/api/passwords/sync') {
            let body = await new Promise(resolve => {
                let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => resolve(data));
            });
            try {
                const data = JSON.parse(body);
                if (typeof data?.profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(data.profileId) || !Array.isArray(data.passwords)) {
                    res.writeHead(400); return res.end(JSON.stringify({ success: false, error: 'profileId and passwords required' }));
                }
                await runProfileApiTask(async () => {
                    const pwFile = path.join(DATA_PATH, data.profileId, 'passwords.json');
                    const existing = await readEncryptedPasswords(pwFile, data.profileId, { strict: true });
                    if (existing.some(entry => entry.apiUpdate?.revision &&
                        data.apiRevisions?.[entry.id] !== entry.apiUpdate.revision)) {
                        throw Object.assign(new Error('API 账号更新尚未导入，请关闭并重新启动环境'), { statusCode: 409 });
                    }
                    const syncStateFile = path.join(DATA_PATH, data.profileId, 'passwords-sync-state.json');
                    const syncState = fs.existsSync(syncStateFile) ? await fs.readJson(syncStateFile) : null;
                    if (syncState?.revision && data.snapshotRevision !== syncState.revision) {
                        throw Object.assign(new Error('同步密码库尚未导入，请关闭并重新启动环境'), { statusCode: 409 });
                    }
                    await fs.ensureDir(path.dirname(pwFile));
                    await writeEncryptedPasswords(pwFile, data.passwords, data.profileId);
                });
                configSync?.schedule();
                res.writeHead(200); res.end(JSON.stringify({ success: true, count: data.passwords.length }));
            } catch (err) {
                res.writeHead(err.statusCode || 500); res.end(JSON.stringify({ success: false, error: err.message }));
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

function normalizeProfileNotes(rawNotes) {
    if (rawNotes === undefined || rawNotes === null) return '';
    return String(rawNotes).replace(/\r\n/g, '\n');
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

    const shim = `(() => {
  try {
    const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
    const storage = globalThis.chrome?.storage?.local || globalThis.browser?.storage?.local;
    if (!runtime?.onInstalled?.addListener || !storage?.get || !storage?.set) return;

    const LEGACY_KEY = '__geekez_extension_seen_once__';
    const VERSION_KEY = '__geekez_extension_installed_version__';
    const originalAddListener = runtime.onInstalled.addListener.bind(runtime.onInstalled);
    const originalRemoveListener = typeof runtime.onInstalled.removeListener === 'function'
      ? runtime.onInstalled.removeListener.bind(runtime.onInstalled)
      : null;
    const originalHasListener = typeof runtime.onInstalled.hasListener === 'function'
      ? runtime.onInstalled.hasListener.bind(runtime.onInstalled)
      : null;
    const wrappedListeners = new WeakMap();
    const eventDecisions = new WeakMap();

    const finishOnce = (resolve) => {
      let finished = false;
      return (value) => {
        if (finished) return;
        finished = true;
        resolve(value);
      };
    };

    const readInstallState = () => new Promise((resolve) => {
      const finish = finishOnce(resolve);
      try {
        const pending = storage.get(null, (result) => finish(result || {}));
        if (pending && typeof pending.then === 'function') {
          pending.then((result) => finish(result || {})).catch(() => finish({}));
        }
      } catch (e) {
        try {
          Promise.resolve(storage.get(null))
            .then((result) => finish(result || {}))
            .catch(() => finish({}));
        } catch (inner) {
          finish({});
        }
      }
    });

    const writeInstallState = (version) => new Promise((resolve) => {
      const finish = finishOnce(resolve);
      const values = {
        [LEGACY_KEY]: true,
        [VERSION_KEY]: String(version || '')
      };
      try {
        const pending = storage.set(values, () => finish());
        if (pending && typeof pending.then === 'function') {
          pending.then(() => finish()).catch(() => finish());
        }
      } catch (e) {
        try {
          Promise.resolve(storage.set(values)).then(() => finish()).catch(() => finish());
        } catch (inner) {
          finish();
        }
      }
    });

    const installStateAtStartup = (async () => {
      const state = await readInstallState();
      const currentVersion = String(runtime.getManifest?.().version || '');
      const storedVersion = String(state && state[VERSION_KEY] || '');
      const legacySeen = !!(state && state[LEGACY_KEY]);
      const hasExistingState = Object.keys(state || {}).some((key) => {
        return key !== LEGACY_KEY && key !== VERSION_KEY;
      });

      if (storedVersion !== currentVersion || !legacySeen) {
        await writeInstallState(currentVersion);
      }

      return { currentVersion, storedVersion, legacySeen, hasExistingState };
    })().catch(() => null);

    const decideInstallEvent = (details) => {
      if (!details || typeof details !== 'object') {
        return Promise.resolve({ emit: true, details });
      }
      if (eventDecisions.has(details)) return eventDecisions.get(details);

      const decision = (async () => {
        const repeatedLifecycleEvent = details.reason === 'install' || details.reason === 'update';

        if (!repeatedLifecycleEvent) {
          return { emit: true, details };
        }

        const startupState = await installStateAtStartup;
        if (!startupState) {
          return { emit: true, details };
        }

        const { currentVersion, storedVersion, legacySeen, hasExistingState } = startupState;

        if (storedVersion) {
          if (storedVersion === currentVersion) {
            return { emit: false, details };
          }
          if (storedVersion !== currentVersion) {
            return {
              emit: true,
              details: Object.assign({}, details, {
                reason: 'update',
                previousVersion: storedVersion
              })
            };
          }
          return { emit: true, details };
        }

        if (legacySeen || hasExistingState) {
          return { emit: false, details };
        }
        return { emit: true, details };
      })().catch(() => ({ emit: true, details }));

      eventDecisions.set(details, decision);
      return decision;
    };

    runtime.onInstalled.addListener = (listener) => {
      if (typeof listener !== 'function') {
        return originalAddListener(listener);
      }
      if (wrappedListeners.has(listener)) {
        return originalAddListener(wrappedListeners.get(listener));
      }

      const wrapped = (details) => {
        decideInstallEvent(details).then((decision) => {
          if (!decision || !decision.emit) return;
          try { listener(decision.details); } catch (e) {}
        });
      };

      wrappedListeners.set(listener, wrapped);
      return originalAddListener(wrapped);
    };

    if (originalRemoveListener) {
      runtime.onInstalled.removeListener = (listener) => {
        const wrapped = wrappedListeners.get(listener) || listener;
        wrappedListeners.delete(listener);
        return originalRemoveListener(wrapped);
      };
    }

    if (originalHasListener) {
      runtime.onInstalled.hasListener = (listener) => {
        return originalHasListener(wrappedListeners.get(listener) || listener);
      };
    }
  } catch (e) {}
})();
`;

    if (isModuleType) {
        const moduleShimSource = `/* __geekez_oninstalled_shim_runtime__ */\n${shim}`;
        const moduleShimDigest = crypto.createHash('sha256')
            .update(moduleShimSource)
            .digest('hex')
            .slice(0, 12);
        const shimRelPath = path.posix.join(
            path.posix.dirname(toManifestPath(wrapperRelPath)),
            `__geekez_sw_install_shim_${moduleShimDigest}.js`
        );
        const shimImportTarget = toRelativeWorkerPath(wrapperRelPath, shimRelPath)
            .replace(/\\/g, '/')
            .replace(/'/g, "\\'");
        return {
            wrapperSource: `/* __geekez_oninstalled_shim__ */\n/* __geekez_original_worker__:${originalWorkerRelPath} */\nimport '${shimImportTarget}';\nimport '${importTarget}';\n`,
            moduleShim: {
                relPath: shimRelPath,
                source: moduleShimSource
            }
        };
    }
    return {
        wrapperSource: `/* __geekez_oninstalled_shim__ */\n/* __geekez_original_worker__:${originalWorkerRelPath} */\n${shim}\ntry { importScripts('${importTarget}'); } catch (e) {}\n`,
        moduleShim: null
    };
}

async function patchExtensionInstallBehavior(extensionDir) {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return false;

    const manifest = await fs.readJson(manifestPath).catch(() => null);
    if (!manifest || Number(manifest.manifest_version) !== 3) return false;

    const bg = manifest.background || {};
    const currentServiceWorker = toManifestPath(bg.service_worker || '');
    if (!currentServiceWorker) return false;

    const bootstrapPattern = /(^|\/)__geekez_sw_bootstrap(?:__|_[a-f0-9]{12})\.js$/;
    const isBootstrapWorker = bootstrapPattern.test(currentServiceWorker);
    let wrapperRelPath = isBootstrapWorker
        ? currentServiceWorker
        : (path.posix.dirname(currentServiceWorker) === '.'
            ? '__geekez_sw_bootstrap__.js'
            : `${path.posix.dirname(currentServiceWorker)}/__geekez_sw_bootstrap__.js`);
    let wrapperAbsPath = path.join(extensionDir, ...wrapperRelPath.split('/'));

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
    let { wrapperSource, moduleShim } = buildExtensionInstallShimSource(
        wrapperRelPath,
        workerRelPath,
        isModuleType
    );
    const wrapperDigest = crypto.createHash('sha256')
        .update(wrapperSource)
        .digest('hex')
        .slice(0, 12);
    const hashedWrapperRelPath = path.posix.join(
        path.posix.dirname(wrapperRelPath),
        `__geekez_sw_bootstrap_${wrapperDigest}.js`
    );
    if (hashedWrapperRelPath !== wrapperRelPath) {
        wrapperRelPath = hashedWrapperRelPath;
        wrapperAbsPath = path.join(extensionDir, ...wrapperRelPath.split('/'));
        ({ wrapperSource, moduleShim } = buildExtensionInstallShimSource(
            wrapperRelPath,
            workerRelPath,
            isModuleType
        ));
    }

    let changed = false;
    if (moduleShim) {
        const moduleShimAbsPath = path.join(extensionDir, ...moduleShim.relPath.split('/'));
        const currentModuleShimSource = fs.existsSync(moduleShimAbsPath)
            ? await fs.readFile(moduleShimAbsPath, 'utf8').catch(() => '')
            : '';
        if (currentModuleShimSource !== moduleShim.source) {
            await fs.outputFile(moduleShimAbsPath, moduleShim.source, 'utf8');
            changed = true;
        }
    }

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

async function saveExtensionSettings(extensions) {
    return runProfileApiTask(async () => {
        const latest = await readSettingsForExtensionMutation();
        return saveSettingsWithNormalizedExtensions({ ...latest, userExtensions: extensions });
    });
}

function normalizeSettingsSnapshot(settings) {
    const nextSettings = settings || {};
    if (!Array.isArray(nextSettings.preProxies)) nextSettings.preProxies = [];
    if (!Array.isArray(nextSettings.subscriptions)) nextSettings.subscriptions = [];
    if (!['single', 'balance', 'failover'].includes(nextSettings.mode)) nextSettings.mode = 'single';
    nextSettings.lang = nextSettings.lang === 'en' ? 'en' : 'cn';
    nextSettings.enablePreProxy = !!nextSettings.enablePreProxy;
    nextSettings.notify = !!nextSettings.notify;
    nextSettings.userExtensions = normalizeUserExtensions(nextSettings.userExtensions || []);
    nextSettings.closeBehavior = normalizeCloseBehavior(nextSettings.closeBehavior);
    nextSettings.defaultBookmarks = normalizeDefaultBookmarks(nextSettings.defaultBookmarks);
    nextSettings.defaultBookmarkScope = normalizeTagScope(nextSettings.defaultBookmarkScope);
    nextSettings.defaultPasswordScope = normalizeTagScope(nextSettings.defaultPasswordScope);
    delete nextSettings.defaultPasswords;
    return nextSettings;
}

function normalizeTagScope(rawScope) {
    const scope = rawScope && typeof rawScope === 'object' ? rawScope : {};
    const mode = ['all', 'includeTags', 'excludeTags'].includes(scope.mode) ? scope.mode : 'all';
    const tags = Array.from(new Set(
        (Array.isArray(scope.tags) ? scope.tags : [])
            .map(tag => String(tag || '').trim())
            .filter(Boolean)
    ));
    return { mode, tags };
}

function normalizeDefaultBookmarks(rawBookmarks) {
    if (!Array.isArray(rawBookmarks)) return [];
    return rawBookmarks.map((item) => {
        if (!item || typeof item !== 'object') return null;
        const url = String(item.url || '').trim();
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (error) {
            return null;
        }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
        const name = String(item.name || '').trim() || parsedUrl.hostname;
        return {
            id: String(item.id || uuidv4()),
            name,
            url
        };
    }).filter(Boolean);
}

function normalizeDefaultPasswords(rawPasswords) {
    if (!Array.isArray(rawPasswords)) throw new Error('内置账号列表格式无效');
    const usedIds = new Set();
    const accounts = new Set();
    return rawPasswords.map((item, index) => {
        const invalid = message => new Error(`第 ${index + 1} 个账号：${message}`);
        if (!item || typeof item !== 'object') throw invalid('格式无效');
        const rawUrl = String(item.url || '').trim();
        let parsedUrl;
        try {
            parsedUrl = new URL(rawUrl);
        } catch (error) {
            throw invalid('请填写有效的网站地址');
        }
        if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
            throw invalid('请填写不含账号密码的 HTTP 或 HTTPS 网站地址');
        }
        const username = String(item.username || '').trim();
        const password = String(item.password || '');
        if (!username || !password) throw invalid('请填写用户名和密码');
        const account = JSON.stringify([parsedUrl.origin, username]);
        if (accounts.has(account)) throw invalid('该网站和用户名已存在');
        accounts.add(account);

        const enabled = item.twoFactorEnabled === true ||
            (item.twoFactorEnabled !== false && Boolean(item.twoFactorSecret));
        let twoFactorSecret = '';
        if (enabled) {
            try {
                twoFactorSecret = normalizePresetTotpSecret(item.twoFactorSecret);
            } catch (error) {
                throw invalid(error.message);
            }
        }
        const requestedId = String(item.id || '').trim();
        const id = requestedId && !usedIds.has(requestedId) ? requestedId : uuidv4();
        usedIds.add(id);
        return {
            id,
            name: String(item.name || '').trim() || parsedUrl.hostname,
            url: parsedUrl.href,
            origin: parsedUrl.origin,
            username,
            password,
            notes: String(item.notes || ''),
            twoFactorEnabled: Boolean(twoFactorSecret),
            twoFactorSecret
        };
    });
}

function normalizePresetTotpSecret(value) {
    let secret = typeof value === 'string' ? value.trim() : '';
    if (/^otpauth:/i.test(secret)) {
        const url = new URL(secret);
        if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') throw new Error('仅支持 TOTP 配置');
        const params = url.searchParams;
        for (const key of ['secret', 'algorithm', 'digits', 'period']) {
            if (params.getAll(key).length > 1) throw new Error('2FA 配置包含重复参数');
        }
        if ((params.has('algorithm') && params.get('algorithm').toUpperCase() !== 'SHA1') ||
            (params.has('digits') && params.get('digits') !== '6') ||
            (params.has('period') && params.get('period') !== '30')) {
            throw new Error('仅支持 SHA1、6 位、30 秒的 TOTP 配置');
        }
        secret = params.get('secret');
    }
    return normalizeTotpSecret(secret);
}

async function readDefaultPasswordSettings({ strict = false } = {}) {
    if (!fs.existsSync(DEFAULT_PASSWORDS_FILE)) return { passwords: [], scope: normalizeTagScope() };
    try {
        const data = await fs.readFile(DEFAULT_PASSWORDS_FILE);
        const stored = JSON.parse(decryptData(data, 'GeekEZ_PW_defaults').toString('utf8'));
        return {
            passwords: normalizeDefaultPasswords(stored?.passwords),
            scope: normalizeTagScope(stored?.scope)
        };
    } catch (error) {
        if (strict) throw error;
        console.warn('[Password Manager] Failed to read built-in accounts:', error.message);
        return { passwords: [], scope: normalizeTagScope() };
    }
}

async function writeDefaultPasswordSettings(passwords, scope) {
    const normalizedPasswords = normalizeDefaultPasswords(passwords);
    const payload = {
        version: 1,
        passwords: normalizedPasswords,
        scope: normalizeTagScope(scope)
    };
    const encrypted = encryptData(Buffer.from(JSON.stringify(payload), 'utf8'), 'GeekEZ_PW_defaults');
    await fs.writeFile(DEFAULT_PASSWORDS_FILE, encrypted);
    return payload;
}

function chromiumBookmarkTimestamp() {
    return String((Date.now() + 11644473600000) * 1000);
}

function createBookmarkRoot(id, guid, name) {
    const timestamp = chromiumBookmarkTimestamp();
    return {
        children: [],
        date_added: timestamp,
        date_modified: timestamp,
        guid,
        id: String(id),
        name,
        type: 'folder'
    };
}

function normalizeBookmarksDocument(rawDocument, { strict = false } = {}) {
    if (strict) {
        const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
        const isBookmark = node => isObject(node) && (node.type === 'folder'
            ? Array.isArray(node.children) && node.children.every(isBookmark)
            : node.type === 'url' && typeof node.url === 'string');
        if (!isObject(rawDocument) || !isObject(rawDocument.roots) ||
            !Object.values(rawDocument.roots).every(root => root?.type === 'folder' && isBookmark(root))) {
            throw new Error('Existing bookmark file is invalid; no files were changed');
        }
    }
    const document = rawDocument && typeof rawDocument === 'object' ? rawDocument : {};
    if (!document.roots || typeof document.roots !== 'object') document.roots = {};
    const rootDefaults = [
        ['bookmark_bar', '1', 'bookmark_bar', 'Bookmarks bar'],
        ['other', '2', 'other', 'Other bookmarks'],
        ['synced', '3', 'synced', 'Mobile bookmarks']
    ];
    for (const [key, id, guid, name] of rootDefaults) {
        const existing = document.roots[key];
        document.roots[key] = existing && typeof existing === 'object'
            ? { ...createBookmarkRoot(id, guid, name), ...existing, children: Array.isArray(existing.children) ? existing.children : [] }
            : createBookmarkRoot(id, guid, name);
    }
    if (!Number.isFinite(Number(document.version))) document.version = 1;
    return document;
}

function findLargestBookmarkId(node) {
    if (!node || typeof node !== 'object') return 3;
    let largest = Number.parseInt(node.id, 10);
    if (!Number.isFinite(largest)) largest = 3;
    for (const child of Array.isArray(node.children) ? node.children : []) {
        largest = Math.max(largest, findLargestBookmarkId(child));
    }
    return largest;
}

function collectBookmarkUrls(node, result = new Set()) {
    if (!node || typeof node !== 'object') return result;
    if (node.type === 'url' && node.url) {
        try { result.add(new URL(node.url).href); } catch { result.add(String(node.url).trim()); }
    }
    for (const child of Array.isArray(node.children) ? node.children : []) collectBookmarkUrls(child, result);
    return result;
}

function appendProfileBookmarks(document, bookmarks) {
    const roots = Object.values(document.roots);
    const existingUrls = new Set();
    roots.forEach(root => collectBookmarkUrls(root, existingUrls));
    let nextId = Math.max(3, ...roots.map(findLargestBookmarkId));
    let added = 0;
    for (const bookmark of bookmarks) {
        const url = new URL(bookmark.url).href;
        if (existingUrls.has(url)) continue;
        document.roots.bookmark_bar.children.push({
            date_added: chromiumBookmarkTimestamp(),
            guid: uuidv4(),
            id: String(++nextId),
            name: bookmark.name,
            type: 'url',
            url
        });
        existingUrls.add(url);
        added++;
    }
    if (added) {
        document.roots.bookmark_bar.date_modified = chromiumBookmarkTimestamp();
        // Chromium rebuilds the checksum after the bookmark tree changes.
        document.checksum = '';
    }
    return { added, skipped: bookmarks.length - added };
}

function passwordAccountKey(entry) {
    let origin = String(entry?.origin || '').trim();
    if (!origin && entry?.url) {
        try { origin = new URL(entry.url).origin; } catch { }
    }
    return JSON.stringify([origin, String(entry?.username || '').trim()]);
}

function appendDefaultPasswords(passwords, defaults) {
    const existingKeys = new Set(passwords.map(passwordAccountKey));
    const usedIds = new Set(passwords.map(entry => entry.id));
    let added = 0;
    for (const entry of defaults) {
        const key = passwordAccountKey(entry);
        if (existingKeys.has(key)) continue;
        let id = entry.id;
        while (!id || usedIds.has(id)) id = uuidv4();
        const now = Date.now();
        passwords.push({ ...entry, id, createdAt: now, updatedAt: now });
        existingKeys.add(key);
        usedIds.add(id);
        added++;
    }
    return added;
}

function matchesProfileTagScope(profile, scope) {
    const normalizedScope = normalizeTagScope(scope);
    if (normalizedScope.mode === 'all') return true;
    const selectedTags = new Set(normalizedScope.tags);
    const profileTags = normalizeTags(profile?.tags || []);
    const hasSelectedTag = profileTags.some(tag => selectedTags.has(tag));
    return normalizedScope.mode === 'includeTags' ? hasSelectedTag : !hasSelectedTag;
}

function shouldApplyDefaultBookmarks(profile, settings) {
    const normalizedSettings = normalizeSettingsSnapshot(settings || {});
    return matchesProfileTagScope(profile, normalizedSettings.defaultBookmarkScope);
}

async function applyDefaultBookmarksToProfile(profile, settings) {
    const nextProfile = {
        ...profile,
        defaultBookmarksAppliedAt: Date.now()
    };
    const normalizedSettings = normalizeSettingsSnapshot(settings || {});
    const defaults = normalizedSettings.defaultBookmarks;
    if (!defaults.length || !shouldApplyDefaultBookmarks(profile, normalizedSettings)) return nextProfile;

    const bookmarksPath = path.join(DATA_PATH, profile.id, 'browser_data', 'Default', 'Bookmarks');
    try {
        await fs.ensureDir(path.dirname(bookmarksPath));
        let document = {};
        if (fs.existsSync(bookmarksPath)) {
            document = await fs.readJson(bookmarksPath).catch(() => ({}));
        }
        document = normalizeBookmarksDocument(document);
        appendProfileBookmarks(document, defaults);
        await fs.writeJson(bookmarksPath, document, { spaces: 2 });
    } catch (error) {
        console.warn(`[Bookmarks] Failed to initialize defaults for ${profile.id}:`, error.message);
    }
    return nextProfile;
}

async function applyDefaultPasswordsToProfile(profile, settings) {
    const nextProfile = {
        ...profile,
        defaultPasswordsAppliedAt: Date.now()
    };
    const hasStoredScope = Object.prototype.hasOwnProperty.call(settings || {}, 'defaultPasswordScope');
    const normalizedSettings = normalizeSettingsSnapshot(settings || {});
    const configured = await readDefaultPasswordSettings();
    const defaults = configured.passwords;
    const scope = hasStoredScope
        ? normalizedSettings.defaultPasswordScope
        : configured.scope;
    if (!defaults.length || !matchesProfileTagScope(profile, scope)) return nextProfile;

    const pwFile = path.join(DATA_PATH, profile.id, 'passwords.json');
    try {
        await fs.ensureDir(path.dirname(pwFile));
        const existing = await readEncryptedPasswords(pwFile, profile.id);
        const passwords = Array.isArray(existing) ? existing.slice() : [];
        const added = appendDefaultPasswords(passwords, defaults);
        if (added || !fs.existsSync(pwFile)) await writeEncryptedPasswords(pwFile, passwords, profile.id);
    } catch (error) {
        console.warn(`[Password Manager] Failed to initialize defaults for ${profile.id}:`, error.message);
    }
    return nextProfile;
}

function isDirectProxy(proxyStr) {
    const value = String(proxyStr || '').trim().toLowerCase();
    return value === 'direct' || value === 'direct://';
}

function isNoOverrideValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'none' ||
        normalized === 'do not modify' ||
        normalized === 'do not modify (browser default)' ||
        normalized === 'no change (browser default)';
}

function isAutoTimezoneValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized ||
        normalized === 'auto' ||
        normalized === 'auto (ip based)' ||
        normalized === 'auto (ip base)' ||
        normalized === 'auto (no change)';
}

function isAutoIpBasedCityValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized ||
        normalized === 'auto' ||
        normalized === 'auto (ip based)' ||
        normalized === 'auto (ip base)' ||
        normalized === '自动 (基于ip)' ||
        normalized === '自动 (基于 ip)';
}

function isAutoLanguageValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized ||
        normalized === 'auto' ||
        normalized === 'auto (ip based)' ||
        normalized === 'auto (ip base)' ||
        normalized === 'auto (system default)' ||
        normalized === '自动 (基于ip)' ||
        normalized === '自动 (基于 ip)';
}

function canonicalizeLocale(value) {
    const raw = String(value || '').trim();
    if (!raw || isAutoLanguageValue(raw) || isNoOverrideValue(raw)) return '';
    try {
        const locales = Intl.getCanonicalLocales(raw);
        return locales[0] || '';
    } catch (e) {
        return '';
    }
}

function normalizeLanguageList(language, languages) {
    const result = [];
    const push = (value) => {
        const locale = canonicalizeLocale(value);
        if (locale && !result.includes(locale)) result.push(locale);
    };

    if (Array.isArray(languages)) {
        languages.forEach(push);
    }
    push(language);

    const primary = result[0] && result[0].includes('-') ? result[0].split('-')[0] : '';
    if (primary) push(primary);
    return result;
}

function buildAcceptLanguageHeader(language, languages) {
    const list = normalizeLanguageList(language, languages);
    if (list.length === 0) return '';
    return list
        .slice(0, 4)
        .map((lang, index) => {
            if (index === 0) return lang;
            const q = Math.max(0.5, 1 - (index * 0.1)).toFixed(1);
            return `${lang};q=${q}`;
        })
        .join(',');
}

function buildRuntimeLanguageState(fingerprint = {}) {
    const language = canonicalizeLocale(fingerprint?.language);
    if (!language) {
        return {
            enabled: false,
            language: '',
            languages: [],
            acceptLanguageHeader: '',
            acceptLanguageOverride: ''
        };
    }

    const languages = normalizeLanguageList(language, fingerprint?.languages);
    return {
        enabled: true,
        language,
        languages,
        acceptLanguageHeader: buildAcceptLanguageHeader(language, languages),
        // CDP expects a comma-separated locale list, not an HTTP header with q-values.
        acceptLanguageOverride: languages.join(',')
    };
}

function setProfileRuntimeLanguageState(profileId, fingerprint = {}) {
    if (!profileId) return buildRuntimeLanguageState(fingerprint);
    const state = {
        ...buildRuntimeLanguageState(fingerprint),
        updatedAt: Date.now()
    };
    runtimeProfileLanguageStates.set(String(profileId), state);
    return state;
}

function getProfileRuntimeLanguageState(profileId) {
    return runtimeProfileLanguageStates.get(String(profileId || '')) || {
        enabled: false,
        language: '',
        languages: [],
        acceptLanguageHeader: '',
        acceptLanguageOverride: '',
        updatedAt: 0
    };
}

function clearProfileRuntimeLanguageState(profileId) {
    if (profileId) runtimeProfileLanguageStates.delete(String(profileId));
}

const IP_COUNTRY_LANGUAGE_MAP = {
    US: 'en-US',
    CA: 'en-CA',
    GB: 'en-GB',
    IE: 'en-IE',
    AU: 'en-AU',
    NZ: 'en-NZ',
    ZA: 'en-ZA',
    IN: 'en-IN',
    PH: 'fil-PH',
    SG: 'en-SG',
    CN: 'zh-CN',
    HK: 'zh-HK',
    MO: 'zh-HK',
    TW: 'zh-TW',
    JP: 'ja-JP',
    KR: 'ko-KR',
    TH: 'th-TH',
    VN: 'vi-VN',
    ID: 'id-ID',
    MY: 'ms-MY',
    FR: 'fr-FR',
    DE: 'de-DE',
    IT: 'it-IT',
    ES: 'es-ES',
    PT: 'pt-PT',
    NL: 'nl-NL',
    BE: 'nl-BE',
    CH: 'de-CH',
    AT: 'de-AT',
    SE: 'sv-SE',
    NO: 'no-NO',
    DK: 'da-DK',
    FI: 'fi-FI',
    PL: 'pl-PL',
    CZ: 'cs-CZ',
    HU: 'hu-HU',
    RO: 'ro-RO',
    GR: 'el-GR',
    TR: 'tr-TR',
    RU: 'ru-RU',
    UA: 'uk-UA',
    MX: 'es-MX',
    AR: 'es-AR',
    CL: 'es-CL',
    CO: 'es-CO',
    PE: 'es-PE',
    BR: 'pt-BR',
    SA: 'ar-SA',
    AE: 'ar-AE',
    IL: 'he-IL'
};

function resolveIpLanguage(country) {
    const code = String(country || '').trim().toUpperCase();
    const mapped = IP_COUNTRY_LANGUAGE_MAP[code] || 'en-US';
    return canonicalizeLocale(mapped) || 'en-US';
}

function hasValidGeolocation(geo) {
    return !!geo &&
        typeof geo.latitude === 'number' &&
        typeof geo.longitude === 'number' &&
        Number.isFinite(geo.latitude) &&
        Number.isFinite(geo.longitude);
}

function getAutoIpBasePolicy(fingerprint = {}) {
    const timezone = isAutoTimezoneValue(fingerprint.timezone);
    const location = !hasValidGeolocation(fingerprint.geolocation) && isAutoIpBasedCityValue(fingerprint.city);
    const language = isAutoLanguageValue(fingerprint.language);
    return {
        timezone,
        location,
        language,
        enabled: timezone || location || language
    };
}

function getAutoIpBaseCachePath(profileId) {
    return path.join(DATA_PATH, profileId, 'ip-base-cache.json');
}

async function readAutoIpBaseCache(profileId) {
    try {
        const cachePath = getAutoIpBaseCachePath(profileId);
        if (!fs.existsSync(cachePath)) return null;
        const cache = await fs.readJson(cachePath);
        return cache && typeof cache === 'object' ? cache : null;
    } catch (e) {
        return null;
    }
}

async function writeAutoIpBaseCache(profileId, snapshot) {
    if (!snapshot || !snapshot.ip) return;
    const cachePath = getAutoIpBaseCachePath(profileId);
    await fs.ensureDir(path.dirname(cachePath));
    await fs.writeJson(cachePath, {
        ...snapshot,
        updatedAt: snapshot.updatedAt || Date.now()
    });
}

function isValidTimezoneId(timezone) {
    const value = String(timezone || '').trim();
    if (!value || isAutoTimezoneValue(value)) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
        return true;
    } catch (e) {
        return false;
    }
}

function parseIpInfoSnapshot(payload = {}) {
    const ip = String(payload.ip || '').trim();
    if (!ip) return null;

    const [latRaw, lngRaw] = String(payload.loc || '').split(',');
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    const hasGeo = Number.isFinite(latitude) && Number.isFinite(longitude);
    const timezone = isValidTimezoneId(payload.timezone) ? String(payload.timezone).trim() : null;
    const country = String(payload.country || '').trim().toUpperCase();
    const language = resolveIpLanguage(country);
    const languages = normalizeLanguageList(language);

    return {
        ip,
        loc: hasGeo ? `${latitude},${longitude}` : '',
        latitude: hasGeo ? latitude : null,
        longitude: hasGeo ? longitude : null,
        accuracy: 100,
        timezone,
        city: String(payload.city || '').trim(),
        region: String(payload.region || '').trim(),
        country,
        language,
        languages,
        org: String(payload.org || '').trim(),
        source: 'ipinfo.io',
        updatedAt: Date.now()
    };
}

async function fetchIpInfoSnapshot(localPort, timeoutMs = 8000) {
    const requestOptions = {
        headers: {
            'User-Agent': 'curl/8.7.1',
            'Accept': 'application/json'
        }
    };
    if (localPort) {
        requestOptions.agent = await createSocksProxyAgent(`socks5h://127.0.0.1:${localPort}`);
    }

    return await new Promise((resolve, reject) => {
        let raw = '';
        const req = https.get('https://ipinfo.io/json', requestOptions, (res) => {
            const statusCode = Number(res.statusCode || 0);
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                raw += chunk;
                if (raw.length > 128 * 1024) {
                    req.destroy(new Error('ipinfo response too large'));
                }
            });
            res.on('end', () => {
                if (statusCode < 200 || statusCode >= 300) {
                    reject(new Error(`ipinfo HTTP ${statusCode}`));
                    return;
                }
                try {
                    const snapshot = parseIpInfoSnapshot(JSON.parse(raw));
                    if (!snapshot) {
                        reject(new Error('ipinfo response missing ip'));
                        return;
                    }
                    resolve(snapshot);
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('ipinfo request timeout'));
        });
        req.on('error', reject);
    });
}

function isAutoIpBaseSourceUsable(source, policy) {
    if (!source || !source.ip) return false;
    if (policy.location) {
        const latitude = Number(source.latitude);
        const longitude = Number(source.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    }
    if (policy.timezone && !isValidTimezoneId(source.timezone)) return false;
    if (policy.language && !canonicalizeLocale(source.language)) return false;
    return true;
}

function buildAutoIpBaseFingerprint(baseFingerprint = {}, source, policy) {
    if (!isAutoIpBaseSourceUsable(source, policy)) return null;

    const nextFingerprint = { ...baseFingerprint };
    if (policy.location) {
        nextFingerprint.city = source.city || source.region || source.country || 'Auto (IP Based)';
        nextFingerprint.geolocation = {
            latitude: Number(source.latitude),
            longitude: Number(source.longitude),
            accuracy: Number(source.accuracy) || 100
        };
    }
    if (policy.timezone && isValidTimezoneId(source.timezone)) {
        nextFingerprint.timezone = source.timezone;
    }
    if (policy.language) {
        const language = canonicalizeLocale(source.language);
        nextFingerprint.language = language;
        nextFingerprint.languages = normalizeLanguageList(language, source.languages);
    }
    return nextFingerprint;
}

async function resolveAutoIpBaseFingerprint(profileId, baseFingerprint, localPort) {
    const policy = getAutoIpBasePolicy(baseFingerprint);
    if (!policy.enabled) return null;

    const cache = await readAutoIpBaseCache(profileId);
    const snapshot = await fetchIpInfoSnapshot(localPort);
    const cacheMatchesCurrentIp = cache && cache.ip && snapshot.ip && cache.ip === snapshot.ip;
    const source = cacheMatchesCurrentIp && isAutoIpBaseSourceUsable(cache, policy)
        ? { ...cache, checkedAt: Date.now() }
        : snapshot;

    if (!cacheMatchesCurrentIp || !isAutoIpBaseSourceUsable(cache, policy)) {
        await writeAutoIpBaseCache(profileId, snapshot);
    }

    const resolvedFingerprint = buildAutoIpBaseFingerprint(baseFingerprint, source, policy);
    if (!resolvedFingerprint) return null;

    return {
        fingerprint: resolvedFingerprint,
        source,
        policy,
        cacheHit: !!cacheMatchesCurrentIp
    };
}

function logAutoIpBaseResolution(profileName, profileId, resolved) {
    if (!resolved || !resolved.fingerprint || !resolved.source || !resolved.policy) return;

    const runtimeFingerprint = resolved.fingerprint;
    const parts = [];
    if (resolved.policy.location && hasValidGeolocation(runtimeFingerprint.geolocation)) {
        parts.push(`geo=${runtimeFingerprint.geolocation.latitude},${runtimeFingerprint.geolocation.longitude}`);
    }
    if (resolved.policy.timezone && isValidTimezoneId(runtimeFingerprint.timezone)) {
        parts.push(`timezone=${runtimeFingerprint.timezone}`);
    }
    if (resolved.policy.language && canonicalizeLocale(runtimeFingerprint.language)) {
        parts.push(`language=${runtimeFingerprint.language}`);
    }
    console.log(`[Auto IP Base] ${profileName || profileId}: ${resolved.cacheHit ? 'reused cache' : 'refreshed'} ip=${resolved.source.ip}${parts.length ? ` ${parts.join(' ')}` : ''}`);
}

function isGoogleAuthLikeUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return false;

    try {
        const parsed = new URL(value);
        const host = String(parsed.hostname || '').toLowerCase();
        const pathname = String(parsed.pathname || '').toLowerCase();
        if (host === 'accounts.google.com' || host.endsWith('.accounts.google.com')) return true;
        if (host === 'accounts.youtube.com' || host.endsWith('.accounts.youtube.com')) return true;
        if ((host === 'google.com' || host === 'www.google.com') && pathname.startsWith('/recaptcha/')) return true;
    } catch (e) { }

    return false;
}

function isPreNavigationUrl(rawUrl) {
    const value = String(rawUrl || '').trim().toLowerCase();
    return !value ||
        value === 'about:blank' ||
        value === 'chrome://newtab/' ||
        value === 'chrome://new-tab-page/';
}

function normalizeProxyStr(proxyStr) {
    const raw = String(proxyStr || '').trim();
    if (!raw || isDirectProxy(raw)) return raw;

    // 如果已经有协议前缀，直接返回
    if (raw.includes('://')) return raw;

    // 处理简写的 SOCKS 格式：IP:Port 或 IP:Port:User:Pass
    if (raw.includes(':') && !raw.includes('://')) {
        const parts = raw.split(':');
        // IP:Port 格式
        if (parts.length === 2) {
            return `socks5://${parts[0]}:${parts[1]}`;
        }
        // IP:Port:User:Pass 格式
        if (parts.length === 4) {
            return `socks5://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
        }
    }

    return raw;
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

    const rawLanguage = firstDefined(data.language, inputFp.language);
    const normalizedLanguage = isNoOverrideValue(rawLanguage)
        ? 'none'
        : (isAutoLanguageValue(rawLanguage)
            ? 'auto'
            : (canonicalizeLocale(rawLanguage) || rawLanguage));

    const normalized = {
        ...inputFp,
        uaMode: firstDefined(data.uaMode, inputFp.uaMode),
        timezone: firstDefined(data.timezone, inputFp.timezone),
        city: firstDefined(data.city, inputFp.city),
        geolocation: firstDefined(data.geolocation, inputFp.geolocation),
        language: normalizedLanguage,
        languages: normalizedLanguage === 'auto' || normalizedLanguage === 'none'
            ? []
            : firstDefined(data.languages, inputFp.languages),
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
    let proxyStr = firstDefined(data.proxyStr, existingProfile?.proxyStr, '') || '';
    const proxyChanged = !existingProfile || (hasOwn(data, 'proxyStr') && proxyStr !== (existingProfile?.proxyStr || ''));
    if (proxyChanged) {
        ensureProxyStrValid(proxyStr);
        // 标准化代理字符串，将简写格式转换为标准格式
        proxyStr = normalizeProxyStr(proxyStr);
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
    const normalizedCustomArgs = hasOwn(data, 'args')
        ? normalizeStoredCustomArgs(data.args, existingProfile?.customArgs || '')
        : normalizeStoredCustomArgs(firstDefined(data.customArgs, existingProfile?.customArgs, ''), existingProfile?.customArgs || '');

    return {
        ...(existingProfile || {}),
        id: existingProfile?.id || uuidv4(),
        name: uniqueName,
        proxyStr,
        tags: normalizeTags(firstDefined(data.tags, existingProfile?.tags, [])),
        notes: normalizeProfileNotes(firstDefined(data.notes, data.note, data.profileNotes, existingProfile?.notes, existingProfile?.note, existingProfile?.profileNotes, '')),
        fingerprint,
        preProxyOverride: firstDefined(data.preProxyOverride, existingProfile?.preProxyOverride, 'default'),
        debugPort,
        customArgs: normalizedCustomArgs,
        isSetup: existingProfile?.isSetup || false,
        createdAt: existingProfile?.createdAt || Date.now()
    };
}

function cleanExportProfile(profile) {
    return {
        ...profile,
        fingerprint: cleanFingerprint(profile.fingerprint)
    };
}

function readExportSelectorValues(params, key) {
    return params.getAll(key)
        .flatMap(value => String(value || '').split(','))
        .map(value => value.trim())
        .filter(Boolean);
}

function resolveApiExportProfiles(profiles, params, routeSelector = '') {
    const selectors = [
        routeSelector ? decodeURIComponent(routeSelector) : '',
        ...readExportSelectorValues(params, 'id'),
        ...readExportSelectorValues(params, 'ids'),
        ...readExportSelectorValues(params, 'profileId'),
        ...readExportSelectorValues(params, 'profileIds'),
        ...readExportSelectorValues(params, 'name'),
        ...readExportSelectorValues(params, 'names'),
        ...readExportSelectorValues(params, 'profile'),
        ...readExportSelectorValues(params, 'profiles')
    ].map(value => String(value || '').trim()).filter(Boolean);

    if (selectors.length === 0) {
        return { profiles, selectedAll: true };
    }

    const selected = [];
    const selectedIds = new Set();
    const missing = [];

    for (const selector of selectors) {
        const profile = profiles.find(item => item.id === selector || item.name === selector);
        if (!profile) {
            missing.push(selector);
            continue;
        }
        if (!selectedIds.has(profile.id)) {
            selectedIds.add(profile.id);
            selected.push(profile);
        }
    }

    if (missing.length > 0) {
        return {
            error: {
                status: 404,
                data: {
                    success: false,
                    error: 'Profile not found',
                    missing
                }
            }
        };
    }

    return { profiles: selected, selectedAll: false };
}

function profileResourceError(message, status = 400) {
    return Object.assign(new Error(message), { status });
}

function normalizeApiProfileResources(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw profileResourceError('Request body must be a JSON object');
    }
    const resources = { passwords: [], bookmarks: [] };
    const accounts = new Set();
    for (const field of ['passwords', 'bookmarks']) {
        if (!hasOwn(data, field)) continue;
        if (!Array.isArray(data[field])) throw profileResourceError(`${field} must be an array`);
        resources[field] = data[field].map((item, index) => {
            const invalid = message => profileResourceError(`${field}[${index}]: ${message}`);
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalid('must be an object');
            let url;
            try { url = new URL(typeof item.url === 'string' ? item.url.trim() : ''); }
            catch { throw invalid('url must be a valid HTTP or HTTPS URL'); }
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
                throw invalid('url must use HTTP or HTTPS without embedded credentials');
            }
            if (hasOwn(item, 'name') && typeof item.name !== 'string') throw invalid('name must be a string');
            if (field === 'bookmarks') return { name: item.name?.trim() || url.hostname, url: url.href };
            if (typeof item.username !== 'string' || !item.username.trim()) throw invalid('username is required');
            const patch = { url: url.href, origin: url.origin, username: item.username.trim() };
            for (const key of ['name', 'password', 'notes', 'twoFactorSecret']) {
                if (!hasOwn(item, key)) continue;
                if (typeof item[key] !== 'string') throw invalid(`${key} must be a string`);
                patch[key] = item[key];
            }
            if (hasOwn(item, 'twoFactorEnabled') && typeof item.twoFactorEnabled !== 'boolean') {
                throw invalid('twoFactorEnabled must be a boolean');
            }
            if (hasOwn(item, 'twoFactorEnabled') || hasOwn(item, 'twoFactorSecret')) {
                patch.twoFactorEnabled = item.twoFactorEnabled ?? Boolean(item.twoFactorSecret?.trim());
                if (!patch.twoFactorEnabled) patch.twoFactorSecret = '';
                else if (hasOwn(item, 'twoFactorSecret')) {
                    try { patch.twoFactorSecret = normalizePresetTotpSecret(item.twoFactorSecret); }
                    catch (error) { throw invalid(error.message); }
                }
            }
            const key = passwordAccountKey(patch);
            if (accounts.has(key)) throw invalid('duplicate website origin and username');
            accounts.add(key);
            return patch;
        });
    }
    return resources;
}

function upsertApiPasswords(passwords, patches) {
    const result = { added: 0, updated: 0, unchanged: 0 };
    patches.forEach((patch, index) => {
        const key = passwordAccountKey(patch);
        const at = passwords.findIndex(entry => passwordAccountKey(entry) === key);
        const previous = at < 0 ? null : passwords[at];
        let normalized;
        try { [normalized] = normalizeDefaultPasswords([{ ...previous, ...patch }]); }
        catch (error) { throw profileResourceError(`passwords[${index}]: ${error.message}`); }
        if (previous && Object.keys(normalized).every(field => normalized[field] === previous[field])) {
            result.unchanged++;
            return;
        }
        const now = Date.now();
        const entry = {
            ...previous, ...normalized,
            createdAt: previous?.createdAt || now,
            updatedAt: now,
            // Retain pending fields when several API updates precede the next launch.
            apiUpdate: {
                revision: uuidv4(),
                fields: Array.from(new Set([...(previous?.apiUpdate?.fields || []), ...Object.keys(patch)]))
            }
        };
        if (at < 0) { passwords.push(entry); result.added++; }
        else { passwords[at] = entry; result.updated++; }
    });
    return result;
}

async function prepareApiProfileResources(profile, resources, settings, isNew) {
    const files = [];
    const results = {};
    const defaults = isNew ? normalizeSettingsSnapshot({ ...settings }) : null;
    const defaultPasswordSettings = isNew ? await readDefaultPasswordSettings() : null;
    const defaultPasswords = isNew && matchesProfileTagScope(profile,
        hasOwn(settings, 'defaultPasswordScope') ? defaults.defaultPasswordScope : defaultPasswordSettings.scope)
        ? defaultPasswordSettings.passwords : [];
    const defaultBookmarks = isNew && matchesProfileTagScope(profile, defaults.defaultBookmarkScope)
        ? defaults.defaultBookmarks : [];

    if (resources.passwords.length || defaultPasswords.length) {
        const file = path.join(DATA_PATH, profile.id, 'passwords.json');
        const passwords = await readEncryptedPasswords(file, profile.id, { strict: true });
        const seeded = appendDefaultPasswords(passwords, defaultPasswords);
        const result = upsertApiPasswords(passwords, resources.passwords);
        if (resources.passwords.length) results.passwords = result;
        if (seeded || result.added || result.updated) {
            files.push({ file, data: encryptData(Buffer.from(JSON.stringify(passwords)), 'GeekEZ_PW_' + profile.id) });
        }
    }
    if (resources.bookmarks.length || defaultBookmarks.length) {
        const file = path.join(DATA_PATH, profile.id, 'browser_data', 'Default', 'Bookmarks');
        const document = fs.existsSync(file)
            ? normalizeBookmarksDocument(await fs.readJson(file), { strict: true })
            : normalizeBookmarksDocument({});
        const result = appendProfileBookmarks(document, resources.bookmarks);
        const seeded = appendProfileBookmarks(document, defaultBookmarks);
        if (resources.bookmarks.length) results.bookmarks = result;
        if (seeded.added || result.added) files.push({ file, data: Buffer.from(JSON.stringify(document, null, 2)) });
    }
    return { files, results };
}

async function commitProfileFiles(files) {
    const staged = [];
    const committed = [];
    try {
        // Prepare every file before replacing any existing data; restore on I/O failure.
        for (const entry of files) {
            const original = fs.existsSync(entry.file) ? await fs.readFile(entry.file) : null;
            const temporary = `${entry.file}.${uuidv4()}.tmp`;
            staged.push({ ...entry, original, temporary });
            await fs.ensureDir(path.dirname(entry.file));
            await fs.writeFile(temporary, entry.data, { mode: 0o600 });
        }
        for (const entry of staged) {
            await fs.rename(entry.temporary, entry.file);
            committed.push(entry);
        }
    } catch (error) {
        for (const entry of committed.reverse()) {
            if (entry.original === null) await fs.remove(entry.file);
            else await fs.writeFile(entry.file, entry.original);
        }
        throw error;
    } finally {
        for (const entry of staged) await fs.remove(entry.temporary);
    }
}

async function saveApiProfile(body, idOrName = null) {
    const data = parseApiBody(body);
    const resources = normalizeApiProfileResources(data);
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    const at = idOrName === null ? -1 : profiles.findIndex(p => p.id === idOrName || p.name === idOrName);
    if (idOrName !== null && at < 0) throw profileResourceError('Profile not found', 404);
    const previous = profiles[at] || null;
    const hasResources = resources.passwords.length > 0 || resources.bookmarks.length > 0;
    if (previous && hasResources && (activeProcesses[previous.id] || launchingProfiles.has(previous.id))) {
        throw profileResourceError('Stop the profile before updating passwords or bookmarks', 409);
    }
    if (previous && hasResources) profileResourceWrites.add(previous.id);
    try {
        const profile = await buildProfileFromInput(data, profiles.filter(p => p !== previous), settings, previous);
        const { files, results } = await prepareApiProfileResources(profile, resources, settings, !previous);
        if (!previous) {
            profile.defaultBookmarksAppliedAt = profile.defaultPasswordsAppliedAt = Date.now();
            profiles.push(profile);
        } else profiles[at] = profile;
        files.push({ file: PROFILES_FILE, data: Buffer.from(JSON.stringify(profiles)) });
        await commitProfileFiles(files);
        notifyUIRefresh();
        return { success: true, profile, remoteDebugPort: settings.enableRemoteDebugging ? profile.debugPort : null, ...results };
    } finally {
        if (previous && hasResources) profileResourceWrites.delete(previous.id);
    }
}

async function handleApiRequest(method, pathname, body, params, context = {}) {
    const profileMatch = pathname.match(/^\/api\/profiles\/([^\/]+)$/);
    if (((method === 'DELETE' && profileMatch) || (method === 'POST' && pathname === '/api/import')) && !context.serialized) {
        return runProfileApiTask(() => handleApiRequest(method, pathname, body, params, { ...context, serialized: true }));
    }
    if (method === 'POST' && pathname === '/api/profiles') {
        return runProfileApiTask(() => saveApiProfile(body));
    }
    if (method === 'PUT' && profileMatch) {
        return runProfileApiTask(() => saveApiProfile(body, decodeURIComponent(profileMatch[1])));
    }
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
    if (method === 'GET' && profileMatch) {
        const profile = findProfile(decodeURIComponent(profileMatch[1]));
        if (!profile) return { status: 404, data: { success: false, error: 'Profile not found' } };
        return { success: true, profile: { ...profile, running: !!activeProcesses[profile.id] } };
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
        const launchOverrideArgs = resolveApiLaunchOverrideArgs(params);
        if (shouldStreamApiOpenRequest(context.req, params) && context.req && context.res) {
            return await streamApiOpenProfile({
                req: context.req,
                res: context.res,
                params,
                settings,
                profile,
                resolveRemoteDebugPortForProfile,
                launchOverrideArgs
            });
        }
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
        const lang = resolveApiPreferredLang(params, settings);
        const uiSender = getApiLaunchUiSender();
        const launchEvent = uiSender
            ? { sender: uiSender }
            : {
                sender: {
                    send: () => { },
                    isDestroyed: () => true
                }
            };
        const launchMessage = await launchProfileHandler(
            launchEvent,
            profile.id,
            settings.watermarkStyle === 'banner' || settings.watermarkStyle === 'off' ? settings.watermarkStyle : 'enhanced',
            lang,
            { launchArgsOverride: launchOverrideArgs }
        );
        const launchedPort = await resolveRemoteDebugPortForProfile(profile.id, profile.debugPort);
        const launchedPayload = {
            success: true,
            message: launchMessage || 'Launched',
            profileId: profile.id,
            name: profile.name,
            launchArgs: launchOverrideArgs
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
    // GET /api/export/profile/:idOrName?password=xxx - Export one profile backup
    const exportFullMatch = pathname.match(/^\/api\/export\/(all|profile)(?:\/([^\/]+))?$/);
    if (method === 'GET' && exportFullMatch) {
        const exportKind = exportFullMatch[1];
        const selection = resolveApiExportProfiles(profiles, params, exportFullMatch[2] || '');
        if (selection.error) return selection.error;
        if (exportKind === 'profile' && selection.selectedAll) {
            return { status: 400, data: { success: false, error: 'Profile id or name required' } };
        }
        const password = params.get('password');
        if (!password) return { status: 400, data: { success: false, error: 'Password required. Use ?password=yourpassword' } };
        const selectedProfiles = selection.profiles;

        const backupData = {
            version: 2,
            createdAt: Date.now(),
            profiles: selectedProfiles.map(cleanExportProfile),
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
        for (const profile of selectedProfiles) {
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
            filename: selection.selectedAll
                ? `GeekEZ_FullBackup_${Date.now()}.geekez`
                : `GeekEZ_FullBackup_Selected_${Date.now()}.geekez`,
            profileCount: selectedProfiles.length
        };
    }

    // GET /api/export/fingerprint - Export YAML fingerprints
    const exportFingerprintMatch = pathname.match(/^\/api\/export\/fingerprint(?:\/([^\/]+))?$/);
    if (method === 'GET' && exportFingerprintMatch) {
        const selection = resolveApiExportProfiles(profiles, params, exportFingerprintMatch[1] || '');
        if (selection.error) return selection.error;
        const selectedProfiles = selection.profiles;
        const exportData = selectedProfiles.map(p => ({
            id: p.id,
            name: p.name,
            proxyStr: p.proxyStr,
            tags: p.tags,
            fingerprint: cleanFingerprint(p.fingerprint)
        }));
        const yamlStr = yaml.dump(exportData, { lineWidth: -1, noRefs: true });
        return {
            success: true,
            data: yamlStr,
            filename: selection.selectedAll
                ? `GeekEZ_Profiles_${Date.now()}.yaml`
                : `GeekEZ_Profiles_Selected_${Date.now()}.yaml`,
            profileCount: selectedProfiles.length
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
                            notes: normalizeProfileNotes(firstDefined(item.notes, item.note, item.profileNotes, '')),
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
    const lookupContext = {};
    lookupContext.isDev = Boolean(isDev);
    lookupContext.appPath = app.getAppPath();
    lookupContext.resourcesPath = process.resourcesPath;
    lookupContext.platform = process.platform;
    lookupContext.env = process.env;
    return chromiumLocator.getChromiumPath(lookupContext);
}

function disableNativePasswordManager(userDataDir) {
    if (!userDataDir) return;
    const preferencesPath = path.join(userDataDir, 'Default', 'Preferences');
    const temporaryPath = `${preferencesPath}.geekez-tmp`;
    try {
        fs.ensureDirSync(path.dirname(preferencesPath));
        let preferences = {};
        if (fs.existsSync(preferencesPath)) {
            preferences = fs.readJsonSync(preferencesPath);
        }
        preferences.credentials_enable_service = false;
        preferences.profile = {
            ...(preferences.profile && typeof preferences.profile === 'object' ? preferences.profile : {}),
            password_manager_enabled: false
        };
        fs.writeJsonSync(temporaryPath, preferences);
        try {
            fs.renameSync(temporaryPath, preferencesPath);
        } catch (renameError) {
            // Windows does not replace an existing file with renameSync.
            fs.copyFileSync(temporaryPath, preferencesPath);
            fs.removeSync(temporaryPath);
        }
    } catch (error) {
        try { fs.removeSync(temporaryPath); } catch (cleanupError) { }
        console.warn('[Password Manager] Failed to disable native password prompts:', error.message);
    }
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

const hasUsableTrayEntry = () => {
    if (!appTray) return false;
    const destroyed = typeof appTray.isDestroyed === 'function' ? appTray.isDestroyed() : false;
    return Boolean(destroyed !== true);
};
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

function emitProfileLaunchProgress(sender, payload) {
    try {
        if (!sender || typeof sender.send !== 'function') return;
        if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) return;
        sender.send('profile-launch-progress', payload);
    } catch (e) { }
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
        await ensureBrowserWindowVisible(preferred, { nudge: process.platform === 'win32' });
        await preferred.bringToFront();
        try { app.focus({ steal: true }); } catch (e) { }
        return true;
    } catch (e) {
        return false;
    }
}

async function ensureBrowserWindowVisible(page, { nudge = false } = {}) {
    if (!page || typeof page.createCDPSession !== 'function') return;
    let session = null;
    try {
        session = await page.createCDPSession();
        const { windowId } = await session.send('Browser.getWindowForTarget');
        let bounds = {};
        try { bounds = await session.send('Browser.getWindowBounds', { windowId }); } catch (e) { }
        const display = screen.getDisplayNearestPoint({
            x: Number.isFinite(bounds.left) ? bounds.left : 0,
            y: Number.isFinite(bounds.top) ? bounds.top : 0
        });
        const workArea = display?.workArea || screen.getPrimaryDisplay().workArea;
        const currentWidth = Number(bounds.width) || 1280;
        const currentHeight = Number(bounds.height) || 800;
        const width = Math.max(480, Math.min(currentWidth, workArea.width));
        const height = Math.max(360, Math.min(currentHeight, workArea.height));
        const currentLeft = Number.isFinite(bounds.left) ? bounds.left : workArea.x;
        const currentTop = Number.isFinite(bounds.top) ? bounds.top : workArea.y;
        const left = Math.max(workArea.x, Math.min(currentLeft, workArea.x + workArea.width - width));
        const top = Math.max(workArea.y, Math.min(currentTop, workArea.y + workArea.height - height));
        // Chromium can finish launching with a valid page but a hidden window
        // on Windows. A short minimize/restore transition reliably activates
        // the native window once its handle has been created.
        if (nudge) {
            await session.send('Browser.setWindowBounds', {
                windowId,
                bounds: { windowState: 'minimized' }
            });
            await sleep(80);
        }
        await session.send('Browser.setWindowBounds', {
            windowId,
            bounds: { left, top, width, height, windowState: 'normal' }
        });
    } catch (e) { }
    finally {
        try { await session?.detach(); } catch (e) { }
    }
}

app.on('second-instance', (event, commandLine) => {
    const profileId = getProfileShortcutId(commandLine);
    if (profileId) {
        queueProfileShortcutLaunch(profileId);
        return;
    }
    showMainWindow();
});

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
    configSync?.schedule();
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

    proc.stopping = true;
    clearProfileRuntimeLanguageState(profileId);
    await forceKill(proc.xrayPid);
    try { await proc.browser.close(); } catch (e) { }
    if (proc.logFd !== undefined) {
        try { fs.closeSync(proc.logFd); } catch (e) { }
    }
    if (proc.macProfileApp) {
        await restoreMacProfileLauncher(proc.macProfileApp).catch((error) => {
            console.warn(`[macOS Dock] Failed to restore launcher for ${profileId}:`, error.message);
        });
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
                await launchProfileHandler(
                    launchEvent,
                    profile.id,
                    settings.watermarkStyle === 'banner' || settings.watermarkStyle === 'off' ? settings.watermarkStyle : 'enhanced'
                );
            } catch (e) { }
        }
        await refreshTrayMenu();
        return;
    }

    try {
        const settings = readSettingsSync();
        const launchEvent = getProfileLaunchEventSender();
        await launchProfileHandler(
            launchEvent,
            profile.id,
            settings.watermarkStyle === 'banner' || settings.watermarkStyle === 'off' ? settings.watermarkStyle : 'enhanced'
        );
    } catch (err) {
        dialog.showErrorBox('启动环境失败', String(err?.message || err || '未知错误'));
    }
    await refreshTrayMenu();
}

async function buildTrayMenuTemplate() {
    const profiles = await readAllProfilesSafe();
    const runningIds = new Set(Object.keys(activeProcesses));
    const launchingIds = new Set(Array.from(launchingProfiles));
    const lang = readSettingsSync().lang === 'en' ? 'en' : 'cn';

    const createProfileMenuItem = (profile) => ({
        label: `${runningIds.has(profile.id) ? '🟢 ' : (launchingIds.has(profile.id) ? '🟡 ' : '')}${profile.name || profile.id}`,
        click: () => {
            if (launchingIds.has(profile.id)) {
                showMainWindow();
                return;
            }
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
    const launchingProfilesList = profiles.filter(profile => launchingIds.has(profile.id));
    const runningMenu = [];
    if (runningProfiles.length > 0) {
        runningMenu.push({
            label: lang === 'en' ? 'Stop all running profiles' : '关闭全部运行中环境',
            click: async () => {
                const confirmed = await confirmStopAllRunningProfilesFromTray();
                if (!confirmed) return;
                stopAllRunningProfilesFromTray().catch(() => { });
            }
        });
    }
    if (launchingProfilesList.length > 0) {
        if (runningMenu.length > 0) runningMenu.push({ type: 'separator' });
        runningMenu.push({
            label: lang === 'en' ? 'Starting Profiles' : '启动中环境',
            enabled: false
        });
        runningMenu.push(...launchingProfilesList.map(createProfileMenuItem));
    }
    if (runningProfiles.length > 0) {
        if (runningMenu.length > 0) runningMenu.push({ type: 'separator' });
        runningMenu.push({
            label: lang === 'en' ? 'Running Profiles' : '运行中环境',
            enabled: false
        });
        runningMenu.push(...runningProfiles.map(createProfileMenuItem));
    }
    if (runningMenu.length === 0) {
        runningMenu.push({
            label: lang === 'en' ? 'No active profiles' : '暂无活动环境',
            enabled: false
        });
    }

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
            label: lang === 'en'
                ? `Profile Status (${launchingProfilesList.length} starting / ${runningProfiles.length} running)`
                : `环境状态（${launchingProfilesList.length} 启动中 / ${runningProfiles.length} 运行中）`,
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

function buildTrayTooltip() {
    const lang = readSettingsSync().lang === 'en' ? 'en' : 'cn';
    const launchingCount = launchingProfiles.size;
    const runningCount = Object.keys(activeProcesses).length;

    if (launchingCount > 0) {
        return lang === 'en'
            ? `GeekEZ Browser · ${launchingCount} starting · ${runningCount} running`
            : `GeekEZ Browser · ${launchingCount} 个启动中 · ${runningCount} 个运行中`;
    }

    if (runningCount > 0) {
        return lang === 'en'
            ? `GeekEZ Browser · ${runningCount} running`
            : `GeekEZ Browser · ${runningCount} 个运行中`;
    }

    return 'GeekEZ Browser';
}

async function refreshTrayMenu(popUp = false) {
    const trayDestroyed = !appTray || (typeof appTray.isDestroyed === 'function' && appTray.isDestroyed());
    if (trayDestroyed) return;
    const template = await buildTrayMenuTemplate();
    const menu = Menu.buildFromTemplate(template);
    appTray.setToolTip(buildTrayTooltip());
    appTray.setContextMenu(menu);
    if (popUp) {
        appTray.popUpContextMenu(menu);
    }
}

async function createTray() {
    if (appTray && (typeof appTray.isDestroyed !== 'function' || !appTray.isDestroyed())) return appTray;

    const trayImage = await resolveTrayIconImage();
    appTray = new Tray(trayImage);
    appTray.setToolTip(buildTrayTooltip());
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

function createWindow(options = {}) {
    const { show = true } = options;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const systemVersion = typeof app.getSystemVersion === 'function' ? app.getSystemVersion() : '';
    const materialOptions = getMainWindowMaterialOptions(process.platform, systemVersion);
    const win = new BrowserWindow({
        width: Math.round(width * 0.5), height: Math.round(height * 0.601), minWidth: 900, minHeight: 600,
        show,
        title: "GeekEZ Browser",
        icon: resolveWindowIconPath(),
        ...(process.platform !== 'darwin'
            ? { titleBarOverlay: { color: '#1e1e2d', symbolColor: '#ffffff', height: 35 } }
            : {}),
        ...materialOptions,
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
        if (isAppQuitting) {
            return;
        }

        event.preventDefault();
        const shouldQuit = decideCloseAction(getCloseBehavior(), {
            hasTrayEntry: hasUsableTrayEntry()
        }) === CLOSE_BEHAVIOR.QUIT;

        if (shouldQuit) {
            quitApplication();
            return;
        }

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
    configSync?.schedule();
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
    const syncStateFile = path.join(DATA_PATH, profileId, 'passwords-sync-state.json');
    const syncState = fs.existsSync(syncStateFile) ? await fs.readJson(syncStateFile) : null;

    // 内部扩展固定使用独立端口 12139
    const apiPort = INTERNAL_API_PORT;
    const backgroundConfig = `const PROFILE_ID = ${JSON.stringify(profileId || '')};\n` +
        `const API_PORT = ${apiPort};\nconst INIT_PASSWORDS = ${JSON.stringify(passwords)};\n` +
        `const INIT_PASSWORDS_REVISION = ${JSON.stringify(syncState?.revision || '')};\n`;
    const backgroundScript = backgroundConfig + guardBackground;
    const backgroundHash = crypto.createHash('sha256').update(backgroundScript).digest('hex').slice(0, 16);
    const backgroundFile = `background-${backgroundHash}.js`;

    const manifest = {
        manifest_version: 3,
        name: "GeekEZ Guard",
        version: "1.2.3",
        description: "Privacy & Password Protection",
        permissions: ["storage", "activeTab"],
        host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
        background: { service_worker: backgroundFile },
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
    const style = watermarkStyle === 'banner' || watermarkStyle === 'off' ? watermarkStyle : 'enhanced';
    const scriptContent = getInjectScript(fingerprint, profileName, style);
    await fs.writeFile(path.join(extDir, 'content.js'), scriptContent);

    // The script URL must change when Guard changes; unpacked workers can retain cached code.
    await fs.writeFile(path.join(extDir, backgroundFile), backgroundScript);
    await fs.writeFile(path.join(extDir, 'content_pw.js'), guardPasswordContent);
    await fs.writeFile(path.join(extDir, 'popup.html'), guardPopupHtml);
    await fs.writeFile(path.join(extDir, 'popup.js'), guardPopupScript);
    await fs.copy(require.resolve('jsqr'), path.join(extDir, 'jsqr.js'));
    await fs.writeJson(path.join(extDir, 'manifest.json'), manifest);
    const staleBackgrounds = (await fs.readdir(extDir)).filter(file =>
        file !== backgroundFile && /^(?:background\.js|background-[a-f0-9]{16}\.js)$/.test(file));
    for (const file of staleBackgrounds) await fs.remove(path.join(extDir, file));

    return extDir;
}

app.whenReady().then(async () => {
    configSync = createProfileSync({
        app, safeStorage, ipcMain, dialog,
        paths: { DATA_PATH, PROFILES_FILE, SETTINGS_FILE, DEFAULT_PASSWORDS_FILE },
        helpers: {
            runProfileApiTask, readEncryptedPasswords, readDefaultPasswordSettings, normalizeDefaultPasswords,
            normalizeSettingsSnapshot, normalizeBookmarksDocument, buildProfileFromInput, encryptData,
            commitProfileFiles, profileResourceWrites, notifyUIRefresh,
            onSettingsApplied: settings => { cachedCloseBehavior = normalizeCloseBehavior(settings.closeBehavior); },
            busyProfileIds: () => [...new Set([...Object.keys(activeProcesses), ...launchingProfiles])]
        },
        broadcast: (channel, payload) => BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
        })
    });
    await configSync.init().then(() => configSync.schedule()).catch(error => {
        configSync.credentials = null;
        configSync.setStatus({ phase: 'error', error: 'syncLocalError' });
        console.error('[Config Sync] Initialization failed:', error.message);
    });
    cachedCloseBehavior = normalizeCloseBehavior(readSettingsSync().closeBehavior);
    initializeProxyRecoveryMonitor();
    createWindow({ show: !initialProfileShortcutId });
    if (initialProfileShortcutId && process.platform === 'darwin' && app.dock && typeof app.dock.hide === 'function') {
        const hideRet = app.dock.hide();
        if (hideRet && typeof hideRet.catch === 'function') hideRet.catch(() => { });
    }
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

    profileShortcutReady = true;
    if (initialProfileShortcutId) pendingProfileShortcutIds.add(initialProfileShortcutId);
    await flushProfileShortcutLaunches();
    suppressProfileShortcutActivate = false;

    setTimeout(() => { fs.emptyDir(TRASH_PATH).catch(() => { }); }, 10000);
});

app.on('activate', () => {
    if (suppressProfileShortcutActivate) return;
    showMainWindow();
});

// IPC Handles
ipcMain.handle('get-app-info', () => {
    const systemVersion = typeof app.getSystemVersion === 'function' ? app.getSystemVersion() : '';
    return {
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        systemVersion,
        nativeGlass: supportsNativeGlass(process.platform, systemVersion)
    };
});

// Check for updates via GitHub Releases API
ipcMain.handle('check-updates', async () => {
    try {
        const currentVersion = app.getVersion();
        // Notify UI that check is in progress
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('update-status', { type: 'checking' });
        }

        const releaseInfo = await fetchLatestGitHubReleaseInfo({
            owner: 'EchoHS',
            repo: 'GeekezBrowser',
            currentVersion
        });
        const latestVersion = releaseInfo.latestVersion;
        const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

        if (hasUpdate) {
            return {
                hasUpdate: true,
                currentVersion,
                latestVersion,
                downloadUrl: releaseInfo.downloadUrl || 'https://github.com/EchoHS/GeekezBrowser/releases',
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

function spawnXrayProcess(configPath, logFd) {
    const child = spawn(BIN_PATH, ['-c', configPath], {
        cwd: BIN_DIR,
        env: { ...process.env, 'XRAY_LOCATION_ASSET': RESOURCES_BIN },
        stdio: ['ignore', logFd, logFd],
        windowsHide: true
    });
    child.once('error', (error) => {
        console.error(`[Xray Process Error] ${error?.message || error}`);
    });
    return child;
}

function readFileTailSafe(filePath, maxLength = 500) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return '';
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content) return '';
        return content.length > maxLength ? content.slice(-maxLength) : content;
    } catch (e) {
        return '';
    }
}

function readFileSinceSafe(filePath, startOffset = 0, maxLength = 4000) {
    let fd;
    try {
        if (!filePath || !fs.existsSync(filePath)) return '';
        fd = fs.openSync(filePath, 'r');
        const size = fs.fstatSync(fd).size;
        if (size <= startOffset) return '';
        const position = Math.max(startOffset, size - maxLength);
        const length = size - position;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, position);
        return buffer.toString('utf8');
    } catch (e) {
        return '';
    } finally {
        if (fd !== undefined) {
            try { fs.closeSync(fd); } catch (e) { }
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Puppeteer 25 exposes browser connectivity as a property. Older releases used
// isConnected(), so keep this check compatible with both versions and with the
// Windows packaged runtime.
function isBrowserConnected(browser) {
    if (!browser) return false;
    try {
        if (typeof browser.isConnected === 'function') return browser.isConnected();
        if (typeof browser.connected === 'boolean') return browser.connected;
        return true;
    } catch (e) {
        return false;
    }
}

function attachXrayExitRecovery(profileId, child) {
    if (!child) return;
    const scheduleRecovery = (code, signal) => {
        const proc = activeProcesses[profileId];
        if (!proc || proc.stopping || proc.xrayProcess !== child) return;
        proc.xrayPid = null;
        console.warn(`[Xray Recovery] ${profileId}: process exited (code=${code}, signal=${signal || 'none'})`);
        setTimeout(() => {
            recoverProfileProxy(profileId, 'unexpected-xray-exit').catch((error) => {
                console.error(`[Xray Recovery] ${profileId}: ${error?.message || error}`);
            });
        }, 500);
    };

    if (child.exitCode !== null) {
        scheduleRecovery(child.exitCode, child.signalCode);
        return;
    }
    child.once('exit', scheduleRecovery);
}

async function restartProfileXray(profileId, proc, reason) {
    const previousPid = proc.xrayPid;
    proc.xrayPid = null;
    proc.xrayProcess = null;
    await forceKill(previousPid);
    await sleep(150);

    for (let attempt = 1; attempt <= 3; attempt++) {
        if (activeProcesses[profileId] !== proc || proc.stopping || !isBrowserConnected(proc.browser)) {
            return false;
        }

        const child = spawnXrayProcess(proc.xrayConfigPath, proc.logFd);
        proc.xrayProcess = child;
        proc.xrayPid = child.pid || null;
        attachXrayExitRecovery(profileId, child);

        if (await waitForLocalPortReady(proc.localPort, 2500)) {
            await sleep(100);
            if (child.exitCode === null) {
                console.log(`[Xray Recovery] ${profileId}: restored on port ${proc.localPort} (${reason})`);
                return true;
            }
        }

        if (proc.xrayProcess === child) {
            proc.xrayProcess = null;
            proc.xrayPid = null;
        }
        await forceKill(child.pid);
        if (attempt < 3) await sleep(250);
    }

    console.error(`[Xray Recovery] ${profileId}: failed to restore on port ${proc.localPort} (${reason})`);
    return false;
}

async function recoverProfileProxy(profileId, reason = 'runtime-health-check') {
    const proc = activeProcesses[profileId];
    if (!proc || proc.stopping || proc.recoveringProxy || !proc.localPort || !proc.xrayConfigPath) {
        return false;
    }

    proc.recoveringProxy = true;
    try {
        const health = await waitForSocksProxyUsable(proc.localPort, 4500, 1200, proc.xrayProcess);
        if (health.success) return true;
        if (activeProcesses[profileId] !== proc || proc.stopping || !isBrowserConnected(proc.browser)) {
            return false;
        }

        console.warn(`[Xray Recovery] ${profileId}: proxy unhealthy after ${reason}: ${health.msg || 'unknown'}`);
        return await restartProfileXray(profileId, proc, reason);
    } finally {
        proc.recoveringProxy = false;
    }
}

function initializeProxyRecoveryMonitor() {
    let resumeTimer = null;
    const scheduleRecovery = (reason) => {
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            resumeTimer = null;
            for (const profileId of Object.keys(activeProcesses)) {
                recoverProfileProxy(profileId, reason).catch((error) => {
                    console.error(`[Xray Recovery] ${profileId}: ${error?.message || error}`);
                });
            }
        }, 2500);
    };
    powerMonitor.on('resume', () => scheduleRecovery('system-resume'));
    powerMonitor.on('unlock-screen', () => scheduleRecovery('screen-unlock'));
}

function formatProbeDetail(detail = {}) {
    const target = detail?.target || 'unknown target';
    const stage = detail?.stage ? ` at ${detail.stage}` : '';
    const elapsedMs = Number(detail?.elapsedMs);
    const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? ` after ${Math.round(elapsedMs)}ms` : '';
    const msg = detail?.msg || 'unknown error';
    return `${target}${stage}: ${msg}${elapsed}`;
}

function summarizeProbeDetails(details = [], maxCount = 3) {
    if (!Array.isArray(details) || details.length === 0) return '';
    return details
        .slice(0, maxCount)
        .map((detail) => formatProbeDetail(detail))
        .join('; ');
}

const DEFAULT_PROXY_PROBE_TARGETS = [
    { url: 'https://www.gstatic.com/generate_204', expectedStatus: 204 },
    { url: 'https://cp.cloudflare.com/generate_204', expectedStatus: 204 },
    { url: 'https://www.google.com/generate_204', expectedStatus: 204 }
];

const HARD_PROXY_PROBE_PATTERNS = [
    /\bECONNRESET\b/i,
    /\bECONNREFUSED\b/i,
    /\bENETUNREACH\b/i,
    /\bEHOSTUNREACH\b/i,
    /\bECONNABORTED\b/i,
    /\bEPIPE\b/i,
    /\bEPROTO\b/i,
    /\bERR_SSL\b/i,
    /\bTLSV1_ALERT\b/i,
    /\bUNEXPECTED_EOF\b/i,
    /\bHTTP 4\d\d\b/i,
    /\bHTTP 5\d\d\b/i,
    /returned HTTP\s+[45]\d\d/i
];

function normalizeProxyProbeTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') {
        return { url: target, expectedStatus: 204 };
    }
    const url = String(target.url || '').trim();
    if (!url) return null;
    return {
        url,
        expectedStatus: Number.isInteger(target.expectedStatus) ? target.expectedStatus : 204
    };
}

function createProbeHttpStatusMessage(target, statusCode) {
    return `${target.url} returned HTTP ${statusCode}`;
}

function isWarmupLikeProbeMessage(msg = '') {
    const text = String(msg || '').trim();
    if (!text) return false;
    if (HARD_PROXY_PROBE_PATTERNS.some((pattern) => pattern.test(text))) {
        return false;
    }
    return /\bTIMEOUT\b/i.test(text)
        || /timed out/i.test(text)
        || /Proxy not ready/i.test(text)
        || /No socket/i.test(text)
        || /Request timeout/i.test(text);
}

function shouldRetryProxyProbe(details = [], msg = '') {
    if (Array.isArray(details) && details.length > 0) {
        let sawRetryableFailure = false;
        for (const detail of details) {
            if (!isWarmupLikeProbeMessage(detail?.msg || '')) {
                return false;
            }
            sawRetryableFailure = true;
        }
        return sawRetryableFailure;
    }
    return isWarmupLikeProbeMessage(msg);
}

async function startPreProxyHealthCheck(url) {
    if (!url) return null;
    try {
        return await runProxyLatencyTest(url);
    } catch (err) {
        return { success: false, msg: err?.message || String(err || 'Unknown error') };
    }
}

async function waitForProxyChainReady(socksPort, processRef = null, options = {}) {
    const fastReadyTimeoutMs = Number.isFinite(options.fastReadyTimeoutMs) ? options.fastReadyTimeoutMs : 2600;
    const fastProbeTimeoutMs = Number.isFinite(options.fastProbeTimeoutMs) ? options.fastProbeTimeoutMs : 1000;
    const slowReadyTimeoutMs = Number.isFinite(options.slowReadyTimeoutMs) ? options.slowReadyTimeoutMs : 7000;
    const slowProbeTimeoutMs = Number.isFinite(options.slowProbeTimeoutMs) ? options.slowProbeTimeoutMs : 2200;
    const targets = Array.isArray(options.targets) ? options.targets : null;

    const fastResult = await waitForSocksProxyUsable(
        socksPort,
        fastReadyTimeoutMs,
        fastProbeTimeoutMs,
        processRef,
        { targets }
    );
    if (fastResult.success) {
        return { ...fastResult, phase: 'fast' };
    }
    if (!shouldRetryProxyProbe(fastResult.details, fastResult.msg)) {
        return { ...fastResult, phase: 'fast' };
    }

    const slowResult = await waitForSocksProxyUsable(
        socksPort,
        slowReadyTimeoutMs,
        slowProbeTimeoutMs,
        processRef,
        { targets }
    );
    return { ...slowResult, phase: 'slow' };
}

function createProxyStartupError(profileName, reason, xrayLogPath, lang = 'cn') {
    const displayName = profileName || '当前环境';
    const summary = lang === 'en'
        ? `${displayName} proxy failed to start. Please check whether the proxy is available or try restarting the profile.`
        : `${displayName}代理启动失败，请检查代理是否可用或尝试重启环境。`;
    const logTail = readFileTailSafe(xrayLogPath, 500).trim();
    const extraReason = String(reason || '').trim();

    if (logTail) {
        console.error(`[Xray Launch Failed] ${displayName}: ${extraReason || 'unknown'}\n${logTail}`);
    } else {
        console.error(`[Xray Launch Failed] ${displayName}: ${extraReason || 'unknown'}`);
    }

    const err = new Error(summary);
    err.code = 'XRAY_STARTUP_FAILED';
    err.detail = extraReason;
    return err;
}

function createPreProxyStartupError(profileName, preProxyRemark, reason, lang = 'cn') {
    const displayName = profileName || '当前环境';
    const nodeLabel = preProxyRemark ? `[${preProxyRemark}]` : '';
    const summary = lang === 'en'
        ? `${displayName} pre-proxy ${nodeLabel} is unavailable. Please check the pre-proxy node or disable pre-proxy and try again.`
        : `${displayName}前置代理${nodeLabel}不可用，请检查前置代理节点或关闭前置代理后重试。`;
    const err = new Error(summary);
    err.code = 'PRE_PROXY_UNAVAILABLE';
    err.detail = String(reason || '').trim();
    return err;
}

async function waitForSocksProxyUsable(socksPort, timeoutMs = 4500, connectTimeoutMs = 1200, processRef = null, options = {}) {
    const start = Date.now();
    let lastMsg = 'Proxy not ready';
    let lastDetails = [];
    const probeTargets = Array.isArray(options.targets) && options.targets.length > 0
        ? options.targets
        : null;

    while (Date.now() - start < timeoutMs) {
        if (processRef && processRef.exitCode !== null) {
            return {
                success: false,
                msg: `xray exited before proxy became usable (code: ${processRef.exitCode})`,
                details: lastDetails
            };
        }

        const result = await measureSocksConnectLatency(socksPort, connectTimeoutMs, probeTargets);
        if (result.success) return result;

        lastMsg = result?.msg || lastMsg;
        lastDetails = Array.isArray(result?.details) ? result.details : [];
        await sleep(200);
    }

    return { success: false, msg: lastMsg, details: lastDetails };
}

function createProbeTimeoutMessage(target, timeoutMs, stage = 'connect') {
    return `${target.host}:${target.port} ${stage} timeout after ${timeoutMs}ms`;
}

async function measureSocksConnectLatency(socksPort, timeoutMs = 4000, customTargets = null) {
    const targets = Array.isArray(customTargets) && customTargets.length > 0
        ? customTargets.map((target) => normalizeProxyProbeTarget(target)).filter(Boolean)
        : DEFAULT_PROXY_PROBE_TARGETS.map((target) => ({ ...target }));

    const probeTarget = async (target) => {
        const start = process.hrtime.bigint();
        let req = null;
        let res = null;
        try {
            const agent = await createSocksProxyAgent(`socks5h://127.0.0.1:${socksPort}`);
            const targetUrl = new URL(target.url);
            const latency = await new Promise((resolve, reject) => {
                req = https.get(targetUrl, {
                    agent,
                    headers: {
                        'User-Agent': 'GeekEZ-Browser/1.0',
                        'Accept': '*/*',
                        'Accept-Encoding': 'identity'
                    }
                }, (response) => {
                    res = response;
                    const statusCode = Number(response.statusCode || 0);
                    response.resume();
                    if (statusCode !== target.expectedStatus) {
                        const err = new Error(createProbeHttpStatusMessage(target, statusCode));
                        err.stage = 'http';
                        err.statusCode = statusCode;
                        reject(err);
                        return;
                    }
                    const requestLatency = Number(process.hrtime.bigint() - start) / 1e6;
                    resolve(Math.max(1, Math.round(requestLatency)));
                });

                req.setTimeout(timeoutMs, () => {
                    const err = new Error(createProbeTimeoutMessage(targetUrl, timeoutMs, 'request'));
                    err.stage = 'request';
                    req.destroy(err);
                });
                req.once('error', (err) => {
                    err.stage = err.stage || 'request';
                    reject(err);
                });
            });

            return {
                success: true,
                latency,
                target: targetUrl.host
            };
        } catch (err) {
            return {
                success: false,
                target: target?.url || 'unknown target',
                stage: err?.stage || 'request',
                msg: err?.code || err?.message || 'Connect failed',
                elapsedMs: Number(process.hrtime.bigint() - start) / 1e6
            };
        } finally {
            try { res?.destroy(); } catch (e) { }
            try { req?.destroy(); } catch (e) { }
        }
    };

    return await new Promise((resolve) => {
        const failures = new Array(targets.length);
        let failureCount = 0;
        let settled = false;

        targets.forEach((target, index) => {
            probeTarget(target).then((result) => {
                if (settled) return;

                if (result.success) {
                    settled = true;
                    resolve({
                        success: true,
                        latency: result.latency,
                        target: result.target
                    });
                    return;
                }

                failures[index] = result;
                failureCount += 1;
                if (failureCount === targets.length) {
                    settled = true;
                    const details = failures.filter(Boolean);
                    resolve({
                        success: false,
                        msg: summarizeProbeDetails(details, targets.length) || 'Proxy probe failed',
                        details
                    });
                }
            });
        });
    });
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
ipcMain.handle('set-title-bar-color', (e, colors) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    const systemVersion = typeof app.getSystemVersion === 'function' ? app.getSystemVersion() : '';
    if (supportsNativeGlass(process.platform, systemVersion)) {
        try { win.setBackgroundColor('#00000000'); } catch (error) { }
        return;
    }

    if (process.platform === 'win32') {
        try { win.setTitleBarOverlay({ color: colors.bg, symbolColor: colors.symbol }); } catch (error) { }
    }
    win.setBackgroundColor(colors.bg);
});
ipcMain.handle('check-app-update', async () => { try { const releaseInfo = await fetchLatestGitHubReleaseInfo({ owner: 'EchoHS', repo: 'GeekezBrowser', currentVersion: app.getVersion() }); if (compareVersions(releaseInfo.latestVersion, app.getVersion()) > 0) { return { update: true, remote: releaseInfo.latestVersion, url: 'https://browser.geekez.net/#downloads', notes: releaseInfo.notes }; } return { update: false }; } catch (e) { return { update: false, error: e.message }; } });
async function checkXrayUpdateAvailable() {
    try {
        const release = await fetchJson('https://api.github.com/repos/XTLS/Xray-core/releases/latest');
        if (!release || !release.tag_name) return { update: false };

        const remoteVersion = release.tag_name;
        const localVersion = await getLocalXrayVersion();
        if (remoteVersion === localVersion) return { update: false };

        const assetName = xrayRelease.resolveXrayAssetName({
            platform: os.platform(),
            arch: os.arch()
        });
        if (!assetName) {
            return { update: false, error: `Unsupported platform/arch: ${os.platform()}-${os.arch()}` };
        }

        return {
            update: true,
            remote: remoteVersion.replace(/^v/, ''),
            downloadUrl: `https://gh-proxy.com/https://github.com/XTLS/Xray-core/releases/download/${remoteVersion}/${assetName}`
        };
    } catch (e) {
        return { update: false };
    }
}
ipcMain.handle('check-xray-update', checkXrayUpdateAvailable);
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
ipcMain.handle('get-profile-runtime-state', () => ({
    runningIds: Object.keys(activeProcesses),
    launchingIds: Array.from(launchingProfiles)
}));
ipcMain.handle('get-profiles', async () => { if (!fs.existsSync(PROFILES_FILE)) return []; return fs.readJson(PROFILES_FILE); });
ipcMain.handle('update-profile', (event, updatedProfile) => runProfileApiTask(async () => {
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
}));
ipcMain.handle('save-profile', (event, data) => runProfileApiTask(async () => {
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    let newProfile = await applyDefaultBookmarksToProfile(
        await buildProfileFromInput(data, profiles, settings),
        settings
    );
    newProfile = await applyDefaultPasswordsToProfile(newProfile, settings);
    profiles.push(newProfile);
    await fs.writeJson(PROFILES_FILE, profiles);
    notifyUIRefresh();
    return newProfile;
}));
ipcMain.handle('reorder-profiles', (event, orderedIds) => runProfileApiTask(async () => {
    if (!Array.isArray(orderedIds)) return false;
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const currentIds = profiles.map(profile => profile.id);
    const nextIds = orderedIds.map(id => String(id || '')).filter(Boolean);
    if (nextIds.length !== currentIds.length) return false;
    if (new Set(nextIds).size !== currentIds.length) return false;
    if (!currentIds.every(id => nextIds.includes(id))) return false;

    const byId = new Map(profiles.map(profile => [profile.id, profile]));
    await fs.writeJson(PROFILES_FILE, nextIds.map(id => byId.get(id)));
    notifyUIRefresh();
    return true;
}));
ipcMain.handle('delete-profile', (event, id) => runProfileApiTask(async () => {
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

    if (process.platform === 'darwin') {
        try {
            await removeMacProfileApp({ profileId: id, rootDir: MAC_PROFILE_APPS_DIR });
        } catch (err) {
            console.warn(`Failed to remove macOS Dock app for profile ${id}:`, err.message);
        }
    }

    return true;
}));
ipcMain.handle('get-settings', async () => {
    const storedSettings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    const hasStoredPasswordScope = Object.prototype.hasOwnProperty.call(storedSettings, 'defaultPasswordScope');
    const normalized = normalizeSettingsSnapshot(storedSettings);
    const defaultPasswordSettings = await readDefaultPasswordSettings();
    const scope = hasStoredPasswordScope
        ? normalized.defaultPasswordScope
        : defaultPasswordSettings.scope;
    return {
            ...normalized,
            defaultPasswords: defaultPasswordSettings.passwords,
            defaultPasswordScope: scope,
            ...(fs.existsSync(SETTINGS_FILE) ? {} : {
            preProxies: [],
            mode: 'single',
            enablePreProxy: false,
            enableRemoteDebugging: false,
            enableUaWebglModify: false,
            closeBehavior: CLOSE_BEHAVIOR.TRAY,
            userExtensions: [],
            defaultBookmarks: [],
            defaultBookmarkScope: { mode: 'all', tags: [] }
            })
    };
});
ipcMain.handle('save-settings', (e, settings) => runProfileApiTask(async () => {
    const incoming = (settings && typeof settings === 'object')
        ? JSON.parse(JSON.stringify(settings))
        : {};
    const existing = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    const hasDefaultPasswords = Object.prototype.hasOwnProperty.call(incoming, 'defaultPasswords');
    const requestedDefaultPasswords = hasDefaultPasswords ? incoming.defaultPasswords : null;
    delete incoming.defaultPasswords;
    if (hasDefaultPasswords) {
        const defaultPasswordSettings = await writeDefaultPasswordSettings(
            requestedDefaultPasswords,
            incoming.defaultPasswordScope || existing.defaultPasswordScope
        );
        incoming.defaultPasswordScope = defaultPasswordSettings.scope;
    }
    const merged = { ...(existing || {}), ...(incoming || {}) };
    delete merged.defaultPasswords;
    await saveSettingsWithNormalizedExtensions(merged);
    configSync?.schedule();
    refreshTrayMenu().catch(() => { });
    return true;
}));
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
        await saveExtensionSettings(settings.userExtensions);
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
    await saveExtensionSettings(settings.userExtensions);
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
    await saveExtensionSettings(settings.userExtensions);

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
            const oldDefaultPasswords = path.join(DATA_PATH, 'default-passwords.json');

            // 迁移 profiles.json
            if (fs.existsSync(oldProfiles)) {
                await fs.copy(oldProfiles, path.join(newPath, 'profiles.json'));
            }
            // 迁移 settings.json
            if (fs.existsSync(oldSettings)) {
                await fs.copy(oldSettings, path.join(newPath, 'settings.json'));
            }
            if (fs.existsSync(oldDefaultPasswords)) {
                await fs.copy(oldDefaultPasswords, path.join(newPath, 'default-passwords.json'));
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
async function readEncryptedPasswords(pwFile, profileId, { strict = false } = {}) {
    if (!fs.existsSync(pwFile)) return [];
    try {
        const encrypted = await fs.readFile(pwFile);
        const decrypted = decryptData(encrypted, 'GeekEZ_PW_' + profileId);
        const passwords = JSON.parse(decrypted.toString('utf8'));
        if (!Array.isArray(passwords) || passwords.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
            throw new Error('Invalid password store');
        }
        return passwords;
    } catch (e) {
        try {
            // 兼容之前明文保存的 JSON，透明升级到加密
            const plain = await fs.readJson(pwFile);
            if (Array.isArray(plain) && plain.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry))) {
                if (!strict) writeEncryptedPasswords(pwFile, plain, profileId).catch(() => { });
                return plain;
            }
        } catch (e2) { }
        if (strict) throw new Error('密码库读取失败，未覆盖已有文件');
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
ipcMain.handle('import-full-backup', (e, { filePath, password }) => runProfileApiTask(async () => {
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

        notifyUIRefresh();
        return { success: true, count: importedCount };
    } catch (err) {
        console.error('Import full backup failed:', err);
        if (err.message.includes('Unsupported state') || err.message.includes('bad decrypt')) {
            return { success: false, error: '密码错误或文件已损坏' };
        }
        return { success: false, error: err.message };
    }
}));

// 导入普通备份 (YAML)
ipcMain.handle('import-data', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
    });

    if (filePaths && filePaths.length > 0) {
        return runProfileApiTask(async () => {
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
                if (updated) notifyUIRefresh();
                return updated;
            } catch (e) {
                console.error(e);
                throw e;
            }
        });
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
const launchProfileHandler = async (event, profileId, watermarkStyle, preferredLang, launchOptions = {}) => {
    if (profileResourceWrites.has(profileId)) {
        throw profileResourceError('Profile data is being updated; retry launching shortly', 409);
    }
    const sender = event.sender;
    const launchArgsOverride = normalizeLaunchOverrideArgs(launchOptions.launchArgsOverride || []);
    const progressTitle = preferredLang === 'en' ? 'Launching Profile' : '正在启动环境';
    const progressWarn = preferredLang === 'en'
        ? 'Please wait while the environment starts. Do not close the application.'
        : '环境启动中，请稍候，不要关闭软件。';
    const totalProgressSteps = 10;
    const updateLaunchProgress = (percent, message, visible = true, extra = {}) => {
        emitProfileLaunchProgress(sender, {
            visible,
            percent,
            title: progressTitle,
            message,
            warn: progressWarn,
            profileId,
            profileName: extra.profileName || '',
            step: Number.isFinite(extra.step) ? extra.step : 0,
            totalSteps: Number.isFinite(extra.totalSteps) ? extra.totalSteps : totalProgressSteps
        });
    };

    const markLaunching = async (active) => {
        if (active) launchingProfiles.add(profileId);
        else launchingProfiles.delete(profileId);
        try {
            if (sender && !(typeof sender.isDestroyed === 'function' && sender.isDestroyed())) {
                sender.send('profile-status', { id: profileId, status: active ? 'launching' : 'stopped' });
            }
        } catch (e) { }
        refreshTrayMenu().catch(() => { });
    };

    if (activeProcesses[profileId]) {
        const proc = activeProcesses[profileId];
        if (isBrowserConnected(proc.browser)) {
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
                clearProfileRuntimeLanguageState(profileId);
            }
        } else {
            await forceKill(proc.xrayPid);
            delete activeProcesses[profileId];
            clearProfileRuntimeLanguageState(profileId);
        }
        if (activeProcesses[profileId]) return "环境已唤醒";
    }

    if (launchingProfiles.has(profileId)) {
        return preferredLang === 'en' ? 'Profile is starting' : '环境启动中';
    }

    if (profileResourceWrites.has(profileId)) {
        throw profileResourceError('Profile data is being updated; retry launching shortly', 409);
    }
    await markLaunching(true);
    updateLaunchProgress(
        5,
        preferredLang === 'en' ? 'Loading profile settings...' : '正在读取环境配置...',
        true,
        { step: 1 }
    );
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
    const uiLang = preferredLang === 'en' ? 'en' : (settings.lang === 'en' ? 'en' : 'cn');

    const profiles = await fs.readJson(PROFILES_FILE);
    const profileIndex = profiles.findIndex(p => p.id === profileId);
    const profile = profileIndex > -1 ? profiles[profileIndex] : null;
    if (!profile) throw new Error('Profile not found');
    const progressProfileName = profile.name || profileId;

    ensureProxyStrValid(profile.proxyStr);
    profile.fingerprint = normalizeFingerprint(profile.fingerprint || {});
    updateLaunchProgress(
        12,
        preferredLang === 'en' ? 'Validating profile configuration...' : '正在校验环境配置...',
        true,
        { step: 2, profileName: progressProfileName }
    );

    // Auto-assign a stable remote debugging port when feature is enabled and no explicit port exists.
    if (settings.enableRemoteDebugging && !normalizeDebugPort(profile.debugPort)) {
        await runProfileApiTask(async () => {
            const latest = await fs.readJson(PROFILES_FILE);
            const entry = latest.find(item => item.id === profileId);
            if (!entry) throw new Error('Profile not found');
            profile.debugPort = await allocateDebugPortIfNeeded(settings, latest, entry.debugPort);
            entry.debugPort = profile.debugPort;
            await fs.writeJson(PROFILES_FILE, latest);
        });
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
    let macProfileApp = null;
    try {
        const profileDir = path.join(DATA_PATH, profileId);
        const userDataDir = path.join(profileDir, 'browser_data');
        fs.ensureDirSync(userDataDir);

        let localPort = null;

        updateLaunchProgress(
            20,
            preferredLang === 'en' ? 'Preparing browser workspace...' : '正在准备浏览器工作区...',
            true,
            { step: 3, profileName: progressProfileName }
        );

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
            // Chromium on Windows otherwise opens only its crash-recovery
            // prompt after an interrupted launch. Mark the previous session
            // clean before requesting last-session restoration.
            preferences.profile.exit_type = 'Normal';
            preferences.profile.exited_cleanly = true;
            if (!preferences.webrtc) preferences.webrtc = {};
            preferences.webrtc.ip_handling_policy = 'disable_non_proxied_udp';
            await fs.writeJson(preferencesPath, preferences);
        } catch (e) { }

        const shouldLaunchXray = (!useDirectNetwork) || !!activePreProxy;
        let xrayLogPath = null;
        let xrayConfigPath = null;
        if (shouldLaunchXray) {
            updateLaunchProgress(
                32,
                activePreProxy
                    ? (preferredLang === 'en' ? 'Starting proxy chain service...' : '正在启动代理链服务...')
                    : (preferredLang === 'en' ? 'Starting profile proxy service...' : '正在启动环境代理服务...'),
                true,
                { step: 4, profileName: progressProfileName }
            );
            xrayConfigPath = path.join(profileDir, 'config.json');
            xrayLogPath = path.join(profileDir, 'xray_run.log');
            const upstreamProxy = useDirectNetwork ? activePreProxy?.url : profile.proxyStr;
            const chainedPreProxy = useDirectNetwork ? null : finalPreProxyConfig;
            logFd = fs.openSync(xrayLogPath, 'a');
            const preProxyLabel = activePreProxy?.remark || activePreProxy?.name || activePreProxy?.id || '';
            const preProxyCheckPromise = activePreProxy?.url
                ? startPreProxyHealthCheck(activePreProxy.url)
                : null;
            const throwPreProxyCheckError = (preProxyCheck) => {
                updateLaunchProgress(
                    56,
                    preferredLang === 'en'
                        ? `Checking pre-proxy node${preProxyLabel ? ` [${preProxyLabel}]` : ''}...`
                        : `正在检测前置代理节点${preProxyLabel ? ` [${preProxyLabel}]` : ''}...`,
                    true,
                    { step: 5, profileName: progressProfileName }
                );
                throw createPreProxyStartupError(
                    profile.name,
                    activePreProxy?.remark || activePreProxy?.name || '',
                    preProxyCheck?.msg || 'pre-proxy unavailable',
                    uiLang
                );
            };
            const awaitWithPreProxyPriority = async (stepPromise) => {
                if (!preProxyCheckPromise) return await stepPromise;
                const taggedStepPromise = Promise.resolve(stepPromise).then((value) => ({ type: 'step', value }));
                const taggedPreProxyPromise = preProxyCheckPromise.then((result) => ({ type: 'pre', result }));
                const first = await Promise.race([taggedStepPromise, taggedPreProxyPromise]);
                if (first.type === 'pre') {
                    if (!first.result?.success) {
                        throwPreProxyCheckError(first.result);
                    }
                    return await stepPromise;
                }
                return first.value;
            };
            let xrayLaunchStartedAt = 0;
            const readyTimeoutMs = 2500;
            const maxBindAttempts = 3;
            for (let attempt = 1; attempt <= maxBindAttempts; attempt++) {
                localPort = await allocateLocalProxyPort();
                const config = generateXrayConfig(upstreamProxy, localPort, chainedPreProxy, profile.fingerprint);
                fs.writeJsonSync(xrayConfigPath, config);
                const logOffset = fs.fstatSync(logFd).size;
                xrayLaunchStartedAt = Date.now();
                xrayProcess = spawnXrayProcess(xrayConfigPath, logFd);

                updateLaunchProgress(
                    40,
                    attempt === 1
                        ? (preferredLang === 'en' ? 'Waiting for local proxy port...' : '正在等待本地代理端口就绪...')
                        : (preferredLang === 'en' ? 'Retrying local proxy port...' : '正在重新分配本地代理端口...'),
                    true,
                    { step: 4, profileName: progressProfileName }
                );
                const ready = await awaitWithPreProxyPriority(waitForLocalPortReady(localPort, readyTimeoutMs));
                if (ready) {
                    await sleep(100);
                    if (xrayProcess.exitCode === null) break;
                }

                const exitCode = xrayProcess.exitCode;
                const reason = exitCode !== null
                    ? `xray exited before ready (code: ${exitCode})`
                    : `xray socks port ${localPort} not ready within ${readyTimeoutMs}ms`;
                const attemptLog = readFileSinceSafe(xrayLogPath, logOffset);
                if (attempt < maxBindAttempts && isXrayLocalBindFailure(attemptLog, localPort)) {
                    console.warn(`[Xray Launch Retry] local port ${localPort} bind failed; allocating another TCP/UDP port`);
                    await forceKill(xrayProcess.pid);
                    xrayProcess = null;
                    await sleep(150);
                    continue;
                }
                throw createProxyStartupError(profile.name, reason, xrayLogPath, uiLang);
            }

            // Xray may bind the local SOCKS port before the upstream proxy chain is fully usable.
            // Chained pre-proxy setups need a bit more warm-up budget before the first probe.
            const minWarmupMs = activePreProxy ? 1200 : 300;
            const remainingWarmupMs = minWarmupMs - (Date.now() - xrayLaunchStartedAt);
            if (remainingWarmupMs > 0) {
                await awaitWithPreProxyPriority(new Promise((resolve) => setTimeout(resolve, remainingWarmupMs)));
            }

            updateLaunchProgress(
                48,
                activePreProxy
                    ? (preferredLang === 'en' ? 'Checking proxy chain availability...' : '正在检测代理链可用性...')
                    : (preferredLang === 'en' ? 'Checking profile proxy availability...' : '正在检测环境代理可用性...'),
                true,
                { step: 5, profileName: progressProfileName }
            );
            const proxyUsable = await awaitWithPreProxyPriority(
                waitForProxyChainReady(
                    localPort,
                    xrayProcess,
                    activePreProxy?.url
                        ? {
                            fastReadyTimeoutMs: 2600,
                            fastProbeTimeoutMs: 1000,
                            slowReadyTimeoutMs: 4200,
                            slowProbeTimeoutMs: 1800
                        }
                        : {
                            fastReadyTimeoutMs: 2200,
                            fastProbeTimeoutMs: 900,
                            slowReadyTimeoutMs: 2600,
                            slowProbeTimeoutMs: 1400
                        }
                )
            );
            if (!proxyUsable.success) {
                const probeSummary = summarizeProbeDetails(proxyUsable.details, 3);
                if (activePreProxy?.url) {
                    updateLaunchProgress(
                        56,
                        preferredLang === 'en'
                            ? `Checking pre-proxy node${preProxyLabel ? ` [${preProxyLabel}]` : ''}...`
                            : `正在检测前置代理节点${preProxyLabel ? ` [${preProxyLabel}]` : ''}...`,
                        true,
                        { step: 5, profileName: progressProfileName }
                    );
                    const preProxyCheck = preProxyCheckPromise
                        ? await preProxyCheckPromise
                        : await startPreProxyHealthCheck(activePreProxy.url);
                    if (!preProxyCheck.success) {
                        throwPreProxyCheckError(preProxyCheck);
                    }
                }

                throw createProxyStartupError(
                    profile.name,
                    probeSummary || proxyUsable.msg || 'proxy chain not usable after startup',
                    xrayLogPath,
                    uiLang
                );
            }
        } else {
            updateLaunchProgress(
                48,
                preferredLang === 'en' ? 'Using direct network path...' : '正在使用直连网络...',
                true,
                { step: 5, profileName: progressProfileName }
            );
        }

        const autoIpBasePolicy = getAutoIpBasePolicy(profile.fingerprint);
        if (autoIpBasePolicy.enabled) {
            updateLaunchProgress(
                58,
                preferredLang === 'en' ? 'Resolving IP-based fingerprint...' : '正在解析基于 IP 的指纹...',
                true,
                { step: 6, profileName: progressProfileName }
            );
            try {
                const resolved = await resolveAutoIpBaseFingerprint(profileId, profile.fingerprint, localPort);
                if (resolved && resolved.fingerprint) {
                    profile.fingerprint = resolved.fingerprint;
                    logAutoIpBaseResolution(profile.name, profileId, resolved);
                }
            } catch (err) {
                console.warn(`[Auto IP Base] ${profile.name || profileId}: ${err?.message || err}`);
            }
        }

        updateLaunchProgress(
            66,
            preferredLang === 'en' ? 'Preparing fingerprint parameters...' : '正在准备指纹参数...',
            true,
            { step: 6, profileName: progressProfileName }
        );
        // 0. Resolve language override
        const configuredLang = profile.fingerprint?.language;
        const leaveLanguageUnmodified = isNoOverrideValue(configuredLang);
        const hasLanguageOverride = typeof configuredLang === 'string' &&
            configuredLang &&
            !isAutoLanguageValue(configuredLang) &&
            !leaveLanguageUnmodified;
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
        const targetLang = hasLanguageOverride ? (canonicalizeLocale(configuredLang) || configuredLang) : localeFromSystem;

        // Update in-memory profile only for explicit language override.
        if (hasLanguageOverride) {
            profile.fingerprint.language = targetLang;
            profile.fingerprint.languages = [targetLang, targetLang.split('-')[0]];
        } else {
            profile.fingerprint.language = leaveLanguageUnmodified ? 'none' : 'auto';
            profile.fingerprint.languages = [];
        }

        // 1. 生成 GeekEZ Guard 扩展（使用传递的水印样式）
        const style = watermarkStyle === 'banner' || watermarkStyle === 'off' ? watermarkStyle : 'enhanced';
        const extPath = await generateExtension(profileDir, profile.fingerprint, profile.name, style, profileId);

        // 2. 获取当前环境需要加载的用户扩展
        updateLaunchProgress(
            76,
            preferredLang === 'en' ? 'Loading browser extensions...' : '正在加载浏览器扩展...',
            true,
            { step: 7, profileName: progressProfileName }
        );
        const userExtensions = getProfileUserExtensions(settings, profileId);
        for (const ext of userExtensions) {
            await patchExtensionInstallBehavior(ext.path).catch(() => { });
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

        const uaSpoofEnabled = String(profile.fingerprint?.uaMode || 'none').toLowerCase() !== 'none';
        const launchWindow = profile.fingerprint?.window || { width: 1280, height: 800 };

        const launchArgs = [
            `--user-data-dir=${userDataDir}`,
            '--disable-save-password-bubble',
            `--window-size=${launchWindow.width || 1280},${launchWindow.height || 800}`,
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

        if (uaSpoofEnabled && profile.fingerprint?.userAgent) {
            launchArgs.push(`--user-agent=${profile.fingerprint.userAgent}`);
        }
        if (hasLanguageOverride) {
            launchArgs.push(`--lang=${targetLang}`);
            const launchLanguages = normalizeLanguageList(targetLang, profile.fingerprint?.languages);
            launchArgs.push(`--accept-lang=${launchLanguages.join(',') || targetLang}`);
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

        if (launchArgsOverride.length > 0) {
            launchArgs.push(...launchArgsOverride);
            console.log('⚡ API Launch Args Override:', launchArgsOverride.join(' '));
            updateLaunchProgress(
                84,
                preferredLang === 'en'
                    ? `Applying temporary launch args: ${launchArgsOverride.join(' ')}`
                    : `正在应用本次临时启动参数：${launchArgsOverride.join(' ')}`,
                true,
                { step: 7, profileName: progressProfileName }
            );
        }

        updateLaunchProgress(
            86,
            preferredLang === 'en' ? 'Launching browser window...' : '正在启动浏览器窗口...',
            true,
            { step: 8, profileName: progressProfileName }
        );
        // 5. 启动浏览器
        const sourceChromePath = getChromiumPath();
        if (!sourceChromePath) {
            if (xrayProcess && xrayProcess.pid) {
                await forceKill(xrayProcess.pid);
            }
            throw new Error("Chrome binary not found.");
        }

        let chromePath = sourceChromePath;
        if (process.platform === 'darwin') {
            try {
                const preparedProfileApp = await prepareMacProfileChromium({
                    sourceExecutable: sourceChromePath,
                    profileId,
                    profileName: profile.name,
                    rootDir: MAC_PROFILE_APPS_DIR
                });
                macProfileApp = preparedProfileApp;
                chromePath = preparedProfileApp.executablePath;
                console.log(
                    `[macOS Dock] ${profile.name || profileId}: ${preparedProfileApp.bundleId} -> ${preparedProfileApp.appPath}`
                );
            } catch (dockAppError) {
                console.warn(
                    `[macOS Dock] Failed to prepare stable app identity for ${profile.name || profileId}; using bundled Chromium:`,
                    dockAppError?.message || dockAppError
                );
            }
        }

        // GeekEZ Guard owns credential capture and autofill. Disable only the
        // Chromium UI prompt so it cannot cover pages during automation.
        disableNativePasswordManager(userDataDir);

        // 时区设置
        const env = { ...process.env };
        if (profile.fingerprint?.timezone &&
            !isAutoTimezoneValue(profile.fingerprint.timezone) &&
            !isNoOverrideValue(profile.fingerprint.timezone)) {
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

        updateLaunchProgress(
            94,
            preferredLang === 'en' ? 'Applying runtime settings...' : '正在应用运行时设置...',
            true,
            { step: 9, profileName: progressProfileName }
        );

        let runtimeFingerprint = profile.fingerprint;
        setProfileRuntimeLanguageState(profileId, runtimeFingerprint);
        const getRuntimeLanguageState = () => {
            return buildRuntimeLanguageState(runtimeFingerprint);
        };

        // GeekEZ Guard is the single source for page-world fingerprint hooks. CDP only
        // aligns network headers, locale and timezone with the resolved profile.
        const applySessionOverrides = async (session, options = {}) => {
            if (!session) return;
            const { url = '' } = options;
            const runtimeLanguage = getRuntimeLanguageState();
            // Apply native locale/timezone overrides while the startup page is still
            // blank. Deferring them until after navigation creates a detectable
            // language transition during the first document load.
            const googleAuthSafeMode = isGoogleAuthLikeUrl(url);
            const hasTimezoneOverride = !!(
                runtimeFingerprint?.timezone &&
                !isAutoTimezoneValue(runtimeFingerprint.timezone) &&
                !isNoOverrideValue(runtimeFingerprint.timezone)
            );

            try { await session.send('Network.enable'); } catch (e) { }

            if (googleAuthSafeMode) {
                if (runtimeLanguage.enabled) {
                    try {
                        await session.send('Network.setExtraHTTPHeaders', { headers: {} });
                    } catch (e) { }
                    try {
                        await session.send('Emulation.setLocaleOverride', { locale: '' });
                    } catch (e) { }
                }
                if (hasTimezoneOverride) {
                    try {
                        await session.send('Emulation.setTimezoneOverride', { timezoneId: '' });
                    } catch (e) { }
                }
            } else if (runtimeLanguage.enabled) {
                try {
                    await session.send('Network.setExtraHTTPHeaders', {
                        headers: {
                            'Accept-Language': runtimeLanguage.acceptLanguageHeader
                        }
                    });
                } catch (e) { }

                try {
                    await session.send('Emulation.setLocaleOverride', { locale: runtimeLanguage.language });
                } catch (e) { }
            }

            if (!googleAuthSafeMode && hasTimezoneOverride) {
                try {
                    await session.send('Emulation.setTimezoneOverride', { timezoneId: runtimeFingerprint.timezone });
                } catch (e) { }
            }

            if (uaSpoofEnabled && profile.fingerprint?.userAgent) {
                const payload = {
                    userAgent: profile.fingerprint.userAgent
                };
                if (runtimeLanguage.enabled && !googleAuthSafeMode) {
                    payload.acceptLanguage = runtimeLanguage.acceptLanguageOverride;
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
        };

        const pageOverrideSessions = new WeakMap();
        const getPageOverrideSession = async (page) => {
            let session = pageOverrideSessions.get(page);
            if (!session) {
                session = await page.createCDPSession();
                pageOverrideSessions.set(page, session);
            }
            return session;
        };

        const applyPageRuntimeOverrides = async (page) => {
            if (!page) return;
            const session = await getPageOverrideSession(page);
            await applySessionOverrides(session, {
                url: typeof page.url === 'function' ? page.url() : ''
            });
        };

        const runtimeOverrideWatchedPages = new WeakSet();
        const watchPageRuntimeOverrideNavigation = (page) => {
            if (!page || runtimeOverrideWatchedPages.has(page) || typeof page.on !== 'function') return;
            runtimeOverrideWatchedPages.add(page);
            page.on('framenavigated', async (frame) => {
                try {
                    if (typeof page.mainFrame === 'function' && frame !== page.mainFrame()) return;
                    await applyPageRuntimeOverrides(page, false);
                } catch (e) { }
            });
        };

        const applyPageOverrides = async (page) => {
            if (!page) return;
            try {
                watchPageRuntimeOverrideNavigation(page);
                await applyPageRuntimeOverrides(page);
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

            await applyPageOverrides(page);

            try {
                const url = page.url();
                if (shouldRestoreSession && inBlankCleanupWindow() && isBlankPageUrl(url)) {
                    await cleanupRestoredBlankPages();
                    await ensureAtLeastOnePage();
                }
            } catch (e) { }
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
            const firstPage = (await browser.pages())[0];
            if (firstPage) {
                await ensureBrowserWindowVisible(firstPage, { nudge: process.platform === 'win32' });
                await firstPage.bringToFront().catch(() => { });
            }
        } catch (e) {
            console.error('Failed to process startup pages:', e);
        }

        activeProcesses[profileId] = {
            xrayPid: xrayProcess ? xrayProcess.pid : null,
            xrayProcess,
            xrayConfigPath,
            localPort,
            browser,
            macProfileApp,
            logFd,
            recoveringProxy: false,
            stopping: false
        };
        if (xrayProcess) attachXrayExitRecovery(profileId, xrayProcess);
        launchingProfiles.delete(profileId);
        updateLaunchProgress(
            100,
            preferredLang === 'en' ? 'Launch complete' : '启动完成',
            true,
            { step: 10, profileName: progressProfileName }
        );
        setTimeout(() => emitProfileLaunchProgress(sender, { visible: false }), 500);
        sender.send('profile-status', { id: profileId, status: 'running' });
        refreshTrayMenu().catch(() => { });

        // CDP Timezone Override (Windows only)
        // On macOS/Linux, TZ env var changes V8's timezone natively.
        // On Windows, V8 ignores TZ and uses Win32 API, so we use CDP instead.
        // This changes V8's internal timezone at the engine level - all Date methods
        // (toString, getTimezoneOffset, getHours, etc.) and Intl APIs work correctly.
        const targetTimezone = runtimeFingerprint?.timezone;
        if (process.platform === 'win32' &&
            targetTimezone &&
            !isAutoTimezoneValue(targetTimezone) &&
            !isNoOverrideValue(targetTimezone)) {
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
                const proc = activeProcesses[profileId];
                proc.stopping = true;
                const pid = proc.xrayPid;
                const logFd = proc.logFd;

                // 关闭日志文件描述符
                if (logFd !== undefined) {
                    try {
                        fs.closeSync(logFd);
                    } catch (e) { }
                }

                delete activeProcesses[profileId];
                clearProfileRuntimeLanguageState(profileId);
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
            if (macProfileApp) {
                await restoreMacProfileLauncher(macProfileApp).catch((error) => {
                    console.warn(`[macOS Dock] Failed to restore launcher for ${profile.name || profileId}:`, error.message);
                });
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

        launchingProfiles.delete(profileId);
        delete activeProcesses[profileId];
        clearProfileRuntimeLanguageState(profileId);
        if (macProfileApp) {
            await restoreMacProfileLauncher(macProfileApp).catch((error) => {
                console.warn(`[macOS Dock] Failed to restore launcher after launch error for ${profile.name || profileId}:`, error.message);
            });
        }
        if (!sender.isDestroyed()) {
            sender.send('profile-status', { id: profileId, status: 'stopped' });
        }
        emitProfileLaunchProgress(sender, { visible: false });
        refreshTrayMenu().catch(() => { });

        console.error(err);
        throw err;
    }
};
ipcMain.handle('launch-profile', launchProfileHandler);

async function launchProfileFromShortcut(profileId) {
    const profiles = await readAllProfilesSafe();
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
        console.warn(`[Profile Shortcut] Profile not found: ${profileId}`);
        showMainWindow();
        return;
    }

    const settings = readSettingsSync();
    const preferredLang = settings.lang === 'en' ? 'en' : 'cn';
    const watermarkStyle = settings.watermarkStyle === 'banner' || settings.watermarkStyle === 'off'
        ? settings.watermarkStyle
        : 'enhanced';

    console.log(`[Profile Shortcut] Launching ${profile.name || profileId} (${profileId})`);
    await launchProfileHandler(
        getProfileLaunchEventSender(),
        profileId,
        watermarkStyle,
        preferredLang
    );
}

async function flushProfileShortcutLaunches() {
    if (!profileShortcutReady || profileShortcutFlushRunning) return;
    profileShortcutFlushRunning = true;
    try {
        while (pendingProfileShortcutIds.size > 0) {
            const [profileId] = pendingProfileShortcutIds;
            pendingProfileShortcutIds.delete(profileId);
            try {
                await launchProfileFromShortcut(profileId);
            } catch (error) {
                console.error(`[Profile Shortcut] Failed to launch ${profileId}:`, error);
                showMainWindow();
            }
        }
    } finally {
        profileShortcutFlushRunning = false;
        if (profileShortcutReady && pendingProfileShortcutIds.size > 0) {
            setImmediate(() => flushProfileShortcutLaunches().catch((error) => {
                console.error('[Profile Shortcut] Failed to resume launch queue:', error);
            }));
        }
    }
}

app.on('before-quit', () => {
    isAppQuitting = true;
    Object.values(activeProcesses).forEach((proc) => {
        proc.stopping = true;
        if (proc.macProfileApp) {
            try { restoreMacProfileLauncherSync(proc.macProfileApp); } catch (e) { }
        }
    });
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
