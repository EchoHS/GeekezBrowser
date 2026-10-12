document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const list = $('list');
    const editor = $('editor');
    const expiryTimers = new Map();
    let passwords = [];
    let draft = null;
    let isEditing = false;
    let saveBusy = false;
    let qrBusy = false;
    let editorVersion = 0;
    let loadVersion = 0;
    let qrLoader;
    let passkeyState = { enabled: false, error: '', credentials: [], pages: [] };
    let passkeyLoadVersion = 0;
    let passkeyBusy = false;

    function request(type, payload = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, ...payload }, (response) => {
                const runtimeError = chrome.runtime.lastError;
                if (runtimeError) return reject(new Error(runtimeError.message));
                // A previously registered Guard worker may still answer during an upgrade.
                if (type === 'GET_ALL_PASSWORDS' && response?.success === undefined && Array.isArray(response?.passwords)) {
                    return resolve({ ...response, success: true });
                }
                if (!response?.success) return reject(new Error(response?.error || '操作失败，请重试'));
                resolve(response);
            });
        });
    }

    async function requestPasskey(action, payload = {}) {
        const configResponse = await fetch(chrome.runtime.getURL('guard-config.json'), { cache: 'no-store' });
        if (!configResponse.ok) throw new Error('无法读取密码管理器配置');
        const config = await configResponse.json();
        if (typeof config.profileId !== 'string' || !config.profileId ||
            !Number.isInteger(config.apiPort) || config.apiPort < 1 || config.apiPort > 65535 ||
            typeof config.apiToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(config.apiToken)) {
            throw new Error('Passkey 配置无效');
        }
        const response = await fetch(`http://127.0.0.1:${config.apiPort}/api/passkeys/manage`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ profileId: config.profileId, action, ...payload }),
            signal: AbortSignal.timeout(action === 'authorize' ? 90000 : 10000)
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`);
        return result;
    }

    function status(message = '', tone = 'error', target = editor.hidden ? 'listStatus' : 'formStatus') {
        const element = $(target);
        element.textContent = message;
        element.dataset.tone = tone;
        element.hidden = !message;
    }

    function passkeyStatus(message = '', tone = 'error') {
        const target = $('passkeyStatus');
        target.textContent = message;
        target.dataset.tone = tone;
        target.hidden = !message;
    }

    function passkeyOrigin(url) {
        try { return new URL(url).hostname; } catch { return ''; }
    }

    function selectedPasskeyPage() {
        return passkeyState.pages.find(page => page.id === $('passkeyPage').value) || null;
    }

    function renderPasskeyCredentials() {
        const selected = selectedPasskeyPage();
        const hostname = selected ? passkeyOrigin(selected.url) : '';
        const matching = hostname
            ? passkeyState.credentials.filter(entry => hostname === entry.rpId || hostname.endsWith('.' + entry.rpId))
            : [];
        const credentialSelect = $('passkeyCredential');
        const previousCredential = credentialSelect.value;
        credentialSelect.replaceChildren();
        credentialSelect.append(new Option(matching.length > 1 ? '请选择要使用的账号' : matching.length ? '自动选择当前网站凭据' : '当前网页没有可用凭据', ''));
        for (const entry of matching) {
            credentialSelect.append(new Option(
                `${entry.userDisplayName || entry.userName || entry.rpId} · ${entry.rpId}`,
                entry.credentialId
            ));
        }
        if (matching.some(entry => entry.credentialId === previousCredential)) credentialSelect.value = previousCredential;
        credentialSelect.disabled = !passkeyState.enabled || !matching.length || passkeyBusy || Boolean(passkeyState.error);
        $('passkeyUse').disabled = !passkeyState.enabled || !selected || !matching.length ||
            (matching.length > 1 && !credentialSelect.value) || passkeyBusy || Boolean(passkeyState.error);
        $('passkeyRegister').disabled = !passkeyState.enabled || !selected || passkeyBusy || Boolean(passkeyState.error);
        $('passkeyRevoke').disabled = passkeyBusy || !passkeyState.pages.some(page => page.authorizedUntil > Date.now());
    }

    function renderPasskeys() {
        const enabled = passkeyState.enabled;
        $('passkeyEnabled').checked = enabled;
        $('passkeyEnabled').disabled = passkeyBusy;
        $('passkeySummary').textContent = passkeyState.error
            ? passkeyState.error
            : `${passkeyState.credentials.length} 个凭据，${passkeyState.pages.length} 个安全网页`;
        $('passkeyControls').hidden = !enabled;
        const pageSelect = $('passkeyPage');
        const previousPage = pageSelect.value;
        pageSelect.replaceChildren();
        if (!passkeyState.pages.length) {
            pageSelect.append(new Option('没有可授权的 HTTPS 网页', ''));
        } else {
            for (const page of passkeyState.pages) pageSelect.append(new Option(page.url, page.id));
            pageSelect.value = passkeyState.pages.some(page => page.id === previousPage) ? previousPage : passkeyState.pages[0].id;
        }
        pageSelect.disabled = !enabled || !passkeyState.pages.length || passkeyBusy;
        const list = $('passkeyCredentials');
        list.replaceChildren();
        if (!passkeyState.credentials.length) {
            list.append(element('div', 'empty', '尚未保存 Passkey'));
        } else {
            for (const entry of passkeyState.credentials) {
                const row = element('div', 'passkey-entry');
                const info = element('div', 'passkey-entry-info');
                info.append(element('div', 'passkey-entry-name', entry.userDisplayName || entry.userName || '未命名用户'));
                info.append(element('div', 'passkey-entry-site', `${entry.rpId} · 签名计数 ${entry.signCount}`));
                const remove = button('删除', () => {
                    if (remove.dataset.confirming === 'true') {
                        void deletePasskey(entry.credentialId);
                        return;
                    }
                    remove.dataset.confirming = 'true';
                    remove.textContent = '确认删除';
                    passkeyStatus('再次点击“确认删除”将移除此环境的凭据；不会删除网站上的账号。');
                    const cancel = button('取消', () => {
                        remove.dataset.confirming = 'false';
                        remove.textContent = '删除';
                        cancel.remove();
                        passkeyStatus();
                    });
                    row.append(cancel);
                }, 'danger');
                remove.disabled = passkeyBusy;
                row.append(info, remove);
                list.append(row);
            }
        }
        renderPasskeyCredentials();
    }

    async function loadPasskeys() {
        if (passkeyBusy) return;
        const version = ++passkeyLoadVersion;
        passkeyStatus();
        try {
            const response = await requestPasskey('list');
            if (version !== passkeyLoadVersion) return;
            passkeyState = response;
            renderPasskeys();
        } catch (error) {
            if (version !== passkeyLoadVersion) return;
            passkeyState = { ...passkeyState, error: error.message };
            renderPasskeys();
            passkeyStatus(`读取 Passkey 失败：${error.message}`);
        }
    }

    async function passkeyAction(operation, successMessage = '') {
        if (passkeyBusy) return;
        passkeyBusy = true;
        ++passkeyLoadVersion;
        $('passkeyReload').disabled = true;
        renderPasskeys();
        passkeyStatus('处理中...', 'success');
        try {
            passkeyState = await operation();
            renderPasskeys();
            if (successMessage) passkeyStatus(successMessage, 'success');
        } catch (error) {
            passkeyStatus(error.message || 'Passkey 操作失败');
        } finally {
            passkeyBusy = false;
            $('passkeyReload').disabled = false;
            renderPasskeys();
        }
    }

    async function authorizePasskey(mode) {
        const page = selectedPasskeyPage();
        if (!page) return passkeyStatus('请选择要授权的网页');
        const credentialId = mode === 'use' ? $('passkeyCredential').value : '';
        await passkeyAction(
            () => requestPasskey('authorize', { targetId: page.id, mode, ...(credentialId ? { credentialId } : {}) }),
            mode === 'register' ? '已授权注册，请回到网页完成操作' : '已授权使用，请回到网页完成登录'
        );
    }

    async function deletePasskey(credentialId) {
        await passkeyAction(
            () => requestPasskey('delete', { credentialId }),
            'Passkey 已删除'
        );
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function button(label, onClick, className = '') {
        const node = element('button', className, label);
        node.type = 'button';
        node.addEventListener('click', onClick);
        return node;
    }

    function hasTwoFactor(entry) {
        return entry.twoFactorEnabled !== false && typeof entry.twoFactorSecret === 'string' && Boolean(entry.twoFactorSecret.trim());
    }

    function clearCode(key) {
        clearTimeout(expiryTimers.get(key));
        expiryTimers.delete(key);
    }

    function clearCodes() {
        for (const timer of expiryTimers.values()) clearTimeout(timer);
        expiryTimers.clear();
        $('preview').hidden = true;
        $('previewValue').textContent = '';
        $('previewCode').textContent = '查看验证码';
    }

    function displayCode(result, key, container, value, expiry, refresh) {
        const expiresAt = Number(result.expiresAt);
        if (!/^\d{6}$/.test(result.code) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            throw new Error('验证码已过期，请重新获取');
        }
        clearCode(key);
        value.textContent = result.code;
        expiry.textContent = `${new Date(expiresAt).toLocaleTimeString('zh-CN', { hour12: false })} 到期`;
        container.hidden = false;
        refresh.textContent = '刷新验证码';
        // A displayed code gets one expiry timer; generation always requires a user action.
        expiryTimers.set(key, setTimeout(() => {
            value.textContent = '------';
            expiry.textContent = '已过期';
            expiryTimers.delete(key);
        }, expiresAt - Date.now()));
    }

    async function copy(value) {
        await navigator.clipboard.writeText(value);
        status('已复制', 'success');
    }

    async function act(control, operation) {
        if (control.disabled) return;
        control.disabled = true;
        status();
        try {
            await operation();
        } catch (error) {
            status(error.message || '操作失败，请重试');
        } finally {
            control.disabled = false;
        }
    }

    function renderList() {
        clearCodes();
        const query = $('search').value.trim().toLocaleLowerCase();
        const filter = $('filter').value;
        const entries = passwords.filter((entry) => {
            if (filter === 'twofa' && !hasTwoFactor(entry)) return false;
            if (filter === 'password' && hasTwoFactor(entry)) return false;
            return [entry.name, entry.url, entry.origin, entry.username, entry.notes]
                .some((value) => String(value || '').toLocaleLowerCase().includes(query));
        });
        $('count').textContent = `${entries.length} / ${passwords.length} 条密码`;
        const fragment = document.createDocumentFragment();
        for (const entry of entries) {
            const item = element('article', 'item');
            item.dataset.id = entry.id;
            const title = element('div', 'item-title');
            title.append(element('h2', 'item-name', entry.name || entry.origin || entry.url));
            if (hasTwoFactor(entry)) title.append(element('span', 'badge', '2FA'));
            item.append(title, element('div', 'item-site', entry.url || entry.origin), element('div', 'item-user', entry.username));
            const actions = element('div', 'actions');
            const copyPassword = button('复制密码', () => act(copyPassword, () => copy(entry.password)));
            actions.append(copyPassword, button('编辑', () => openEditor(entry)));
            if (hasTwoFactor(entry)) {
                const codeLine = element('div', 'code-line');
                codeLine.hidden = true;
                const codeValue = element('span', 'code-value');
                const codeExpiry = element('span', 'code-expiry');
                codeLine.append(codeValue, codeExpiry);
                const view = button('查看验证码', () => act(view, async () => {
                    const response = await request('GET_TOTP', { id: entry.id });
                    if (item.isConnected && editor.hidden) displayCode(response, entry.id, codeLine, codeValue, codeExpiry, view);
                }));
                const copyCode = button('复制验证码', () => act(copyCode, async () => {
                    const response = await request('GET_TOTP', { id: entry.id });
                    if (!item.isConnected || !editor.hidden) return;
                    displayCode(response, entry.id, codeLine, codeValue, codeExpiry, view);
                    await copy(response.code);
                }));
                actions.append(view, copyCode);
                item.append(codeLine);
            }
            const remove = button('删除', () => {
                remove.disabled = true;
                const confirm = element('div', 'delete-confirm', '确认删除此密码？');
                const commands = element('div', 'actions');
                const cancel = button('取消', () => { confirm.remove(); remove.disabled = false; });
                const accept = button('确认删除', () => act(accept, async () => {
                    cancel.disabled = true;
                    try {
                        const response = await request('DELETE_PASSWORD', { id: entry.id });
                        passwords = response.passwords || passwords.filter((item) => item.id !== entry.id);
                        renderList();
                        status(response.syncError ? `同步失败：${response.syncError}` : '已删除', response.syncError ? 'error' : 'success');
                    } finally {
                        cancel.disabled = false;
                    }
                }), 'danger');
                commands.append(cancel, accept);
                confirm.append(commands);
                item.append(confirm);
            }, 'danger');
            actions.append(remove);
            item.append(actions);
            fragment.append(item);
        }
        if (!entries.length) fragment.append(element('p', 'empty', passwords.length ? '没有匹配的密码' : '暂无保存的密码'));
        list.replaceChildren(fragment);
    }

    async function loadPasswords() {
        const version = ++loadVersion;
        $('reload').disabled = true;
        try {
            const response = await request('GET_ALL_PASSWORDS');
            if (version !== loadVersion) return;
            passwords = Array.isArray(response.passwords) ? response.passwords : [];
            if (editor.hidden) renderList();
            status(response.syncError ? `同步失败：${response.syncError}` : '', 'error', 'listStatus');
        } catch (error) {
            if (version !== loadVersion) return;
            status(`读取密码失败：${error.message}`, 'error', 'listStatus');
            if (!passwords.length) list.replaceChildren(element('p', 'empty', '密码读取失败'));
        } finally {
            if (version === loadVersion) $('reload').disabled = false;
        }
    }

    function openEditor(entry) {
        clearCodes();
        editorVersion++;
        isEditing = Boolean(entry);
        draft = entry ? { ...entry } : { id: crypto.randomUUID() };
        for (const key of ['name', 'url', 'username', 'password', 'notes', 'twoFactorSecret']) $(key).value = draft[key] || '';
        if (!$('url').value) $('url').value = draft.origin || '';
        $('twoFactorEnabled').checked = hasTwoFactor(draft);
        $('twoFactorFields').hidden = !$('twoFactorEnabled').checked;
        $('twoFactorSecret').required = $('twoFactorEnabled').checked;
        $('password').type = $('twoFactorSecret').type = 'password';
        $('showPassword').textContent = $('showSecret').textContent = '显示';
        $('showPassword').setAttribute('aria-label', '显示密码');
        $('showSecret').setAttribute('aria-label', '显示密钥');
        $('editorTitle').textContent = isEditing ? '编辑密码' : '添加密码';
        $('listView').hidden = true;
        $('viewTabs').hidden = true;
        editor.hidden = false;
        status();
        $('url').focus();
    }

    function closeEditor() {
        if (saveBusy) return;
        editorVersion++;
        qrBusy = false;
        $('uploadQr').disabled = false;
        $('save').disabled = false;
        clearCodes();
        draft = null;
        editor.reset();
        editor.hidden = true;
        $('listView').hidden = false;
        $('viewTabs').hidden = false;
        renderList();
    }

    function resetPreview() {
        clearCode('preview');
        $('preview').hidden = true;
        $('previewValue').textContent = '';
        $('previewCode').textContent = '查看验证码';
    }

    function parseSecret(value) {
        const text = value.trim();
        if (!/^otpauth:/i.test(text)) return text;
        let url;
        try { url = new URL(text); } catch { throw new Error('无效的 2FA 配置链接'); }
        if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') throw new Error('仅支持 TOTP 二维码');
        const params = url.searchParams;
        for (const key of ['secret', 'algorithm', 'digits', 'period']) {
            if (params.getAll(key).length > 1) throw new Error('2FA 配置包含重复参数');
        }
        if ((params.has('algorithm') && params.get('algorithm').toUpperCase() !== 'SHA1') ||
            (params.has('digits') && params.get('digits') !== '6') ||
            (params.has('period') && params.get('period') !== '30')) {
            throw new Error('仅支持 SHA1、6 位、30 秒的 TOTP 配置');
        }
        if (!params.get('secret')) throw new Error('二维码中没有 2FA 密钥');
        return params.get('secret');
    }

    function loadQrDecoder() {
        if (typeof globalThis.jsQR === 'function') return Promise.resolve(globalThis.jsQR);
        if (!qrLoader) qrLoader = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'jsqr.js';
            script.onload = () => {
                if (typeof globalThis.jsQR === 'function') resolve(globalThis.jsQR);
                else { qrLoader = undefined; reject(new Error('二维码解析组件加载失败')); }
            };
            script.onerror = () => { qrLoader = undefined; script.remove(); reject(new Error('二维码解析组件加载失败')); };
            document.head.append(script);
        });
        return qrLoader;
    }

    async function importQr(blob) {
        if (qrBusy || saveBusy || !draft) return;
        const version = editorVersion;
        qrBusy = true;
        $('uploadQr').disabled = true;
        $('save').disabled = true;
        status('正在解析二维码...', 'success');
        let bitmap;
        try {
            if (!blob || blob.size > 10 * 1024 * 1024) throw new Error('请选择不超过 10 MB 的二维码图片');
            const decode = await loadQrDecoder();
            bitmap = await createImageBitmap(blob);
            if (bitmap.width * bitmap.height > 24000000) throw new Error('图片尺寸过大，请裁剪二维码后重试');
            const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const result = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
            if (!result) throw new Error('未识别到二维码，请使用清晰的二维码图片');
            if (!/^otpauth:/i.test(result.data.trim())) throw new Error('二维码中没有 TOTP 配置');
            const response = await request('VALIDATE_TOTP', { secret: parseSecret(result.data) });
            if (version !== editorVersion || !draft) return;
            $('twoFactorSecret').value = response.secret;
            $('twoFactorEnabled').checked = true;
            $('twoFactorFields').hidden = false;
            $('twoFactorSecret').required = true;
            resetPreview();
            status('二维码已导入', 'success');
        } catch (error) {
            if (version === editorVersion) status(`二维码解析失败：${error.message}`);
        } finally {
            bitmap?.close();
            if (version === editorVersion) {
                qrBusy = false;
                $('uploadQr').disabled = false;
                $('save').disabled = false;
            }
        }
    }

    async function preview(copyCode) {
        if (qrBusy || !draft || !$('twoFactorEnabled').checked) return;
        const version = editorVersion;
        const secret = $('twoFactorSecret').value;
        const control = copyCode ? $('copyPreviewCode') : $('previewCode');
        await act(control, async () => {
            const response = await request('PREVIEW_TOTP', { secret: parseSecret(secret) });
            if (version !== editorVersion || secret !== $('twoFactorSecret').value || !$('twoFactorEnabled').checked) return;
            displayCode(response, 'preview', $('preview'), $('previewValue'), $('previewExpiry'), $('previewCode'));
            if (copyCode) await copy(response.code);
        });
    }

    editor.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saveBusy || qrBusy || !draft) return;
        saveBusy = true;
        const controls = Array.from(editor.querySelectorAll('input, textarea, button'));
        for (const control of controls) control.disabled = true;
        $('save').textContent = '保存中...';
        status();
        try {
            const url = new URL($('url').value.trim());
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请填写不含账号密码的 HTTP 或 HTTPS 网站地址');
            const twoFactorEnabled = $('twoFactorEnabled').checked;
            const entry = {
                ...draft,
                url: url.href,
                origin: url.origin,
                name: $('name').value.trim() || url.hostname,
                username: $('username').value.trim(),
                password: $('password').value,
                notes: $('notes').value,
                twoFactorEnabled,
                twoFactorSecret: twoFactorEnabled ? parseSecret($('twoFactorSecret').value) : ''
            };
            if (!entry.username || !entry.password) throw new Error('请填写用户名和密码');
            const response = await request(isEditing ? 'UPDATE_PASSWORD' : 'SAVE_PASSWORD', { entry });
            passwords = response.passwords || [...passwords.filter((item) => item.id !== entry.id), response.entry || entry];
            saveBusy = false;
            closeEditor();
            status(response.syncError ? `同步失败：${response.syncError}` : '已保存', response.syncError ? 'error' : 'success');
        } catch (error) {
            status(`保存失败：${error.message}`);
        } finally {
            saveBusy = false;
            for (const control of controls) control.disabled = false;
            $('save').textContent = '保存';
        }
    });

    $('add').addEventListener('click', () => openEditor());
    $('reload').addEventListener('click', loadPasswords);
    $('search').addEventListener('input', renderList);
    $('filter').addEventListener('change', renderList);
    $('cancel').addEventListener('click', closeEditor);
    $('back').addEventListener('click', closeEditor);
    $('twoFactorEnabled').addEventListener('change', () => {
        $('twoFactorFields').hidden = !$('twoFactorEnabled').checked;
        $('twoFactorSecret').required = $('twoFactorEnabled').checked;
        resetPreview();
    });
    $('twoFactorSecret').addEventListener('input', resetPreview);
    $('twoFactorSecret').addEventListener('paste', (event) => {
        const image = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'));
        if (image) { event.preventDefault(); importQr(image.getAsFile()); }
        else if (/^otpauth:/i.test(event.clipboardData?.getData('text/plain').trim() || '')) {
            event.preventDefault();
            try {
                $('twoFactorSecret').value = parseSecret(event.clipboardData.getData('text/plain'));
                resetPreview();
                status();
            } catch (error) { status(error.message); }
        }
    });
    $('uploadQr').addEventListener('click', () => $('qrFile').click());
    $('qrFile').addEventListener('change', () => {
        const file = $('qrFile').files[0];
        $('qrFile').value = '';
        if (file) importQr(file);
    });
    $('previewCode').addEventListener('click', () => preview(false));
    $('copyPreviewCode').addEventListener('click', () => preview(true));
    $('passkeyReload').addEventListener('click', loadPasskeys);
    $('passwordTab').addEventListener('click', () => {
        if (!editor.hidden) return;
        $('listView').hidden = false;
        $('passkeyView').hidden = true;
        $('passwordTab').classList.add('primary');
        $('passkeyTab').classList.remove('primary');
        $('passwordTab').setAttribute('aria-pressed', 'true');
        $('passkeyTab').setAttribute('aria-pressed', 'false');
    });
    $('passkeyTab').addEventListener('click', () => {
        if (!editor.hidden) return;
        clearCodes();
        $('listView').hidden = true;
        $('passkeyView').hidden = false;
        $('passkeyTab').classList.add('primary');
        $('passwordTab').classList.remove('primary');
        $('passwordTab').setAttribute('aria-pressed', 'false');
        $('passkeyTab').setAttribute('aria-pressed', 'true');
        void loadPasskeys();
    });
    $('passkeyPage').addEventListener('change', renderPasskeyCredentials);
    $('passkeyCredential').addEventListener('change', renderPasskeyCredentials);
    $('passkeyUse').addEventListener('click', () => authorizePasskey('use'));
    $('passkeyRegister').addEventListener('click', () => authorizePasskey('register'));
    $('passkeyRevoke').addEventListener('click', () => passkeyAction(() => requestPasskey('revoke'), '已撤销当前 Passkey 授权'));
    $('passkeyEnabled').addEventListener('change', () => {
        const enabled = $('passkeyEnabled').checked;
        void passkeyAction(
            () => requestPasskey('enable', { enabled }),
            enabled ? 'Passkey 已启用' : 'Passkey 已停用'
        );
    });
    for (const [controlId, fieldId, label] of [['showPassword', 'password', '密码'], ['showSecret', 'twoFactorSecret', '密钥']]) {
        $(controlId).addEventListener('click', () => {
            const visible = $(fieldId).type === 'password';
            $(fieldId).type = visible ? 'text' : 'password';
            $(controlId).textContent = visible ? '隐藏' : '显示';
            $(controlId).setAttribute('aria-label', `${visible ? '隐藏' : '显示'}${label}`);
        });
    }
    window.addEventListener('pagehide', clearCodes);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearCodes(); if (editor.hidden) renderList(); } });
    loadPasswords();
});
