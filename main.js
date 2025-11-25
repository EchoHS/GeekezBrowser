const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const getPort = require('get-port');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { v4: uuidv4 } = require('uuid');
const yaml = require('js-yaml');
const { SocksProxyAgent } = require('socks-proxy-agent');
const http = require('http');
const https = require('https');
const os = require('os');

// 1. 禁用硬件加速
app.disableHardwareAcceleration();

const { generateXrayConfig } = require('./utils');
const { generateFingerprint } = require('./fingerprint');

puppeteer.use(StealthPlugin());

const isDev = !app.isPackaged;

// 核心路径定义
const BIN_DIR = isDev 
    ? path.join(__dirname, 'resources', 'bin')
    : path.join(process.resourcesPath, 'bin');

const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'xray.exe' : 'xray');

const DATA_PATH = path.join(app.getPath('userData'), 'BrowserProfiles');
const TRASH_PATH = path.join(app.getPath('userData'), '_Trash_Bin');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');
const SETTINGS_FILE = path.join(DATA_PATH, 'settings.json');

fs.ensureDirSync(DATA_PATH);
fs.ensureDirSync(TRASH_PATH);

let activeProcesses = {}; 

// --- 进程管理 ---
function forceKill(pid) {
    return new Promise((resolve) => {
        if (!pid) return resolve();
        try {
            if (process.platform === 'win32') {
                exec(`taskkill /pid ${pid} /T /F`, () => resolve());
            } else {
                process.kill(pid, 'SIGKILL');
                resolve();
            }
        } catch (e) { resolve(); }
    });
}

function getChromiumPath() {
    const basePath = isDev 
        ? path.join(__dirname, 'resources', 'puppeteer')
        : path.join(process.resourcesPath, 'puppeteer');

    if (!fs.existsSync(basePath)) return null;

    function findFile(dir, filename) {
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    const result = findFile(fullPath, filename);
                    if (result) return result;
                } else if (file === filename) {
                    return fullPath;
                }
            }
        } catch (e) { return null; }
        return null;
    }
    const targetName = process.platform === 'win32' ? 'chrome.exe' : 'chrome';
    return findFile(basePath, targetName);
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    const winW = Math.round(screenW * 0.5); 
    const winH = Math.round(screenH * 0.601); 

    const win = new BrowserWindow({
        width: winW, height: winH, minWidth: 800, minHeight: 600,
        title: "GeekEZ Browser", 
        backgroundColor: '#1e1e2d',
        icon: path.join(__dirname, 'icon.png'),
        titleBarOverlay: { color: '#1e1e2d', symbolColor: '#ffffff', height: 35 },
        titleBarStyle: 'hidden', 
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true, nodeIntegration: false, spellcheck: false 
        }
    });
    
    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
    return win;
}

app.whenReady().then(async () => {
    createWindow();
    setTimeout(() => { fs.emptyDir(TRASH_PATH).catch(() => {}); }, 10000); 
});

const createInjectionScript = (fp, profileName) => {
    if (!fp) return "";
    const fpJson = JSON.stringify(fp);
    const nameJson = JSON.stringify(profileName);
    return `
    (() => {
        try {
            const fp = ${fpJson};
            const profileName = ${nameJson};
            const nativeToString = Function.prototype.toString;
            function proxyToString(fn, nativeStr) {
                const toStringProxy = new Proxy(nativeToString, {
                    apply(target, thisArg, args) { if (thisArg === fn) return nativeStr; return target.apply(thisArg, args); }
                });
                Object.defineProperty(fn, 'toString', { value: toStringProxy });
            }
            Object.defineProperty(navigator, 'userAgent', { get: () => fp.userAgent });
            Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });
            const lang = fp.platform.includes('Mac') ? ['en-US', 'en'] : ['en-US', 'en']; 
            Object.defineProperty(navigator, 'languages', { get: () => lang });
            Object.defineProperty(navigator, 'language', { get: () => lang[0] });
            const screenProps = { width: fp.screen.width, height: fp.screen.height, availWidth: fp.screen.width, availHeight: fp.screen.height, colorDepth: 24, pixelDepth: 24 };
            for (const prop in screenProps) { Object.defineProperty(screen.prototype, prop, { get: () => screenProps[prop] }); }
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return fp.webgl.vendor;
                if (parameter === 37446) return fp.webgl.renderer;
                return getParameter.apply(this, arguments);
            };
            proxyToString(WebGLRenderingContext.prototype.getParameter, "function getParameter() { [native code] }");
            const getImageData = CanvasRenderingContext2D.prototype.getImageData;
            CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
                const imageData = getImageData.apply(this, arguments);
                if (fp.noiseSeed) {
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        if ((i + fp.noiseSeed) % 53 === 0) {
                            const noise = fp.canvasNoise ? (fp.canvasNoise.b || 0) : 0;
                            imageData.data[i+2] = Math.min(255, Math.max(0, imageData.data[i+2] + noise));
                        }
                    }
                }
                return imageData;
            };
            proxyToString(CanvasRenderingContext2D.prototype.getImageData, "function getImageData() { [native code] }");
            const toDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type) { return toDataURL.apply(this, arguments); };
            proxyToString(HTMLCanvasElement.prototype.toDataURL, "function toDataURL() { [native code] }");
            const originalGetChannelData = AudioBuffer.prototype.getChannelData;
            AudioBuffer.prototype.getChannelData = function(channel) {
                const results = originalGetChannelData.apply(this, arguments);
                const noise = fp.audioNoise || 0.00001;
                for (let i = 0; i < results.length; i += 100) { results[i] = results[i] + noise; }
                return results;
            };
            proxyToString(AudioBuffer.prototype.getChannelData, "function getChannelData() { [native code] }");
            const updateTitle = () => { if(!document.title.startsWith("[" + profileName + "]")) { document.title = "[" + profileName + "] " + document.title; } };
            setInterval(updateTitle, 1000);
            const badge = document.createElement('div');
            badge.innerText = profileName;
            badge.style.cssText = "position:fixed; bottom:5px; right:5px; opacity:0.6; background:#000; color:#0f0; padding:3px 6px; font-size:11px; z-index:2147483647; pointer-events:none; border-radius:3px; font-family:sans-serif; font-weight:bold;";
            if(document.body) document.body.appendChild(badge);
        } catch(e) {}
    })();
    `;
};

// IPC Handles... (fetch-url, test-proxy-latency, etc. keep same)
ipcMain.handle('fetch-url', async (e, url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (error) { throw error.message; }
});
ipcMain.handle('test-proxy-latency', async (e, proxyStr) => {
    const tempPort = await getPort();
    const tempConfigPath = path.join(app.getPath('userData'), `test_config_${tempPort}.json`);
    try {
        let outbound;
        try { const { parseProxyLink } = require('./utils'); outbound = parseProxyLink(proxyStr, "proxy_test"); } catch (err) { return { success: false, msg: "Format Err" }; }
        const config = { log: { loglevel: "none" }, inbounds: [{ port: tempPort, listen: "127.0.0.1", protocol: "socks", settings: { udp: true } }], outbounds: [outbound, { protocol: "freedom", tag: "direct" }], routing: { rules: [{ type: "field", outboundTag: "proxy_test", port: "0-65535" }] } };
        await fs.writeJson(tempConfigPath, config);
        const xrayProcess = spawn(BIN_PATH, ['-c', tempConfigPath], { 
            cwd: BIN_DIR, 
            env: { ...process.env, 'XRAY_LOCATION_ASSET': BIN_DIR },
            stdio: 'ignore',
            windowsHide: true // 确保测试时也不弹窗
        });
        await new Promise(r => setTimeout(r, 800));
        const start = Date.now();
        const agent = new SocksProxyAgent(`socks5://127.0.0.1:${tempPort}`);
        const result = await new Promise((resolve) => {
            const req = http.get('http://cp.cloudflare.com/generate_204', { agent, timeout: 5000 }, (res) => {
                const latency = Date.now() - start;
                if (res.statusCode === 204) resolve({ success: true, latency }); else resolve({ success: false, msg: `HTTP ${res.statusCode}` });
            });
            req.on('error', () => resolve({ success: false, msg: "Err/Timeout" }));
            req.on('timeout', () => { req.destroy(); resolve({ success: false, msg: "Timeout" }); });
        });
        await forceKill(xrayProcess.pid); 
        try { fs.unlinkSync(tempConfigPath); } catch(e){}
        return result;
    } catch (err) { return { success: false, msg: err.message }; }
});
ipcMain.handle('set-title-bar-color', (e, colors) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
        if (process.platform === 'win32') { try { win.setTitleBarOverlay({ color: colors.bg, symbolColor: colors.symbol }); } catch(e) {} }
        win.setBackgroundColor(colors.bg);
    }
});
ipcMain.handle('check-app-update', async () => {
    const currentVer = app.getVersion();
    try {
        const data = await fetchJson('https://api.github.com/repos/EchoHS/GeekezBrowser/releases/latest');
        if (!data || !data.tag_name) return { update: false };
        const remoteVer = data.tag_name.replace('v', ''); 
        if (compareVersions(remoteVer, currentVer) > 0) { shell.openExternal(data.html_url); return { update: true, remote: remoteVer }; }
        return { update: false };
    } catch (e) { return { update: false, error: e.message }; }
});
ipcMain.handle('check-xray-update', async () => {
    try {
        const data = await fetchJson('https://api.github.com/repos/XTLS/Xray-core/releases/latest');
        if(!data || !data.tag_name) return { update: false };
        const remoteVer = data.tag_name; 
        const currentVer = await getLocalXrayVersion();
        if (remoteVer !== currentVer) {
            let assetName = ''; const arch = os.arch(); const platform = os.platform();
            if (platform === 'win32') assetName = `Xray-windows-${arch==='x64'?'64':'32'}.zip`;
            else if (platform === 'darwin') assetName = `Xray-macos-${arch==='arm64'?'arm64-v8a':'64'}.zip`;
            else assetName = `Xray-linux-${arch==='x64'?'64':'32'}.zip`;
            const downloadUrl = `https://gh-proxy.com/https://github.com/XTLS/Xray-core/releases/download/${remoteVer}/${assetName}`;
            return { update: true, remote: remoteVer, downloadUrl };
        }
        return { update: false };
    } catch (e) { return { update: false }; }
});
ipcMain.handle('download-xray-update', async (e, url) => {
    const zipPath = path.join(path.dirname(BIN_PATH), 'update_xray.zip');
    const destDir = path.dirname(BIN_PATH);
    try {
        await downloadFile(url, zipPath);
        if (process.platform === 'win32') await new Promise((resolve) => exec('taskkill /F /IM xray.exe', () => resolve()));
        activeProcesses = {};
        await new Promise(r => setTimeout(r, 1500));
        await extractZip(zipPath, destDir);
        fs.unlinkSync(zipPath);
        if (process.platform !== 'win32') fs.chmodSync(BIN_PATH, '755');
        return true;
    } catch (e) { try { if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch(err){} return false; }
});
ipcMain.handle('get-running-ids', () => Object.keys(activeProcesses));
ipcMain.handle('get-profiles', async () => { if (!fs.existsSync(PROFILES_FILE)) return []; return fs.readJson(PROFILES_FILE); });
ipcMain.handle('update-profile', async (event, updatedProfile) => {
    let profiles = await fs.readJson(PROFILES_FILE);
    const index = profiles.findIndex(p => p.id === updatedProfile.id);
    if (index > -1) { profiles[index] = updatedProfile; await fs.writeJson(PROFILES_FILE, profiles); return true; }
    return false;
});
ipcMain.handle('save-profile', async (event, data) => {
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const fingerprint = data.fingerprint || generateFingerprint();
    const newProfile = { id: uuidv4(), name: data.name, proxyStr: data.proxyStr, fingerprint: fingerprint, preProxyOverride: 'default', isSetup: false, createdAt: Date.now() };
    profiles.push(newProfile);
    await fs.writeJson(PROFILES_FILE, profiles);
    return newProfile;
});
ipcMain.handle('delete-profile', async (event, id) => {
    if (activeProcesses[id]) {
        await forceKill(activeProcesses[id].xrayPid);
        try { await activeProcesses[id].browser.close(); } catch(e){}
        delete activeProcesses[id];
        await new Promise(r => setTimeout(r, 500)); 
    }
    let profiles = await fs.readJson(PROFILES_FILE);
    profiles = profiles.filter(p => p.id !== id);
    await fs.writeJson(PROFILES_FILE, profiles);
    const profileDir = path.join(DATA_PATH, id);
    const trashDest = path.join(TRASH_PATH, `${id}_${Date.now()}`);
    try { if (fs.existsSync(profileDir)) fs.renameSync(profileDir, trashDest); } 
    catch (err) { fs.move(profileDir, trashDest).catch(() => {}); }
    return true;
});
ipcMain.handle('get-settings', async () => { if (fs.existsSync(SETTINGS_FILE)) return fs.readJson(SETTINGS_FILE); return { preProxies: [], mode: 'single', enablePreProxy: false }; });
ipcMain.handle('save-settings', async (e, settings) => { await fs.writeJson(SETTINGS_FILE, settings); return true; });
ipcMain.handle('open-url', async (e, url) => { await shell.openExternal(url); });
ipcMain.handle('export-data', async (e, type) => {
    const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
    const settings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] };
    let exportObj = {};
    if (type === 'all' || type === 'profiles') exportObj.profiles = profiles;
    if (type === 'all' || type === 'proxies') { exportObj.preProxies = settings.preProxies || []; exportObj.subscriptions = settings.subscriptions || []; }
    if (Object.keys(exportObj).length === 0) return false;
    const { filePath } = await dialog.showSaveDialog({ title: 'Export Data', defaultPath: `GeekEZ_Backup_${type}_${Date.now()}.yaml`, filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }] });
    if (filePath) { await fs.writeFile(filePath, yaml.dump(exportObj)); return true; }
    return false;
});
ipcMain.handle('import-data', async () => {
    const { filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }] });
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
                        if (idx > -1) currentProfiles[idx] = p; else { if(!p.id) p.id = uuidv4(); currentProfiles.push(p); }
                    });
                    await fs.writeJson(PROFILES_FILE, currentProfiles); updated = true;
                }
                if (Array.isArray(data.preProxies) || Array.isArray(data.subscriptions)) {
                    const currentSettings = fs.existsSync(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : { preProxies: [], subscriptions: [] };
                    if(data.preProxies) {
                        if(!currentSettings.preProxies) currentSettings.preProxies = [];
                        data.preProxies.forEach(p => { if(!currentSettings.preProxies.find(cp => cp.id === p.id)) currentSettings.preProxies.push(p); });
                    }
                    if(data.subscriptions) {
                        if(!currentSettings.subscriptions) currentSettings.subscriptions = [];
                        data.subscriptions.forEach(s => { if(!currentSettings.subscriptions.find(cs => cs.id === s.id)) currentSettings.subscriptions.push(s); });
                    }
                    await fs.writeJson(SETTINGS_FILE, currentSettings); updated = true;
                }
            } else if (data.name && data.proxyStr && data.fingerprint) {
                const profiles = fs.existsSync(PROFILES_FILE) ? await fs.readJson(PROFILES_FILE) : [];
                const newProfile = { ...data, id: uuidv4(), isSetup: false, createdAt: Date.now() };
                profiles.push(newProfile);
                await fs.writeJson(PROFILES_FILE, profiles);
                updated = true;
            }
            return updated;
        } catch (e) { console.error(e); throw e; }
    }
    return false;
});

// --- 核心启动逻辑 ---
ipcMain.handle('launch-profile', async (event, profileId) => {
    const sender = event.sender;

    if (activeProcesses[profileId]) {
        const proc = activeProcesses[profileId];
        if (proc.browser && proc.browser.isConnected()) {
            try {
                const pages = await proc.browser.pages();
                if (pages.length > 0) await pages[0].bringToFront();
                return "环境运行中，已唤醒窗口";
            } catch (e) {
                await forceKill(proc.xrayPid);
                delete activeProcesses[profileId];
            }
        } else {
            await forceKill(proc.xrayPid);
            delete activeProcesses[profileId];
        }
    }
    
    await new Promise(resolve => setTimeout(resolve, 800));

    const profiles = await fs.readJson(PROFILES_FILE);
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) throw new Error('Profile not found');
    
    let settings = { preProxies: [], mode: 'single', enablePreProxy: false };
    if (fs.existsSync(SETTINGS_FILE)) try { settings = await fs.readJson(SETTINGS_FILE); } catch(e){}
    const override = profile.preProxyOverride || 'default';
    const shouldUsePreProxy = override === 'on' || (override === 'default' && settings.enablePreProxy);
    let finalPreProxyConfig = null;
    let switchMsg = null;
    
    if (shouldUsePreProxy && settings.preProxies && settings.preProxies.length > 0) {
        const active = settings.preProxies.filter(p => p.enable !== false);
        if (active.length > 0) {
            if (settings.mode === 'single') {
                const target = active.find(p => p.id === settings.selectedId) || active[0];
                finalPreProxyConfig = { preProxies: [target] };
            } else if (settings.mode === 'balance') {
                const target = active[Math.floor(Math.random() * active.length)];
                finalPreProxyConfig = { preProxies: [target] };
                if(settings.notify) switchMsg = `Balance: [${target.remark}]`;
            } else if (settings.mode === 'failover') {
                const target = active[0];
                finalPreProxyConfig = { preProxies: [target] };
                if(settings.notify) switchMsg = `Failover: [${target.remark}]`;
            }
        }
    }

    try {
        const localPort = await getPort({ port: getPort.makeRange(10000, 50000) });
        const profileDir = path.join(DATA_PATH, profileId);
        const userDataDir = path.join(profileDir, 'browser_data');
        const xrayConfigPath = path.join(profileDir, 'config.json');
        const xrayLogPath = path.join(profileDir, 'xray_run.log');
        fs.ensureDirSync(userDataDir);

        // 3. 写入 Preferences (基础设置)
        try {
            const defaultProfileDir = path.join(userDataDir, 'Default');
            fs.ensureDirSync(defaultProfileDir);
            const preferencesPath = path.join(defaultProfileDir, 'Preferences');
            let preferences = {};
            if (fs.existsSync(preferencesPath)) preferences = await fs.readJson(preferencesPath);
            if (!preferences.bookmark_bar) preferences.bookmark_bar = {};
            preferences.bookmark_bar.show_on_all_tabs = true;
            if(preferences.protection) delete preferences.protection;
            await fs.writeJson(preferencesPath, preferences);
        } catch (e) {}

        const config = generateXrayConfig(profile.proxyStr, localPort, finalPreProxyConfig);
        fs.writeJsonSync(xrayConfigPath, config);
        
        // 4. 启动 Xray (核心修复: windowsHide + 独立日志 + 环境变量)
        const logFd = fs.openSync(xrayLogPath, 'a');
        const xrayProcess = spawn(BIN_PATH, ['-c', xrayConfigPath], { 
            cwd: BIN_DIR, 
            env: { ...process.env, 'XRAY_LOCATION_ASSET': BIN_DIR },
            stdio: ['ignore', logFd, logFd],
            windowsHide: true // 核心：隐藏CMD
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        const launchArgs = [
            `--proxy-server=socks5://127.0.0.1:${localPort}`,
            `--user-data-dir=${userDataDir}`,
            `--window-size=${profile.fingerprint?.window?.width || 1280},${profile.fingerprint?.window?.height || 800}`,
            '--no-first-run', '--restore-last-session',
            '--disable-blink-features=AutomationControlled', 
            '--disable-infobars', 
            '--disable-features=IsolateOrigins,site-per-process',
            '--no-sandbox', '--disable-setuid-sandbox'
        ];

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
            pipe: false, dumpio: false 
        });

        // --- 5. 改名逻辑 (核心修复：使用 chrome.send 接口) ---
        if (!profile.isSetup) {
            try {
                // 给浏览器一点启动时间
                await new Promise(r => setTimeout(r, 2500));
                
                const setupPage = await browser.newPage();
                await setupPage.goto('chrome://settings/manageProfile');
                
                // 等待页面加载
                await new Promise(r => setTimeout(r, 1500));
                
                // 使用 Chrome 原生 WebUI 消息接口，绕过 DOM 操作
                await setupPage.evaluate((name) => {
                    if (window.chrome && window.chrome.send) {
                        window.chrome.send('setProfileName', [name]);
                    }
                }, profile.name);
                
                await new Promise(r => setTimeout(r, 500));
                await setupPage.close();

                const allProfiles = await fs.readJson(PROFILES_FILE);
                const idx = allProfiles.findIndex(p => p.id === profileId);
                if (idx > -1) { allProfiles[idx].isSetup = true; await fs.writeJson(PROFILES_FILE, allProfiles); }
            } catch (e) {
                console.warn("Rename failed:", e.message);
            }
        }
        // -----------------------------------------------------

        const injectJs = createInjectionScript(profile.fingerprint, profile.name);
        let pageReady = false;
        let retries = 0;
        while(!pageReady && retries < 15) {
            try {
                const pages = await browser.pages();
                if (pages.length > 0) {
                    await pages[0].evaluateOnNewDocument(injectJs);
                    await new Promise(r => setTimeout(r, 500));
                    await pages[0].reload().catch(()=>{});
                    pageReady = true;
                } else {
                    await new Promise(r => setTimeout(r, 300));
                    retries++;
                }
            } catch(e) {
                await new Promise(r => setTimeout(r, 300));
                retries++;
            }
        }

        browser.on('targetcreated', async (t) => {
            try { const p = await t.page(); if(p) await p.evaluateOnNewDocument(injectJs).catch(()=>{}); } catch(e) {}
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

// Helpers (Keep same as before)
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: {'User-Agent': 'GeekEZ-Browser'} }, (res) => {
            let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        req.on('error', reject);
    });
}
function getLocalXrayVersion() {
    return new Promise((resolve) => {
        if (!fs.existsSync(BIN_PATH)) return resolve('v0.0.0');
        try {
            const proc = spawn(BIN_PATH, ['-version']);
            let output = ''; proc.stdout.on('data', d => output += d.toString());
            proc.on('close', () => {
                const match = output.match(/Xray\s+v?(\d+\.\d+\.\d+)/i);
                resolve(match ? (match[1].startsWith('v')?match[1]:'v'+match[1]) : 'v0.0.0');
            });
            proc.on('error', () => resolve('v0.0.0'));
        } catch(e) { resolve('v0.0.0'); }
    });
}
function compareVersions(v1, v2) {
    const p1 = v1.split('.').map(Number); const p2 = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((p1[i]||0) > (p2[i]||0)) return 1; if ((p1[i]||0) < (p2[i]||0)) return -1; }
    return 0;
}
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject); return;
            }
            response.pipe(file); file.on('finish', () => file.close(resolve));
        }).on('error', (err) => { fs.unlink(dest, ()=>{}); reject(err); });
    });
}
function extractZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
        if (os.platform() === 'win32') {
            exec(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, (err) => { if (err) reject(err); else resolve(); });
        } else {
            exec(`unzip -o "${zipPath}" -d "${destDir}"`, (err) => { if (err) reject(err); else resolve(); });
        }
    });
}