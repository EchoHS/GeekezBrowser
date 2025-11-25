const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { exec } = require('child_process');

// 配置：升级到支持 Reality 最好的新版本
const BIN_DIR = path.join(__dirname, 'resources', 'bin');
const XRAY_VERSION = 'v24.11.30'; // 核心修改：升级版本
const GH_PROXY = 'https://gh-proxy.com/'; 

function getPlatformInfo() {
    const platform = os.platform();
    const arch = os.arch();
    let xrayAsset = '';
    let exeName = 'xray';

    if (platform === 'win32') {
        xrayAsset = `Xray-windows-${arch === 'x64' ? '64' : '32'}.zip`;
        exeName = 'xray.exe';
    } else if (platform === 'darwin') {
        xrayAsset = `Xray-macos-${arch === 'arm64' ? 'arm64-v8a' : '64'}.zip`;
    } else if (platform === 'linux') {
        xrayAsset = `Xray-linux-${arch === 'x64' ? '64' : '32'}.zip`;
    } else {
        console.error('❌ Unsupported Platform:', platform);
        process.exit(1);
    }
    return { xrayAsset, exeName };
}

function checkNetwork() {
    return new Promise((resolve) => {
        console.log('🌐 Checking network connectivity...');
        const req = https.get('https://www.google.com', { timeout: 3000 }, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 400);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    });
}

function extractZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
        console.log('📦 Extracting...');
        if (os.platform() === 'win32') {
            exec(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, (err) => {
                if (err) reject(err); else resolve();
            });
        } else {
            exec(`unzip -o "${zipPath}" -d "${destDir}"`, (err) => {
                if (err) reject(err); else resolve();
            });
        }
    });
}

async function main() {
    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

    const { xrayAsset, exeName } = getPlatformInfo();
    
    // 强制覆盖旧版本，确保使用新内核
    const zipPath = path.join(BIN_DIR, 'xray.zip');

    const isGlobal = await checkNetwork();
    console.log(`🌍 Network: ${isGlobal ? 'Global' : 'CN (Mirror)'}`);

    const baseUrl = `https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/${xrayAsset}`;
    const downloadUrl = isGlobal ? baseUrl : (GH_PROXY + baseUrl);

    console.log(`⬇️ Downloading Xray (${XRAY_VERSION})...`);
    
    try {
        await downloadFile(downloadUrl, zipPath);
        await extractZip(zipPath, BIN_DIR);
        fs.unlinkSync(zipPath);
        if (os.platform() !== 'win32') fs.chmodSync(path.join(BIN_DIR, exeName), '755');
        console.log('🎉 Xray Updated Successfully!');
    } catch (error) {
        console.error('❌ Setup Failed:', error.message);
    }
}

main();