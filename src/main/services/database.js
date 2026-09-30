const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { reportError, reportMessage } = require('../reporting.js');

let dev = process.env.NODE_ENV === 'dev';

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SQLITE_CORRUPT = 11;
const SQLITE_NOTADB = 26;

function toKey(key) {
    let number = typeof key === 'string' && /^\d{1,15}$/.test(key) ? Number(key) : key;
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid database key');
    return number;
}

function tableIdentifier(tableName) {
    if (typeof tableName !== 'string' || !TABLE_NAME.test(tableName)) throw new Error('Invalid table name');
    return `"${tableName}"`;
}

function isCorruption(error) {
    let code = Number(error?.errcode) & 0xff;
    return code === SQLITE_CORRUPT || code === SQLITE_NOTADB;
}

function parseRow(row) {
    if (!row || typeof row.json_data !== 'string') return null;
    let data;
    try {
        data = JSON.parse(row.json_data);
    } catch (e) {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    data.ID = Number(row.id);
    return data;
}

class Database {
    constructor() {
        this.db = null;
        this.tables = new Set();
        this.statements = new Map();
        this.memory = false;
    }

    directory() {
        let userData = app.getPath('userData');
        return dev ? path.resolve(userData, '..') : path.join(userData, 'launcher-db');
    }

    filePath() {
        return path.join(this.directory(), `Databases.${dev ? 'sqlite' : 'db'}`);
    }

    relocateLegacy() {
        if (dev) return;
        let legacyPath = path.join(app.getPath('userData'), 'databases');
        let newPath = path.join(app.getPath('userData'), 'launcher-db');
        try {
            if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) fs.renameSync(legacyPath, newPath);
        } catch (error) {
            reportError('database', 'relocate_legacy', error, { once: true });
        }
    }

    openFile(file) {
        let db = new DatabaseSync(file, { timeout: 5000 });
        try {
            let check = db.prepare('PRAGMA quick_check').get();
            if (!check || Object.values(check)[0] !== 'ok') {
                let error = new Error('Database integrity check failed');
                error.errcode = SQLITE_CORRUPT;
                throw error;
            }
        } catch (error) {
            try {
                db.close();
            } catch (e) { }
            throw error;
        }
        return db;
    }

    quarantine(file) {
        let target = `${file}.corrupt-${Date.now()}`;
        try {
            fs.renameSync(file, target);
            for (let suffix of ['-wal', '-shm', '-journal']) {
                if (fs.existsSync(file + suffix)) fs.renameSync(file + suffix, target + suffix);
            }
            return true;
        } catch (error) {
            reportError('database', 'quarantine', error, { once: true });
            return false;
        }
    }

    connection() {
        if (this.db) return this.db;
        let file = this.filePath();
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            this.db = this.openFile(file);
        } catch (error) {
            let corrupt = isCorruption(error);
            reportError('database', corrupt ? 'open_corrupt' : 'open', error, { once: true, tags: { corrupt } });
            if (corrupt && this.quarantine(file)) {
                try {
                    this.db = this.openFile(file);
                    reportMessage('database', 'reset_after_corruption', 'Corrupted database moved aside, new database created', { once: true, level: 'warning' });
                } catch (retryError) {
                    reportError('database', 'open_after_quarantine', retryError, { once: true });
                }
            }
            if (!this.db) {
                this.db = new DatabaseSync(':memory:');
                this.memory = true;
                reportMessage('database', 'memory_fallback', 'Database unavailable, using in-memory storage for this session', { once: true, level: 'error' });
            }
        }
        return this.db;
    }

    table(tableName) {
        let identifier = tableIdentifier(tableName);
        let db = this.connection();
        if (!this.tables.has(tableName)) {
            db.exec(`CREATE TABLE IF NOT EXISTS ${identifier}(id INTEGER PRIMARY KEY, json_data TEXT, createdAt DATETIME, updatedAt DATETIME)`);
            this.tables.add(tableName);
        }
        return identifier;
    }

    statement(tableName, key, build) {
        let identifier = this.table(tableName);
        let cacheKey = `${tableName}|${key}`;
        let statement = this.statements.get(cacheKey);
        if (!statement) {
            statement = this.connection().prepare(build(identifier));
            this.statements.set(cacheKey, statement);
        }
        return statement;
    }

    run(tableName, operation, task) {
        try {
            return task();
        } catch (error) {
            reportError('database', operation, error, { once: `${tableName}|${error?.errcode ?? error?.code ?? ''}`, tags: { table: tableName } });
            throw error;
        }
    }

    dropCorrupted(tableName, id) {
        try {
            this.statement(tableName, 'delete', t => `DELETE FROM ${t} WHERE id = ?`).run(id);
        } catch (e) { }
        reportMessage('database', 'corrupted_entry', `Corrupted entry removed from ${tableName}`, { once: tableName, tags: { table: tableName } });
    }

    async createData(tableName, data) {
        let json = JSON.stringify(data);
        return this.run(tableName, 'create', () => {
            let now = Date.now();
            let result = this.statement(tableName, 'insert', t => `INSERT INTO ${t}(json_data, createdAt, updatedAt) VALUES(?, ?, ?)`).run(json, now, now);
            let created = JSON.parse(json);
            created.ID = Number(result.lastInsertRowid);
            return created;
        });
    }

    async readData(tableName, key = 1) {
        key = toKey(key);
        let row = this.run(tableName, 'read', () => this.statement(tableName, 'get', t => `SELECT id, json_data FROM ${t} WHERE id = ?`).get(key));
        if (!row) return undefined;
        let data = parseRow(row);
        if (!data) {
            this.dropCorrupted(tableName, key);
            return undefined;
        }
        return data;
    }

    async readAllData(tableName) {
        let rows;
        try {
            rows = this.run(tableName, 'read_all', () => this.statement(tableName, 'all', t => `SELECT id, json_data FROM ${t} ORDER BY id`).all());
        } catch (e) {
            return [];
        }
        let valid = [];
        for (let row of rows) {
            let data = parseRow(row);
            if (data) valid.push(data);
            else this.dropCorrupted(tableName, Number(row.id));
        }
        return valid;
    }

    async updateData(tableName, data, key = 1) {
        key = toKey(key);
        let json = JSON.stringify(data);
        this.run(tableName, 'update', () => {
            this.statement(tableName, 'update', t => `UPDATE ${t} SET json_data = ?, updatedAt = ? WHERE id = ?`).run(json, Date.now(), key);
        });
    }

    async deleteData(tableName, key = 1) {
        key = toKey(key);
        this.run(tableName, 'delete', () => {
            this.statement(tableName, 'delete', t => `DELETE FROM ${t} WHERE id = ?`).run(key);
        });
    }

    async deleteAllData(tableName) {
        this.run(tableName, 'delete_all', () => {
            this.statement(tableName, 'delete_all', t => `DELETE FROM ${t}`).run();
        });
        try {
            this.connection().exec('VACUUM');
        } catch (error) {
            reportError('database', 'vacuum', error, { once: true, level: 'warning' });
        }
    }

    close() {
        if (!this.db) return;
        try {
            this.db.close();
        } catch (e) { }
        this.db = null;
        this.tables.clear();
        this.statements.clear();
    }
}

module.exports = new Database();
