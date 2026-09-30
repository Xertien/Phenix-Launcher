const { safeStorage } = require('electron');
const { AZauth, Mojang } = require('minecraft-java-core');
const database = require('./database.js');
const settings = require('./settings.js');
const remote = require('./remote.js');
const MicrosoftDeviceAuth = require('./msDeviceAuth.js');
const { isAccountId } = require('../validate.js');
const { reportError, reportMessage } = require('../reporting.js');

const ACCOUNTS_SCHEMA = 2;

class Accounts {
    constructor() {
        this.cache = new Map();
        this.persistent = false;
        this.memorySelected = null;
        this.nextMemoryId = 1000000000;
        this.memoryOnly = new Set();
        this.queue = Promise.resolve();
    }

    run(task) {
        let result = this.queue.then(task, task);
        this.queue = result.catch(() => { });
        return result;
    }

    async detectEncryption() {
        try {
            if (!(await safeStorage.isAsyncEncryptionAvailable())) {
                reportMessage('accounts', 'encryption_unavailable', 'safeStorage encryption unavailable, sessions kept in memory', { once: true, tags: { reason: 'unavailable' } });
                return false;
            }
            if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
                let backend = safeStorage.getSelectedStorageBackend();
                if (backend === 'basic_text' || backend === 'unknown') {
                    reportMessage('accounts', 'encryption_unavailable', 'safeStorage backend not secure, sessions kept in memory', { once: true, level: 'info', tags: { reason: backend } });
                    return false;
                }
            }
            return true;
        } catch (e) {
            reportError('accounts', 'encryption_detect', e, { once: true });
            return false;
        }
    }

    async encrypt(account) {
        let data = { ...account };
        delete data.ID;
        let encrypted = await safeStorage.encryptStringAsync(JSON.stringify(data));
        return encrypted.toString('base64');
    }

    async decrypt(secret) {
        let { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(secret, 'base64'));
        let account = JSON.parse(result);
        if (!account || typeof account !== 'object') throw new Error('invalid account');
        return { account, shouldReEncrypt };
    }

    async wipeStored(reason) {
        let count = 0;
        try {
            count = (await database.readAllData('accounts')).length;
            await database.deleteAllData('accounts');
            if (count) reportMessage('accounts', 'wipe', `Stored accounts wiped (${reason})`, { once: reason, level: 'info', tags: { reason }, extra: { count } });
        } catch (e) {
            reportError('accounts', 'wipe', e, { once: true, tags: { reason } });
        }
    }

    init() {
        return this.run(async () => {
            await settings.init();
            this.persistent = await this.detectEncryption();

            let configClient = await settings.get();
            if (configClient.accounts_schema !== ACCOUNTS_SCHEMA) {
                console.info('[Accounts] Migration du stockage des comptes, déconnexion de tous les comptes');
                await this.wipeStored('schema_migration');
                await settings.update(config => {
                    config.account_selected = null;
                    config.accounts_schema = ACCOUNTS_SCHEMA;
                });
            }

            if (!this.persistent) {
                console.info('[Accounts] Chiffrement indisponible, les sessions resteront en mémoire');
                await settings.update(config => {
                    config.account_selected = null;
                });
                return;
            }

            let rows = await database.readAllData('accounts');
            let invalid = 0;
            let unreadable = 0;
            let lastError = null;
            for (let row of rows) {
                if (!row || row.schema !== ACCOUNTS_SCHEMA || typeof row.secret !== 'string') {
                    invalid++;
                    await database.deleteData('accounts', row?.ID).catch(() => { });
                    continue;
                }
                let decrypted;
                try {
                    decrypted = await this.decrypt(row.secret);
                } catch (e) {
                    unreadable++;
                    lastError = e;
                    await database.deleteData('accounts', row.ID).catch(() => { });
                    continue;
                }
                let { account, shouldReEncrypt } = decrypted;
                account.ID = row.ID;
                this.cache.set(String(row.ID), account);
                if (shouldReEncrypt) {
                    try {
                        await database.updateData('accounts', { schema: ACCOUNTS_SCHEMA, secret: await this.encrypt(account) }, row.ID);
                    } catch (e) {
                        reportError('accounts', 'reencrypt', e, { once: true });
                    }
                }
            }
            if (unreadable) reportError('accounts', 'decrypt', lastError, { once: true, extra: { unreadable, total: rows.length } });
            if (invalid) reportMessage('accounts', 'invalid_rows', 'Invalid stored accounts removed', { once: true, extra: { invalid, total: rows.length } });
        });
    }

    toDisplay(account) {
        if (!account) return null;
        let skin = account.profile?.skins?.[0]?.base64;
        return {
            ID: account.ID,
            name: typeof account.name === 'string' ? account.name : '',
            uuid: typeof account.uuid === 'string' ? account.uuid : '',
            type: account.meta?.type ?? null,
            skin: typeof skin === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(skin) ? skin : null
        };
    }

    key(id) {
        if (!isAccountId(id)) return null;
        let key = String(id);
        return this.cache.has(key) ? key : null;
    }

    async getSelectedKey() {
        let selected = this.persistent ? (await settings.get()).account_selected : this.memorySelected;
        if (selected === null || selected === undefined) return null;
        let key = String(selected);
        return this.cache.has(key) ? key : null;
    }

    async setSelected(id) {
        if (this.persistent) {
            await settings.update(config => {
                config.account_selected = id;
            });
        } else {
            this.memorySelected = id;
        }
    }

    sortedAccounts() {
        return [...this.cache.values()].sort((a, b) => Number(a.ID) - Number(b.ID));
    }

    list() {
        return this.run(async () => this.sortedAccounts().filter(account => account.name && account.meta).map(account => this.toDisplay(account)));
    }

    selected() {
        return this.run(async () => {
            let key = await this.getSelectedKey();
            return key ? this.toDisplay(this.cache.get(key)) : null;
        });
    }

    async getSelectedFull() {
        return await this.run(async () => {
            let key = await this.getSelectedKey();
            return key ? { ...this.cache.get(key) } : null;
        });
    }

    select(id) {
        return this.run(async () => {
            let key = this.key(id);
            if (!key) return null;
            let account = this.cache.get(key);
            await this.setSelected(account.ID);
            return this.toDisplay(account);
        });
    }

    async store(account) {
        let data = { ...account };
        delete data.ID;
        if (this.persistent) {
            try {
                let row = await database.createData('accounts', { schema: ACCOUNTS_SCHEMA, secret: await this.encrypt(data) });
                data.ID = row.ID;
            } catch (e) {
                reportError('accounts', 'encrypt_store', e, { once: true, level: 'warning' });
            }
        }
        if (data.ID === undefined) {
            data.ID = this.nextMemoryId++;
            this.memoryOnly.add(String(data.ID));
        }
        this.cache.set(String(data.ID), data);
        return data;
    }

    async replace(key, account) {
        let previous = this.cache.get(key);
        let data = { ...account, ID: previous.ID };
        if (this.persistent && !this.memoryOnly.has(key)) {
            try {
                await database.updateData('accounts', { schema: ACCOUNTS_SCHEMA, secret: await this.encrypt(data) }, previous.ID);
            } catch (e) {
                reportError('accounts', 'encrypt_update', e, { once: true, level: 'warning' });
            }
        }
        this.cache.set(key, data);
        return data;
    }

    async delete(key) {
        let account = this.cache.get(key);
        if (!account) return;
        this.cache.delete(key);
        if (this.persistent && !this.memoryOnly.has(key)) await database.deleteData('accounts', account.ID).catch(() => { });
        this.memoryOnly.delete(key);
        let selected = this.persistent ? (await settings.get()).account_selected : this.memorySelected;
        if (selected !== null && selected !== undefined && String(selected) === key) await this.setSelected(null);
    }

    add(account) {
        return this.run(async () => {
            let stored = await this.store(account);
            await this.setSelected(stored.ID);
            return this.toDisplay(stored);
        });
    }

    remove(id) {
        return this.run(async () => {
            let key = this.key(id);
            if (!key) return { removed: false, selected: null };
            let selectedBefore = await this.getSelectedKey();
            await this.delete(key);
            let next = null;
            if (selectedBefore === key) {
                let first = this.sortedAccounts()[0];
                if (first) {
                    await this.setSelected(first.ID);
                    next = this.toDisplay(first);
                }
            } else if (selectedBefore) {
                next = this.toDisplay(this.cache.get(selectedBefore));
            }
            return { removed: true, wasSelected: selectedBefore === key, selected: next };
        });
    }

    async refreshFailed(key, type, stage, message, error) {
        let reason = typeof message === 'string' && message.length <= 64 && /^[\w.\-]+$/.test(message) ? message : 'other';
        let options = { once: `${type}|${stage}|${reason}`, level: 'warning', tags: { account_type: type || 'unknown', stage, reason } };
        if (error) reportError('accounts', 'refresh', error, options);
        else reportMessage('accounts', 'refresh', `Account refresh failed (${type || 'unknown'}, ${stage})`, { ...options, fingerprint: [type || 'unknown', stage] });
        await this.delete(key);
        return { error: true, message: String(message) };
    }

    refresh(id) {
        return this.run(async () => {
            let key = this.key(id);
            if (!key) return { error: true, message: 'Compte introuvable' };
            let account = this.cache.get(key);
            let type = account.meta?.type;
            let config = await remote.getCachedConfig().catch(() => ({}));
            let refreshed;

            try {
                if (type === 'Xbox') {
                    refreshed = await new MicrosoftDeviceAuth(config.client_id).refresh(account);
                    if (refreshed.error) return await this.refreshFailed(key, type, 'rejected', refreshed.errorMessage || refreshed.error);
                } else if (type === 'AZauth') {
                    refreshed = await new AZauth(config.online).verify(account);
                    if (refreshed.error) return await this.refreshFailed(key, type, 'rejected', refreshed.message);
                } else if (type === 'Mojang') {
                    if (account.meta.online == false) {
                        refreshed = await Mojang.login(account.name);
                    } else {
                        refreshed = await Mojang.refresh(account);
                        if (refreshed.error) return await this.refreshFailed(key, type, 'rejected', refreshed.errorMessage);
                    }
                } else {
                    return await this.refreshFailed(key, type, 'unknown_type', 'Account Type Not Found');
                }
            } catch (error) {
                return await this.refreshFailed(key, type, 'exception', error?.message || error, error);
            }

            let stored = await this.replace(key, refreshed);
            return this.toDisplay(stored);
        });
    }
}

module.exports = new Accounts();
