const os = require('os');
const fs = require('fs');
const path = require('path');

const RESOLUTIONS = [
    { w: 1920, h: 1080 },
    { w: 2560, h: 1440 },
    { w: 1366, h: 768 },
    { w: 1536, h: 864 },
    { w: 1440, h: 900 }
];

const BROWSER_MAJOR_VERSIONS = Array.from({ length: 19 }, (_, i) => 129 + i); // 129 - 147
const BROWSER_TYPES = ['chrome', 'edge'];
const UTLS_SIGNATURES = [
    'none',
    'chrome',
    'edge',
    'firefox',
    'safari',
    'ios',
    'android',
    'qq',
    '360',
    'random',
    'randomized',
    'hellorandomizednoalpn'
];
const BROWSER_FULL_VERSION_POOL = [
    '147.0.0.0',
    '146.0.0.0',
    '145.0.0.0',
    '144.0.0.0',
    '143.0.0.0',
    '142.0.0.0',
    '141.0.0.0',
    '140.0.0.0',
    '139.0.0.0',
    '138.0.0.0',
    '137.0.0.0',
    '136.0.0.0',
    '135.0.0.0',
    '134.0.0.0',
    '133.0.0.0',
    '132.0.0.0',
    '131.0.0.0',
    '130.0.0.0',
    '129.0.0.0'
];
const BROWSER_FULL_VERSION_BY_MAJOR = BROWSER_FULL_VERSION_POOL.reduce((acc, version) => {
    const major = String(version).split('.')[0];
    if (!acc[major]) acc[major] = [];
    if (!acc[major].includes(version)) acc[major].push(version);
    return acc;
}, {});

const WEBGL_CATALOG = {
    windows: [
        {
            id: 'win_intel_uhd_620',
            vendor: 'Google Inc. (Intel)',
            renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Inc.',
            unmaskedRenderer: 'Intel(R) UHD Graphics 620',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_intel_uhd_630',
            vendor: 'Google Inc. (Intel)',
            renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Inc.',
            unmaskedRenderer: 'Intel(R) UHD Graphics 630',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_intel_iris_xe',
            vendor: 'Google Inc. (Intel)',
            renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Inc.',
            unmaskedRenderer: 'Intel(R) Iris(R) Xe Graphics',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_gtx_1050',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce GTX 1050/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_gtx_1060',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_gtx_1660',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce GTX 1660 SUPER/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_rtx_2060',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 2060/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_rtx_3060',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 3060/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_rtx_3070',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 3070/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_rtx_3080',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 3080/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_rtx_4060',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 4060/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_rtx_4070',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 4070/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_rtx_4080',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 4080/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_amd_rx_580',
            vendor: 'Google Inc. (AMD)',
            renderer: 'ANGLE (AMD, Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'Radeon RX 580 Series',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_amd_rx_6600',
            vendor: 'Google Inc. (AMD)',
            renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX 6600 XT',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_amd_rx_6700',
            vendor: 'Google Inc. (AMD)',
            renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX 6700 XT',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_amd_rx_6800',
            vendor: 'Google Inc. (AMD)',
            renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX 6800 XT',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_amd_vega_8',
            vendor: 'Google Inc. (AMD)',
            renderer: 'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon(TM) Vega 8 Graphics',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_nvidia_1650',
            vendor: 'Google Inc. (NVIDIA)',
            renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F99) Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce GTX 1650/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'win_amd_rx6600',
            vendor: 'Google Inc. (AMD)',
            renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX 6600 XT',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        }
    ],
    mac: [
        {
            id: 'mac_apple_m1',
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
            unmaskedVendor: 'Apple Inc.',
            unmaskedRenderer: 'Apple M1',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'mac_apple_m2',
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
            unmaskedVendor: 'Apple Inc.',
            unmaskedRenderer: 'Apple M2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'mac_apple_m3',
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
            unmaskedVendor: 'Apple Inc.',
            unmaskedRenderer: 'Apple M3',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'mac_apple_m4',
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)',
            unmaskedVendor: 'Apple Inc.',
            unmaskedRenderer: 'Apple M4',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'mac_intel_iris',
            vendor: 'Google Inc. (Intel)',
            renderer: 'Intel Iris OpenGL Engine',
            unmaskedVendor: 'Intel Inc.',
            unmaskedRenderer: 'Intel Iris OpenGL Engine',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'mac_intel_uhd_630',
            vendor: 'Google Inc. (Intel)',
            renderer: 'Intel UHD Graphics 630 OpenGL Engine',
            unmaskedVendor: 'Intel Inc.',
            unmaskedRenderer: 'Intel UHD Graphics 630 OpenGL Engine',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'mac_amd_pro_560x',
            vendor: 'ATI Technologies Inc.',
            renderer: 'AMD Radeon Pro 560X OpenGL Engine',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon Pro 560X OpenGL Engine',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'mac_amd_pro_5500m',
            vendor: 'ATI Technologies Inc.',
            renderer: 'AMD Radeon Pro 5500M OpenGL Engine',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon Pro 5500M OpenGL Engine',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        }
    ],
    linux: [
        {
            id: 'linux_mesa_intel_620',
            vendor: 'Intel Open Source Technology Center',
            renderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_mesa_intel_xe',
            vendor: 'Intel Open Source Technology Center',
            renderer: 'Mesa Intel(R) Xe Graphics (TGL GT2)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) Xe Graphics (TGL GT2)',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_nvidia_1650',
            vendor: 'NVIDIA Corporation',
            renderer: 'NVIDIA GeForce GTX 1650/PCIe/SSE2',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce GTX 1650/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_nvidia_3060',
            vendor: 'NVIDIA Corporation',
            renderer: 'NVIDIA GeForce RTX 3060/PCIe/SSE2',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 3060/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_nvidia_4090',
            vendor: 'NVIDIA Corporation',
            renderer: 'NVIDIA GeForce RTX 4090/PCIe/SSE2',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 4090/PCIe/SSE2',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_mesa_amd_6600',
            vendor: 'X.Org',
            renderer: 'AMD Radeon RX 6600 XT (radeonsi, navi23, LLVM 17.0.6, DRM 3.57, 6.8.0)',
            unmaskedVendor: 'X.Org',
            unmaskedRenderer: 'AMD Radeon RX 6600 XT (radeonsi, navi23, LLVM 17.0.6, DRM 3.57, 6.8.0)',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_mesa_amd_6800',
            vendor: 'X.Org',
            renderer: 'AMD Radeon RX 6800 XT (radeonsi, navi21, LLVM 17.0.6, DRM 3.57, 6.8.0)',
            unmaskedVendor: 'X.Org',
            unmaskedRenderer: 'AMD Radeon RX 6800 XT (radeonsi, navi21, LLVM 17.0.6, DRM 3.57, 6.8.0)',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_mesa_amd',
            vendor: 'X.Org',
            renderer: 'AMD Radeon RX 6600 XT (radeonsi, navi23, LLVM 17.0.6, DRM 3.57, 6.8.0)',
            unmaskedVendor: 'X.Org',
            unmaskedRenderer: 'AMD Radeon RX 6600 XT (radeonsi, navi23, LLVM 17.0.6, DRM 3.57, 6.8.0)',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        },
        {
            id: 'linux_mesa_intel',
            vendor: 'Intel Open Source Technology Center',
            renderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        }
    ]
};

function sanitizeProfileId(input, fallback = 'profile') {
    const clean = String(input || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return clean || fallback;
}

function inferWebglVendorMeta(renderer) {
    const value = String(renderer || '');
    const lower = value.toLowerCase();
    if (lower.includes('apple')) return { vendor: 'Google Inc. (Apple)', unmaskedVendor: 'Apple Inc.' };
    if (lower.includes('nvidia')) return { vendor: 'Google Inc. (NVIDIA)', unmaskedVendor: 'NVIDIA Corporation' };
    if (lower.includes('intel')) return { vendor: 'Google Inc. (Intel)', unmaskedVendor: 'Intel Inc.' };
    if (lower.includes('amd') || lower.includes('radeon') || lower.includes('ati')) return { vendor: 'Google Inc. (AMD)', unmaskedVendor: 'ATI Technologies Inc.' };
    if (lower.includes('mesa') || lower.includes('x.org')) return { vendor: 'X.Org', unmaskedVendor: 'X.Org' };
    return { vendor: 'Google Inc.', unmaskedVendor: 'Google Inc.' };
}

function inferWebglRuntimeBucket(renderer) {
    const value = String(renderer || '').toLowerCase();
    if (value.includes('direct3d')) return 'windows';
    if (value.includes('metal') || value.includes('apple')) return 'mac';
    if (value.includes('mesa') || value.includes('x.org') || value.includes('opengl')) return 'linux';

    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'mac';
    return 'linux';
}

function buildExternalWebglProfile(renderer, index) {
    const meta = inferWebglVendorMeta(renderer);
    const bucket = inferWebglRuntimeBucket(renderer);
    return {
        bucket,
        profile: {
            id: `ext_${bucket}_${sanitizeProfileId(renderer).slice(0, 48)}_${index}`,
            vendor: meta.vendor,
            renderer,
            unmaskedVendor: meta.unmaskedVendor,
            unmaskedRenderer: renderer,
            version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        }
    };
}

function augmentWebglCatalogFromExternalDataset() {
    const datasetDir = ['Virtual', 'Browser'].join('');
    const candidates = [
        path.resolve(process.cwd(), `${datasetDir}/server/src/utils/webgl.json`),
        path.resolve(__dirname, `../../${datasetDir}/server/src/utils/webgl.json`),
        path.resolve(__dirname, `../../../${datasetDir}/server/src/utils/webgl.json`)
    ];

    const sourcePath = candidates.find(p => fs.existsSync(p));
    if (!sourcePath) return;

    try {
        const list = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        if (!Array.isArray(list) || list.length === 0) return;

        const existing = new Set(
            [...WEBGL_CATALOG.windows, ...WEBGL_CATALOG.mac, ...WEBGL_CATALOG.linux]
                .map(item => String(item.renderer || '').trim())
                .filter(Boolean)
        );

        list.forEach((renderer, idx) => {
            const cleanRenderer = String(renderer || '').trim();
            if (!cleanRenderer || existing.has(cleanRenderer)) return;
            const { bucket, profile } = buildExternalWebglProfile(cleanRenderer, idx + 1);
            if (!WEBGL_CATALOG[bucket]) return;
            WEBGL_CATALOG[bucket].push(profile);
            existing.add(cleanRenderer);
        });
    } catch (err) {
        void err;
    }
}

augmentWebglCatalogFromExternalDataset();

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function asNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function resolveRuntimePlatform(explicitPlatform) {
    if (explicitPlatform === 'Win32') return 'windows';
    if (explicitPlatform === 'MacIntel') return 'mac';
    if (explicitPlatform === 'Linux x86_64') return 'linux';

    const platform = os.platform();
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'mac';
    return 'linux';
}

function getPlatformValues(runtimePlatform) {
    if (runtimePlatform === 'windows') {
        return {
            navigatorPlatform: 'Win32',
            uaPlatformToken: 'Windows NT 10.0; Win64; x64',
            uaMetadataPlatform: 'Windows',
            platformVersion: '10.0.0',
            architecture: 'x86',
            bitness: '64'
        };
    }

    if (runtimePlatform === 'mac') {
        return {
            navigatorPlatform: 'MacIntel',
            uaPlatformToken: 'Macintosh; Intel Mac OS X 10_15_7',
            uaMetadataPlatform: 'macOS',
            platformVersion: '13.0.0',
            architecture: 'x86',
            bitness: '64'
        };
    }

    return {
        navigatorPlatform: 'Linux x86_64',
        uaPlatformToken: 'X11; Linux x86_64',
        uaMetadataPlatform: 'Linux',
        platformVersion: '6.0.0',
        architecture: 'x86',
        bitness: '64'
    };
}

function resolveBrowserType(type) {
    return BROWSER_TYPES.includes(type) ? type : getRandom(BROWSER_TYPES);
}

function resolveUaMode(mode) {
    return mode === 'none' ? 'none' : 'spoof';
}

function resolveBrowserMajorVersion(major) {
    const parsed = asNumber(major);
    if (parsed && parsed >= 100 && parsed <= 200) return Math.floor(parsed);
    return getRandom(BROWSER_MAJOR_VERSIONS);
}

function resolveBrowserFullVersion(fullVersion, majorVersion) {
    if (typeof fullVersion === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(fullVersion.trim())) {
        const normalized = fullVersion.trim();
        if (Number(normalized.split('.')[0]) === Number(majorVersion)) {
            return normalized;
        }
    }
    const known = BROWSER_FULL_VERSION_BY_MAJOR[String(majorVersion)];
    if (Array.isArray(known) && known.length > 0) {
        return getRandom(known);
    }
    return `${majorVersion}.0.0.0`;
}

function mapBrowserMajorToUtls(browserType, majorVersion) {
    // Xray supports a limited set of uTLS signatures, so we map major versions to those
    // signatures to keep TLS handshake style closer to the chosen browser family.
    if (browserType === 'edge') {
        if (majorVersion >= 132) return 'edge';
        if (majorVersion >= 126) return 'chrome';
        return 'randomized';
    }

    if (majorVersion >= 134) return 'chrome';
    if (majorVersion >= 128) return 'randomized';
    if (majorVersion >= 123) return 'hellorandomizednoalpn';
    return 'chrome';
}

function resolveTlsClientHello(value, browserType, majorVersion, uaMode) {
    if (uaMode === 'none') return 'none';
    // Keep TLS ClientHello aligned with the selected UA family/version.
    return mapBrowserMajorToUtls(browserType, majorVersion);
}

function buildBrowserBrands(browserType, majorVersion, fullVersion) {
    const browserBrand = browserType === 'edge' ? 'Microsoft Edge' : 'Google Chrome';
    const brands = [
        { brand: 'Not.A/Brand', version: '99' },
        { brand: 'Chromium', version: String(majorVersion) },
        { brand: browserBrand, version: String(majorVersion) }
    ];

    return {
        brands,
        fullVersionList: [
            { brand: 'Not.A/Brand', version: '99.0.0.0' },
            { brand: 'Chromium', version: fullVersion },
            { brand: browserBrand, version: fullVersion }
        ]
    };
}

function buildUserAgent(browserType, fullVersion, uaPlatformToken) {
    const base = `Mozilla/5.0 (${uaPlatformToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVersion} Safari/537.36`;
    if (browserType === 'edge') return `${base} Edg/${fullVersion}`;
    return base;
}

function normalizeLanguages(language, languages) {
    if (Array.isArray(languages) && languages.length > 0) {
        return languages.filter(Boolean).map(v => String(v));
    }

    if (typeof language === 'string' && language && language !== 'auto') {
        const shortLang = language.split('-')[0];
        return shortLang && shortLang !== language ? [language, shortLang] : [language];
    }

    return ['en-US', 'en'];
}

function resolveScreen(screen, width, height) {
    if (screen && asNumber(screen.width) && asNumber(screen.height)) {
        return {
            width: Math.floor(asNumber(screen.width)),
            height: Math.floor(asNumber(screen.height))
        };
    }

    if (asNumber(width) && asNumber(height)) {
        return {
            width: Math.floor(asNumber(width)),
            height: Math.floor(asNumber(height))
        };
    }

    const randomRes = getRandom(RESOLUTIONS);
    return { width: randomRes.w, height: randomRes.h };
}

function getWebglProfilesByRuntime(runtimePlatform) {
    if (runtimePlatform === 'windows') return WEBGL_CATALOG.windows;
    if (runtimePlatform === 'mac') return WEBGL_CATALOG.mac;
    return WEBGL_CATALOG.linux;
}

function resolveWebglProfile(runtimePlatform, requestedProfile, explicitWebgl) {
    if (requestedProfile === 'none') {
        return {
            profileId: 'none',
            disabled: true
        };
    }

    if (explicitWebgl && typeof explicitWebgl === 'object') {
        return {
            profileId: explicitWebgl.profileId || requestedProfile || 'custom',
            disabled: !!explicitWebgl.disabled,
            vendor: explicitWebgl.vendor || 'Google Inc.',
            renderer: explicitWebgl.renderer || 'ANGLE (Unknown GPU)',
            unmaskedVendor: explicitWebgl.unmaskedVendor || explicitWebgl.vendor || 'Google Inc.',
            unmaskedRenderer: explicitWebgl.unmaskedRenderer || explicitWebgl.renderer || 'ANGLE (Unknown GPU)',
            version: explicitWebgl.version || 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            shadingLanguageVersion: explicitWebgl.shadingLanguageVersion || 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'
        };
    }

    const runtimeCatalog = getWebglProfilesByRuntime(runtimePlatform);
    const allCatalog = [...WEBGL_CATALOG.windows, ...WEBGL_CATALOG.mac, ...WEBGL_CATALOG.linux];
    const exact = allCatalog.find(item => item.id === requestedProfile);
    const selected = exact || getRandom(runtimeCatalog);

    return {
        profileId: selected.id,
        vendor: selected.vendor,
        renderer: selected.renderer,
        unmaskedVendor: selected.unmaskedVendor,
        unmaskedRenderer: selected.unmaskedRenderer,
        version: selected.version,
        shadingLanguageVersion: selected.shadingLanguageVersion
    };
}

function buildSecChUa(brands) {
    if (!Array.isArray(brands) || brands.length === 0) return '';
    return brands.map(item => `"${item.brand}";v="${item.version}"`).join(', ');
}

function generateFingerprint(options = {}) {
    const runtimePlatform = resolveRuntimePlatform(options.platform);
    const platformValues = getPlatformValues(runtimePlatform);
    const uaMode = resolveUaMode(options.uaMode);

    const resolvedBrowserType = resolveBrowserType(options.browserType);
    const resolvedBrowserMajorVersion = resolveBrowserMajorVersion(options.browserMajorVersion);
    const resolvedBrowserFullVersion = resolveBrowserFullVersion(options.browserFullVersion, resolvedBrowserMajorVersion);
    const browserType = uaMode === 'none' ? null : resolvedBrowserType;
    const browserMajorVersion = uaMode === 'none' ? null : resolvedBrowserMajorVersion;
    const browserFullVersion = uaMode === 'none' ? null : resolvedBrowserFullVersion;

    const brandInfo = buildBrowserBrands(resolvedBrowserType, resolvedBrowserMajorVersion, resolvedBrowserFullVersion);
    const defaultUaMetadata = {
        brands: brandInfo.brands,
        fullVersionList: brandInfo.fullVersionList,
        mobile: false,
        platform: platformValues.uaMetadataPlatform,
        platformVersion: platformValues.platformVersion,
        architecture: platformValues.architecture,
        bitness: platformValues.bitness,
        model: '',
        wow64: false,
        uaFullVersion: resolvedBrowserFullVersion
    };

    const screen = resolveScreen(options.screen, options.resW, options.resH);
    const hasLanguageOverride = typeof options.language === 'string' && options.language && options.language !== 'auto';
    const language = hasLanguageOverride ? options.language : 'auto';
    const languages = hasLanguageOverride ? normalizeLanguages(language, options.languages) : [];

    const webgl = resolveWebglProfile(runtimePlatform, options.webglProfile || options.webglProfileId, options.webgl);
    const tlsClientHello = resolveTlsClientHello(options.tlsClientHello, resolvedBrowserType, resolvedBrowserMajorVersion, uaMode);
    const userAgentMetadata = uaMode === 'none'
        ? null
        : {
            ...defaultUaMetadata,
            ...(options.userAgentMetadata || {})
        };
    const userAgent = uaMode === 'none'
        ? null
        : (options.userAgent || buildUserAgent(resolvedBrowserType, resolvedBrowserFullVersion, platformValues.uaPlatformToken));

    const fingerprint = {
        uaMode,
        platform: platformValues.navigatorPlatform,
        screen,
        window: { ...screen },
        language,
        languages,
        hardwareConcurrency: asNumber(options.hardwareConcurrency) || getRandom([4, 8, 12, 16]),
        deviceMemory: asNumber(options.deviceMemory) || getRandom([2, 4, 8, 16]),
        canvasNoise: options.canvasNoise || {
            r: randInt(-5, 5),
            g: randInt(-5, 5),
            b: randInt(-5, 5),
            a: randInt(-5, 5)
        },
        audioNoise: typeof options.audioNoise === 'number' ? options.audioNoise : (Math.random() * 0.000001),
        noiseSeed: asNumber(options.noiseSeed) || randInt(1000, 9999999),
        timezone: options.timezone || 'America/Los_Angeles',
        city: options.city || null,
        geolocation: options.geolocation || null,
        browserType,
        browserMajorVersion,
        browserFullVersion,
        userAgent,
        userAgentMetadata,
        secChUa: userAgentMetadata ? buildSecChUa(userAgentMetadata.brands) : '',
        tlsClientHello,
        webgl,
        webglProfile: webgl?.profileId || 'none'
    };

    return fingerprint;
}

function getInjectScript(fp, profileName, watermarkStyle) {
    const normalizedFp = generateFingerprint(fp || {});
    const fpJson = JSON.stringify(normalizedFp);
    const safeProfileName = (profileName || 'Profile').replace(/[<>"'&]/g, '');
    const style = watermarkStyle === 'banner' || watermarkStyle === 'off' ? watermarkStyle : 'enhanced';

    return `
    (function() {
        try {
            const fp = ${fpJson};
            const isGoogleAuthPage = (() => {
                const isAuthHost = (host) => {
                    const value = String(host || '').toLowerCase();
                    return value === 'accounts.google.com' ||
                        value.endsWith('.accounts.google.com') ||
                        value === 'accounts.youtube.com' ||
                        value.endsWith('.accounts.youtube.com');
                };
                try {
                    const host = String(location.hostname || '').toLowerCase();
                    const path = String(location.pathname || '').toLowerCase();
                    if (isAuthHost(host)) return true;
                    if ((host === 'www.google.com' || host === 'google.com') && path.startsWith('/recaptcha/')) return true;
                } catch (e) { }
                try {
                    const ancestors = location.ancestorOrigins;
                    if (ancestors && typeof ancestors.length === 'number') {
                        for (let i = 0; i < ancestors.length; i += 1) {
                            try {
                                if (isAuthHost(new URL(ancestors[i]).hostname)) return true;
                            } catch (e) { }
                        }
                    }
                } catch (e) { }
                try {
                    if (document.referrer && isAuthHost(new URL(document.referrer).hostname)) return true;
                } catch (e) { }
                return false;
            })();
            if (isGoogleAuthPage) return;

            const makeNative = (func, name) => {
                const nativeStr = 'function ' + name + '() { [native code] }';
                Object.defineProperty(func, 'toString', {
                    value: function() { return nativeStr; },
                    configurable: true,
                    writable: true
                });
                Object.defineProperty(func.toString, 'toString', {
                    value: function() { return 'function toString() { [native code] }'; },
                    configurable: true,
                    writable: true
                });
                return func;
            };

            const defineValueGetter = (target, key, value, nativeName) => {
                if (!target) return;
                try {
                    const getter = makeNative(function() { return value; }, nativeName || key);
                    Object.defineProperty(target, key, {
                        get: getter,
                        configurable: true
                    });
                } catch (e) { }
            };

            // --- 1. Basic automation markers cleanup ---
            try {
                defineValueGetter(Navigator.prototype, 'webdriver', false, 'get webdriver');
                const cdcRegex = /cdc_[a-zA-Z0-9]+/;
                Object.keys(window).forEach((key) => {
                    if (cdcRegex.test(key)) {
                        try { delete window[key]; } catch (e) { }
                    }
                });
                ['$cdc_asdjflasutopfhvcZLmcfl_', '$chrome_asyncScriptInfo', 'callPhantom', 'webdriver'].forEach((k) => {
                    if (window[k]) {
                        try { delete window[k]; } catch (e) { }
                    }
                });
                if (!window.chrome) {
                    Object.defineProperty(window, 'chrome', {
                        value: {
                            app: {
                                isInstalled: false,
                                InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
                                RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
                            },
                            runtime: {
                                OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
                                PlatformArch: { ARM: 'arm', ARM64: 'arm64', X86_32: 'x86-32', X86_64: 'x86-64' },
                                PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }
                            }
                        },
                        configurable: false,
                        enumerable: true,
                        writable: true
                    });
                }
            } catch (e) { }

            // --- 2. Screen and hardware fingerprint ---
            if (fp.screen && fp.screen.width && fp.screen.height) {
                const screenWidth = fp.screen.width;
                const screenHeight = fp.screen.height;
                defineValueGetter(screen, 'width', screenWidth, 'get width');
                defineValueGetter(screen, 'height', screenHeight, 'get height');
                defineValueGetter(screen, 'availWidth', screenWidth, 'get availWidth');
                defineValueGetter(screen, 'availHeight', Math.max(0, screenHeight - 40), 'get availHeight');
                defineValueGetter(window, 'outerWidth', screenWidth, 'get outerWidth');
                defineValueGetter(window, 'outerHeight', screenHeight, 'get outerHeight');
            }

            if (fp.hardwareConcurrency) {
                defineValueGetter(Navigator.prototype, 'hardwareConcurrency', fp.hardwareConcurrency, 'get hardwareConcurrency');
            }

            if (fp.deviceMemory) {
                defineValueGetter(Navigator.prototype, 'deviceMemory', fp.deviceMemory, 'get deviceMemory');
            }

            // --- 3. UA and User-Agent Client Hints spoof ---
            const enableUaSpoof = fp.uaMode !== 'none';
            const targetUa = (enableUaSpoof && fp.userAgent) ? fp.userAgent : navigator.userAgent;
            const targetMeta = fp.userAgentMetadata || {};
            const hasLanguageOverride = typeof fp.language === 'string' && fp.language && fp.language !== 'auto';
            const targetLanguage = hasLanguageOverride ? fp.language : (navigator.language || 'en-US');
            const targetLanguages = hasLanguageOverride
                ? (Array.isArray(fp.languages) && fp.languages.length > 0 ? fp.languages : [targetLanguage])
                : (Array.isArray(navigator.languages) && navigator.languages.length > 0 ? navigator.languages : [targetLanguage]);
            const targetPlatform = fp.platform || navigator.platform;

            if (hasLanguageOverride) {
                defineValueGetter(Navigator.prototype, 'language', targetLanguage, 'get language');
                defineValueGetter(Navigator.prototype, 'languages', targetLanguages, 'get languages');
            }

            if (enableUaSpoof) {
                defineValueGetter(Navigator.prototype, 'userAgent', targetUa, 'get userAgent');
                defineValueGetter(Navigator.prototype, 'appVersion', targetUa.startsWith('Mozilla/') ? targetUa.slice('Mozilla/'.length) : targetUa, 'get appVersion');
                defineValueGetter(Navigator.prototype, 'platform', targetPlatform, 'get platform');
                defineValueGetter(Navigator.prototype, 'vendor', 'Google Inc.', 'get vendor');

                const uaDataSnapshot = {
                    brands: Array.isArray(targetMeta.brands) ? targetMeta.brands : [],
                    mobile: !!targetMeta.mobile,
                    platform: targetMeta.platform || (targetPlatform.includes('Mac') ? 'macOS' : (targetPlatform.includes('Win') ? 'Windows' : 'Linux'))
                };

                const highEntropyValues = {
                    architecture: targetMeta.architecture || 'x86',
                    bitness: targetMeta.bitness || '64',
                    model: targetMeta.model || '',
                    platformVersion: targetMeta.platformVersion || '10.0.0',
                    uaFullVersion: targetMeta.uaFullVersion || fp.browserFullVersion || '',
                    wow64: !!targetMeta.wow64,
                    fullVersionList: Array.isArray(targetMeta.fullVersionList) ? targetMeta.fullVersionList : []
                };

                const uaData = {
                    brands: uaDataSnapshot.brands,
                    mobile: uaDataSnapshot.mobile,
                    platform: uaDataSnapshot.platform,
                    getHighEntropyValues: makeNative(async function getHighEntropyValues(hints) {
                        const res = { ...uaDataSnapshot };
                        if (Array.isArray(hints)) {
                            hints.forEach((hint) => {
                                if (Object.prototype.hasOwnProperty.call(highEntropyValues, hint)) {
                                    res[hint] = highEntropyValues[hint];
                                }
                            });
                        }
                        return res;
                    }, 'getHighEntropyValues'),
                    toJSON: makeNative(function toJSON() {
                        return { ...uaDataSnapshot };
                    }, 'toJSON')
                };

                defineValueGetter(Navigator.prototype, 'userAgentData', uaData, 'get userAgentData');
            }

            // --- 4. Geolocation ---
            if (fp.geolocation && typeof fp.geolocation.latitude === 'number' && typeof fp.geolocation.longitude === 'number') {
                const latitude = fp.geolocation.latitude;
                const longitude = fp.geolocation.longitude;
                const accuracy = fp.geolocation.accuracy || (500 + Math.floor(Math.random() * 1000));

                const buildPosition = () => ({
                    coords: {
                        latitude: latitude + (Math.random() - 0.5) * 0.005,
                        longitude: longitude + (Math.random() - 0.5) * 0.005,
                        accuracy,
                        altitude: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null
                    },
                    timestamp: Date.now()
                });

                // Match Location Guard's low-risk shape: leave Geolocation.prototype
                // native and replace only the current navigator.geolocation methods.
                const fakeGetCurrentPosition = function getCurrentPosition(success, error, options) {
                    const position = {
                        ...buildPosition()
                    };
                    setTimeout(() => {
                        if (typeof success === 'function') success(position);
                    }, 12);
                };

                const fakeWatchPosition = function watchPosition(success, error, options) {
                    fakeGetCurrentPosition(success, error, options);
                    return Math.floor(Math.random() * 10000) + 1;
                };

                try {
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition = fakeGetCurrentPosition;
                        navigator.geolocation.watchPosition = fakeWatchPosition;
                        if (typeof navigator.geolocation.clearWatch === 'function') {
                            const originalClearWatch = navigator.geolocation.clearWatch;
                            navigator.geolocation.clearWatch = function clearWatch(watchId) {
                                try {
                                    return originalClearWatch.call(navigator.geolocation, watchId);
                                } catch (e) {
                                    return undefined;
                                }
                            };
                        }
                    }
                } catch (e) { }
            }

            // --- 5. Intl default language alignment ---
            if (hasLanguageOverride) {
                const hookIntlLocaleCtor = (ctorName) => {
                    try {
                        const OriginalCtor = Intl[ctorName];
                        if (typeof OriginalCtor !== 'function') return;
                        const HookedCtor = function(locales, options) {
                            return new OriginalCtor(locales || targetLanguage, options);
                        };
                        HookedCtor.prototype = OriginalCtor.prototype;
                        if (typeof OriginalCtor.supportedLocalesOf === 'function') {
                            HookedCtor.supportedLocalesOf = OriginalCtor.supportedLocalesOf.bind(OriginalCtor);
                        }
                        Intl[ctorName] = makeNative(HookedCtor, ctorName);
                    } catch (e) { }
                };

                [
                    'DateTimeFormat',
                    'NumberFormat',
                    'Collator',
                    'DisplayNames',
                    'ListFormat',
                    'PluralRules',
                    'RelativeTimeFormat',
                    'Segmenter'
                ].forEach(hookIntlLocaleCtor);
            }

            // --- 6. Canvas and Audio noise ---
            try {
                const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                const hookedGetImageData = function getImageData(x, y, w, h) {
                    const imageData = originalGetImageData.apply(this, arguments);
                    if (fp.noiseSeed) {
                        for (let i = 0; i < imageData.data.length; i += 4) {
                            if ((i + fp.noiseSeed) % 53 === 0) {
                                const noise = fp.canvasNoise ? (fp.canvasNoise.a || 0) : 0;
                                imageData.data[i + 3] = Math.max(0, Math.min(255, imageData.data[i + 3] + noise));
                            }
                        }
                    }
                    return imageData;
                };
                CanvasRenderingContext2D.prototype.getImageData = makeNative(hookedGetImageData, 'getImageData');
            } catch (e) { }

            try {
                const originalGetChannelData = AudioBuffer.prototype.getChannelData;
                const hookedGetChannelData = function getChannelData(channel) {
                    const results = originalGetChannelData.apply(this, arguments);
                    const noise = fp.audioNoise || 0.0000001;
                    for (let i = 0; i < 100 && i < results.length; i++) {
                        results[i] = results[i] + noise;
                    }
                    return results;
                };
                AudioBuffer.prototype.getChannelData = makeNative(hookedGetChannelData, 'getChannelData');
            } catch (e) { }

            // --- 7. WebGL spoof ---
            const enableWebglSpoof = !!(fp.webgl && !fp.webgl.disabled && fp.webglProfile !== 'none');
            if (enableWebglSpoof || enableUaSpoof) {
            const webglInfo = fp.webgl || {};
            const PATCHED_WEBGL_PROTO_KEY = '__geekezWebglPatched__';
            const debugExt = {
                UNMASKED_VENDOR_WEBGL: 37445,
                UNMASKED_RENDERER_WEBGL: 37446
            };
            const deriveWebglCaps = () => {
                const renderer = String(webglInfo.unmaskedRenderer || webglInfo.renderer || '').toLowerCase();
                const vendor = String(webglInfo.unmaskedVendor || webglInfo.vendor || '').toLowerCase();
                const isApple = renderer.includes('apple') || vendor.includes('apple');
                const isNvidia = renderer.includes('nvidia') || vendor.includes('nvidia');
                const isAmd = renderer.includes('amd') || renderer.includes('radeon') || vendor.includes('ati');
                const isIntel = renderer.includes('intel') || vendor.includes('intel');

                let textureSize = 16384;
                let renderbufferSize = 16384;
                let vertexUniforms = 1024;
                let fragmentUniforms = 1024;
                let varyingVectors = 30;
                let vertexAttribs = 16;

                if (isApple || isNvidia || isAmd) {
                    textureSize = 32768;
                    renderbufferSize = 32768;
                    vertexUniforms = 4096;
                    fragmentUniforms = 2048;
                    varyingVectors = 32;
                } else if (isIntel) {
                    textureSize = 16384;
                    renderbufferSize = 16384;
                    vertexUniforms = 2048;
                    fragmentUniforms = 1024;
                    varyingVectors = 30;
                }

                return {
                    3379: textureSize, // MAX_TEXTURE_SIZE
                    34076: textureSize, // MAX_CUBE_MAP_TEXTURE_SIZE
                    34024: renderbufferSize, // MAX_RENDERBUFFER_SIZE
                    34921: vertexAttribs, // MAX_VERTEX_ATTRIBS
                    34930: 16, // MAX_TEXTURE_IMAGE_UNITS
                    35660: 16, // MAX_VERTEX_TEXTURE_IMAGE_UNITS
                    35661: 32, // MAX_COMBINED_TEXTURE_IMAGE_UNITS
                    36347: vertexUniforms, // MAX_VERTEX_UNIFORM_VECTORS
                    36348: varyingVectors, // MAX_VARYING_VECTORS
                    36349: fragmentUniforms, // MAX_FRAGMENT_UNIFORM_VECTORS
                    3386: new Int32Array([textureSize, textureSize]), // MAX_VIEWPORT_DIMS
                    33901: new Float32Array([1, 1024]), // ALIASED_POINT_SIZE_RANGE
                    33902: new Float32Array([1, 1]), // ALIASED_LINE_WIDTH_RANGE
                    34852: 8, // MAX_DRAW_BUFFERS
                    36063: 8 // MAX_COLOR_ATTACHMENTS
                };
            };
            const webglCaps = deriveWebglCaps();
            const cloneCapValue = (value) => {
                if (value instanceof Int32Array) return new Int32Array(value);
                if (value instanceof Float32Array) return new Float32Array(value);
                if (Array.isArray(value)) return value.slice();
                return value;
            };

            const hookWebGLPrototype = (proto) => {
                if (!proto || proto[PATCHED_WEBGL_PROTO_KEY]) return;
                try {
                    const originalGetParameter = proto.getParameter;
                    const originalGetExtension = proto.getExtension;
                    const originalGetSupportedExtensions = proto.getSupportedExtensions;

                    const hookedGetParameter = function getParameter(param) {
                        if (param === 37445) return webglInfo.unmaskedVendor || webglInfo.vendor || 'Google Inc.';
                        if (param === 37446) return webglInfo.unmaskedRenderer || webglInfo.renderer || 'ANGLE (Unknown GPU)';
                        if (param === 7936) return webglInfo.vendor || 'Google Inc.';
                        if (param === 7937) return webglInfo.renderer || 'ANGLE (Unknown GPU)';
                        if (param === 7938) return webglInfo.version || 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
                        if (param === 35724) return webglInfo.shadingLanguageVersion || 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
                        if (Object.prototype.hasOwnProperty.call(webglCaps, param)) return cloneCapValue(webglCaps[param]);
                        return originalGetParameter.apply(this, arguments);
                    };

                    const hookedGetExtension = function getExtension(name) {
                        if (name === 'WEBGL_debug_renderer_info') return debugExt;
                        return originalGetExtension.apply(this, arguments);
                    };

                    const hookedGetSupportedExtensions = function getSupportedExtensions() {
                        const list = originalGetSupportedExtensions ? originalGetSupportedExtensions.apply(this, arguments) : [];
                        if (Array.isArray(list) && !list.includes('WEBGL_debug_renderer_info')) {
                            return list.concat(['WEBGL_debug_renderer_info']);
                        }
                        return list;
                    };

                    proto.getParameter = makeNative(hookedGetParameter, 'getParameter');
                    proto.getExtension = makeNative(hookedGetExtension, 'getExtension');
                    if (originalGetSupportedExtensions) {
                        proto.getSupportedExtensions = makeNative(hookedGetSupportedExtensions, 'getSupportedExtensions');
                    }
                    Object.defineProperty(proto, PATCHED_WEBGL_PROTO_KEY, {
                        value: true,
                        configurable: true
                    });
                } catch (e) { }
            };

            const patchContextIfNeeded = (context) => {
                if (!context || typeof context !== 'object') return context;
                try {
                    hookWebGLPrototype(Object.getPrototypeOf(context));
                } catch (e) { }
                return context;
            };

            const hookCanvasContextFactory = (canvasProto) => {
                if (!canvasProto || !canvasProto.getContext) return;
                try {
                    const originalGetContext = canvasProto.getContext;
                    canvasProto.getContext = makeNative(function getContext(type) {
                        const context = originalGetContext.apply(this, arguments);
                        const name = String(type || '').toLowerCase();
                        if (name === 'webgl' || name === 'experimental-webgl' || name === 'webgl2') {
                            return patchContextIfNeeded(context);
                        }
                        return context;
                    }, 'getContext');
                } catch (e) { }
            };

            if (enableWebglSpoof) {
                hookWebGLPrototype(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
                hookWebGLPrototype(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);
                hookCanvasContextFactory(window.HTMLCanvasElement && window.HTMLCanvasElement.prototype);
                hookCanvasContextFactory(window.OffscreenCanvas && window.OffscreenCanvas.prototype);
            }

            // --- 7.1 WebGPU alignment ---
            // Some detectors compare WebGL renderer with WebGPU adapter info.
            // Keep WebGPU adapter metadata aligned with selected WebGL profile.
            const patchGpuAdapter = (gpuObj) => {
                if (!gpuObj || typeof gpuObj.requestAdapter !== 'function') return;
                try {
                    const rendererText = String(webglInfo.unmaskedRenderer || webglInfo.renderer || '');
                    const vendorText = String(webglInfo.unmaskedVendor || webglInfo.vendor || '');
                    const lowerRenderer = rendererText.toLowerCase();
                    const lowerVendor = vendorText.toLowerCase();

                    const guessVendor = () => {
                        if (lowerVendor.includes('apple') || lowerRenderer.includes('apple')) return 'Apple';
                        if (lowerVendor.includes('nvidia') || lowerRenderer.includes('nvidia')) return 'NVIDIA';
                        if (lowerVendor.includes('intel') || lowerRenderer.includes('intel')) return 'Intel';
                        if (lowerVendor.includes('amd') || lowerVendor.includes('ati') || lowerRenderer.includes('amd') || lowerRenderer.includes('radeon')) return 'AMD';
                        return vendorText || 'Unknown';
                    };

                    const fakeAdapterInfo = Object.freeze({
                        vendor: guessVendor(),
                        architecture: guessVendor(),
                        device: rendererText || 'Generic GPU',
                        description: rendererText || 'Generic GPU Adapter'
                    });

                    const originalRequestAdapter = gpuObj.requestAdapter.bind(gpuObj);
                    const wrapAdapter = (adapter) => {
                        if (!adapter || typeof adapter !== 'object') return adapter;
                        return new Proxy(adapter, {
                            get(target, prop, receiver) {
                                if (prop === 'requestAdapterInfo') {
                                    return makeNative(async function requestAdapterInfo() {
                                        return fakeAdapterInfo;
                                    }, 'requestAdapterInfo');
                                }
                                if (prop === 'info') return fakeAdapterInfo;
                                const value = Reflect.get(target, prop, receiver);
                                return typeof value === 'function' ? value.bind(target) : value;
                            }
                        });
                    };

                    const hookedRequestAdapter = async function requestAdapter(options) {
                        const adapter = await originalRequestAdapter(options);
                        return wrapAdapter(adapter);
                    };

                    try {
                        Object.defineProperty(Object.getPrototypeOf(gpuObj), 'requestAdapter', {
                            value: makeNative(hookedRequestAdapter, 'requestAdapter'),
                            configurable: true,
                            writable: true
                        });
                    } catch (e) {
                        gpuObj.requestAdapter = makeNative(hookedRequestAdapter, 'requestAdapter');
                    }
                } catch (e) { }
            };

            if (enableWebglSpoof) {
                patchGpuAdapter(navigator.gpu);
            }

            // --- 7.2 Worker realm bridge ---
            // BrowserScan/PixelScan can read GPU/UA from dedicated workers.
            // Inject the same spoofing into worker contexts via constructor wrappers.
            try {
                const buildWorkerBootstrap = (sourceUrl, isModule) => {
                    const payload = JSON.stringify({
                        uaMode: fp.uaMode || 'spoof',
                        enableWebglSpoof: enableWebglSpoof,
                        userAgent: targetUa,
                        userAgentMetadata: targetMeta,
                        languageOverrideEnabled: hasLanguageOverride,
                        language: targetLanguage,
                        languages: targetLanguages,
                        platform: targetPlatform,
                        webgl: webglInfo
                    });

                    const workerPatch = function(workerPayload) {
                        try {
                            const makeNative = (func, name) => {
                                const nativeStr = 'function ' + name + '() { [native code] }';
                                try {
                                    Object.defineProperty(func, 'toString', {
                                        value: function() { return nativeStr; },
                                        configurable: true
                                    });
                                } catch (e) { }
                                return func;
                            };

                            const defineGetter = (target, key, value, nativeName) => {
                                if (!target) return;
                                try {
                                    const getter = makeNative(function() { return value; }, nativeName || key);
                                    Object.defineProperty(target, key, { get: getter, configurable: true });
                                } catch (e) { }
                            };

                            const nav = self.navigator || {};
                            const navProto = Object.getPrototypeOf(nav);
                            const hasWorkerLanguageOverride = !!workerPayload.languageOverrideEnabled;
                            const targetLang = hasWorkerLanguageOverride
                                ? (workerPayload.language || 'en-US')
                                : (nav.language || 'en-US');
                            const targetLangs = hasWorkerLanguageOverride
                                ? (Array.isArray(workerPayload.languages) && workerPayload.languages.length > 0
                                    ? workerPayload.languages
                                    : [targetLang])
                                : (Array.isArray(nav.languages) && nav.languages.length > 0 ? nav.languages : [targetLang]);
                            const targetPlatform = workerPayload.platform || '';

                            const enableWorkerUaSpoof = workerPayload.uaMode !== 'none';
                            if (enableWorkerUaSpoof) {
                                defineGetter(navProto, 'userAgent', workerPayload.userAgent || nav.userAgent, 'get userAgent');
                                defineGetter(navProto, 'appVersion', String(workerPayload.userAgent || nav.userAgent || '').replace(/^Mozilla\\//, ''), 'get appVersion');
                                defineGetter(navProto, 'platform', targetPlatform || nav.platform, 'get platform');
                            }
                            if (hasWorkerLanguageOverride) {
                                defineGetter(navProto, 'language', targetLang, 'get language');
                                defineGetter(navProto, 'languages', targetLangs, 'get languages');
                            }

                            if (enableWorkerUaSpoof) {
                                const targetMeta = workerPayload.userAgentMetadata || {};
                                const uaDataSnapshot = {
                                    brands: Array.isArray(targetMeta.brands) ? targetMeta.brands : [],
                                    mobile: !!targetMeta.mobile,
                                    platform: targetMeta.platform || (String(targetPlatform).includes('Mac') ? 'macOS' : (String(targetPlatform).includes('Win') ? 'Windows' : 'Linux'))
                                };
                                const highEntropyValues = {
                                    architecture: targetMeta.architecture || 'x86',
                                    bitness: targetMeta.bitness || '64',
                                    model: targetMeta.model || '',
                                    platformVersion: targetMeta.platformVersion || '10.0.0',
                                    uaFullVersion: targetMeta.uaFullVersion || '',
                                    wow64: !!targetMeta.wow64,
                                    fullVersionList: Array.isArray(targetMeta.fullVersionList) ? targetMeta.fullVersionList : []
                                };
                                const uaData = {
                                    brands: uaDataSnapshot.brands,
                                    mobile: uaDataSnapshot.mobile,
                                    platform: uaDataSnapshot.platform,
                                    getHighEntropyValues: makeNative(async function getHighEntropyValues(hints) {
                                        const out = { ...uaDataSnapshot };
                                        if (Array.isArray(hints)) {
                                            hints.forEach((hint) => {
                                                if (Object.prototype.hasOwnProperty.call(highEntropyValues, hint)) {
                                                    out[hint] = highEntropyValues[hint];
                                                }
                                            });
                                        }
                                        return out;
                                    }, 'getHighEntropyValues'),
                                    toJSON: makeNative(function toJSON() {
                                        return { ...uaDataSnapshot };
                                    }, 'toJSON')
                                };
                                defineGetter(navProto, 'userAgentData', uaData, 'get userAgentData');
                            }

                            if (hasWorkerLanguageOverride) {
                                ['DateTimeFormat', 'NumberFormat', 'Collator', 'DisplayNames', 'ListFormat', 'PluralRules', 'RelativeTimeFormat', 'Segmenter']
                                    .forEach((ctorName) => {
                                        try {
                                            const OriginalCtor = Intl[ctorName];
                                            if (typeof OriginalCtor !== 'function') return;
                                            const HookedCtor = function(locales, options) {
                                                return new OriginalCtor(locales || targetLang, options);
                                            };
                                            HookedCtor.prototype = OriginalCtor.prototype;
                                            if (typeof OriginalCtor.supportedLocalesOf === 'function') {
                                                HookedCtor.supportedLocalesOf = OriginalCtor.supportedLocalesOf.bind(OriginalCtor);
                                            }
                                            Intl[ctorName] = makeNative(HookedCtor, ctorName);
                                        } catch (e) { }
                                    });
                            }

                            const enableWorkerWebglSpoof = !!workerPayload.enableWebglSpoof;
                            if (enableWorkerWebglSpoof) {
                                const workerWebgl = workerPayload.webgl || {};
                                const patchKey = '__geekezWebglPatched__';
                                const debugExt = { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
                                const deriveWorkerCaps = () => {
                                    const renderer = String(workerWebgl.unmaskedRenderer || workerWebgl.renderer || '').toLowerCase();
                                    const vendor = String(workerWebgl.unmaskedVendor || workerWebgl.vendor || '').toLowerCase();
                                    const isApple = renderer.includes('apple') || vendor.includes('apple');
                                    const isNvidia = renderer.includes('nvidia') || vendor.includes('nvidia');
                                    const isAmd = renderer.includes('amd') || renderer.includes('radeon') || vendor.includes('ati');
                                    const isIntel = renderer.includes('intel') || vendor.includes('intel');

                                    let textureSize = 16384;
                                    let renderbufferSize = 16384;
                                    let vertexUniforms = 1024;
                                    let fragmentUniforms = 1024;
                                    let varyingVectors = 30;

                                    if (isApple || isNvidia || isAmd) {
                                        textureSize = 32768;
                                        renderbufferSize = 32768;
                                        vertexUniforms = 4096;
                                        fragmentUniforms = 2048;
                                        varyingVectors = 32;
                                    } else if (isIntel) {
                                        textureSize = 16384;
                                        renderbufferSize = 16384;
                                        vertexUniforms = 2048;
                                        fragmentUniforms = 1024;
                                        varyingVectors = 30;
                                    }

                                    return {
                                        3379: textureSize,
                                        34076: textureSize,
                                        34024: renderbufferSize,
                                        34921: 16,
                                        34930: 16,
                                        35660: 16,
                                        35661: 32,
                                        36347: vertexUniforms,
                                        36348: varyingVectors,
                                        36349: fragmentUniforms,
                                        3386: new Int32Array([textureSize, textureSize]),
                                        33901: new Float32Array([1, 1024]),
                                        33902: new Float32Array([1, 1]),
                                        34852: 8,
                                        36063: 8
                                    };
                                };
                                const workerCaps = deriveWorkerCaps();
                                const cloneWorkerCap = (value) => {
                                    if (value instanceof Int32Array) return new Int32Array(value);
                                    if (value instanceof Float32Array) return new Float32Array(value);
                                    if (Array.isArray(value)) return value.slice();
                                    return value;
                                };
                                const hookProto = (proto) => {
                                    if (!proto || proto[patchKey]) return;
                                    try {
                                        const origGetParameter = proto.getParameter;
                                        const origGetExtension = proto.getExtension;
                                        const origGetSupportedExtensions = proto.getSupportedExtensions;
                                        proto.getParameter = makeNative(function getParameter(param) {
                                            if (param === 37445) return workerWebgl.unmaskedVendor || workerWebgl.vendor || 'Google Inc.';
                                            if (param === 37446) return workerWebgl.unmaskedRenderer || workerWebgl.renderer || 'ANGLE (Unknown GPU)';
                                            if (param === 7936) return workerWebgl.vendor || 'Google Inc.';
                                            if (param === 7937) return workerWebgl.renderer || 'ANGLE (Unknown GPU)';
                                            if (param === 7938) return workerWebgl.version || 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
                                            if (param === 35724) return workerWebgl.shadingLanguageVersion || 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
                                            if (Object.prototype.hasOwnProperty.call(workerCaps, param)) return cloneWorkerCap(workerCaps[param]);
                                            return origGetParameter.apply(this, arguments);
                                        }, 'getParameter');
                                        proto.getExtension = makeNative(function getExtension(name) {
                                            if (name === 'WEBGL_debug_renderer_info') return debugExt;
                                            return origGetExtension.apply(this, arguments);
                                        }, 'getExtension');
                                        if (origGetSupportedExtensions) {
                                            proto.getSupportedExtensions = makeNative(function getSupportedExtensions() {
                                                const list = origGetSupportedExtensions.apply(this, arguments) || [];
                                                if (Array.isArray(list) && !list.includes('WEBGL_debug_renderer_info')) {
                                                    return list.concat(['WEBGL_debug_renderer_info']);
                                                }
                                                return list;
                                            }, 'getSupportedExtensions');
                                        }
                                        Object.defineProperty(proto, patchKey, { value: true, configurable: true });
                                    } catch (e) { }
                                };

                                hookProto(self.WebGLRenderingContext && self.WebGLRenderingContext.prototype);
                                hookProto(self.WebGL2RenderingContext && self.WebGL2RenderingContext.prototype);

                                if (self.OffscreenCanvas && self.OffscreenCanvas.prototype && self.OffscreenCanvas.prototype.getContext) {
                                    try {
                                        const origGetContext = self.OffscreenCanvas.prototype.getContext;
                                        self.OffscreenCanvas.prototype.getContext = makeNative(function getContext(type) {
                                            const ctx = origGetContext.apply(this, arguments);
                                            const name = String(type || '').toLowerCase();
                                            if (name === 'webgl' || name === 'experimental-webgl' || name === 'webgl2') {
                                                try { hookProto(Object.getPrototypeOf(ctx)); } catch (e) { }
                                            }
                                            return ctx;
                                        }, 'getContext');
                                    } catch (e) { }
                                }

                                if (nav.gpu && typeof nav.gpu.requestAdapter === 'function') {
                                    try {
                                        const rendererText = String(workerWebgl.unmaskedRenderer || workerWebgl.renderer || '');
                                        const vendorText = String(workerWebgl.unmaskedVendor || workerWebgl.vendor || '');
                                        const fakeAdapterInfo = Object.freeze({
                                            vendor: vendorText || 'Unknown',
                                            architecture: vendorText || 'Unknown',
                                            device: rendererText || 'Generic GPU',
                                            description: rendererText || 'Generic GPU Adapter'
                                        });
                                        const origRequestAdapter = nav.gpu.requestAdapter.bind(nav.gpu);
                                        const wrapped = async function requestAdapter(options) {
                                            const adapter = await origRequestAdapter(options);
                                            if (!adapter || typeof adapter !== 'object') return adapter;
                                            return new Proxy(adapter, {
                                                get(target, prop, receiver) {
                                                    if (prop === 'requestAdapterInfo') {
                                                        return makeNative(async function requestAdapterInfo() {
                                                            return fakeAdapterInfo;
                                                        }, 'requestAdapterInfo');
                                                    }
                                                    if (prop === 'info') return fakeAdapterInfo;
                                                    const value = Reflect.get(target, prop, receiver);
                                                    return typeof value === 'function' ? value.bind(target) : value;
                                                }
                                            });
                                        };
                                        Object.defineProperty(Object.getPrototypeOf(nav.gpu), 'requestAdapter', {
                                            value: makeNative(wrapped, 'requestAdapter'),
                                            configurable: true,
                                            writable: true
                                        });
                                    } catch (e) { }
                                }
                            }
                        } catch (e) { }
                    };

                    const bootstrap = '(' + workerPatch.toString() + ')(' + payload + ');';
                    if (isModule) {
                        return bootstrap + '\\nimport(' + JSON.stringify(sourceUrl) + ');';
                    }
                    return bootstrap + '\\nimportScripts(' + JSON.stringify(sourceUrl) + ');';
                };

                const wrapWorkerConstructor = (ctorName) => {
                    const OriginalCtor = window[ctorName];
                    if (typeof OriginalCtor !== 'function') return;

                    const HookedCtor = function(scriptURL, optionsOrName) {
                        try {
                            const originalUrl = new URL(String(scriptURL), location.href).href;
                            const isModule = !!(optionsOrName && typeof optionsOrName === 'object' && optionsOrName.type === 'module');
                            const bootstrapCode = buildWorkerBootstrap(originalUrl, isModule);
                            const blob = new Blob([bootstrapCode], { type: 'application/javascript' });
                            const blobUrl = URL.createObjectURL(blob);
                            const worker = new OriginalCtor(blobUrl, optionsOrName);
                            setTimeout(() => {
                                try { URL.revokeObjectURL(blobUrl); } catch (e) { }
                            }, 15000);
                            return worker;
                        } catch (e) {
                            return new OriginalCtor(scriptURL, optionsOrName);
                        }
                    };

                    HookedCtor.prototype = OriginalCtor.prototype;
                    try {
                        Object.defineProperty(window, ctorName, {
                            value: makeNative(HookedCtor, ctorName),
                            configurable: true,
                            writable: true
                        });
                    } catch (e) {
                        window[ctorName] = makeNative(HookedCtor, ctorName);
                    }
                };

                wrapWorkerConstructor('Worker');
                wrapWorkerConstructor('SharedWorker');
            } catch (e) { }
            }

            // --- 8. WebRTC protection ---
            if (window.RTCPeerConnection) {
                const OriginalRTCPeerConnection = window.RTCPeerConnection;
                const HookedRTCPeerConnection = function RTCPeerConnection(config) {
                    const nextConfig = config || {};
                    nextConfig.iceTransportPolicy = 'relay';
                    return new OriginalRTCPeerConnection(nextConfig);
                };
                HookedRTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
                window.RTCPeerConnection = makeNative(HookedRTCPeerConnection, 'RTCPeerConnection');
            }

            // --- 9. Watermark ---
            const watermarkStyle = '${style}';

            function createWatermark() {
                try {
                    if (watermarkStyle === 'off') return;
                    if (document.getElementById('geekez-watermark')) return;
                    if (!document.body) {
                        setTimeout(createWatermark, 50);
                        return;
                    }

                    if (watermarkStyle === 'banner') {
                        const banner = document.createElement('div');
                        banner.id = 'geekez-watermark';
                        banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, rgba(102, 126, 234, 0.5), rgba(118, 75, 162, 0.5)); backdrop-filter: blur(10px); color: white; padding: 5px 20px; text-align: center; font-size: 12px; font-weight: 500; z-index: 2147483647; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; gap: 8px; font-family: monospace;';

                        const icon = document.createElement('span');
                        icon.textContent = '🔹';

                        const text = document.createElement('span');
                        text.textContent = '环境：${safeProfileName}';

                        const closeBtn = document.createElement('button');
                        closeBtn.textContent = '×';
                        closeBtn.style.cssText = 'position: absolute; right: 10px; background: rgba(255,255,255,0.2); border: none; color: white; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1;';
                        closeBtn.onclick = function() { banner.style.display = 'none'; };

                        banner.appendChild(icon);
                        banner.appendChild(text);
                        banner.appendChild(closeBtn);
                        document.body.appendChild(banner);
                    } else {
                        const watermark = document.createElement('div');
                        watermark.id = 'geekez-watermark';
                        watermark.style.cssText = 'position: fixed; bottom: 16px; right: 16px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.5), rgba(118, 75, 162, 0.5)); backdrop-filter: blur(10px); color: white; padding: 10px 16px; border-radius: 8px; font-size: 15px; font-weight: 600; z-index: 2147483647; pointer-events: none; user-select: none; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); display: flex; align-items: center; gap: 8px; font-family: monospace; animation: geekez-pulse 2s ease-in-out infinite;';

                        const icon = document.createElement('span');
                        icon.textContent = '🎯';
                        icon.style.cssText = 'font-size: 18px; animation: geekez-rotate 3s linear infinite;';

                        const text = document.createElement('span');
                        text.textContent = '${safeProfileName}';

                        watermark.appendChild(icon);
                        watermark.appendChild(text);
                        document.body.appendChild(watermark);

                        if (!document.getElementById('geekez-watermark-styles')) {
                            const styleNode = document.createElement('style');
                            styleNode.id = 'geekez-watermark-styles';
                            styleNode.textContent = '@keyframes geekez-pulse { 0%, 100% { box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); } 50% { box-shadow: 0 4px 25px rgba(102, 126, 234, 0.6); } } @keyframes geekez-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                            document.head.appendChild(styleNode);
                        }
                    }
                } catch (e) { }
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', createWatermark);
            } else {
                createWatermark();
            }
        } catch (e) {
            console.error('FP Error', e);
        }
    })();
    `;
}

function getWatermarkScript(profileName, watermarkStyle) {
    const safeProfileName = (profileName || 'Profile').replace(/[<>"'&]/g, '');
    const style = watermarkStyle === 'banner' || watermarkStyle === 'off' ? watermarkStyle : 'enhanced';

    if (style === 'off') {
        return `
        (function() {
            try {
                const watermark = document.getElementById('geekez-watermark');
                if (watermark && watermark.parentNode) {
                    watermark.parentNode.removeChild(watermark);
                }
            } catch (e) { }
        })();
        `;
    }

    return `
    (function() {
        try {
            const isGoogleAuthPage = (() => {
                const isAuthHost = (host) => {
                    const value = String(host || '').toLowerCase();
                    return value === 'accounts.google.com' ||
                        value.endsWith('.accounts.google.com') ||
                        value === 'accounts.youtube.com' ||
                        value.endsWith('.accounts.youtube.com');
                };
                try {
                    const host = String(location.hostname || '').toLowerCase();
                    const path = String(location.pathname || '').toLowerCase();
                    if (isAuthHost(host)) return true;
                    if ((host === 'www.google.com' || host === 'google.com') && path.startsWith('/recaptcha/')) return true;
                } catch (e) { }
                try {
                    const ancestors = location.ancestorOrigins;
                    if (ancestors && typeof ancestors.length === 'number') {
                        for (let i = 0; i < ancestors.length; i += 1) {
                            try {
                                if (isAuthHost(new URL(ancestors[i]).hostname)) return true;
                            } catch (e) { }
                        }
                    }
                } catch (e) { }
                try {
                    if (document.referrer && isAuthHost(new URL(document.referrer).hostname)) return true;
                } catch (e) { }
                return false;
            })();
            if (isGoogleAuthPage) return;
            if (window.__geekezWatermarkBootstrapped__) return;
            window.__geekezWatermarkBootstrapped__ = true;

            const watermarkStyle = ${JSON.stringify(style)};
            const profileLabel = ${JSON.stringify(safeProfileName)};

            function ensureStyleNode() {
                try {
                    if (document.getElementById('geekez-watermark-styles')) return;
                    const styleNode = document.createElement('style');
                    styleNode.id = 'geekez-watermark-styles';
                    styleNode.textContent = '@keyframes geekez-pulse { 0%, 100% { box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); } 50% { box-shadow: 0 4px 25px rgba(102, 126, 234, 0.6); } } @keyframes geekez-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                    (document.head || document.documentElement).appendChild(styleNode);
                } catch (e) { }
            }

            function createWatermark() {
                try {
                    if (document.getElementById('geekez-watermark')) return;
                    if (!document.body) {
                        setTimeout(createWatermark, 50);
                        return;
                    }

                    ensureStyleNode();

                    if (watermarkStyle === 'banner') {
                        const banner = document.createElement('div');
                        banner.id = 'geekez-watermark';
                        banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, rgba(102, 126, 234, 0.5), rgba(118, 75, 162, 0.5)); backdrop-filter: blur(10px); color: white; padding: 5px 20px; text-align: center; font-size: 12px; font-weight: 500; z-index: 2147483647; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; gap: 8px; font-family: monospace;';

                        const icon = document.createElement('span');
                        icon.textContent = '🔹';

                        const text = document.createElement('span');
                        text.textContent = '环境：' + profileLabel;

                        const closeBtn = document.createElement('button');
                        closeBtn.textContent = '×';
                        closeBtn.style.cssText = 'position: absolute; right: 10px; background: rgba(255,255,255,0.2); border: none; color: white; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1;';
                        closeBtn.onclick = function() { banner.style.display = 'none'; };

                        banner.appendChild(icon);
                        banner.appendChild(text);
                        banner.appendChild(closeBtn);
                        document.body.appendChild(banner);
                        return;
                    }

                    const watermark = document.createElement('div');
                    watermark.id = 'geekez-watermark';
                    watermark.style.cssText = 'position: fixed; bottom: 16px; right: 16px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.5), rgba(118, 75, 162, 0.5)); backdrop-filter: blur(10px); color: white; padding: 10px 16px; border-radius: 8px; font-size: 15px; font-weight: 600; z-index: 2147483647; pointer-events: none; user-select: none; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); display: flex; align-items: center; gap: 8px; font-family: monospace; animation: geekez-pulse 2s ease-in-out infinite;';

                    const icon = document.createElement('span');
                    icon.textContent = '🎯';
                    icon.style.cssText = 'font-size: 18px; animation: geekez-rotate 3s linear infinite;';

                    const text = document.createElement('span');
                    text.textContent = profileLabel;

                    watermark.appendChild(icon);
                    watermark.appendChild(text);
                    document.body.appendChild(watermark);
                } catch (e) { }
            }

            function scheduleWatermark() {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', createWatermark, { once: true });
                } else {
                    createWatermark();
                }
                setTimeout(createWatermark, 250);
                setTimeout(createWatermark, 1000);
            }

            scheduleWatermark();

            try {
                const observer = new MutationObserver(() => {
                    if (!document.getElementById('geekez-watermark')) {
                        createWatermark();
                    }
                });
                observer.observe(document.documentElement || document, { childList: true, subtree: true });
            } catch (e) { }
        } catch (e) { }
    })();
    `;
}

export { generateFingerprint, getInjectScript, getWatermarkScript };
