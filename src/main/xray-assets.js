const xrayOsNames = Object.freeze({
    darwin: 'macos',
    linux: 'linux',
    win32: 'windows'
});

const xrayArchNames = Object.freeze({
    darwin: Object.freeze({
        arm64: 'arm64-v8a',
        x64: '64'
    }),
    linux: Object.freeze({
        arm64: 'arm64-v8a',
        ia32: '32',
        x64: '64'
    }),
    win32: Object.freeze({
        arm64: 'arm64-v8a',
        ia32: '32',
        x64: '64'
    })
});

function firstArmVersionValue({ env = process.env, processConfig = process.config } = {}) {
    return [
        env.npm_config_arm_version,
        env.NPM_CONFIG_ARM_VERSION,
        processConfig?.variables?.arm_version
    ].find(value => value !== undefined && value !== null && value !== '');
}

function readPositiveInteger(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectArmVersion(options = {}) {
    return readPositiveInteger(firstArmVersionValue(options));
}

function linuxArm32Name(armVersion) {
    if (armVersion === 5) return 'arm32-v5';
    if (armVersion === 6) return 'arm32-v6';
    return 'arm32-v7a';
}

function resolveArchName({ platform, arch, armVersion = detectArmVersion() } = {}) {
    if (platform === 'linux' && arch === 'arm') return linuxArm32Name(armVersion);
    return xrayArchNames[platform]?.[arch] || null;
}

function normalizeXrayTarget({ platform = process.platform, arch = process.arch, armVersion } = {}) {
    const osName = xrayOsNames[platform] || null;
    const archName = resolveArchName({ platform, arch, armVersion });

    return osName && archName ? { osName, archName } : null;
}

function chooseXrayReleaseAsset(options = {}) {
    const target = normalizeXrayTarget(options);
    return target ? `Xray-${target.osName}-${target.archName}.zip` : null;
}

function resolveLinuxXrayAssetName({ arch, armVersion } = {}) {
    return chooseXrayReleaseAsset({ platform: 'linux', arch, armVersion });
}

function resolveXrayAssetName(options = {}) {
    return chooseXrayReleaseAsset(options);
}

module.exports = {
    chooseXrayReleaseAsset,
    detectArmVersion,
    normalizeXrayTarget,
    resolveLinuxXrayAssetName,
    resolveXrayAssetName
};
