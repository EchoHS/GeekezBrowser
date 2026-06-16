const fs = require('fs');
const path = require('path');

const envPathKeys = Object.freeze([
    'GEEKEZ_CHROME_PATH',
    'CHROME_PATH',
    'CHROMIUM_PATH',
    'PUPPETEER_EXECUTABLE_PATH'
]);

const shellExecutableNames = Object.freeze({
    darwin: ['Google Chrome for Testing', 'Google Chrome'],
    linux: ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium', 'chrome'],
    win32: ['chrome.exe', 'chrome']
});

const appBundleExecutables = Object.freeze({
    darwin: path.join('Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    linux: 'chrome',
    win32: 'chrome.exe'
});

const bundleFolderPrefixes = Object.freeze({
    darwin: 'chrome-mac',
    linux: 'chrome-linux',
    win32: 'chrome-win'
});

function uniquePaths(paths) {
    const seen = new Set();
    const result = [];

    for (const item of paths) {
        if (!item || seen.has(item)) continue;
        seen.add(item);
        result.push(item);
    }

    return result;
}

function isLaunchable(filePath, platform = process.platform) {
    if (typeof filePath !== 'string' || filePath.length === 0) return false;

    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return false;
        if (platform !== 'win32') fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch (e) {
        return false;
    }
}

const canLaunch = isLaunchable;

function childDirectories(parentDir) {
    try {
        return fs.readdirSync(parentDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => path.join(parentDir, entry.name));
    } catch (e) {
        return [];
    }
}

function chromeInstallRoots(puppeteerRoot) {
    if (!puppeteerRoot) return [];
    return childDirectories(path.join(puppeteerRoot, 'chrome'))
        .flatMap(releaseDir => childDirectories(releaseDir));
}

function bundledChromeCandidates(puppeteerRoot, platform = process.platform) {
    const executableName = appBundleExecutables[platform];
    const folderPrefix = bundleFolderPrefixes[platform];
    if (!executableName || !folderPrefix) return [];

    const candidates = [];

    for (const installRoot of chromeInstallRoots(puppeteerRoot)) {
        const folder = path.basename(installRoot).toLowerCase();
        if (folder.startsWith(folderPrefix)) candidates.push(path.join(installRoot, executableName));
    }

    return uniquePaths(candidates);
}

function envChromeCandidates(env = process.env) {
    return envPathKeys
        .map(key => env[key])
        .filter(value => typeof value === 'string' && value.length > 0);
}

function pathChromeCandidates(platform = process.platform, env = process.env) {
    const dirs = String(env.PATH || '').split(path.delimiter).filter(Boolean);
    const names = shellExecutableNames[platform] || [];
    const candidates = [];

    for (const name of names) {
        for (const dir of dirs) {
            candidates.push(path.join(dir, name));
            if (platform === 'win32' && !name.toLowerCase().endsWith('.exe')) {
                candidates.push(path.join(dir, `${name}.exe`));
            }
        }
    }

    return uniquePaths(candidates);
}

function chromeExecutablePath(...segments) {
    return path.join(...segments, 'Google', 'Chrome', 'Application', 'chrome.exe');
}

function installedChromeCandidates(platform = process.platform, env = process.env) {
    const home = env.HOME || env.USERPROFILE || '';

    if (platform === 'darwin') {
        return uniquePaths([
            path.join('/Applications', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            path.join('/Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
            home && path.join(home, 'Applications', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            home && path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
        ]);
    }

    if (platform === 'win32') {
        const localAppData = env.LOCALAPPDATA || '';
        const programFiles = env.ProgramW6432 || env.PROGRAMFILES || 'C:\\Program Files';
        const programFilesX86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        return uniquePaths([
            localAppData && chromeExecutablePath(localAppData),
            chromeExecutablePath(programFiles),
            chromeExecutablePath(programFilesX86)
        ]);
    }

    if (platform === 'linux') {
        return [
            ['opt', 'google', 'chrome', 'chrome'],
            ['usr', 'bin', 'google-chrome-stable'],
            ['usr', 'bin', 'google-chrome'],
            ['usr', 'bin', 'chromium-browser'],
            ['usr', 'bin', 'chromium'],
            ['snap', 'bin', 'chromium']
        ].map(parts => path.join('/', ...parts));
    }

    return [];
}

function chromiumSearchGroups({ basePath, puppeteerRoot, platform = process.platform, env = process.env } = {}) {
    const browserBundleRoot = puppeteerRoot || basePath;

    return [
        { source: 'bundled', candidates: bundledChromeCandidates(browserBundleRoot, platform) },
        { source: 'environment', candidates: envChromeCandidates(env) },
        { source: 'path', candidates: pathChromeCandidates(platform, env) },
        { source: 'standard-install', candidates: installedChromeCandidates(platform, env) }
    ];
}

function findChromiumExecutable(options = {}) {
    const platform = options.platform || process.platform;
    const checked = [];

    for (const group of chromiumSearchGroups(options)) {
        for (const candidatePath of group.candidates) {
            const executable = isLaunchable(candidatePath, platform);
            checked.push({ source: group.source, path: candidatePath, executable });
            if (executable) {
                return { executablePath: candidatePath, source: group.source, checked };
            }
        }
    }

    return { executablePath: null, source: null, checked };
}

function resolveChromiumPath(options = {}) {
    return findChromiumExecutable(options).executablePath;
}

function resolvePuppeteerRoot({ isDev, appPath, resourcesPath } = {}) {
    if (isDev) return appPath ? path.join(appPath, 'resources', 'puppeteer') : null;
    return resourcesPath ? path.join(resourcesPath, 'puppeteer') : null;
}

function getChromiumPathDetails({ isDev, appPath, resourcesPath, platform = process.platform, env = process.env } = {}) {
    return findChromiumExecutable({
        puppeteerRoot: resolvePuppeteerRoot({ isDev, appPath, resourcesPath }),
        platform,
        env
    });
}

function getChromiumPath(options = {}) {
    return getChromiumPathDetails(options).executablePath;
}

module.exports = {
    canLaunch,
    findChromiumExecutable,
    getChromiumPath,
    getChromiumPathDetails,
    resolveChromiumPath
};
