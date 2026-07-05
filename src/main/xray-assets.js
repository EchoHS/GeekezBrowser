const XRAY_OS = new Map([
    ['darwin', 'macos'],
    ['linux', 'linux'],
    ['win32', 'windows']
]);
const XRAY_ARCH = new Map([
    ['arm64', 'arm64-v8a'],
    ['ia32', '32'],
    ['x64', '64']
]);
const toPositiveInt = (value) => {
    const numericValue = Number.parseInt(`${value || ''}`, 10);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }
    return numericValue;
}; // toPositiveInt
const detectArmVersion = ({ env = process.env, processConfig = process.config } = {}) => {
    return toPositiveInt(env.npm_config_arm_version) ||
        toPositiveInt(env.NPM_CONFIG_ARM_VERSION) ||
        toPositiveInt(processConfig?.variables?.arm_version);
}; // detectArmVersion
const resolveLinuxArm32 = (armVersion) => {
    if (armVersion === 5) return 'arm32-v5';
    if (armVersion === 6) return 'arm32-v6';
    return 'arm32-v7a';
}; // resolveLinuxArm32
const resolveArchToken = (platform, arch, armVersion) => {
    if (platform === 'linux' && arch === 'arm') return resolveLinuxArm32(armVersion);
    return XRAY_ARCH.get(arch) || null;
}; // resolveArchToken
const normalizeXrayTarget = ({ platform = process.platform, arch = process.arch, armVersion = detectArmVersion() } = {}) => {
    const osName = XRAY_OS.get(platform) || null;
    const archName = resolveArchToken(platform, arch, armVersion);
    return osName && archName ? { osName, archName } : null;
}; // normalizeXrayTarget
const chooseXrayReleaseAsset = (options = {}) => {
    const target = normalizeXrayTarget(options);
    return target ? `Xray-${target.osName}-${target.archName}.zip` : null;
}; // chooseXrayReleaseAsset
const resolveLinuxXrayAssetName = ({ arch, armVersion } = {}) => chooseXrayReleaseAsset({ platform: 'linux', arch, armVersion });
const resolveXrayAssetName = (options = {}) => chooseXrayReleaseAsset(options);
exports.chooseXrayReleaseAsset = chooseXrayReleaseAsset;
exports.detectArmVersion = detectArmVersion;
exports.normalizeXrayTarget = normalizeXrayTarget;
exports.resolveLinuxXrayAssetName = resolveLinuxXrayAssetName;
exports.resolveXrayAssetName = resolveXrayAssetName;
