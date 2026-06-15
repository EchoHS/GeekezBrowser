const path = require('path');
const fs = require('fs-extra');
const initSqlJs = require('sql.js');

function createProfileStore({ dataPath, legacyProfilesFile }) {
    const dbPath = path.join(dataPath, 'profiles.sqlite');
    let dbPromise = null;
    let queue = Promise.resolve();

    function enqueue(task) {
        const run = queue.then(task, task);
        queue = run.catch(() => { });
        return run;
    }

    function resolveSqlWasmPath(file) {
        try {
            const sqlJsEntry = require.resolve('sql.js');
            const candidate = path.join(path.dirname(sqlJsEntry), file);
            if (fs.existsSync(candidate)) return candidate;
        } catch (e) { }

        try {
            const candidate = require.resolve(`sql.js/dist/${file}`);
            if (fs.existsSync(candidate)) return candidate;
        } catch (e) { }

        return file;
    }

    async function loadSql() {
        return initSqlJs({
            locateFile: (file) => resolveSqlWasmPath(file)
        });
    }

    function createSchema(db) {
        db.run(`
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                data TEXT NOT NULL,
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
            CREATE INDEX IF NOT EXISTS idx_profiles_order ON profiles(order_index, created_at, id);
            PRAGMA user_version = 1;
        `);
    }

    function readProfilesFromDb(db) {
        const stmt = db.prepare(`
            SELECT data
            FROM profiles
            ORDER BY order_index ASC, created_at ASC, id ASC
        `);
        const profiles = [];
        try {
            while (stmt.step()) {
                const row = stmt.getAsObject();
                try {
                    const profile = JSON.parse(row.data);
                    if (profile && profile.id) profiles.push(profile);
                } catch (e) {
                    console.error('Failed to parse profile row:', e.message);
                }
            }
        } finally {
            stmt.free();
        }
        return profiles;
    }

    function getProfileFromDb(db, idOrName) {
        const stmt = db.prepare('SELECT data FROM profiles WHERE id = ? OR name = ? LIMIT 1');
        try {
            stmt.bind([idOrName, idOrName]);
            if (!stmt.step()) return null;
            const row = stmt.getAsObject();
            return JSON.parse(row.data);
        } finally {
            stmt.free();
        }
    }

    function getMaxOrderIndex(db) {
        const result = db.exec('SELECT COALESCE(MAX(order_index), -1) AS max_order FROM profiles');
        if (!result.length || !result[0].values.length) return -1;
        return Number(result[0].values[0][0]) || -1;
    }

    function getExistingOrderIndex(db, id) {
        const stmt = db.prepare('SELECT order_index FROM profiles WHERE id = ? LIMIT 1');
        try {
            stmt.bind([id]);
            if (!stmt.step()) return null;
            const row = stmt.getAsObject();
            return Number(row.order_index);
        } finally {
            stmt.free();
        }
    }

    function upsertProfileInDb(db, profile, orderIndex = null) {
        if (!profile || !profile.id) {
            throw new Error('Cannot save profile without id');
        }

        const existingOrder = getExistingOrderIndex(db, profile.id);
        const finalOrder = Number.isFinite(orderIndex)
            ? orderIndex
            : (existingOrder !== null ? existingOrder : getMaxOrderIndex(db) + 1);
        const createdAt = Number(profile.createdAt || profile.created_at || 0) || Date.now();
        const updatedAt = Date.now();
        const data = JSON.stringify(profile);

        db.run(`
            INSERT INTO profiles (id, name, data, order_index, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                data = excluded.data,
                order_index = excluded.order_index,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at
        `, [
            String(profile.id),
            String(profile.name || profile.id),
            data,
            finalOrder,
            createdAt,
            updatedAt
        ]);
    }

    function replaceProfilesInDb(db, profiles) {
        db.run('DELETE FROM profiles');
        profiles.forEach((profile, index) => {
            upsertProfileInDb(db, profile, index);
        });
    }

    async function flushDb(db) {
        await fs.ensureDir(dataPath);
        const tmpPath = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
        const bytes = Buffer.from(db.export());
        await fs.writeFile(tmpPath, bytes);
        await fs.rename(tmpPath, dbPath);
    }

    async function migrateLegacyProfiles(db) {
        if (!legacyProfilesFile || !fs.existsSync(legacyProfilesFile)) return false;

        const stat = await fs.stat(legacyProfilesFile).catch(() => null);
        if (!stat || stat.size === 0) return false;

        const existing = readProfilesFromDb(db);
        if (existing.length > 0) return false;

        const legacyProfiles = await fs.readJson(legacyProfilesFile).catch((err) => {
            console.error('Failed to read legacy profiles.json:', err.message);
            return [];
        });
        if (!Array.isArray(legacyProfiles) || legacyProfiles.length === 0) return false;

        replaceProfilesInDb(db, legacyProfiles.filter(profile => profile && profile.id));
        return true;
    }

    async function initDb() {
        if (dbPromise) return dbPromise;

        dbPromise = (async () => {
            await fs.ensureDir(dataPath);
            const SQL = await loadSql();
            let db;
            if (fs.existsSync(dbPath)) {
                const bytes = await fs.readFile(dbPath);
                db = new SQL.Database(bytes);
            } else {
                db = new SQL.Database();
            }

            createSchema(db);
            const migrated = await migrateLegacyProfiles(db);
            if (!fs.existsSync(dbPath) || migrated) {
                await flushDb(db);
            }
            return db;
        })();

        return dbPromise;
    }

    function createRepo(db) {
        let changed = false;
        return {
            readProfiles() {
                return readProfilesFromDb(db);
            },
            getProfile(idOrName) {
                return getProfileFromDb(db, idOrName);
            },
            upsertProfile(profile, orderIndex = null) {
                upsertProfileInDb(db, profile, orderIndex);
                changed = true;
            },
            replaceProfiles(profiles) {
                replaceProfilesInDb(db, profiles);
                changed = true;
            },
            deleteProfile(id) {
                db.run('DELETE FROM profiles WHERE id = ?', [id]);
                changed = true;
            },
            get changed() {
                return changed;
            }
        };
    }

    async function runExclusive(task) {
        return enqueue(async () => {
            const db = await initDb();
            const repo = createRepo(db);
            db.run('BEGIN TRANSACTION');
            try {
                const result = await task(repo);
                db.run('COMMIT');
                if (repo.changed) await flushDb(db);
                return result;
            } catch (err) {
                try { db.run('ROLLBACK'); } catch (e) { }
                throw err;
            }
        });
    }

    async function readProfiles() {
        return runExclusive((repo) => repo.readProfiles());
    }

    async function getProfile(idOrName) {
        return runExclusive((repo) => repo.getProfile(idOrName));
    }

    async function upsertProfile(profile) {
        return runExclusive((repo) => {
            repo.upsertProfile(profile);
            return profile;
        });
    }

    async function replaceProfiles(profiles) {
        return runExclusive((repo) => {
            repo.replaceProfiles(profiles);
            return profiles;
        });
    }

    async function deleteProfile(id) {
        return runExclusive((repo) => {
            repo.deleteProfile(id);
            return true;
        });
    }

    return {
        dbPath,
        readProfiles,
        getProfile,
        upsertProfile,
        replaceProfiles,
        deleteProfile,
        runExclusive
    };
}

module.exports = {
    createProfileStore
};
