const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const getPort = require('get-port');
const puppeteer = require('puppeteer'); // 使用原生 puppeteer，不带 extra
const { v4: uuidv4 } = require('uuid');
const yaml = require('js-yaml');
const { SocksProxyAgent } = require('socks-proxy-agent');
const http = require('http');
const https = require('https');
const os = require('os');

app.disableHardwareAcceleration();

const { generateXrayConfig } = require('./utils');
const { generateFingerprint, getInjectScript } = require('./fingerprint');

const isDev = !app.isPackaged;
const BIN_DIR = isDev ? path.join(__dirname, 'resources', 'bin') : path.join(process.resourcesPath, 'bin');
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'xray.exe' : 'xray');
const DATA_PATH = path.join(app.getPath('userData'), 'BrowserProfiles');
const TRASH_PATH = path.join(app.getPath('userData'), '_Trash_Bin');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');
const SETTINGS_FILE = path.join(DATA_PATH, 'settings.json');

fs.ensureDirSync(DATA_PATH);
fs.ensureDirSync(TRASH_PATH);

let activeProcesses = {};

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
    const basePath = isDev ? path.join(__dirname, 'resources', 'puppeteer') : path.join(process.resourcesPath, 'puppeteer');
    if (!fs.existsSync(basePath)) return null;
    function findFile(dir, filename) {
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) { const res = findFile(fullPath, filename); if (res) return res; }
                else if (file === filename) return fullPath;
            }
        } catch (e) { return null; } return null;
    }

    // macOS: Chrome binary is inside .app/Contents/MacOS/
    if (process.platform === 'darwin') {
        return findFile(basePath, 'Google Chrome for Testing');
    }
    // Windows
    return findFile(basePath, 'chrome.exe');
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const win = new BrowserWindow({
        width: Math.round(width * 0.5), height: Math.round(height * 0.601), minWidth: 900, minHeight: 600,
        title: "GeekEZ Browser", backgroundColor: '#1e1e2d',
        icon: path.join(__dirname, 'icon.png'),
        titleBarOverlay: { color: '#1e1e2d', symbolColor: '#ffffff', height: 35 },
        titleBarStyle: 'hidden',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
    });
    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
    return win;
}

async function generateExtension(profilePath, fingerprint) {
    const extDir = path.join(profilePath, 'extension');
    await fs.ensureDir(extDir);
    const manifest = {
        manifest_version: 3,
        name: "GeekEZ Guard",
        version: "1.0.0",
        description: "Privacy Protection",
        content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], run_at: "document_start", all_frames: true, world: "MAIN" }]
    };
    const scriptContent = getInjectScript(fingerprint);
    await fs.writeJson(path.join(extDir, 'manifest.json'), manifest);
    await fs.writeFile(path.join(extDir, 'content.js'), scriptContent);
    return extDir;
}

app.whenReady().then(async () => {
    createWindow();
    setTimeout(() => { fs.emptyDir(TRASH_PATH).catch(() => { }); }, 10000);
});

// IPC Handles
ipcMain.handle('get-app-info', () => { return { name: app.getName(), version: app.getVersion() }; });
ipcMain.handle('fetch-url', async (e, url) => { try { const res = await fetch(url); if (!res.ok) throw new Error('HTTP ' + res.status); return await res.text(); } catch (e) { throw e.message; } });
ipcMain.handle('test-proxy-latency', async (e, proxyStr) => {
    const tempPort = await getPort(); const tempConfigPath = path.join(app.getPath('userData'), `test_config_${tempPort}.json`);
    try {
        let outbound; try { const { parseProxyLink } = require('./utils'); outbound = parseProxyLink(proxyStr, "proxy_test"); } catch (err) { return { success: false, msg: "Format Err" }; }
        const config = { log: { loglevel: "none" }, inbounds: [{ port: tempPort, listen: "127.0.0.1", protocol: "socks", settings: { udp: true } }], outbounds: [outbound, { protocol: "freedom", tag: "direct" }], routing: { rules: [{ type: "field", outboundTag: "proxy_test", port: "0-65535" }] } };
        await fs.writeJson(tempConfigPath, config);
        const xrayProcess = spawn(BIN_PATH, ['-c', tempConfigPath], { cwd: BIN_DIR, env: { ...process.env, 'XRAY_LOCATION_ASSET': BIN_DIR }, stdio: 'ignore', windowsHide: true });
        await new Promise(r => setTimeout(r, 800));
        const start = Date.now(); const agent = new SocksProxyAgent(`socks5://127.0.0.1:${tempPort}`);
        const result = await new Promise((resolve) => {
            const req = http.get('http://cp.cloudflare.com/generate_204', { agent, timeout: 5000 }, (res) => {
                const latency = Date.now() - start; if (res.statusCode === 204) resolve({ success: true, latency }); else resolve({ success: false, msg: `HTTP ${res.statusCode}` });
            });
            req.on('error', () => resolve({ success: false, msg: "Err" })); req.on('timeout', () => { req.destroy(); resolve({ success: false, msg: "Timeout" }); });
        });
        await forceKill(xrayProcess.pid); try { fs.unlinkSync(tempConfigPath); } catch (e) { } return result;
    } catch (err) { return { success: false, msg: err.message }; }
});
ipcMain.handle('set-title-bar-color', (e, colors) => { const win = BrowserWindow.fromWebContents(e.sender); if (win) { if (process.platform === 'win32') try { win.setTitleBarOverlay({ color: colors.bg, symbolColor: colors.symbol }); } catch (e) { } win.setBackgroundColor(colors.bg); } });
ipcMain.handle('check-app-update', async () => { try { const data = await fetchJson('https://api.github.com/repos/EchoHS/GeekezBrowser/releases/latest'); if (!data || !data.tag_name) return { update: false }; const remote = data.tag_name.replace('v', ''); if (compareVersions(remote, app.getVersion()) > 0) { shell.openExternal(data.html_url); return { update: true, remote }; } return { update: false }; } catch (e) { return { update: false, error: e.message }; } });
ipcMain.handle('check-xray-update', async () => { try { const data = await fetchJson('https://api.github.com/repos/XTLS/Xray-core/releases/latest'); if (!data || !data.tag_name) return { update: false }; const remoteVer = data.tag_name; const currentVer = await getLocalXrayVersion(); if (remoteVer !== currentVer) { let assetName = ''; const arch = os.arch(); const platform = os.platform(); if (platform === 'win32') assetName = `Xray-windows-${arch === 'x64' ? '64' : '32'}.zip`; else if (platform === 'darwin') assetName = `Xray-macos-${arch === 'arm64' ? 'arm64-v8a' : '64'}.zip`; else assetName = `Xray-linux-${arch === 'x64' ? '64' : '32'}.zip`; const downloadUrl = `https://gh-proxy.com/https://github.com/XTLS/Xray-core/releases/download/${remoteVer}/${assetName}`; return { update: true, remote: remoteVer.replace(/^v/, ''), downloadUrl }; } return { update: false }; } catch (e) { return { update: false }; } });
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
        fs.copyFileSync(xrayBinary, BIN_PATH);
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
ipcMain.handle('update-profile', async (event, updatedProfile) => { let profiles = await fs.readJson(PROFILES_FILE); const index = profiles.findIndex(p => p.id === updatedProfile.id); if (index > -1) { profiles[index] = updatedProfile; await fs.writeJson(PROFILES_FILE, profiles); return true; } return false; });
ipcMain.handle('save-profile', async (event, data) => { const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : []; const fingerprint = data.fingerprint || generateFingerprint(); if (data.timezone) fingerprint.timezone = data.timezone; else fingerprint.timezone = "America/Los_Angeles"; const newProfile = { id: uuidv4(), name: data.name, proxyStr: data.proxyStr, tags: data.tags || [], fingerprint: fingerprint, preProxyOverride: 'default', isSetup: false, createdAt: Date.now() }; profiles.push(newProfile); await fs.writeJson(PROFILES_FILE, profiles); return newProfile; });
ipcMain.handle('delete-profile', async (event, id) => { if (activeProcesses[id]) { await forceKill(activeProcesses[id].xrayPid); try { await activeProcesses[id].browser.close(); } catch (e) { } delete activeProcesses[id]; await new Promise(r => setTimeout(r, 500)); } let profiles = await fs.readJson(PROFILES_FILE); profiles = profiles.filter(p => p.id !== id); await fs.writeJson(PROFILES_FILE, profiles); const profileDir = path.join(DATA_PATH, id); const trashDest = path.join(TRASH_PATH, `${id}_${Date.now()}`); try { if (fs.existsSync(profileDir)) fs.renameSync(profileDir, trashDest); } catch (err) { fs.move(profileDir, trashDest).catch(() => { }); } return true; });
ipcMain.handle('get-settings', async () => { if (fs.existsSync(SETTINGS_FILE)) return fs.readJson(SETTINGS_FILE); return { preProxies: [], mode: 'single', enablePreProxy: false }; });
ipcMain.handle('save-settings', async (e, settings) => { await fs.writeJson(SETTINGS_FILE, settings); return true; });
ipcMain.handle('select-extension-folder', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Extension Folder'
    });
    return filePaths && filePaths.length > 0 ? filePaths[0] : null;
});
ipcMain.handle('add-user-extension', async (e, extPath) => {
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
    if (!settings.userExtensions) settings.userExtensions = [];
    if (!settings.userExtensions.includes(extPath)) {
        settings.userExtensions.push(extPath);
        await fs.writeJson(SETTINGS_FILE, settings);
    }
    return true;
});
ipcMain.handle('remove-user-extension', async (e, extPath) => {
    if (!fs.existsSync(SETTINGS_FILE)) return true;
    const settings = await fs.readJson(SETTINGS_FILE);
    if (settings.userExtensions) {
        settings.userExtensions = settings.userExtensions.filter(p => p !== extPath);
        await fs.writeJson(SETTINGS_FILE, settings);
    }
    return true;
});
ipcMain.handle('get-user-extensions', async () => {
    if (!fs.existsSync(SETTINGS_FILE)) return [];
    const settings = await fs.readJson(SETTINGS_FILE);
    return settings.userExtensions || [];
});
ipcMain.handle('open-url', async (e, url) => { await shell.openExternal(url); });
ipcMain.handle('export-data', async (e, type) => { const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : []; const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] }; let exportObj = {}; if (type === 'all' || type === 'profiles') exportObj.profiles = profiles; if (type === 'all' || type === 'proxies') { exportObj.preProxies = settings.preProxies || []; exportObj.subscriptions = settings.subscriptions || []; } if (Object.keys(exportObj).length === 0) return false; const { filePath } = await dialog.showSaveDialog({ title: 'Export Data', defaultPath: `GeekEZ_Backup_${type}_${Date.now()}.yaml`, filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }] }); if (filePath) { await fs.writeFile(filePath, yaml.dump(exportObj)); return true; } return false; });
ipcMain.handle('import-data', async () => { const { filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }] }); if (filePaths && filePaths.length > 0) { try { const content = await fs.readFile(filePaths[0], 'utf8'); const data = yaml.load(content); let updated = false; if (data.profiles || data.preProxies || data.subscriptions) { if (Array.isArray(data.profiles)) { const currentProfiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : []; data.profiles.forEach(p => { const idx = currentProfiles.findIndex(cp => cp.id === p.id); if (idx > -1) currentProfiles[idx] = p; else { if (!p.id) p.id = uuidv4(); currentProfiles.push(p); } }); await fs.writeJson(PROFILES_FILE, currentProfiles); updated = true; } if (Array.isArray(data.preProxies) || Array.isArray(data.subscriptions)) { const currentSettings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] }; if (data.preProxies) { if (!currentSettings.preProxies) currentSettings.preProxies = []; data.preProxies.forEach(p => { if (!currentSettings.preProxies.find(cp => cp.id === p.id)) currentSettings.preProxies.push(p); }); } if (data.subscriptions) { if (!currentSettings.subscriptions) currentSettings.subscriptions = []; data.subscriptions.forEach(s => { if (!currentSettings.subscriptions.find(cs => cs.id === s.id)) currentSettings.subscriptions.push(s); }); } await fs.writeJson(SETTINGS_FILE, currentSettings); updated = true; } } else if (data.name && data.proxyStr && data.fingerprint) { const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : []; const newProfile = { ...data, id: uuidv4(), isSetup: false, createdAt: Date.now() }; profiles.push(newProfile); await fs.writeJson(PROFILES_FILE, profiles); updated = true; } return updated; } catch (e) { console.error(e); throw e; } } return false; });

// --- 核心启动逻辑 ---
ipcMain.handle('launch-profile', async (event, profileId) => {
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

    const profiles = await fs.readJson(PROFILES_FILE);
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) throw new Error('Profile not found');

    if (!profile.fingerprint) profile.fingerprint = generateFingerprint();
    if (!profile.fingerprint.languages) profile.fingerprint.languages = ['en-US', 'en'];

    // Settings
    let settings = { preProxies: [], mode: 'single', enablePreProxy: false };
    if (fs.existsSync(SETTINGS_FILE)) try { settings = await fs.readJson(SETTINGS_FILE); } catch (e) { }
    const override = profile.preProxyOverride || 'default';
    const shouldUsePreProxy = override === 'on' || (override === 'default' && settings.enablePreProxy);
    let finalPreProxyConfig = null;
    let switchMsg = null;
    if (shouldUsePreProxy && settings.preProxies && settings.preProxies.length > 0) {
        const active = settings.preProxies.filter(p => p.enable !== false);
        if (active.length > 0) {
            if (settings.mode === 'single') { const target = active.find(p => p.id === settings.selectedId) || active[0]; finalPreProxyConfig = { preProxies: [target] }; }
            else if (settings.mode === 'balance') { const target = active[Math.floor(Math.random() * active.length)]; finalPreProxyConfig = { preProxies: [target] }; if (settings.notify) switchMsg = `Balance: [${target.remark}]`; }
            else if (settings.mode === 'failover') { const target = active[0]; finalPreProxyConfig = { preProxies: [target] }; if (settings.notify) switchMsg = `Failover: [${target.remark}]`; }
        }
    }

    try {
        const localPort = await getPort();
        const profileDir = path.join(DATA_PATH, profileId);
        const userDataDir = path.join(profileDir, 'browser_data');
        const xrayConfigPath = path.join(profileDir, 'config.json');
        const xrayLogPath = path.join(profileDir, 'xray_run.log');
        fs.ensureDirSync(userDataDir);

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

            // Bookmarks
            const bookmarksPath = path.join(defaultProfileDir, 'Bookmarks');
            const bookmarkData = { "checksum": "0", "roots": { "bookmark_bar": { "children": [{ "date_added": "13245678900000000", "guid": uuidv4(), "id": "1", "name": `🔍 ${profile.name}`, "type": "url", "url": "chrome://newtab/" }], "date_added": "13245678900000000", "date_modified": "0", "id": "1", "name": "Bookmarks Bar", "type": "folder" }, "other": { "children": [], "date_added": "0", "id": "2", "name": "Other Bookmarks", "type": "folder" }, "synced": { "children": [], "date_added": "0", "id": "3", "name": "Mobile Bookmarks", "type": "folder" } }, "version": 1 };
            await fs.writeJson(bookmarksPath, bookmarkData);
        } catch (e) { }

        const config = generateXrayConfig(profile.proxyStr, localPort, finalPreProxyConfig);
        fs.writeJsonSync(xrayConfigPath, config);
        const logFd = fs.openSync(xrayLogPath, 'a');
        const xrayProcess = spawn(BIN_PATH, ['-c', xrayConfigPath], { cwd: BIN_DIR, env: { ...process.env, 'XRAY_LOCATION_ASSET': BIN_DIR }, stdio: ['ignore', logFd, logFd], windowsHide: true });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // 1. 生成 GeekEZ Guard 扩展
        const extPath = await generateExtension(profileDir, profile.fingerprint);

        // 2. 获取用户自定义扩展
        const userExts = settings.userExtensions || [];

        // 3. 合并所有扩展路径
        let extPaths = extPath; // GeekEZ Guard
        if (userExts.length > 0) {
            extPaths += ',' + userExts.join(',');
        }

        // 4. 构建启动参数
        const launchArgs = [
            `--proxy-server=socks5://127.0.0.1:${localPort}`,
            `--user-data-dir=${userDataDir}`,
            `--window-size=${profile.fingerprint?.window?.width || 1280},${profile.fingerprint?.window?.height || 800}`,
            '--restore-last-session',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
            `--lang=${profile.fingerprint.languages[0]}`,
            `--disable-extensions-except=${extPaths}`,
            `--load-extension=${extPaths}`
        ];

        // 5. 启动浏览器
        const chromePath = getChromiumPath();
        if (!chromePath) {
            await forceKill(xrayProcess.pid);
            throw new Error("Chrome binary not found.");
        }

        const browser = await puppeteer.launch({
            headless: false,
            executablePath: chromePath,
            userDataDir: userDataDir,
            args: launchArgs,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation'],
            pipe: false,
            dumpio: false
        });

        activeProcesses[profileId] = { xrayPid: xrayProcess.pid, browser };
        sender.send('profile-status', { id: profileId, status: 'running' });

        browser.on('disconnected', async () => {
            if (activeProcesses[profileId]) {
                const pid = activeProcesses[profileId].xrayPid;
                delete activeProcesses[profileId];
                await forceKill(pid);
                if (!sender.isDestroyed()) sender.send('profile-status', { id: profileId, status: 'stopped' });
            }
        });

        return switchMsg;
    } catch (err) {
        console.error(err);
        throw err;
    }
});

app.on('window-all-closed', () => {
    Object.values(activeProcesses).forEach(p => forceKill(p.xrayPid));
    if (process.platform !== 'darwin') app.quit();
});
// Helpers (Same)
function fetchJson(url) { return new Promise((resolve, reject) => { const req = https.get(url, { headers: { 'User-Agent': 'GeekEZ-Browser' } }, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }); }); req.on('error', reject); }); }
function getLocalXrayVersion() { return new Promise((resolve) => { if (!fs.existsSync(BIN_PATH)) return resolve('v0.0.0'); try { const proc = spawn(BIN_PATH, ['-version']); let output = ''; proc.stdout.on('data', d => output += d.toString()); proc.on('close', () => { const match = output.match(/Xray\s+v?(\d+\.\d+\.\d+)/i); resolve(match ? (match[1].startsWith('v') ? match[1] : 'v' + match[1]) : 'v0.0.0'); }); proc.on('error', () => resolve('v0.0.0')); } catch (e) { resolve('v0.0.0'); } }); }
function compareVersions(v1, v2) { const p1 = v1.split('.').map(Number); const p2 = v2.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((p1[i] || 0) > (p2[i] || 0)) return 1; if ((p1[i] || 0) < (p2[i] || 0)) return -1; } return 0; }
function downloadFile(url, dest) { return new Promise((resolve, reject) => { const file = fs.createWriteStream(dest); https.get(url, (response) => { if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) { downloadFile(response.headers.location, dest).then(resolve).catch(reject); return; } response.pipe(file); file.on('finish', () => file.close(resolve)); }).on('error', (err) => { fs.unlink(dest, () => { }); reject(err); }); }); }
function extractZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
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
    });
}
