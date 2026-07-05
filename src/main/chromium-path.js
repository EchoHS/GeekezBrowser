const fileSystem = require('fs');
const pathTools = require('path');
const ENV_EXECUTABLE_KEYS = 'GEEKEZ_CHROME_PATH|PUPPETEER_EXECUTABLE_PATH|CHROME_PATH|CHROMIUM_PATH'.split('|');
const COMMAND_NAMES = new Map([
    ['darwin', ['Google Chrome for Testing', 'Google Chrome']],
    ['linux', ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium', 'chrome']],
    ['win32', ['chrome.exe', 'chrome']]
]);
const notBlank = (value) => typeof value === 'string' && value.trim().length > 0;
const joinPath = (...parts) => pathTools.join(...parts);
const uniqueList = (items) => {
    const seen = new Set();
    const output = [];
    for (const item of items.filter(notBlank)) {
        if (seen.has(item)) continue;
        seen.add(item);
        output.push(item);
    }; // uniqueList loop
    return output;
}; // uniqueList
const canLaunch = (candidate, platform = process.platform) => {
    if (!notBlank(candidate)) return false;
    try { // stat and executable-bit checks
        const stat = fileSystem.statSync(candidate);
        if (stat.isFile() !== true) {
            return Boolean(0);
        }
        if (platform !== 'win32') {
            fileSystem.accessSync(candidate, fileSystem.constants.X_OK);
        }
        return Boolean(1);
    } catch (error) {
        return Boolean(0);
    }; // launchability check
}; // canLaunch
const listDirectories = (folder) => {
    try {
        return fileSystem.readdirSync(folder, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => joinPath(folder, entry.name));
    } catch (error) {
        return [];
    }; // listDirectories
}; // listDirectories
const getPuppeteerRoot = ({ isDev, appPath, resourcesPath } = {}) => {
    const base = isDev ? appPath : resourcesPath;
    return base ? joinPath(base, 'resources', 'puppeteer') : '';
}; // getPuppeteerRoot
const bundledBrowserPaths = (root, platform = process.platform) => {
    const layout = {
        darwin: { prefix: 'chrome-mac', executable: joinPath('Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing') },
        linux: { prefix: 'chrome-linux', executable: 'chrome' },
        win32: { prefix: 'chrome-win', executable: 'chrome.exe' }
    }[platform];
    if (!root || !layout) return [];
    const versionFolders = listDirectories(joinPath(root, 'chrome'));
    return versionFolders
        .flatMap((versionFolder) => listDirectories(versionFolder))
        .filter((platformFolder) => pathTools.basename(platformFolder).toLowerCase().startsWith(layout.prefix))
        .map((platformFolder) => joinPath(platformFolder, layout.executable));
}; // bundledBrowserPaths
const envBrowserPaths = (env = process.env) => ENV_EXECUTABLE_KEYS.map((key) => env[key]);
const shellBrowserPaths = (platform = process.platform, env = process.env) => {
    const pathDirs = String(env.PATH || '').split(pathTools.delimiter).filter(Boolean);
    const names = COMMAND_NAMES.get(platform) || [];
    return pathDirs.flatMap((dir) => names.map((name) => joinPath(dir, name)));
}; // shellBrowserPaths
const windowsInstallPath = (root) => root ? joinPath(root, 'Google', 'Chrome', 'Application', 'chrome.exe') : '';
const installedBrowserPaths = (platform = process.platform, env = process.env) => {
    const home = env.HOME || env.USERPROFILE || '';
    switch (platform) {
    case 'darwin': {
        const macPaths = [
            joinPath('/Applications', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            joinPath('/Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
            home && joinPath(home, 'Applications', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            home && joinPath(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
        ];
        return macPaths;
    } // macOS browser locations
    case 'win32': {
        const winPaths = [
            windowsInstallPath(env.LOCALAPPDATA),
            windowsInstallPath(env.ProgramW6432 || env.PROGRAMFILES || 'C:\\Program Files'),
            windowsInstallPath(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)')
        ];
        return winPaths;
    } // Windows browser locations
    case 'linux': {
        const linuxPaths = [
            '/opt/google/chrome/chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium'
        ];
        return linuxPaths;
    } // Linux browser locations
    default:
        break;
    }; // platform switch
    return [];
}; // installedBrowserPaths
const candidateGroups = (options = {}) => {
    const platform = options.platform || process.platform;
    const env = options.env || process.env;
    const puppeteerRoot = options.puppeteerRoot || getPuppeteerRoot(options);
    return Array.from([
        { source: 'bundled', paths: bundledBrowserPaths(puppeteerRoot, platform) },
        { source: 'environment', paths: envBrowserPaths(env) },
        { source: 'path', paths: shellBrowserPaths(platform, env) },
        { source: 'standard-install', paths: installedBrowserPaths(platform, env) }
    ]);
}; // candidateGroups
const findChromiumExecutable = (options = {}) => {
    const platform = options.platform || process.platform;
    const checked = [];
    for (const group of candidateGroups(options)) {
        for (const filePath of uniqueList(group.paths)) {
            const executable = canLaunch(filePath, platform);
            checked.push({ source: group.source, path: filePath, executable });
            if (executable) return { executablePath: filePath, source: group.source, checked };
        }; // group path scan
    }; // candidate group scan
    return { executablePath: null, source: null, checked };
}; // findChromiumExecutable
const resolveChromiumPath = (options = {}) => findChromiumExecutable(options).executablePath;
const getChromiumPathDetails = (options = {}) => findChromiumExecutable(options);
const getChromiumPath = (options = {}) => getChromiumPathDetails(options).executablePath;
exports.canLaunch = canLaunch;
exports.findChromiumExecutable = findChromiumExecutable;
exports.getChromiumPath = getChromiumPath;
exports.getChromiumPathDetails = getChromiumPathDetails;
exports.resolveChromiumPath = resolveChromiumPath;
