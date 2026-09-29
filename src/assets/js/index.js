/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { config, escapeHTML, sanitizeHTML } from './utils.js';

class Splash {
    constructor() {
        this.splash = document.querySelector(".splash");
        this.splashMessage = document.querySelector(".splash-message");
        this.splashAuthor = document.querySelector(".splash-author");
        this.message = document.querySelector(".message");
        this.progress = document.querySelector(".progress");
        let start = async () => {
            await this.applyTheme();
            window.launcher.theme.onUpdated(() => this.applyTheme());
            this.startAnimation()
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    }

    async applyTheme() {
        let configClient = await window.launcher.settings.get().catch(() => null);
        let theme = configClient?.launcher_config?.theme || "dark"
        let isDarkTheme = await window.launcher.theme.isDark(theme).catch(() => true)
        document.body.className = isDarkTheme ? 'dark global' : 'light global';
    }

    async startAnimation() {
        let splashes = [
            {"message": "NNCT <3", "author": "Xertien"},
            {"message": "Un launcher ma foi", "author": "Xertien"},
            {"message": "La terre est plate... J'rigole elle est triangulaire", "author": "Illuminati"},
            {"message": "Pensez-vous qu'un jour les poules auront des dents ?", "author": "Xertien"},
            {"message": "Le saviez-vous, la Terre a un diamètre de 12 742 km", "author": "Wikipedia"},
            {"message": "Les arcs-en-ciel, c'est de quelles couleurs ?", "author": "Ungolmonpercher"},
            {"message": "Hébergé par Phenix Hosting, setup par Xertien", "author": "NNTC"},
            {"message": "J'aurais bien vanné Kim mais trop peur d'avoir des problèmes", "author": "Unmecpasdrole"}
        ];
        let splash = splashes[Math.floor(Math.random() * splashes.length)];
        this.splashMessage.textContent = splash.message;
        this.splashAuthor.children[0].textContent = "@" + splash.author;
        await sleep(100);
        document.querySelector("#splash").style.display = "block";
        await sleep(500);
        this.splash.classList.add("opacity");
        await sleep(500);
        this.splash.classList.add("translate");
        this.splashMessage.classList.add("opacity");
        this.splashAuthor.classList.add("opacity");
        this.message.classList.add("opacity");
        await sleep(1000);
        this.checkUpdate();
    }

    async checkUpdate() {
        this.setStatus(`Recherche de mise à jour...`);

        window.launcher.updater.on('available', () => {
            this.setStatus(`Mise à jour disponible !`);
            if (window.launcher.platform == 'win32') {
                this.toggleProgress();
                window.launcher.updater.start();
            }
            else return this.dowloadUpdate();
        })

        window.launcher.updater.on('error', err => {
            if (err) return this.shutdown(escapeHTML(err.message));
        })

        window.launcher.updater.on('progress', progress => {
            this.setProgress(progress.transferred, progress.total);
        })

        window.launcher.updater.on('not-available', () => {
            console.error("Mise à jour non disponible");
            this.maintenanceCheck();
        })

        window.launcher.updater.check().then(res => {
            if (res?.error) return this.shutdown(`erreur lors de la recherche de mise à jour :<br>${escapeHTML(res.message)}`);
        }).catch(err => {
            return this.shutdown(`erreur lors de la recherche de mise à jour :<br>${escapeHTML(err?.message)}`);
        });
    }

    async dowloadUpdate() {
        await window.launcher.updater.prepareManualDownload().catch(() => null);

        this.setStatus(`Mise à jour disponible !<br><div class="download-update">Télécharger</div>`);
        document.querySelector(".download-update").addEventListener("click", () => {
            window.launcher.updater.openManualDownload();
            return this.shutdown("Téléchargement en cours...");
        });
    }

    async maintenanceCheck() {
        config.GetConfig().then(res => {
            if (res.maintenance) return this.shutdown(sanitizeHTML(res.maintenance_message));
            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("Aucune connexion internet détectée,<br>veuillez réessayer ultérieurement.");
        })
    }

    startLauncher() {
        this.setStatus(`Démarrage du launcher`);
        window.launcher.updater.launchMain();
    }

    shutdown(text) {
        this.setStatus(`${text}<br>Arrêt dans 5s`);
        let i = 4;
        setInterval(() => {
            this.setStatus(`${text}<br>Arrêt dans ${i--}s`);
            if (i < 0) window.launcher.window.close();
        }, 1000);
    }

    setStatus(text) {
        this.message.innerHTML = text;
    }

    toggleProgress() {
        if (this.progress.classList.toggle("show")) this.setProgress(0, 1);
    }

    setProgress(value, max) {
        this.progress.value = value;
        this.progress.max = max;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
        window.launcher.window.devTools();
    }
})
new Splash();
