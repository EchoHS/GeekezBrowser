const { applyStableCanvasNoise } = require('./canvas-noise');

function getWorkerInjectScript(fp = {}) {
    const uaMode = fp.uaMode || 'none';
    const enableWebglSpoof = !!(fp.webgl && !fp.webgl.disabled && fp.webglProfile !== 'none');
    const payload = {
        uaMode,
        enableWebglSpoof,
        enableCanvasSpoof: uaMode !== 'none' || enableWebglSpoof,
        userAgent: fp.userAgent,
        userAgentMetadata: fp.userAgentMetadata,
        platform: fp.platform,
        hardwareConcurrency: fp.hardwareConcurrency,
        deviceMemory: fp.deviceMemory,
        noiseSeed: fp.noiseSeed,
        canvasNoise: fp.canvasNoise,
        webgl: fp.webgl
    };
    const workerPatch = function(workerPayload) {
        try {
            const nativeFunctionStrings = new WeakMap();
            const originalFunctionToString = Function.prototype.toString;
            const originalToStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, 'toString');
            const patchedFunctionToString = new Proxy(originalFunctionToString, {
                apply(target, thisArg, args) {
                    if (nativeFunctionStrings.has(thisArg)) {
                        return nativeFunctionStrings.get(thisArg);
                    }
                    return Reflect.apply(target, thisArg, args);
                }
            });
            nativeFunctionStrings.set(
                patchedFunctionToString,
                Reflect.apply(originalFunctionToString, originalFunctionToString, [])
            );
            try {
                Object.defineProperty(Function.prototype, 'toString', {
                    ...originalToStringDescriptor,
                    value: patchedFunctionToString
                });
            } catch (e) { }

            const makeNative = (func, name, original) => {
                let nativeStr = 'function ' + name + '() { [native code] }';
                if (typeof original === 'function') {
                    try {
                        nativeStr = Reflect.apply(originalFunctionToString, original, []);
                    } catch (e) { }
                }
                nativeFunctionStrings.set(func, nativeStr);
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
            const targetPlatform = workerPayload.platform || '';

            if (workerPayload.hardwareConcurrency) {
                defineGetter(navProto, 'hardwareConcurrency', workerPayload.hardwareConcurrency, 'get hardwareConcurrency');
            }
            if (workerPayload.deviceMemory) {
                defineGetter(navProto, 'deviceMemory', workerPayload.deviceMemory, 'get deviceMemory');
            }

            if (workerPayload.enableCanvasSpoof) try {
                const contextPrototype = self.OffscreenCanvasRenderingContext2D && self.OffscreenCanvasRenderingContext2D.prototype;
                const offscreenPrototype = self.OffscreenCanvas && self.OffscreenCanvas.prototype;
                const originalGetImageData = contextPrototype && contextPrototype.getImageData;
                const originalPutImageData = contextPrototype && contextPrototype.putImageData;
                const originalOffscreenGetContext = offscreenPrototype && offscreenPrototype.getContext;
                const originalConvertToBlob = offscreenPrototype && offscreenPrototype.convertToBlob;

                if (typeof originalGetImageData === 'function') {
                    const hookedGetImageData = function getImageData(x, y, w, h) {
                        const imageData = originalGetImageData.apply(this, arguments);
                        const canvas = this && this.canvas;
                        applyCanvasNoise(
                            imageData.data,
                            imageData.width,
                            imageData.height,
                            workerPayload.noiseSeed,
                            workerPayload.canvasNoise,
                            x,
                            y,
                            canvas && canvas.width ? canvas.width : imageData.width
                        );
                        return imageData;
                    };
                    contextPrototype.getImageData = makeNative(hookedGetImageData, 'getImageData', originalGetImageData);
                }

                if (
                    typeof originalGetImageData === 'function' &&
                    typeof originalPutImageData === 'function' &&
                    typeof originalOffscreenGetContext === 'function' &&
                    typeof originalConvertToBlob === 'function'
                ) {
                    const hookedConvertToBlob = function convertToBlob() {
                        try {
                            const width = Math.max(0, Number(this && this.width) || 0);
                            const height = Math.max(0, Number(this && this.height) || 0);
                            if (width && height) {
                                const copy = new OffscreenCanvas(width, height);
                                const context = originalOffscreenGetContext.call(copy, '2d', { willReadFrequently: true });
                                if (context) {
                                    context.drawImage(this, 0, 0);
                                    const imageData = originalGetImageData.call(context, 0, 0, width, height);
                                    applyCanvasNoise(
                                        imageData.data,
                                        width,
                                        height,
                                        workerPayload.noiseSeed,
                                        workerPayload.canvasNoise,
                                        0,
                                        0,
                                        width
                                    );
                                    originalPutImageData.call(context, imageData, 0, 0);
                                    return originalConvertToBlob.apply(copy, arguments);
                                }
                            }
                        } catch (e) { }
                        return originalConvertToBlob.apply(this, arguments);
                    };
                    offscreenPrototype.convertToBlob = makeNative(hookedConvertToBlob, 'convertToBlob', originalConvertToBlob);
                }
            } catch (e) { }

            const enableWorkerUaSpoof = workerPayload.uaMode !== 'none';
            if (enableWorkerUaSpoof) {
                defineGetter(navProto, 'userAgent', workerPayload.userAgent || nav.userAgent, 'get userAgent');
                defineGetter(navProto, 'appVersion', String(workerPayload.userAgent || nav.userAgent || '').replace(/^Mozilla\//, ''), 'get appVersion');
                defineGetter(navProto, 'platform', targetPlatform || nav.platform, 'get platform');
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

            const enableWorkerWebglSpoof = !!workerPayload.enableWebglSpoof;
            if (enableWorkerWebglSpoof) {
                const workerWebgl = workerPayload.webgl || {};
                const patchedWebglPrototypes = new WeakSet();
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
                    if (!proto || patchedWebglPrototypes.has(proto)) return;
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
                        patchedWebglPrototypes.add(proto);
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
                        const adapterInfoOverrides = Object.freeze({
                            vendor: vendorText || 'Unknown',
                            architecture: vendorText || 'Unknown',
                            device: rendererText || 'Generic GPU',
                            description: rendererText || 'Generic GPU Adapter'
                        });
                        const origRequestAdapter = nav.gpu.requestAdapter.bind(nav.gpu);
                        const adapterProxies = new WeakMap();
                        const adapterInfoProxies = new WeakMap();
                        const wrapAdapterInfo = (info) => {
                            if (!info || typeof info !== 'object') return info;
                            if (adapterInfoProxies.has(info)) return adapterInfoProxies.get(info);
                            const proxy = new Proxy(info, {
                                get(target, prop) {
                                    if (Object.prototype.hasOwnProperty.call(adapterInfoOverrides, prop)) {
                                        return adapterInfoOverrides[prop];
                                    }
                                    const value = Reflect.get(target, prop, target);
                                    return typeof value === 'function' ? value.bind(target) : value;
                                }
                            });
                            adapterInfoProxies.set(info, proxy);
                            return proxy;
                        };
                        const wrapped = async function requestAdapter(options) {
                            const adapter = await origRequestAdapter(options);
                            if (!adapter || typeof adapter !== 'object') return adapter;
                            if (adapterProxies.has(adapter)) return adapterProxies.get(adapter);
                            const boundMethods = new Map();
                            let requestAdapterInfoWrapper = null;
                            const proxy = new Proxy(adapter, {
                                get(target, prop, receiver) {
                                    if (prop === 'requestAdapterInfo') {
                                        const original = Reflect.get(target, prop, target);
                                        if (typeof original !== 'function') return original;
                                        if (!requestAdapterInfoWrapper) {
                                            requestAdapterInfoWrapper = makeNative(async function requestAdapterInfo() {
                                                const info = await original.apply(target, arguments);
                                                return wrapAdapterInfo(info);
                                            }, 'requestAdapterInfo', original);
                                        }
                                        return requestAdapterInfoWrapper;
                                    }
                                    if (prop === 'info') return wrapAdapterInfo(Reflect.get(target, prop, target));
                                    const value = Reflect.get(target, prop, target);
                                    if (typeof value !== 'function') return value;
                                    if (!boundMethods.has(prop)) boundMethods.set(prop, value.bind(target));
                                    return boundMethods.get(prop);
                                }
                            });
                            adapterProxies.set(adapter, proxy);
                            return proxy;
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
    return '(function() { const applyCanvasNoise = ' + applyStableCanvasNoise.toString() + '; (' + workerPatch.toString() + ')(' + JSON.stringify(payload) + '); })();';
}

async function installWorkerFingerprint(browser, fingerprint, shouldSkipUrl = () => false) {
    const root = await browser.target().createCDPSession();
    const expression = getWorkerInjectScript(fingerprint);
    const pending = new Set();
    const workerTypes = new Set(['worker', 'shared_worker']);
    const childFilter = [{ type: 'worker' }, { type: 'shared_worker' }, { type: 'iframe' }, { exclude: true }];

    const watch = (session, ownerId) => {
        session.on('Target.attachedToTarget', event => {
            const task = prepare(session, event, ownerId);
            pending.add(task);
            void task.finally(() => pending.delete(task));
        });
    };

    const prepare = async (parent, event, ownerId) => {
        const session = parent.connection()?.session(event.sessionId);
        if (!session) return;
        const { targetInfo, waitingForDebugger } = event;
        const nextOwnerId = ['page', 'iframe'].includes(targetInfo.type) ? targetInfo.targetId : ownerId;
        watch(session, nextOwnerId);
        try {
            await session.send('Target.setAutoAttach', {
                autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: childFilter
            });
            if (workerTypes.has(targetInfo.type)) {
                const owner = ownerId
                    ? (await root.send('Target.getTargetInfo', { targetId: ownerId })).targetInfo
                    : targetInfo;
                const sourceUrl = targetInfo.url.replace(/^blob:/, '');
                if (!shouldSkipUrl(owner.url) && !shouldSkipUrl(sourceUrl) &&
                    /^(?:https?:|blob:https?:|data:)/.test(targetInfo.url)) {
                    const result = await session.send('Runtime.evaluate', { expression });
                    if (result.exceptionDetails) throw new Error('Worker fingerprint initialization failed');
                }
            }
        } catch (error) {
            if (!session.detached && browser.connected) {
                console.warn('Worker fingerprint initialization failed:', error.name || 'Error');
            }
        } finally {
            if (waitingForDebugger) await session.send('Runtime.runIfWaitingForDebugger').catch(() => {});
        }
    };

    watch(root);
    try {
        await root.send('Target.setAutoAttach', {
            autoAttach: true,
            waitForDebuggerOnStart: true,
            flatten: true,
            filter: [{ type: 'page' }, { type: 'shared_worker' }, { exclude: true }]
        });
        while (pending.size) await Promise.all([...pending]);
    } catch (error) {
        await root.detach().catch(() => {});
        throw error;
    }
    return root;
}

module.exports = { getWorkerInjectScript, installWorkerFingerprint };
