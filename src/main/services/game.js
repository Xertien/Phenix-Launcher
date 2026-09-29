const { app } = require('electron');
const { Launch, Status } = require('minecraft-java-core');
const accounts = require('./accounts.js');
const settings = require('./settings.js');
const remote = require('./remote.js');
const { isSafePathSegment, scrubString } = require('../../assets/js/utils/security.js');

class Game {
    constructor() {
        this.running = false;
        this.statusCache = { time: 0, list: null };
    }

    getGamePath(dataDirectory) {
        return `${app.getPath('appData')}/${process.platform == 'darwin' ? dataDirectory : `.${dataDirectory}`}`;
    }

    async runtimePath() {
        let config = await remote.getCachedConfig().catch(() => ({}));
        if (!isSafePathSegment(config.dataDirectory)) return '';
        return `${this.getGamePath(config.dataDirectory)}/runtime`;
    }

    async instancesCached() {
        if (this.statusCache.list && Date.now() - this.statusCache.time < 15000) return this.statusCache.list;
        let list = await remote.getInstanceList();
        this.statusCache = { time: Date.now(), list };
        return list;
    }

    async serverStatus(instanceName) {
        if (!isSafePathSegment(instanceName)) return { online: false };
        let instance = (await this.instancesCached()).find(i => i.name == instanceName);
        let status = instance?.status;
        if (!status || typeof status.ip !== 'string' || !status.ip.length || status.ip.length > 253) return { online: false };
        let port = Number(status.port) || 25565;
        let statusServer = await new Status(status.ip, port).getStatus().then(res => res).catch(err => ({ error: err }));
        if (!statusServer || statusServer.error) return { online: false };
        return {
            online: true,
            ms: Number(statusServer.ms) || 0,
            playersConnect: Number(statusServer.playersConnect) || 0
        };
    }

    async launch(window) {
        if (this.running) return { error: 'already_running', message: 'Le jeu est déjà en cours de lancement.' };

        let configClient = await settings.get();
        let config = await remote.getConfig().catch(() => null);
        let instances = await remote.getInstanceList();
        let authenticator = await accounts.getSelectedFull();
        let options = instances.find(i => i.name == configClient.instance_selct);

        if (!authenticator || !authenticator.meta || !authenticator.meta.type) {
            return { error: 'no_account', message: 'Aucun compte valide sélectionné. Veuillez vous reconnecter.' };
        }

        if (!options) {
            return { error: 'no_instance', message: 'Aucune instance sélectionnée.' };
        }

        if (!config || !isSafePathSegment(config.dataDirectory) || !isSafePathSegment(options.name) || !options.loadder) {
            return { error: 'invalid_config', message: 'Configuration distante invalide (chemin non autorisé).' };
        }

        let closeLauncher = configClient.launcher_config?.closeLauncher;
        let javaPath = configClient.java_config?.java_path || null;
        let memory = configClient.java_config?.java_memory || { min: 2, max: 4 };
        let screen = configClient.game_config?.screen_size || { width: 854, height: 480 };

        let opt = {
            url: typeof options.url === 'string' ? options.url.replace(/^http:\/\//i, 'https://').replace(/\/files\?/, '/files/?') : options.url,
            authenticator: authenticator,
            timeout: 10000,
            path: this.getGamePath(config.dataDirectory),
            instance: options.name,
            version: options.loadder.minecraft_version,
            detached: closeLauncher == 'close-all' ? false : true,
            downloadFileMultiple: Number(configClient.launcher_config?.download_multi) || 5,
            intelEnabledMac: configClient.launcher_config?.intelEnabledMac,

            loader: {
                type: options.loadder.loadder_type,
                build: options.loadder.loadder_version,
                enable: options.loadder.loadder_type == 'none' ? false : true
            },

            verify: options.verify,

            ignored: Array.isArray(options.ignored) ? [...options.ignored] : [],

            javaPath: javaPath,

            java: {
                path: javaPath,
                version: null,
                type: 'jre'
            },

            screen: {
                width: Number(screen.width) || 854,
                height: Number(screen.height) || 480
            },

            memory: {
                min: `${Number(memory.min) * 1024}M`,
                max: `${Number(memory.max) * 1024}M`
            }
        };

        let launch = new Launch();
        let sender = window.webContents;
        let send = (channel, ...args) => {
            if (!sender.isDestroyed()) sender.send(channel, ...args);
        };
        let hidden = false;

        let restore = () => {
            this.running = false;
            if (window.isDestroyed()) return;
            if (closeLauncher == 'close-launcher' && hidden) window.show();
            window.setProgressBar(-1);
        };

        this.running = true;
        window.setProgressBar(2);

        launch.on('extract', extract => {
            if (!window.isDestroyed()) window.setProgressBar(2);
            send('game:extract', scrubString(String(extract)));
        });

        launch.on('progress', (progress, size) => {
            if (!window.isDestroyed() && size) window.setProgressBar(progress / size);
            send('game:progress', Number(progress) || 0, Number(size) || 0);
        });

        launch.on('check', (progress, size) => {
            if (!window.isDestroyed() && size) window.setProgressBar(progress / size);
            send('game:check', Number(progress) || 0, Number(size) || 0);
        });

        launch.on('estimated', time => send('game:estimated', Number(time) || 0));

        launch.on('speed', speed => send('game:speed', Number(speed) || 0));

        launch.on('patch', patch => {
            if (!window.isDestroyed()) window.setProgressBar(2);
            send('game:patch', scrubString(String(patch)));
        });

        launch.on('data', data => {
            if (!window.isDestroyed()) {
                if (closeLauncher == 'close-launcher' && !hidden) {
                    hidden = true;
                    window.hide();
                }
                window.setProgressBar(2);
            }
            send('game:data', scrubString(String(data)));
        });

        launch.on('close', code => {
            restore();
            send('game:close', String(code));
        });

        launch.on('error', err => {
            restore();
            let message = typeof err?.error === 'string' ? err.error : (err?.message || String(err?.error ?? err));
            console.error(`[Game] ${scrubString(String(message))}`);
            send('game:error', scrubString(String(message)));
        });

        try {
            await launch.Launch(opt);
        } catch (error) {
            restore();
            let message = scrubString(String(error?.message || error));
            send('game:error', message);
        }
        return { started: true };
    }
}

module.exports = new Game();
