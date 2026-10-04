const { BrowserWindow, nativeTheme, shell } = require('electron');
const Sentry = require('@sentry/electron/main');
const pkg = require('../../package.json');
const { handle } = require('./ipc.js');
const { isString, isOneOf, isAccountId } = require('./validate.js');
const { isSafeExternalUrl, scrubString } = require('../assets/js/utils/security.js');
const MainWindow = require('../assets/js/windows/mainWindow.js');
const UpdateWindow = require('../assets/js/windows/updateWindow.js');
const remote = require('./services/remote.js');
const settings = require('./services/settings.js');
const accounts = require('./services/accounts.js');
const auth = require('./services/auth.js');
const game = require('./services/game.js');
const instances = require('./services/instances.js');
const system = require('./services/system.js');
const updater = require('./services/updater.js');

const LAUNCHER = ['launcher'];
const UPDATE = ['update'];
const BOTH = ['launcher', 'update'];
const SETTINGS_KEYS = ['java_memory', 'instance_memory', 'screen_size', 'fullscreen', 'jvm_args', 'game_args', 'download_multi', 'theme', 'closeLauncher', 'instance_selct', 'pinned_instances', 'java_path'];
const FOLDERS = ['game', 'instance', 'logs'];

let reportWindow = { start: 0, count: 0 };

function senderWindow(event) {
    return BrowserWindow.fromWebContents(event.sender);
}

function report(level, name, message) {
    if (!isOneOf(level, ['warning', 'error'])) return false;
    if (!isString(name, 64) || !isString(message, 8000)) return false;
    let now = Date.now();
    if (now - reportWindow.start > 60000) reportWindow = { start: now, count: 0 };
    if (++reportWindow.count > 30) return false;
    Sentry.captureMessage(`[Renderer][${name}] ${scrubString(message)}`, level);
    return true;
}

async function knownInstanceNames() {
    let list = await remote.getInstanceList().catch(() => []);
    return Array.isArray(list) ? list.map(instance => instance.name) : [];
}

function broadcastThemeUpdate() {
    for (let window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('theme:updated');
    }
}

function register() {
    updater.register();
    nativeTheme.on('updated', broadcastThemeUpdate);

    handle('app:info', BOTH, () => ({ name: pkg.name, version: pkg.version }));
    handle('log:report', BOTH, (event, level, name, message) => report(level, name, message));

    handle('theme:is-dark', BOTH, (event, theme) => system.isDarkTheme(isOneOf(theme, ['auto', 'dark', 'light']) ? theme : 'dark'));
    handle('theme:background', LAUNCHER, (event, isDark) => system.background(isDark === true));

    handle('config:get', BOTH, async () => {
        try {
            return await remote.getConfig();
        } catch (error) {
            return { error: error?.error || { code: 'unknown', message: 'server not accessible' } };
        }
    });
    handle('news:get', LAUNCHER, async () => {
        try {
            return await remote.getNews();
        } catch (error) {
            return { error: error?.error || { code: 'unknown', message: 'server not accessible' } };
        }
    });
    handle('instances:list', LAUNCHER, () => remote.getInstanceList());
    handle('instances:status', LAUNCHER, () => instances.status());
    handle('instances:delete', LAUNCHER, (event, name) => isString(name, 64) ? instances.remove(name) : { error: 'invalid_name', message: "Nom d'instance invalide." });
    handle('server:status', LAUNCHER, (event, instanceName) => game.serverStatus(instanceName));
    handle('panels:load', LAUNCHER, (event, id) => system.loadPanel(id));

    handle('settings:get', BOTH, () => settings.getPublic());
    handle('settings:set', LAUNCHER, async (event, key, value) => {
        if (!isOneOf(key, SETTINGS_KEYS)) return false;
        if (key === 'pinned_instances' || key === 'instance_memory') {
            let knownInstances = await knownInstanceNames();
            if (!knownInstances.length) return false;
            return settings.set(key, value, { knownInstances });
        }
        return settings.set(key, value);
    });
    handle('settings:reset', LAUNCHER, () => settings.reset());
    handle('system:memory', LAUNCHER, () => system.memory());
    handle('folders:open', LAUNCHER, (event, kind) => isOneOf(kind, FOLDERS) ? instances.openFolder(kind) : { error: 'invalid_folder', message: 'Dossier inconnu.' });
    handle('java:pick', LAUNCHER, event => system.pickJava(senderWindow(event)));
    handle('java:runtime-path', LAUNCHER, () => game.runtimePath());

    handle('accounts:list', LAUNCHER, () => accounts.list());
    handle('accounts:selected', LAUNCHER, () => accounts.selected());
    handle('accounts:select', LAUNCHER, (event, id) => isAccountId(id) ? accounts.select(id) : null);
    handle('accounts:remove', LAUNCHER, (event, id) => isAccountId(id) ? accounts.remove(id) : { removed: false, selected: null });
    handle('accounts:refresh', LAUNCHER, (event, id) => isAccountId(id) ? accounts.refresh(id) : { error: true, message: 'Compte invalide' });

    handle('auth:microsoft:start', LAUNCHER, event => auth.microsoftStart(event));
    handle('auth:microsoft:poll', LAUNCHER, (event, sessionId) => auth.microsoftPoll(event, sessionId));
    handle('auth:microsoft:cancel', LAUNCHER, (event, sessionId) => auth.microsoftCancel(event, sessionId));
    handle('auth:microsoft:copy-code', LAUNCHER, (event, sessionId) => auth.microsoftCopyCode(event, sessionId));
    handle('auth:microsoft:open', LAUNCHER, (event, sessionId) => auth.microsoftOpenVerification(event, sessionId));
    handle('auth:offline:login', LAUNCHER, (event, name) => auth.offlineLogin(name));
    handle('auth:azauth:login', LAUNCHER, (event, email, password, code) => auth.azauthLogin(email, password, code));

    handle('game:launch', LAUNCHER, event => game.launch(senderWindow(event)));

    handle('shell:open-external', LAUNCHER, async (event, url) => {
        if (!isString(url, 2048) || !isSafeExternalUrl(url)) return false;
        await shell.openExternal(url);
        return true;
    });

    handle('window:minimize', LAUNCHER, event => senderWindow(event)?.minimize());
    handle('window:maximize', LAUNCHER, event => {
        let window = senderWindow(event);
        if (!window) return false;
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        return window.isMaximized();
    });
    handle('window:close', BOTH, event => {
        if (MainWindow.getWindow() && senderWindow(event) === MainWindow.getWindow()) return MainWindow.destroyWindow();
        UpdateWindow.destroyWindow();
    });
    handle('window:dev-tools', BOTH, event => {
        let contents = event.sender;
        if (contents.isDevToolsOpened()) contents.closeDevTools();
        contents.openDevTools({ mode: 'detach' });
    });

    handle('updater:check', UPDATE, () => updater.check());
    handle('updater:start', UPDATE, () => updater.start());
    handle('updater:manual-download', UPDATE, () => updater.prepareManualDownload());
    handle('updater:open-manual-download', UPDATE, () => updater.openManualDownload());
    handle('updater:launch-main', UPDATE, () => {
        MainWindow.createWindow();
        UpdateWindow.destroyWindow();
    });
}

async function init() {
    await accounts.init();
}

module.exports = {
    register,
    init
};
