const { contextBridge, ipcRenderer } = require('electron');

const GAME_EVENTS = ['extract', 'progress', 'check', 'estimated', 'speed', 'patch', 'data', 'close', 'error', 'ram-applied', 'ram-recommendation'];

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
        minimize: () => invoke('window:minimize'),
        maximize: () => invoke('window:maximize'),
        close: () => invoke('window:close'),
        devTools: () => invoke('window:dev-tools')
    },
    theme: {
        isDark: theme => invoke('theme:is-dark', theme),
        background: isDark => invoke('theme:background', isDark),
        onUpdated: callback => typeof callback === 'function' ? subscribe('theme:updated', () => callback()) : () => { }
    },
    config: {
        get: () => invoke('config:get')
    },
    news: {
        get: () => invoke('news:get')
    },
    instances: {
        list: () => invoke('instances:list'),
        status: () => invoke('instances:status'),
        remove: name => invoke('instances:delete', name)
    },
    server: {
        status: instanceName => invoke('server:status', instanceName)
    },
    panels: {
        load: id => invoke('panels:load', id)
    },
    settings: {
        get: () => invoke('settings:get'),
        set: (key, value) => invoke('settings:set', key, value),
        reset: () => invoke('settings:reset')
    },
    folders: {
        open: kind => invoke('folders:open', kind)
    },
    system: {
        memory: () => invoke('system:memory')
    },
    java: {
        pick: () => invoke('java:pick'),
        runtimePath: () => invoke('java:runtime-path')
    },
    accounts: {
        list: () => invoke('accounts:list'),
        selected: () => invoke('accounts:selected'),
        select: id => invoke('accounts:select', id),
        remove: id => invoke('accounts:remove', id),
        refresh: id => invoke('accounts:refresh', id)
    },
    auth: {
        microsoft: {
            start: () => invoke('auth:microsoft:start'),
            poll: sessionId => invoke('auth:microsoft:poll', sessionId),
            cancel: sessionId => invoke('auth:microsoft:cancel', sessionId),
            copyCode: sessionId => invoke('auth:microsoft:copy-code', sessionId),
            openBrowser: sessionId => invoke('auth:microsoft:open', sessionId)
        },
        offline: {
            login: name => invoke('auth:offline:login', name)
        },
        azauth: {
            login: (email, password, code) => invoke('auth:azauth:login', email, password, code)
        }
    },
    game: {
        launch: () => invoke('game:launch'),
        on: (name, callback) => GAME_EVENTS.includes(name) ? subscribe(`game:${name}`, callback) : () => { }
    },
    shell: {
        openExternal: url => invoke('shell:open-external', url)
    }
});
