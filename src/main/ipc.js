const { ipcMain } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');

const PAGES = {
    launcher: path.join(__dirname, '..', 'launcher.html'),
    update: path.join(__dirname, '..', 'index.html')
};

function normalizePath(filePath) {
    let resolved = path.resolve(filePath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isAllowedSender(event, pages) {
    let frame = event?.senderFrame;
    if (!frame || frame.parent) return false;
    let url;
    try {
        url = new URL(frame.url);
    } catch (e) {
        return false;
    }
    if (url.protocol !== 'file:') return false;
    url.hash = '';
    url.search = '';
    let filePath;
    try {
        filePath = normalizePath(fileURLToPath(url.href));
    } catch (e) {
        return false;
    }
    return pages.some(page => PAGES[page] && normalizePath(PAGES[page]) === filePath);
}

function handle(channel, pages, listener) {
    ipcMain.handle(channel, async (event, ...args) => {
        if (!isAllowedSender(event, pages)) {
            console.warn(`[IPC] Requête refusée sur ${channel}`);
            throw new Error('Unauthorized');
        }
        return await listener(event, ...args);
    });
}

module.exports = {
    handle,
    isAllowedSender,
    PAGES
};
