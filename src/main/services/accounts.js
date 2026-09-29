const { safeStorage } = require('electron');
const { AZauth, Mojang } = require('minecraft-java-core');
const database = require('./database.js');
const settings = require('./settings.js');
const remote = require('./remote.js');
const MicrosoftDeviceAuth = require('./msDeviceAuth.js');
const { isAccountId } = require('../validate.js');

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
            if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
            if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
                let backend = safeStorage.getSelectedStorageBackend();
                if (backend === 'basic_text' || backend === 'unknown') return false;
            }
            return true;
        } catch (e) {
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

    async wipeStored() {
        try {
            await database.deleteAllData('accounts');
        } catch (e) {
            console.error(`[Accounts] Impossible de vider les comptes: ${e?.message || e}`);
        }
    }

    init() {
        return this.run(async () => {
            await settings.init();
            this.persistent = await this.detectEncryption();

            let configClient = await settings.get();
            if (configClient.accounts_schema !== ACCOUNTS_SCHEMA) {
                console.warn('[Accounts] Migration du stockage des comptes, déconnexion de tous les comptes');
                await this.wipeStored();
                await settings.update(config => {
                    config.account_selected = null;
                    config.accounts_schema = ACCOUNTS_SCHEMA;
                });
            }

            if (!this.persistent) {
                console.warn('[Accounts] Chiffrement indisponible, les sessions resteront en mémoire');
                await settings.update(config => {
                    config.account_selected = null;
                });
                return;
            }

            let rows = await database.readAllData('accounts');
            for (let row of rows) {
                if (!row || row.schema !== ACCOUNTS_SCHEMA || typeof row.secret !== 'string') {
                    await database.deleteData('accounts', row?.ID).catch(() => { });
                    continue;
                }
                try {
                    let { account, shouldReEncrypt } = await this.decrypt(row.secret);
                    account.ID = row.ID;
                    this.cache.set(String(row.ID), account);
                    if (shouldReEncrypt) await database.updateData('accounts', { schema: ACCOUNTS_SCHEMA, secret: await this.encrypt(account) }, row.ID);
                } catch (e) {
                    console.warn(`[Accounts] Compte ${row.ID} illisible, suppression`);
                    await database.deleteData('accounts', row.ID).catch(() => { });
                }
            }
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
                console.warn(`[Accounts] Chiffrement impossible, session gardée en mémoire: ${e?.message || e}`);
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
                console.warn(`[Accounts] Mise à jour chiffrée impossible: ${e?.message || e}`);
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
                    if (refreshed.error) {
                        console.error(`[Account] ${account.name}: ${refreshed.errorMessage || refreshed.error}`);
                        await this.delete(key);
                        return { error: true, message: String(refreshed.errorMessage || refreshed.error) };
                    }
                } else if (type === 'AZauth') {
                    refreshed = await new AZauth(config.online).verify(account);
                    if (refreshed.error) {
                        console.error(`[Account] ${account.name}: ${refreshed.message}`);
                        await this.delete(key);
                        return { error: true, message: String(refreshed.message) };
                    }
                } else if (type === 'Mojang') {
                    if (account.meta.online == false) {
                        refreshed = await Mojang.login(account.name);
                    } else {
                        refreshed = await Mojang.refresh(account);
                        if (refreshed.error) {
                            console.error(`[Account] ${account.name}: ${refreshed.errorMessage}`);
                            await this.delete(key);
                            return { error: true, message: String(refreshed.errorMessage) };
                        }
                    }
                } else {
                    console.error(`[Account] ${account.name}: Account Type Not Found`);
                    await this.delete(key);
                    return { error: true, message: 'Account Type Not Found' };
                }
            } catch (error) {
                console.error(`[Account] ${account.name}: ${error?.message || error}`);
                await this.delete(key);
                return { error: true, message: String(error?.message || error) };
            }

            let stored = await this.replace(key, refreshed);
            return this.toDisplay(stored);
        });
    }
}

module.exports = new Accounts();
