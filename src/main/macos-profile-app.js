import path from 'path';
import crypto from 'crypto';
import fs from 'fs-extra';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MANIFEST_NAME = '.geekez-profile-app.json';
const MANIFEST_VERSION = 3;
const PROFILE_ID_RESOURCE = 'geekez-profile-id';
const REAL_EXECUTABLE_SUFFIX = '.geekez-real';
const LAUNCHER_EXECUTABLE_SUFFIX = '.geekez-launcher';

function stableProfileKey(profileId) {
    return crypto
        .createHash('sha256')
        .update(String(profileId || ''))
        .digest('hex')
        .slice(0, 24);
}

function profileBundleId(profileId) {
    return `com.geekez.browser.profile.p${stableProfileKey(profileId)}`;
}

function sanitizeAppLabel(profileName) {
    const normalized = String(profileName || '')
        .replace(/[\u0000-\u001f/:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const label = normalized || 'Profile';
    return label.slice(0, 60);
}

function findAppBundle(executablePath) {
    let current = path.resolve(String(executablePath || ''));
    while (current && current !== path.dirname(current)) {
        if (current.toLowerCase().endsWith('.app')) return current;
        current = path.dirname(current);
    }
    return null;
}

async function setPlistString(plistPath, key, value) {
    await execFileAsync('/usr/bin/plutil', [
        '-replace', key,
        '-string', String(value),
        plistPath
    ]);
}

function profileExecutablePaths(appPath, executableName) {
    const executablePath = path.join(appPath, 'Contents', 'MacOS', executableName);
    return {
        executablePath,
        realExecutablePath: `${executablePath}${REAL_EXECUTABLE_SUFFIX}`,
        launcherExecutablePath: `${executablePath}${LAUNCHER_EXECUTABLE_SUFFIX}`
    };
}

async function replaceExecutableLink(sourcePath, targetPath) {
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.swap`;
    await fs.remove(temporaryPath);
    try {
        await fs.link(sourcePath, temporaryPath);
        await fs.rename(temporaryPath, targetPath);
    } catch (error) {
        await fs.remove(temporaryPath).catch(() => { });
        throw error;
    }
}

function replaceExecutableLinkSync(sourcePath, targetPath) {
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.swap`;
    try { fs.removeSync(temporaryPath); } catch (e) { }
    try {
        fs.linkSync(sourcePath, temporaryPath);
        fs.renameSync(temporaryPath, targetPath);
    } finally {
        try { fs.removeSync(temporaryPath); } catch (e) { }
    }
}

async function installProfileLauncher(appPath, profileId, executableName) {
    const {
        executablePath,
        realExecutablePath,
        launcherExecutablePath
    } = profileExecutablePaths(appPath, executableName);
    const resourceDir = path.join(appPath, 'Contents', 'Resources');
    const profileIdPath = path.join(resourceDir, PROFILE_ID_RESOURCE);
    const launcherScript = `#!/bin/sh
set -u
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROFILE_ID=$(cat "$SCRIPT_DIR/../Resources/${PROFILE_ID_RESOURCE}")

request_profile() {
    /usr/bin/curl -fsS --max-time 1 -X POST \
        -H "X-GeekEZ-Profile-Shortcut: 1" \
        "http://127.0.0.1:12139/api/profile-shortcut?profileId=$PROFILE_ID" \
        >/dev/null 2>&1
}

if request_profile; then
    exit 0
fi

/usr/bin/open -b com.geekez.browser --args "--geekez-profile=$PROFILE_ID" >/dev/null 2>&1 || true

i=0
while [ "$i" -lt 50 ]; do
    /bin/sleep 0.1
    if request_profile; then
        exit 0
    fi
    i=$((i + 1))
done

exit 0
`;

    await fs.ensureDir(resourceDir);
    await fs.writeFile(profileIdPath, String(profileId), 'utf8');
    if (!await fs.pathExists(realExecutablePath)) {
        await fs.move(executablePath, realExecutablePath, { overwrite: true });
    }
    await fs.writeFile(launcherExecutablePath, launcherScript, { mode: 0o755 });
    await fs.chmod(launcherExecutablePath, 0o755);
    await setPlistString(path.join(appPath, 'Contents', 'Info.plist'), 'CFBundleExecutable', executableName);
    await replaceExecutableLink(launcherExecutablePath, executablePath);
}

async function activateMacProfileChromium(options = {}) {
    const { appPath, executableName } = options;
    if (process.platform !== 'darwin' || !appPath || !executableName) return;
    const { executablePath, realExecutablePath } = profileExecutablePaths(appPath, executableName);
    if (!await fs.pathExists(realExecutablePath)) {
        throw new Error(`Missing preserved Chromium executable: ${realExecutablePath}`);
    }
    await replaceExecutableLink(realExecutablePath, executablePath);
}

async function restoreMacProfileLauncher(options = {}) {
    const { appPath, executableName } = options;
    if (process.platform !== 'darwin' || !appPath || !executableName) return;
    const { executablePath, launcherExecutablePath } = profileExecutablePaths(appPath, executableName);
    if (!await fs.pathExists(launcherExecutablePath)) return;
    await replaceExecutableLink(launcherExecutablePath, executablePath);
}

function restoreMacProfileLauncherSync(options = {}) {
    const { appPath, executableName } = options;
    if (process.platform !== 'darwin' || !appPath || !executableName) return;
    const { executablePath, launcherExecutablePath } = profileExecutablePaths(appPath, executableName);
    if (!fs.pathExistsSync(launcherExecutablePath)) return;
    replaceExecutableLinkSync(launcherExecutablePath, executablePath);
}

async function sourceFingerprint(sourceExecutable, sourceAppPath) {
    const executableStat = await fs.stat(sourceExecutable);
    const plistPath = path.join(sourceAppPath, 'Contents', 'Info.plist');
    const plistStat = await fs.stat(plistPath);
    let resolvedExecutable = sourceExecutable;
    try {
        resolvedExecutable = await fs.realpath(sourceExecutable);
    } catch (e) { }

    return [
        resolvedExecutable,
        `${executableStat.size}:${Math.trunc(executableStat.mtimeMs)}`,
        `${plistStat.size}:${Math.trunc(plistStat.mtimeMs)}`
    ].join('|');
}

async function readManifest(manifestPath) {
    try {
        const value = await fs.readJson(manifestPath);
        return value && typeof value === 'object' ? value : null;
    } catch (e) {
        return null;
    }
}

async function findExistingAppFileName(profileRoot) {
    try {
        const entries = await fs.readdir(profileRoot, { withFileTypes: true });
        const app = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase().endsWith('.app'));
        return app?.name || null;
    } catch (e) {
        return null;
    }
}

async function cloneAppBundle(sourceAppPath, destinationAppPath) {
    const tempAppPath = path.join(
        path.dirname(destinationAppPath),
        `.${path.basename(destinationAppPath, '.app')}.${process.pid}.${Date.now()}.tmp.app`
    );

    await fs.remove(tempAppPath);
    try {
        // macOS /bin/cp -c uses clonefile(2), so every profile gets its own
        // LaunchServices identity without physically duplicating the ~350 MB
        // Chromium bundle on APFS.
        await execFileAsync('/bin/cp', ['-cR', sourceAppPath, tempAppPath]);
        await fs.remove(destinationAppPath);
        await fs.move(tempAppPath, destinationAppPath, { overwrite: true });
    } catch (error) {
        await fs.remove(tempAppPath).catch(() => { });
        throw error;
    }
}

async function updateProfileIdentity(appPath, bundleId, displayName) {
    const plistPath = path.join(appPath, 'Contents', 'Info.plist');
    await setPlistString(plistPath, 'CFBundleIdentifier', bundleId);
    await setPlistString(plistPath, 'CFBundleName', displayName);
    await setPlistString(plistPath, 'CFBundleDisplayName', displayName);
}

async function prepareMacProfileChromium(options = {}) {
    const {
        sourceExecutable,
        profileId,
        profileName,
        rootDir
    } = options;

    if (process.platform !== 'darwin') {
        return { executablePath: sourceExecutable, appPath: null, bundleId: null, reused: true };
    }
    if (!sourceExecutable || !profileId || !rootDir) {
        throw new Error('Missing sourceExecutable, profileId or rootDir for macOS profile app');
    }

    const sourceAppPath = findAppBundle(sourceExecutable);
    if (!sourceAppPath) {
        throw new Error(`Chromium executable is not inside a macOS .app bundle: ${sourceExecutable}`);
    }

    const sourceExecutableName = path.basename(sourceExecutable);
    const bundleId = profileBundleId(profileId);
    const displayName = `GeekEZ - ${sanitizeAppLabel(profileName)}`;
    const profileRoot = path.join(rootDir, stableProfileKey(profileId));
    const manifestPath = path.join(profileRoot, MANIFEST_NAME);
    await fs.ensureDir(profileRoot);

    const manifest = await readManifest(manifestPath);
    const existingAppFileName = manifest?.appFileName || await findExistingAppFileName(profileRoot);
    const appFileName = existingAppFileName || `${displayName}.app`;
    const appPath = path.join(profileRoot, appFileName);
    const executablePath = path.join(appPath, 'Contents', 'MacOS', sourceExecutableName);
    const {
        realExecutablePath,
        launcherExecutablePath
    } = profileExecutablePaths(appPath, sourceExecutableName);
    const profileIdPath = path.join(appPath, 'Contents', 'Resources', PROFILE_ID_RESOURCE);
    const fingerprint = await sourceFingerprint(sourceExecutable, sourceAppPath);

    const sourceMatches = Boolean(
        manifest &&
        manifest.sourceFingerprint === fingerprint &&
        manifest.bundleId === bundleId &&
        await fs.pathExists(executablePath)
    );
    const canReuse = Boolean(
        sourceMatches &&
        manifest.version === MANIFEST_VERSION &&
        await fs.pathExists(realExecutablePath) &&
        await fs.pathExists(launcherExecutablePath) &&
        await fs.pathExists(profileIdPath)
    );

    if (!sourceMatches) {
        await cloneAppBundle(sourceAppPath, appPath);
        await updateProfileIdentity(appPath, bundleId, displayName);
        await installProfileLauncher(appPath, profileId, sourceExecutableName);
    } else if (!canReuse) {
        // Upgrade an already pinned profile app in place while preserving the
        // exact .app path referenced by the Dock item.
        await updateProfileIdentity(appPath, bundleId, displayName);
        await installProfileLauncher(appPath, profileId, sourceExecutableName);
    } else if (manifest.displayName !== displayName) {
        // Keep the .app path stable for an already pinned Dock item, while still
        // updating the visible application metadata after a profile rename.
        await updateProfileIdentity(appPath, bundleId, displayName);
    }

    await fs.writeJson(manifestPath, {
        version: MANIFEST_VERSION,
        appFileName,
        bundleId,
        displayName,
        sourceFingerprint: fingerprint
    }, { spaces: 2 });

    // The pinned app is idle with a launcher at its normal executable path.
    // Just before Puppeteer launches it, swap the real Chromium binary back
    // into that exact path so LaunchServices registers the profile-specific
    // bundle identity rather than GeekEZ's parent identity.
    await activateMacProfileChromium({ appPath, executableName: sourceExecutableName });

    return {
        executablePath,
        appPath,
        bundleId,
        executableName: sourceExecutableName,
        reused: canReuse
    };
}

async function removeMacProfileApp(options = {}) {
    const { profileId, rootDir } = options;
    if (process.platform !== 'darwin' || !profileId || !rootDir) return;
    await fs.remove(path.join(rootDir, stableProfileKey(profileId)));
}

export {
    activateMacProfileChromium,
    findAppBundle,
    installProfileLauncher,
    prepareMacProfileChromium,
    profileBundleId,
    removeMacProfileApp,
    restoreMacProfileLauncher,
    restoreMacProfileLauncherSync,
    sanitizeAppLabel,
    stableProfileKey
};
