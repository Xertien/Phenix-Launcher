const os = require('os');
const database = require('./database.js');
const { isSafePathSegment } = require('../../assets/js/utils/security.js');
const { isNumber, isOneOf, toInteger, parseJvmArgs, parseGameArgs } = require('../validate.js');

const GIB = 1073741824;

const defaultConfig = () => ({
    account_selected: null,
    instance_selct: null,
    pinned_instances: [],
    instance_memory: {},
    java_config: {
        java_path: null,
        java_memory: { min: 2, max: 4 },
        jvm_args: ''
    },
    game_config: {
        screen_size: { width: 854, height: 480 },
        fullscreen: false,
        game_args: ''
    },
    launcher_config: {
        download_multi: 5,
        theme: 'dark',
        closeLauncher: 'close-launcher',
        intelEnabledMac: true
    }
});

const THEMES = ['auto', 'dark', 'light'];
const CLOSE_MODES = ['close-launcher', 'close-all', 'close-none'];
const MAX_PINNED = 64;
const MAX_INSTANCE_MEMORY = 128;
const MAX_DOWNLOADS = 30;

function memoryLimits() {
    let total = os.totalmem() / GIB;
    let totalGB = Math.trunc(total * 10) / 10;
    let reserve = Math.max(2, total * 0.25);
    let usableGB = Math.floor((total - reserve) * 2) / 2;
    usableGB = Math.min(Math.max(1, usableGB), Math.max(1, Math.floor(total * 2) / 2));
    return { totalGB, usableGB };
}

function sanitizePinned(value) {
    if (!Array.isArray(value)) return [];
    let pinned = [];
    for (let name of value.slice(0, MAX_PINNED)) {
        if (isSafePathSegment(name) && !pinned.includes(name)) pinned.push(name);
    }
    return pinned;
}

function validMemory(value, limit) {
    if (!value || typeof value !== 'object') return null;
    let min = Number(value.min);
    let max = Number(value.max);
    if (!isNumber(min, 0.5, Math.max(limit, 1)) || !isNumber(max, 0.5, Math.max(limit, 2)) || min > max) return null;
    return { min, max };
}

function sanitizeInstanceMemory(value) {
    let result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    let count = 0;
    for (let [name, memory] of Object.entries(value)) {
        if (count >= MAX_INSTANCE_MEMORY) break;
        if (!isSafePathSegment(name)) continue;
        let valid = validMemory(memory, Infinity);
        if (!valid) continue;
        result[name] = valid;
        count++;
    }
    return result;
}

function storedArgs(value, parser) {
    if (typeof value !== 'string') return '';
    let parsed = parser(value);
    return parsed.error ? '' : parsed.args.join(' ');
}

class Settings {
    constructor() {
        this.queue = Promise.resolve();
    }

    run(task) {
        let result = this.queue.then(task, task);
        this.queue = result.catch(() => { });
        return result;
    }

    async read() {
        let configClient = await database.readData('configClient');
        if (!configClient) {
            configClient = await database.createData('configClient', defaultConfig());
        }
        return configClient;
    }

    async write(configClient) {
        let data = { ...configClient };
        delete data.ID;
        await database.updateData('configClient', data);
    }

    init() {
        return this.run(async () => {
            let configClient = await database.readData('configClient');
            let defaults = defaultConfig();

            if (!configClient) {
                await database.createData('configClient', defaults);
                return;
            }

            let needsUpdate = false;

            if (!configClient.java_config) {
                configClient.java_config = defaults.java_config;
                needsUpdate = true;
            } else if (!configClient.java_config.java_memory) {
                configClient.java_config.java_memory = defaults.java_config.java_memory;
                needsUpdate = true;
            }

            if (!configClient.game_config) {
                configClient.game_config = defaults.game_config;
                needsUpdate = true;
            } else if (!configClient.game_config.screen_size) {
                configClient.game_config.screen_size = defaults.game_config.screen_size;
                needsUpdate = true;
            }

            if (!configClient.launcher_config) {
                configClient.launcher_config = defaults.launcher_config;
                needsUpdate = true;
            }

            if (!configClient.instance_memory || typeof configClient.instance_memory !== 'object' || Array.isArray(configClient.instance_memory)) {
                configClient.instance_memory = {};
                needsUpdate = true;
            }

            if (needsUpdate) {
                console.warn('[Config] Repaired missing configuration properties');
                await this.write(configClient);
            }
        });
    }

    async get() {
        return await this.run(() => this.read());
    }

    limits() {
        return memoryLimits();
    }

    globalMemory(configClient) {
        return validMemory(configClient?.java_config?.java_memory, Infinity) ?? defaultConfig().java_config.java_memory;
    }

    instanceMemory(configClient, name) {
        if (!isSafePathSegment(name)) return null;
        return sanitizeInstanceMemory(configClient?.instance_memory)[name] ?? null;
    }

    launchOptions(configClient) {
        return {
            jvmArgs: parseJvmArgs(storedArgs(configClient?.java_config?.jvm_args, parseJvmArgs)).args,
            gameArgs: parseGameArgs(storedArgs(configClient?.game_config?.game_args, parseGameArgs)).args,
            fullscreen: configClient?.game_config?.fullscreen === true
        };
    }

    async getPublic() {
        let configClient = await this.get();
        return {
            instance_selct: configClient.instance_selct ?? null,
            pinned_instances: sanitizePinned(configClient.pinned_instances),
            instance_memory: sanitizeInstanceMemory(configClient.instance_memory),
            java_config: {
                java_path: configClient.java_config?.java_path ?? null,
                java_memory: this.globalMemory(configClient),
                jvm_args: storedArgs(configClient.java_config?.jvm_args, parseJvmArgs)
            },
            game_config: {
                screen_size: configClient.game_config?.screen_size ?? defaultConfig().game_config.screen_size,
                fullscreen: configClient.game_config?.fullscreen === true,
                game_args: storedArgs(configClient.game_config?.game_args, parseGameArgs)
            },
            launcher_config: {
                download_multi: Math.min(MAX_DOWNLOADS, configClient.launcher_config?.download_multi ?? 5),
                theme: configClient.launcher_config?.theme ?? 'dark',
                closeLauncher: configClient.launcher_config?.closeLauncher ?? 'close-launcher',
                intelEnabledMac: configClient.launcher_config?.intelEnabledMac ?? true
            }
        };
    }

    update(mutator) {
        return this.run(async () => {
            let configClient = await this.read();
            let result = await mutator(configClient);
            await this.write(configClient);
            return result;
        });
    }

    async set(key, value, options = {}) {
        let { totalGB } = memoryLimits();

        switch (key) {
            case 'java_memory': {
                let memory = validMemory(value, totalGB);
                if (!memory) return false;
                await this.update(configClient => {
                    configClient.java_config = configClient.java_config || defaultConfig().java_config;
                    configClient.java_config.java_memory = memory;
                });
                return true;
            }
            case 'instance_memory': {
                if (!value || typeof value !== 'object' || !isSafePathSegment(value.name)) return false;
                if (!Array.isArray(options.knownInstances) || !options.knownInstances.includes(value.name)) return false;
                let memory = validMemory(value, totalGB);
                if (!memory) return false;
                await this.update(configClient => {
                    let current = sanitizeInstanceMemory(configClient.instance_memory);
                    let next = {};
                    for (let [name, entry] of Object.entries(current)) {
                        if (name !== value.name && options.knownInstances.includes(name)) next[name] = entry;
                    }
                    next[value.name] = memory;
                    configClient.instance_memory = sanitizeInstanceMemory(next);
                });
                return true;
            }
            case 'screen_size': {
                if (!value || typeof value !== 'object') return false;
                let width = value.width === undefined ? undefined : toInteger(value.width, 1, 16384);
                let height = value.height === undefined ? undefined : toInteger(value.height, 1, 16384);
                if (width === null || height === null) return false;
                await this.update(configClient => {
                    configClient.game_config = configClient.game_config || defaultConfig().game_config;
                    let current = configClient.game_config.screen_size || defaultConfig().game_config.screen_size;
                    configClient.game_config.screen_size = {
                        width: width ?? current.width,
                        height: height ?? current.height
                    };
                });
                return true;
            }
            case 'fullscreen': {
                if (typeof value !== 'boolean') return false;
                await this.update(configClient => {
                    configClient.game_config = configClient.game_config || defaultConfig().game_config;
                    configClient.game_config.fullscreen = value;
                });
                return true;
            }
            case 'jvm_args':
            case 'game_args': {
                let parsed = key === 'jvm_args' ? parseJvmArgs(value) : parseGameArgs(value);
                if (parsed.error) return { error: parsed.error };
                let normalized = parsed.args.join(' ');
                await this.update(configClient => {
                    if (key === 'jvm_args') {
                        configClient.java_config = configClient.java_config || defaultConfig().java_config;
                        configClient.java_config.jvm_args = normalized;
                    } else {
                        configClient.game_config = configClient.game_config || defaultConfig().game_config;
                        configClient.game_config.game_args = normalized;
                    }
                });
                return true;
            }
            case 'download_multi': {
                let number = toInteger(value, 1, MAX_DOWNLOADS);
                if (number === null) return false;
                await this.update(configClient => {
                    configClient.launcher_config = configClient.launcher_config || defaultConfig().launcher_config;
                    configClient.launcher_config.download_multi = number;
                });
                return true;
            }
            case 'theme': {
                if (!isOneOf(value, THEMES)) return false;
                await this.update(configClient => {
                    configClient.launcher_config = configClient.launcher_config || defaultConfig().launcher_config;
                    configClient.launcher_config.theme = value;
                });
                return true;
            }
            case 'closeLauncher': {
                if (!isOneOf(value, CLOSE_MODES)) return false;
                await this.update(configClient => {
                    configClient.launcher_config = configClient.launcher_config || defaultConfig().launcher_config;
                    configClient.launcher_config.closeLauncher = value;
                });
                return true;
            }
            case 'instance_selct': {
                if (value !== null && !isSafePathSegment(value)) return false;
                await this.update(configClient => {
                    configClient.instance_selct = value;
                });
                return true;
            }
            case 'pinned_instances': {
                if (!Array.isArray(value) || value.length > MAX_PINNED) return false;
                if (!value.every(name => isSafePathSegment(name))) return false;
                let pinned = sanitizePinned(value);
                if (Array.isArray(options.knownInstances)) pinned = pinned.filter(name => options.knownInstances.includes(name));
                await this.update(configClient => {
                    configClient.pinned_instances = pinned;
                });
                return true;
            }
            case 'java_path': {
                if (value !== null) return false;
                await this.setJavaPath(null);
                return true;
            }
            default:
                return false;
        }
    }

    async setInstanceMemoryIfMissing(name, memory) {
        if (!isSafePathSegment(name)) return false;
        let valid = validMemory(memory, memoryLimits().totalGB);
        if (!valid) return false;
        return await this.update(configClient => {
            let current = sanitizeInstanceMemory(configClient.instance_memory);
            if (current[name]) return false;
            if (Object.keys(current).length >= MAX_INSTANCE_MEMORY) return false;
            current[name] = valid;
            configClient.instance_memory = current;
            return true;
        });
    }

    async reset() {
        await this.update(configClient => {
            let defaults = defaultConfig();
            configClient.java_config = defaults.java_config;
            configClient.game_config = defaults.game_config;
            configClient.launcher_config = defaults.launcher_config;
            configClient.instance_memory = {};
        });
        return true;
    }

    async getPendingInstances() {
        let configClient = await this.get();
        return sanitizePinned(configClient.pending_instances);
    }

    async setInstancePending(name, pending) {
        if (!isSafePathSegment(name)) return;
        await this.update(configClient => {
            let list = sanitizePinned(configClient.pending_instances).filter(item => item !== name);
            if (pending) list.push(name);
            configClient.pending_instances = list.slice(-MAX_PINNED);
        });
    }

    async setJavaPath(javaPath) {
        await this.update(configClient => {
            configClient.java_config = configClient.java_config || defaultConfig().java_config;
            configClient.java_config.java_path = javaPath;
        });
    }
}

module.exports = new Settings();
