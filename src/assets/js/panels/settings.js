/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { changePanel, accountSelect, addAccount, Slider, config, setStatus, popup, applyTheme, escapeHTML } from '../utils.js'
import microsoftLogin from '../utils/microsoftLogin.js';

class Settings {
    static id = "settings";
    async init(config) {
        this.config = config;
        this.navBTN()
        this.accounts()
        this.ram()
        this.javaPath()
        this.resolution()
        this.launchArgs()
        this.launcher()
        this.folders()
        this.resetSettings()
    }

    navBTN() {
        const activate = (button, tab) => {
            let activeSettingsBTN = document.querySelector('.active-settings-BTN')
            let activeContainerSettings = document.querySelector('.active-container-settings')
            if (activeSettingsBTN) {
                activeSettingsBTN.classList.remove('active-settings-BTN');
                activeSettingsBTN.removeAttribute('aria-current');
            }
            button.classList.add('active-settings-BTN');
            button.setAttribute('aria-current', 'page');
            if (activeContainerSettings) activeContainerSettings.classList.remove('active-container-settings');
            tab.classList.add('active-container-settings');
            tab.scrollTop = 0;
        };

        document.querySelector('.nav-box').addEventListener('click', e => {
            let button = e.target.closest('.nav-settings-btn');
            if (!button) return;
            let id = button.id

            if (id == 'save') {
                this.resetAfterLeave(() => activate(document.querySelector('#account'), document.querySelector('#account-tab')));
                return changePanel('home')
            }

            activate(button, document.querySelector(`#${id}-tab`));

            if (id === 'java') this.ram();
        })
    }

    resetAfterLeave(reset) {
        let panel = document.querySelector('.panel.settings');
        requestAnimationFrame(() => {
            let running = panel.getAnimations().map(animation => animation.finished.catch(() => { }));
            Promise.all(running).then(() => {
                if (!panel.classList.contains('active')) reset();
            });
        });
    }

    accounts() {
        document.querySelector('.accounts-list').addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            let target = e.target.closest('.account, .delete-profile');
            if (!target || e.target !== target) return;
            e.preventDefault();
            target.click();
        });

        document.querySelector('.accounts-list').addEventListener('click', async e => {
            let popupAccount = new popup()
            try {
                let id = e.target.id
                if (e.target.classList.contains('account')) {
                    popupAccount.openPopup({
                        title: 'Connexion',
                        content: 'Veuillez patienter...',
                        color: 'var(--color)'
                    })

                    if (id == 'add') {
                        try {
                            const account = await microsoftLogin();
                            if (!account) return;

                            await addAccount(account);
                            await accountSelect(account);
                        } catch (err) {
                            console.error(`[Settings] Microsoft auth error: ${err}`);
                            popupAccount.openPopup({
                                title: 'Erreur',
                                content: escapeHTML(err.toString()),
                                options: true
                            });
                        }
                        return;
                    }

                    let account = await window.launcher.accounts.select(id);
                    if (!account) return;
                    await this.setInstance(account);
                    return await accountSelect(account);
                }

                if (e.target.classList.contains("delete-profile")) {
                    popupAccount.openPopup({
                        title: 'Connexion',
                        content: 'Veuillez patienter...',
                        color: 'var(--color)'
                    })
                    let result = await window.launcher.accounts.remove(id);
                    let deleteProfile = document.getElementById(`${id}`);
                    let accountListElement = document.querySelector('.accounts-list');
                    if (deleteProfile) deleteProfile.remove();

                    if (accountListElement.children.length == 1) return changePanel('login');

                    if (result?.wasSelected && result.selected) {
                        accountSelect(result.selected);
                        await this.setInstance(result.selected);
                    }
                }
            } catch (err) {
                console.error(err)
            } finally {
                popupAccount.closePopup();
            }
        })
    }

    async setInstance(auth) {
        let configClient = await window.launcher.settings.get()
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == auth.name)
                if (whitelist !== auth.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        await window.launcher.settings.set('instance_selct', newInstanceSelect.name)
                        await setStatus(newInstanceSelect)
                    }
                }
            }
        }
    }

    async ram() {
        let token = (this.ramToken || 0) + 1;
        this.ramToken = token;
        clearTimeout(this.ramSaveTimer);
        this.ramPending?.();
        await this.ramSaving;
        let [configClient, memory, instances] = await Promise.all([
            window.launcher.settings.get(),
            window.launcher.system.memory(),
            config.getInstanceList().catch(() => [])
        ]);
        if (token !== this.ramToken) return;

        let totalMem = Math.trunc(memory.total / 1073741824 * 10) / 10;
        let freeMem = Math.trunc(memory.free / 1073741824 * 10) / 10;
        let usable = Number(memory.usableGB) || Math.max(1, Math.floor(totalMem * 1.5) / 2);
        this.ramUsable = usable;

        document.getElementById("total-ram").textContent = `${totalMem} Go`;
        document.getElementById("free-ram").textContent = `${freeMem} Go`;
        document.getElementById("usable-ram").textContent = `${usable} Go`;

        let instance = (Array.isArray(instances) ? instances : []).find(item => item.name === configClient?.instance_selct) || null;
        let saved = instance ? configClient?.instance_memory?.[instance.name] : null;
        let current = saved || configClient?.java_config?.java_memory || { min: 2, max: 4 };
        let reco = instance?.ram;
        this.ramTarget = instance ? instance.name : null;
        this.ramRecommended = reco && Number.isFinite(reco.min) && Number.isFinite(reco.max) ? { min: reco.min, max: reco.max } : null;

        let target = document.getElementById('ram-target');
        target.classList.toggle('ram-target-none', !instance);
        target.querySelector('.ram-target-label').textContent = instance ? (saved ? 'Réglage sauvegardé :' : 'Réglage par défaut :') : 'Aucune instance sélectionnée';
        target.querySelector('.ram-target-name').textContent = instance ? instance.name : '';
        target.title = instance
            ? (saved ? `Réglage enregistré pour ${instance.name}` : `${instance.name} utilise encore le réglage par défaut : le modifier l'enregistrera pour cette instance`)
            : 'Choisissez une instance depuis l\'accueil pour régler sa mémoire';

        if (!this.slider) {
            document.querySelector('.memory-slider').setAttribute('max', String(usable));
            this.slider = new Slider('.memory-slider', parseFloat(current.min), parseFloat(current.max));
            this.slider.on('input', () => this.updateRamHints());
            this.slider.on('change', (min, max) => {
                this.updateRamHints();
                let target = this.ramTarget;
                clearTimeout(this.ramSaveTimer);
                this.ramPending = () => {
                    this.ramPending = null;
                    this.ramSaving = (this.ramSaving || Promise.resolve()).then(() => target
                        ? window.launcher.settings.set('instance_memory', { name: target, min, max })
                        : window.launcher.settings.set('java_memory', { min, max })).then(ok => {
                            if (ok !== false && target && this.ramTarget === target) document.getElementById('ram-target-label').textContent = 'Réglage sauvegardé :';
                            return ok;
                        }).catch(() => false);
                };
                this.ramSaveTimer = setTimeout(() => this.ramPending?.(), 250);
            });
        } else {
            this.slider.setRange(0.5, usable);
            this.slider.setValues(parseFloat(current.min), parseFloat(current.max));
        }
        this.slider.setRecommended(this.ramRecommended);
        this.updateRamHints();
    }

    updateRamHints() {
        let reco = this.ramRecommended;
        let issues = this.slider && reco ? this.slider.recommendedIssues() : { min: false, max: false };
        let maxTarget = reco ? Math.min(reco.max, this.ramUsable) : 0;
        let minTarget = reco ? Math.min(reco.min, this.ramUsable - 0.5) : 0;
        let go = value => `${value.toLocaleString('fr-FR')} Go`;
        let text = '';
        if (issues.min && issues.max) text = `Minimum et maximum en dessous de la recommandation (${go(minTarget)} min, ${go(maxTarget)} max)`;
        else if (issues.min) text = `Minimum en dessous de la recommandation (${go(minTarget)})`;
        else if (issues.max) text = `Maximum en dessous de la recommandation (${go(maxTarget)})`;
        document.getElementById('ram-warning-text').textContent = text;
        document.getElementById('ram-warning').hidden = !text;
    }

    async javaPath() {
        let javaPathText = document.querySelector(".java-path-txt")
        javaPathText.textContent = await window.launcher.java.runtimePath();

        let configClient = await window.launcher.settings.get()
        this.loadJavaPath(configClient);
        let javaPathInputTxt = document.querySelector(".java-path-input-text");

        document.querySelector(".java-path-set").addEventListener("click", async () => {
            let result = await window.launcher.java.pick();
            if (result?.cancelled) return;

            if (result?.path) {
                javaPathInputTxt.value = result.path;
            } else new popup().openPopup({
                title: 'Erreur',
                content: 'Le nom du fichier doit être java ou javaw.',
                options: true
            });
        });

        document.querySelector(".java-path-reset").addEventListener("click", async () => {
            javaPathInputTxt.value = 'Utiliser la version de Java livrée avec le launcher';
            await window.launcher.settings.set('java_path', null);
        });
    }

    loadJavaPath(configClient) {
        document.querySelector(".java-path-input-text").value = configClient?.java_config?.java_path || 'Utiliser la version de Java livrée avec le launcher';
    }

    async resolution() {
        let configClient = await window.launcher.settings.get()

        let width = document.querySelector(".width-size");
        let height = document.querySelector(".height-size");
        let resolutionReset = document.querySelector(".size-reset");
        let fullscreen = document.querySelector(".fullscreen-switch");

        this.loadResolution(configClient);

        width.addEventListener("change", async () => {
            await window.launcher.settings.set('screen_size', { width: width.value });
        })

        height.addEventListener("change", async () => {
            await window.launcher.settings.set('screen_size', { height: height.value });
        })

        resolutionReset.addEventListener("click", async () => {
            width.value = '854';
            height.value = '480';
            await window.launcher.settings.set('screen_size', { width: 854, height: 480 });
        })

        fullscreen.addEventListener("click", async () => {
            let next = fullscreen.getAttribute('aria-checked') !== 'true';
            this.markFullscreen(next);
            let saved = await window.launcher.settings.set('fullscreen', next).catch(() => false);
            if (saved !== true) this.markFullscreen(!next);
        })
    }

    markFullscreen(value) {
        let fullscreen = document.querySelector(".fullscreen-switch");
        fullscreen.setAttribute('aria-checked', String(!!value));
        document.querySelector('.input-size-element').classList.toggle('size-ignored', !!value);
    }

    loadResolution(configClient) {
        let resolution = configClient?.game_config?.screen_size || { width: 854, height: 480 };
        document.querySelector(".width-size").value = resolution.width;
        document.querySelector(".height-size").value = resolution.height;
        this.markFullscreen(configClient?.game_config?.fullscreen === true);
    }

    async launchArgs() {
        let configClient = await window.launcher.settings.get();
        this.loadArgs(configClient);

        for (let input of document.querySelectorAll('.args-input')) {
            let key = input.dataset.key;
            let feedback = document.getElementById(input.getAttribute('aria-describedby').split(' ').pop());
            let timer = null;

            const show = (message, error) => {
                clearTimeout(timer);
                feedback.textContent = message;
                feedback.classList.toggle('args-feedback-error', !!error);
                feedback.classList.toggle('args-feedback-ok', !error && !!message);
                if (!error && message) timer = setTimeout(() => {
                    feedback.textContent = '';
                    feedback.classList.remove('args-feedback-ok');
                }, 2500);
            };

            const save = async () => {
                let result = await window.launcher.settings.set(key, input.value).catch(() => false);
                if (result === true) {
                    input.value = input.value.trim().split(/\s+/).filter(Boolean).join(' ');
                    input.removeAttribute('aria-invalid');
                    show('Enregistré.', false);
                } else {
                    input.setAttribute('aria-invalid', 'true');
                    show(result?.error || 'Valeur refusée.', true);
                }
            };

            input.addEventListener('change', save);
            document.querySelector(`.args-reset[data-key="${key}"]`).addEventListener('click', () => {
                input.value = '';
                save();
            });
        }
    }

    loadArgs(configClient) {
        let values = {
            jvm_args: configClient?.java_config?.jvm_args || '',
            game_args: configClient?.game_config?.game_args || ''
        };
        for (let input of document.querySelectorAll('.args-input')) {
            input.value = values[input.dataset.key] ?? '';
            input.removeAttribute('aria-invalid');
            let feedback = document.getElementById(input.getAttribute('aria-describedby').split(' ').pop());
            feedback.textContent = '';
            feedback.classList.remove('args-feedback-error', 'args-feedback-ok');
        }
    }

    folders() {
        let feedback = document.querySelector('.folders-feedback');
        document.querySelector('.folders-box').addEventListener('click', async e => {
            let button = e.target.closest('.folder-btn');
            if (!button || button.disabled) return;
            button.disabled = true;
            let result = await window.launcher.folders.open(button.dataset.folder).catch(() => ({ error: 'failed', message: 'Impossible d\'ouvrir le dossier.' }));
            button.disabled = false;
            feedback.textContent = result?.opened ? '' : String(result?.message || 'Impossible d\'ouvrir le dossier.');
            feedback.classList.toggle('args-feedback-error', !result?.opened);
        });
    }

    resetSettings() {
        document.querySelector('.settings-reset-btn').addEventListener('click', async () => {
            let confirmed = await new popup().confirm({
                title: 'Réinitialiser les paramètres',
                text: [
                    'Rétablir tous les paramètres par défaut ?',
                    'La mémoire de chaque instance, Java, la fenêtre du jeu, les arguments et les options du launcher seront réinitialisés. Vos comptes et vos instances sont conservés.'
                ],
                confirmLabel: 'Réinitialiser',
                cancelLabel: 'Annuler',
                danger: true
            });
            if (!confirmed) return;
            clearTimeout(this.ramSaveTimer);
            this.ramPending = null;
            await this.ramSaving;
            await window.launcher.settings.reset();
            let configClient = await window.launcher.settings.get();
            this.loadJavaPath(configClient);
            this.loadResolution(configClient);
            this.loadArgs(configClient);
            this.loadLauncher(configClient);
            await applyTheme(configClient?.launcher_config?.theme || 'dark');
            await this.ram();
        });
    }

    loadLauncher(configClient) {
        document.querySelector(".max-files").value = configClient?.launcher_config?.download_multi || 5;
        this.theme = configClient?.launcher_config?.theme || "dark";
        this.markTheme(this.theme, false);
        this.markClose(configClient?.launcher_config?.closeLauncher || "close-launcher");
    }

    async launcher() {
        let configClient = await window.launcher.settings.get();

        let maxDownloadFilesInput = document.querySelector(".max-files");
        let maxDownloadFilesReset = document.querySelector(".max-files-reset");

        maxDownloadFilesInput.addEventListener("change", async () => {
            let saved = await window.launcher.settings.set('download_multi', maxDownloadFilesInput.value);
            if (saved !== true) {
                let current = await window.launcher.settings.get();
                maxDownloadFilesInput.value = current?.launcher_config?.download_multi || 5;
            }
        })

        maxDownloadFilesReset.addEventListener("click", async () => {
            maxDownloadFilesInput.value = 5
            await window.launcher.settings.set('download_multi', 5);
        })

        let themeBox = document.querySelector(".theme-box");

        const themeButtons = [
            ['theme-btn-clair', 'light'],
            ['theme-btn-sombre', 'dark'],
            ['theme-btn-auto', 'auto']
        ];

        let indicator = themeBox.querySelector('.segmented-indicator');

        const moveIndicator = animate => {
            let active = themeBox.querySelector('.active-theme');
            if (!indicator || !active || !active.offsetWidth) return;
            if (!animate) indicator.classList.add('no-transition');
            indicator.style.width = `${active.offsetWidth}px`;
            indicator.style.transform = `translateX(${active.offsetLeft - indicator.offsetLeft}px)`;
            indicator.classList.add('ready');
            if (!animate) {
                void indicator.offsetWidth;
                indicator.classList.remove('no-transition');
            }
        };

        this.markTheme = (value, animate) => {
            for (let [className, name] of themeButtons) {
                let button = document.querySelector(`.${className}`);
                button.classList.toggle('active-theme', name === value);
                button.setAttribute('aria-checked', String(name === value));
            }
            moveIndicator(animate);
        };

        let closeBox = document.querySelector(".close-box");

        this.markClose = value => {
            for (let button of closeBox.querySelectorAll('.close-btn')) {
                let active = button.classList.contains(value);
                button.classList.toggle('active-close', active);
                button.setAttribute('aria-checked', String(active));
            }
        };

        this.loadLauncher(configClient);
        new ResizeObserver(() => moveIndicator(false)).observe(themeBox);

        const selectTheme = async target => {
            let entry = themeButtons.find(([className]) => target.classList.contains(className));
            if (!entry || entry[1] === this.theme) return;
            this.theme = entry[1];
            this.markTheme(this.theme, true);
            await window.launcher.settings.set('theme', this.theme);
            await applyTheme(this.theme);
        };

        themeBox.addEventListener("click", e => {
            let target = e.target.closest('.theme-btn');
            if (target) selectTheme(target);
        })

        themeBox.addEventListener("keydown", e => {
            let target = e.target.closest('.theme-btn');
            if (!target) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectTheme(target);
            }
        })

        const selectClose = async target => {
            if (target.classList.contains('active-close')) return;
            let value = ['close-launcher', 'close-all', 'close-none'].find(name => target.classList.contains(name));
            if (!value) return;
            this.markClose(value);
            await window.launcher.settings.set('closeLauncher', value);
        };

        closeBox.addEventListener("click", e => {
            let target = e.target.closest('.close-btn');
            if (target) selectClose(target);
        })

        closeBox.addEventListener("keydown", e => {
            let target = e.target.closest('.close-btn');
            if (!target || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            selectClose(target);
        })
    }
}
export default Settings;
