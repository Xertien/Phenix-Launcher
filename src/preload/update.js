const { contextBridge, ipcRenderer } = require('electron');

const UPDATER_EVENTS = ['available', 'not-available', 'progress', 'error'];

function invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
    if (typeof callback !== 'function') return () => { };
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('launcher', {
    platform: process.platform,
    app: {
        info: () => invoke('app:info')
    },
    log: {
        report: (level, name, message) => invoke('log:report', level, name, message)
    },
    window: {
        close: () => invoke('window:close'),
        devTools: () => invoke('window:dev-tools')
    },
    theme: {
        isDark: theme => invoke('theme:is-dark', theme),
        onUpdated: callback => typeof callback === 'function' ? subscribe('theme:updated', () => callback()) : () => { }
    },
    config: {
        get: () => invoke('config:get')
    },
    settings: {
        get: () => invoke('settings:get')
    },
    updater: {
        check: () => invoke('updater:check'),
        start: () => invoke('updater:start'),
        prepareManualDownload: () => invoke('updater:manual-download'),
        openManualDownload: () => invoke('updater:open-manual-download'),
        launchMain: () => invoke('updater:launch-main'),
        on: (name, callback) => UPDATER_EVENTS.includes(name) ? subscribe(`updater:${name}`, callback) : () => { }
    }
});
