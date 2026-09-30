const { shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const nodeFetch = require('node-fetch');
const pkg = require('../../../package.json');
const UpdateWindow = require('../../assets/js/windows/updateWindow.js');
const { isSafeExternalUrl, scrubString } = require('../../assets/js/utils/security.js');
const { reportError } = require('../reporting.js');

class Updater {
    constructor() {
        this.manualDownloadUrl = null;
        this.registered = false;
    }

    send(channel, ...args) {
        let updateWindow = UpdateWindow.getWindow();
        if (updateWindow && !updateWindow.isDestroyed()) updateWindow.webContents.send(channel, ...args);
    }

    register() {
        if (this.registered) return;
        this.registered = true;
        autoUpdater.autoDownload = false;

        autoUpdater.on('update-available', () => this.send('updater:available'));

        autoUpdater.on('update-not-available', () => this.send('updater:not-available'));

        autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall());

        autoUpdater.on('download-progress', progress => {
            let updateWindow = UpdateWindow.getWindow();
            let transferred = Number(progress?.transferred) || 0;
            let total = Number(progress?.total) || 0;
            if (updateWindow && !updateWindow.isDestroyed() && total) updateWindow.setProgressBar(transferred / total);
            this.send('updater:progress', { transferred, total });
        });

        autoUpdater.on('error', err => {
            reportError('updater', 'auto_updater', err, { once: true, level: 'warning' });
            this.send('updater:error', { message: scrubString(String(err?.message || err)) });
        });
    }

    async check() {
        try {
            await autoUpdater.checkForUpdates();
            return { error: false };
        } catch (error) {
            reportError('updater', 'check', error, { once: true, level: 'warning' });
            return { error: true, message: scrubString(String(error?.message || error)) };
        }
    }

    start() {
        autoUpdater.downloadUpdate().catch(err => {
            reportError('updater', 'download', err, { once: true });
            this.send('updater:error', { message: scrubString(String(err?.message || err)) });
        });
        return true;
    }

    getLatestReleaseForOS(os, preferredFormat, assets) {
        return assets.filter(asset => {
            const name = String(asset?.name || '').toLowerCase();
            return name.includes(os) && name.endsWith(preferredFormat);
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    }

    async prepareManualDownload() {
        this.manualDownloadUrl = null;
        try {
            const repoURL = pkg.repository.url.replace("git+", "").replace(".git", "").replace("https://github.com/", "").split("/");
            const githubAPI = await nodeFetch('https://api.github.com').then(res => res.json());
            const githubAPIRepoURL = githubAPI.repository_url.replace("{owner}", repoURL[0]).replace("{repo}", repoURL[1]);
            const githubAPIRepo = await nodeFetch(githubAPIRepoURL).then(res => res.json());
            const releases = await nodeFetch(githubAPIRepo.releases_url.replace("{/id}", '')).then(res => res.json());
            const latestRelease = releases[0].assets;
            let latest;

            if (process.platform == 'darwin') latest = this.getLatestReleaseForOS('mac', '.dmg', latestRelease);
            else if (process.platform == 'linux') latest = this.getLatestReleaseForOS('linux', '.appimage', latestRelease);

            let downloadUrl = latest?.browser_download_url;
            if (typeof downloadUrl === 'string' && downloadUrl.startsWith('https://github.com/') && isSafeExternalUrl(downloadUrl)) {
                this.manualDownloadUrl = downloadUrl;
            }
        } catch (error) {
            reportError('updater', 'manual_download', error, { once: true, level: 'warning' });
        }
        return { available: !!this.manualDownloadUrl };
    }

    async openManualDownload() {
        if (!this.manualDownloadUrl) return false;
        await shell.openExternal(this.manualDownloadUrl);
        return true;
    }
}

module.exports = new Updater();
