/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const Sentry = require('@sentry/electron/main');
const { sentryBeforeSend, sentryBeforeBreadcrumb, isSafeExternalUrl } = require('./assets/js/utils/security.js');

Sentry.init({
    dsn: "https://38394ab6f5576f5332b25abe3fdb3a80@o4509386054500352.ingest.de.sentry.io/4510526799151184",
    sendDefaultPii: false,
    ipcMode: Sentry.IPCMode.Classic,
    integrations: defaults => [
        ...defaults.filter(integration => integration.name !== 'PreloadInjection'),
        Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
    ],
    beforeSend: sentryBeforeSend,
    beforeBreadcrumb: sentryBeforeBreadcrumb,
});

const { app, shell } = require('electron');

const path = require('path');
const fs = require('fs');

const UpdateWindow = require("./assets/js/windows/updateWindow.js");
const MainWindow = require("./assets/js/windows/mainWindow.js");
const services = require('./main/index.js');
const database = require('./main/services/database.js');
const { reportError } = require('./main/reporting.js');

let dev = process.env.NODE_ENV === 'dev';

if (dev) {
    let appPath = path.resolve('./data/Launcher').replace(/\\/g, '/');
    let appdata = path.resolve('./data').replace(/\\/g, '/');
    if (!fs.existsSync(appPath)) fs.mkdirSync(appPath, { recursive: true });
    if (!fs.existsSync(appdata)) fs.mkdirSync(appdata, { recursive: true });
    app.setPath('userData', appPath);
    app.setPath('appData', appdata)
}

app.on('web-contents-created', (event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    contents.on('will-navigate', (e, url) => {
        if (url.startsWith('file://')) return;
        e.preventDefault();
        if (isSafeExternalUrl(url)) shell.openExternal(url);
    });

    contents.on('will-redirect', (e, url) => {
        if (!url.startsWith('file://')) e.preventDefault();
    });

    contents.on('will-attach-webview', e => e.preventDefault());
});

database.relocateLegacy();

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
    try {
        await services.init();
    } catch (error) {
        reportError('startup', 'services_init', error);
    }
    services.register();
    if (dev) return MainWindow.createWindow()
    UpdateWindow.createWindow()
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => database.close());
