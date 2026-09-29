const os = require('os');
const database = require('./database.js');
const { isSafePathSegment } = require('../../assets/js/utils/security.js');
const { isNumber, isOneOf, toInteger } = require('../validate.js');

const defaultConfig = () => ({
    account_selected: null,
    instance_selct: null,
    pinned_instances: [],
    java_config: {
        java_path: null,
        java_memory: { min: 2, max: 4 }
    },
    game_config: {
        screen_size: { width: 854, height: 480 }
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

function sanitizePinned(value) {
    if (!Array.isArray(value)) return [];
    let pinned = [];
    for (let name of value.slice(0, MAX_PINNED)) {
        if (isSafePathSegment(name) && !pinned.includes(name)) pinned.push(name);
    }
    return pinned;
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

            if (needsUpdate) {
                console.warn('[Config] Repaired missing configuration properties');
                await this.write(configClient);
            }
        });
    }

    async get() {
        return await this.run(() => this.read());
    }

    async getPublic() {
        let configClient = await this.get();
        return {
            instance_selct: configClient.instance_selct ?? null,
            pinned_instances: sanitizePinned(configClient.pinned_instances),
            java_config: {
                java_path: configClient.java_config?.java_path ?? null,
                java_memory: configClient.java_config?.java_memory ?? defaultConfig().java_config.java_memory
            },
            game_config: {
                screen_size: configClient.game_config?.screen_size ?? defaultConfig().game_config.screen_size
            },
            launcher_config: {
                download_multi: configClient.launcher_config?.download_multi ?? 5,
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
        let totalMem = Math.trunc(os.totalmem() / 1073741824 * 10) / 10;

        switch (key) {
            case 'java_memory': {
                if (!value || typeof value !== 'object') return false;
                let min = Number(value.min);
                let max = Number(value.max);
                if (!isNumber(min, 0.5, Math.max(totalMem, 1)) || !isNumber(max, 0.5, Math.max(totalMem, 2))) return false;
                if (min > max) return false;
                await this.update(configClient => {
                    configClient.java_config = configClient.java_config || defaultConfig().java_config;
                    configClient.java_config.java_memory = { min, max };
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
            case 'download_multi': {
                let number = toInteger(value, 1, 100);
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

    async setJavaPath(javaPath) {
        await this.update(configClient => {
            configClient.java_config = configClient.java_config || defaultConfig().java_config;
            configClient.java_config.java_path = javaPath;
        });
    }
}

module.exports = new Settings();
