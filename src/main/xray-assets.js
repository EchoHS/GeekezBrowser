function parseArmVersion(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectArmVersion({ env = process.env, processConfig = process.config } = {}) {
    return parseArmVersion(
        env.npm_config_arm_version ||
        env.NPM_CONFIG_ARM_VERSION ||
        processConfig?.variables?.arm_version
    );
}

function resolveLinuxXrayAssetName({ arch, armVersion = detectArmVersion() } = {}) {
    if (arch === 'x64') return 'Xray-linux-64.zip';
    if (arch === 'ia32') return 'Xray-linux-32.zip';
    if (arch === 'arm64') return 'Xray-linux-arm64-v8a.zip';
    if (arch !== 'arm') return null;

    if (armVersion === 5) return 'Xray-linux-arm32-v5.zip';
    if (armVersion === 6) return 'Xray-linux-arm32-v6.zip';

    // Default to v7a when the exact ARM variant is unavailable.
    return 'Xray-linux-arm32-v7a.zip';
}

function resolveXrayAssetName({ platform = process.platform, arch = process.arch, armVersion } = {}) {
    if (platform === 'win32') {
        return `Xray-windows-${arch === 'x64' ? '64' : '32'}.zip`;
    }

    if (platform === 'darwin') {
        return `Xray-macos-${arch === 'arm64' ? 'arm64-v8a' : '64'}.zip`;
    }

    if (platform === 'linux') {
        return resolveLinuxXrayAssetName({ arch, armVersion });
    }

    return null;
}

module.exports = {
    detectArmVersion,
    resolveLinuxXrayAssetName,
    resolveXrayAssetName
};
