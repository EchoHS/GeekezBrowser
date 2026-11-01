const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { syncError, contentHash, validId, validateRecord, deriveSyncKey, encryptSyncData, decryptSyncData } = require('./sync-format');
const { WebDavStore } = require('./webdav-store');
const { SyncRevisions, planSync, mapConcurrent } = require('./sync-revisions');

const uuid = () => crypto.randomUUID();
const baseline = versions => ({ revision: versions[0].id, heads: versions.map(version => version.id).sort(), hash: versions[0].hash });

class WebDavSync {
    constructor({ directory, safeStorage, readSnapshot, applyRecords, notify = () => {}, fetchImpl }) {
        this.directory = directory;
        this.safeStorage = safeStorage;
        this.readSnapshot = readSnapshot;
        this.applyRecords = applyRecords;
        this.notify = notify;
        this.fetchImpl = fetchImpl;
        this.state = { deviceId: uuid(), bases: {}, lastSync: null };
        this.config = { url: '', folder: 'GeekEZ-Sync', username: '', automatic: false, remember: false };
        this.credentials = null;
        this.secureStorageAvailable = false;
        this.status = { phase: 'idle', error: '', detail: '', conflicts: 0, deferred: 0 };
        this.plan = null;
        this.busy = false;
        this.timer = null;
    }

    canRemember() {
        return this.secureStorageAvailable;
    }

    async init() {
        try {
            this.secureStorageAvailable = Boolean(
                await this.safeStorage?.isAsyncEncryptionAvailable?.() &&
                this.safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
            );
        } catch {
            this.secureStorageAvailable = false;
        }
        await fs.ensureDir(this.directory);
        const file = path.join(this.directory, 'connection.json');
        if (await fs.pathExists(file)) {
            const stored = await fs.readJson(file);
            this.config = { ...this.config, ...stored.config };
            if (stored.credentials && this.canRemember()) {
                try { this.credentials = JSON.parse(await this.safeStorage.decryptStringAsync(Buffer.from(stored.credentials, 'base64'))); }
                catch { this.status.error = 'syncUnlockRequired'; }
            }
        }
        const stateFile = path.join(this.directory, 'state-v3.json');
        if (await fs.pathExists(stateFile)) {
            const state = await fs.readJson(stateFile);
            if (!state || !validId(state.deviceId) || !state.bases || typeof state.bases !== 'object' || Array.isArray(state.bases)) throw syncError('syncLocalError');
            for (const base of Object.values(state.bases)) {
                if (!base || !validId(base.revision) || !/^[a-f0-9]{64}$/.test(base.hash) || !Array.isArray(base.heads) ||
                    !base.heads.length || !base.heads.includes(base.revision) || base.heads.some(id => !validId(id))) throw syncError('syncLocalError');
            }
            this.state = state;
        }
        return this.getStatus();
    }

    getStatus() {
        return {
            config: { ...this.config }, canRemember: this.canRemember(), unlocked: !!this.credentials,
            lastSync: this.state.lastSync, ...this.status, busy: this.busy
        };
    }

    setStatus(patch) {
        Object.assign(this.status, patch);
        this.notify(this.getStatus());
    }

    async atomicJson(name, value) {
        await fs.ensureDir(this.directory);
        const target = path.join(this.directory, name);
        const tmp = `${target}.${uuid()}.tmp`;
        try { await fs.writeJson(tmp, value, { mode: 0o600 }); await fs.rename(tmp, target); }
        finally { await fs.remove(tmp); }
    }

    async saveConfig(input) {
        await this.operation(async () => {
            const config = {
                url: String(input.url || '').trim(), folder: String(input.folder || 'GeekEZ-Sync').trim(),
                username: String(input.username || ''), automatic: input.automatic === true, remember: input.remember === true
            };
            const same = ['url', 'folder', 'username'].every(key => config[key] === this.config[key]);
            const credentials = {
                password: input.password || (same ? this.credentials?.password : '') || '',
                passphrase: input.passphrase || (same ? this.credentials?.passphrase : '') || ''
            };
            new WebDavStore({ ...config, ...credentials }, this.fetchImpl);
            await deriveSyncKey(credentials.passphrase);
            if (config.remember && !this.canRemember()) throw syncError('syncKeychainUnavailable');
            const stored = { config };
            if (config.remember) stored.credentials = (await this.safeStorage.encryptStringAsync(JSON.stringify(credentials))).toString('base64');
            await this.atomicJson('connection.json', stored);
            if (!same) {
                this.state = { deviceId: this.state.deviceId, bases: {}, lastSync: null };
                await this.atomicJson('state-v3.json', this.state);
            }
            this.config = config;
            this.credentials = credentials;
            this.plan = null;
            this.importPlan = null;
            this.connectionTested = false;
            this.revisions = null;
            this.setStatus({ phase: 'idle', error: '', detail: '' });
        });
        this.schedule();
        return this.getStatus();
    }

    async disconnect() {
        await this.operation(async () => {
            clearTimeout(this.timer);
            const config = { url: '', folder: 'GeekEZ-Sync', username: '', automatic: false, remember: false };
            const state = { deviceId: this.state.deviceId, bases: {}, lastSync: null };
            await this.atomicJson('connection.json', { config });
            await this.atomicJson('state-v3.json', state);
            this.config = config;
            this.state = state;
            this.credentials = this.plan = this.importPlan = null;
            this.connectionTested = false;
            this.revisions = null;
            this.setStatus({ phase: 'disconnected', conflicts: 0, deferred: 0 });
        });
        return this.getStatus();
    }

    cancelPreview(id) {
        if (this.busy) throw syncError('syncBusy');
        if (this.plan?.id === id) this.plan = null;
        if (this.importPlan?.id === id) this.importPlan = null;
        this.setStatus({ phase: 'idle' });
        this.schedule();
    }

    store() {
        if (!this.credentials) throw syncError('syncUnlockRequired');
        this.revisions ||= new SyncRevisions(new WebDavStore({ ...this.config, ...this.credentials }, this.fetchImpl), this.credentials.passphrase);
        return this.revisions.store;
    }

    async operation(task) {
        if (this.busy) throw syncError('syncBusy');
        this.busy = true;
        this.setStatus({ phase: 'working', error: '', detail: '' });
        try { return await task(); }
        catch (error) {
            this.setStatus({ phase: 'error', error: error.code?.startsWith('sync') ? error.code : 'syncLocalError', detail: error.detail || '' });
            throw error;
        } finally { this.busy = false; this.notify(this.getStatus()); }
    }

    async test() {
        return this.operation(async () => {
            await this.store().test();
            await this.revisions.read(this.state);
            this.connectionTested = true;
            this.setStatus({ phase: 'connected' });
            return this.getStatus();
        });
    }

    async makePlan() {
        this.plan = null;
        this.importPlan = null;
        const store = this.store();
        await store.mkdir();
        const graph = await this.revisions.read(this.state);
        const local = await this.readSnapshot();
        const remoteEmpty = Object.keys(graph.entries).length === 0;
        if (remoteEmpty && local.busy.length) throw syncError('syncInitialProfilesBusy');
        const rows = planSync(local, graph, this.state.bases);
        this.plan = { id: uuid(), graph, rows, local, store, remoteEmpty };
        this.setStatus({ phase: 'preview', conflicts: rows.filter(row => row.action === 'conflict').length, deferred: rows.filter(row => row.action === 'deferred').length });
        return { id: this.plan.id, rows, remoteEmpty, profileCount: Object.keys(local.records).filter(key => key.startsWith('profile:')).length };
    }

    async preview() { return this.operation(() => this.makePlan()); }

    async getRemoteRecord(plan, key, version) {
        plan.remoteSnapshots ||= new Map();
        if (!plan.remoteSnapshots.has(version.id)) {
            plan.remoteSnapshots.set(version.id, this.revisions.configuration(plan.graph.byId.get(version.id)));
        }
        const records = await plan.remoteSnapshots.get(version.id);
        return records[key];
    }

    async execute(planId, choices = {}) {
        const plan = this.plan;
        if (!plan || plan.id !== planId) throw syncError('syncPlanExpired');
        const latest = await this.readSnapshot();
        if (plan.remoteEmpty) {
            if (latest.busy.length) throw syncError('syncInitialProfilesBusy');
            if (contentHash(latest.records) !== contentHash(plan.local.records)) throw syncError('syncPlanExpired');
        }
        const uploads = new Map(), downloads = [], accepted = new Map(), selectedRemotes = new Map();
        let unresolvedBranches = false;
        for (const row of plan.rows) {
            let action = row.action;
            const choice = plan.remoteEmpty ? undefined : choices[row.key];
            if (choice === 'skip') action = 'skip';
            if (action === 'conflict' || action === 'removed') action = choice || 'skip';
            const competing = new Set(row.remotes.map(version => version.hash)).size > 1;
            if (action === 'skip' || action === 'deferred' || latest.busy.includes(row.key)) {
                if (competing) unresolvedBranches = true;
                continue;
            }
            let selected = row.remote;
            if (typeof action === 'string' && action.startsWith('download:')) {
                selected = row.remotes.find(version => version.id === action.slice(9));
                if (!selected) throw syncError('syncInvalidData');
                action = 'download';
            } else if (action === 'download' && competing) throw syncError('syncInvalidData');
            if (!['upload', 'download', 'unchanged'].includes(action)) throw syncError('syncInvalidData');
            let record = latest.records[row.key];
            if ((record ? contentHash(record) : null) !== row.hash) throw syncError('syncPlanExpired');
            if (action === 'download') {
                if (!selected) throw syncError('syncInvalidData');
                record = await this.getRemoteRecord(plan, row.key, selected);
                downloads.push({ key: row.key, record, expectedHash: row.hash });
                selectedRemotes.set(row.key, selected);
            }
            if (action === 'upload') {
                if (!record) throw syncError('syncInvalidData');
                uploads.set(row.key, record);
            }
            accepted.set(row.key, { hash: contentHash(record), remotes: action === 'download' ? [selected] : row.remotes });
        }
        const shouldPublish = uploads.size > 0 || downloads.length > 0 && plan.graph.heads.length > 1;
        if (shouldPublish && unresolvedBranches) throw syncError('syncResolveBranches');
        const records = {};
        if (shouldPublish) {
            await mapConcurrent(plan.rows, async row => {
                if (uploads.has(row.key)) { records[row.key] = uploads.get(row.key); return; }
                const selected = selectedRemotes.get(row.key) || row.remote;
                if (!selected) return;
                const local = latest.records[row.key];
                records[row.key] = local && contentHash(local) === selected.hash ? local : await this.getRemoteRecord(plan, row.key, selected);
            });
        }
        if (shouldPublish && !this.connectionTested) {
            await plan.store.test();
            this.connectionTested = true;
        }
        const current = await this.revisions.read(this.state);
        if (current.signature !== plan.graph.signature) throw syncError('syncRemoteChanged');
        const published = shouldPublish ? await this.revisions.publish(current, records, this.state.deviceId) : null;
        const confirmed = published ? await this.revisions.read(this.state, [published.id]) : current;
        if (downloads.length) await this.applyRecords(downloads);
        for (const [key, entry] of accepted) {
            this.state.bases[key] = published ? baseline([{ id: published.id, hash: entry.hash }]) : baseline(entry.remotes);
        }
        this.state.lastSync = Date.now();
        await this.atomicJson('state-v3.json', this.state);
        if (published) await this.revisions.prune(confirmed);
        const remaining = await this.readSnapshot();
        const conflicts = planSync(remaining, confirmed, this.state.bases).filter(row => row.action === 'conflict').length;
        this.plan = null;
        this.setStatus({ phase: conflicts ? 'conflict' : 'synced', conflicts, deferred: remaining.busy.length });
        return { uploaded: uploads.size, downloaded: downloads.length, conflicts, deferred: remaining.busy.length };
    }

    async sync(planId, choices) { return this.operation(() => this.execute(planId, choices)); }

    schedule() {
        clearTimeout(this.timer);
        if (!this.config.automatic || !this.credentials) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            if (this.busy) { this.schedule(); return; }
            if (this.plan || this.importPlan) return;
            this.operation(async () => {
                try {
                    const plan = await this.makePlan();
                    if (plan.remoteEmpty) { this.setStatus({ phase: 'idle' }); return; }
                    return await this.execute(plan.id);
                } finally { this.plan = null; }
            }).catch(() => {});
        }, 2500);
        this.timer.unref?.();
    }

    async history() {
        return this.operation(async () => {
            this.plan = this.importPlan = null;
            await this.store().mkdir();
            const graph = await this.revisions.read(this.state);
            const versions = this.revisions.history(graph).map(version => ({
                id: version.id, at: version.at, device: version.device, current: graph.heads.some(head => head.id === version.id),
                profileCount: Object.keys(version.records).filter(key => key.startsWith('profile:')).length
            }));
            this.setStatus({ phase: 'idle' });
            return versions;
        });
    }

    async restore(versionId) {
        return this.operation(async () => {
            try {
                await this.makePlan();
                const plan = this.plan;
                const version = this.revisions.history(plan.graph).find(item => item.id === versionId);
                if (!version) throw syncError('syncVersionMissing');
                if (plan.local.busy.length) throw syncError('syncProfilesBusy');
                const records = await this.revisions.configuration(version);
                const changes = Object.entries(records).map(([key, record]) => ({
                    key, record, expectedHash: plan.local.records[key] ? contentHash(plan.local.records[key]) : null
                }));
                await this.applyRecords(changes);
                // Restoring an older batch is a local change against the latest cloud baselines.
                for (const key of Object.keys(version.records)) this.state.bases[key] = baseline([plan.graph.entries[key].heads[0]]);
                await this.atomicJson('state-v3.json', this.state);
                this.setStatus({ phase: 'restored' });
                return this.getStatus();
            } finally { this.plan = null; }
        });
    }

    async exportFile(passphrase) {
        return this.operation(async () => {
            const secret = await deriveSyncKey(passphrase || this.credentials?.passphrase);
            const snapshot = await this.readSnapshot();
            if (snapshot.busy.length) throw syncError('syncProfilesBusy');
            const buffer = await encryptSyncData({ version: 1, kind: 'backup', records: snapshot.records, createdAt: Date.now() }, secret);
            this.setStatus({ phase: 'exported' });
            return buffer;
        });
    }

    async previewImport(buffer, passphrase) {
        return this.operation(async () => {
            this.plan = null;
            const password = passphrase || this.credentials?.passphrase;
            if (!password) throw syncError('syncPassphraseLength');
            const { data } = await decryptSyncData(buffer, password);
            if (data?.version !== 1 || data.kind !== 'backup' || !data.records || typeof data.records !== 'object' || Array.isArray(data.records)) throw syncError('syncInvalidData');
            const local = await this.readSnapshot();
            const rows = Object.entries(data.records).map(([key, record]) => {
                validateRecord(record, key);
                const hash = local.records[key] ? contentHash(local.records[key]) : null;
                const action = local.busy.includes(key) ? 'deferred' : hash === contentHash(record) ? 'unchanged' : hash ? 'conflict' : 'download';
                return { key, name: record.profile?.name || '', action, hash };
            });
            this.importPlan = { id: uuid(), rows, records: data.records };
            this.setStatus({ phase: 'preview' });
            return { id: this.importPlan.id, rows, source: 'file' };
        });
    }

    async importFile(id, choices = {}) {
        return this.operation(async () => {
            const plan = this.importPlan;
            if (!plan || plan.id !== id) throw syncError('syncPlanExpired');
            const changes = plan.rows.filter(row => row.action === 'download' && choices[row.key] !== 'skip' || row.action === 'conflict' && choices[row.key] === 'download')
                .map(row => ({ key: row.key, record: plan.records[row.key], expectedHash: row.hash }));
            await this.applyRecords(changes);
            this.importPlan = null;
            this.setStatus({ phase: 'imported' });
            return { downloaded: changes.length };
        });
    }
}

module.exports = { WebDavStore, WebDavSync, planSync };
