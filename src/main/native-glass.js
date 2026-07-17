const MACOS_NATIVE_GLASS_MAJOR = 26;

function parseMajorVersion(version) {
    const match = String(version || '').trim().match(/^(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
}

function supportsNativeGlass(platform, systemVersion) {
    return platform === 'darwin' && parseMajorVersion(systemVersion) >= MACOS_NATIVE_GLASS_MAJOR;
}

function getMainWindowMaterialOptions(platform, systemVersion) {
    if (supportsNativeGlass(platform, systemVersion)) {
        return {
            backgroundColor: '#00000000',
            titleBarStyle: 'hiddenInset',
            vibrancy: 'under-window',
            visualEffectState: 'active'
        };
    }

    return {
        backgroundColor: '#1e1e2d',
        titleBarStyle: 'hidden'
    };
}

module.exports = {
    MACOS_NATIVE_GLASS_MAJOR,
    parseMajorVersion,
    supportsNativeGlass,
    getMainWindowMaterialOptions
};
