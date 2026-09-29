const { nativeTheme, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const settings = require('./settings.js');

const ROOT = path.join(__dirname, '..', '..');
const BACKGROUNDS = path.join(ROOT, 'assets', 'images', 'background');
const PANELS = ['login', 'home', 'settings'];
const IMAGE_NAME = /^[\w\-. ]+\.(png|jpe?g|webp|gif)$/i;

class System {
    isDarkTheme(theme) {
        if (theme === 'dark') return true;
        if (theme === 'light') return false;
        return nativeTheme.shouldUseDarkColors;
    }

    listImages(folder) {
        try {
            return fs.readdirSync(path.join(BACKGROUNDS, folder)).filter(name => IMAGE_NAME.test(name));
        } catch (e) {
            return [];
        }
    }

    background(isDark) {
        let easterEgg = this.listImages('easterEgg');
        if (easterEgg.length && Math.random() < 0.005) {
            return { easterEgg: true, path: `./assets/images/background/easterEgg/${easterEgg[Math.floor(Math.random() * easterEgg.length)]}` };
        }
        let folder = isDark ? 'dark' : 'light';
        let backgrounds = this.listImages(folder);
        if (!backgrounds.length) return null;
        return { easterEgg: false, path: `./assets/images/background/${folder}/${backgrounds[Math.floor(Math.random() * backgrounds.length)]}` };
    }

    loadPanel(id) {
        if (!PANELS.includes(id)) return '';
        return fs.readFileSync(path.join(ROOT, 'panels', `${id}.html`), 'utf8');
    }

    memory() {
        return {
            total: os.totalmem(),
            free: os.freemem()
        };
    }

    async pickJava(window) {
        let result = await dialog.showOpenDialog(window, {
            properties: ['openFile'],
            filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
        });
        if (result.canceled || !result.filePaths?.length) return { cancelled: true };
        let file = result.filePaths[0];
        let base = path.basename(file).replace(/\.exe$/i, '');
        if (!/^javaw?$/i.test(base) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            return { error: 'invalid_java' };
        }
        await settings.setJavaPath(file);
        return { path: file };
    }
}

module.exports = new System();
