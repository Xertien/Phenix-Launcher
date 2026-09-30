/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { config, sanitizeHTML } from './utils.js';

class Splash {
    constructor() {
        this.root = document.querySelector("#splash");
        this.splash = document.querySelector(".splash");
        this.splashBrand = document.querySelector(".splash-brand");
        this.splashMessage = document.querySelector(".splash-message");
        this.splashAuthor = document.querySelector(".splash-author");
        this.status = document.querySelector(".status");
        this.message = document.querySelector(".message");
        this.detail = document.querySelector(".status-detail");
        this.progress = document.querySelector(".progress");
        this.progressBar = document.querySelector(".progress-bar");
        this.progressText = document.querySelector(".progress-text");
        this.downloadButton = document.querySelector(".download-update");
        this.countdown = document.querySelector(".status-countdown");
        this.shutdownTimer = null;
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
        this.splashMessage.textContent = `« ${splash.message} »`;
        this.splashAuthor.children[0].textContent = "@" + splash.author;
        await sleep(100);
        this.root.classList.add("visible");
        await sleep(300);
        this.splash.classList.add("opacity");
        await sleep(400);
        this.splash.classList.add("translate");
        this.splashBrand.classList.add("opacity");
        this.splashMessage.classList.add("opacity");
        this.status.classList.add("opacity");
        this.splashAuthor.classList.add("opacity");
        await sleep(1000);
        this.checkUpdate();
    }

    async checkUpdate() {
        this.setStatus(`Recherche de mise à jour...`, { state: 'checking' });

        window.launcher.updater.on('available', () => {
            if (window.launcher.platform == 'win32') {
                this.setStatus(`Mise à jour disponible !`, { state: 'downloading', detail: 'Téléchargement de la mise à jour...' });
                this.toggleProgress();
                window.launcher.updater.start();
            }
            else {
                this.setStatus(`Mise à jour disponible !`, { state: 'available' });
                return this.dowloadUpdate();
            }
        })

        window.launcher.updater.on('error', err => {
            if (err) return this.shutdown(`Erreur de mise à jour`, { detail: err.message });
        })

        window.launcher.updater.on('progress', progress => {
            this.setProgress(progress.transferred, progress.total);
        })

        window.launcher.updater.on('not-available', () => {
            console.error("Mise à jour non disponible");
            this.maintenanceCheck();
        })

        window.launcher.updater.check().then(res => {
            if (res?.error) return this.shutdown(`Erreur lors de la recherche de mise à jour`, { detail: res.message });
        }).catch(err => {
            return this.shutdown(`Erreur lors de la recherche de mise à jour`, { detail: err?.message });
        });
    }

    async dowloadUpdate() {
        await window.launcher.updater.prepareManualDownload().catch(() => null);

        this.setStatus(`Mise à jour disponible !`, { state: 'manual', detail: 'Téléchargez la nouvelle version pour continuer.' });
        this.downloadButton.hidden = false;
        this.downloadButton.addEventListener("click", () => {
            window.launcher.updater.openManualDownload();
            return this.shutdown("Téléchargement en cours...", { state: 'manual' });
        }, { once: true });
        this.downloadButton.focus({ preventScroll: true });
    }

    async maintenanceCheck() {
        config.GetConfig().then(res => {
            if (res.maintenance) return this.shutdown(`Maintenance en cours`, { state: 'maintenance', html: sanitizeHTML(res.maintenance_message) });
            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("Aucune connexion internet détectée", { detail: 'Veuillez réessayer ultérieurement.' });
        })
    }

    startLauncher() {
        this.setStatus(`Démarrage du launcher`, { state: 'starting' });
        window.launcher.updater.launchMain();
    }

    shutdown(text, options = {}) {
        this.setStatus(text, { state: 'error', ...options });
        this.downloadButton.hidden = true;
        if (this.shutdownTimer) clearInterval(this.shutdownTimer);
        let i = 5;
        this.setCountdown(i);
        this.shutdownTimer = setInterval(() => {
            this.setCountdown(--i);
            if (i <= 0) {
                clearInterval(this.shutdownTimer);
                window.launcher.window.close();
            }
        }, 1000);
    }

    setCountdown(seconds) {
        this.countdown.hidden = false;
        this.countdown.textContent = `Arrêt dans ${seconds} s`;
    }

    setStatus(text, { state, detail, html } = {}) {
        if (state) this.root.dataset.state = state;
        this.message.textContent = text;
        if (html) {
            this.detail.innerHTML = html;
            this.detail.hidden = false;
        } else if (detail) {
            this.detail.textContent = detail;
            this.detail.hidden = false;
        } else {
            this.detail.replaceChildren();
            this.detail.hidden = true;
        }
    }

    toggleProgress() {
        this.progressText.hidden = false;
        this.setProgress(0, 1);
    }

    setProgress(value, max) {
        let ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
        let percent = Math.round(ratio * 100);
        this.progressBar.style.width = `${percent}%`;
        this.progress.setAttribute("aria-valuenow", String(percent));
        let size = max > 1 ? ` · ${formatSize(value)} / ${formatSize(max)}` : '';
        this.progressText.textContent = `${percent} %${size}`;
    }
}

function formatSize(bytes) {
    return `${(bytes / 1048576).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`;
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
