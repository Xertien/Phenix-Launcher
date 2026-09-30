/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { changePanel, accountSelect, addAccount, Slider, config, setStatus, popup, applyTheme, escapeHTML } from '../utils.js'

class Settings {
    static id = "settings";
    async init(config) {
        this.config = config;
        this.navBTN()
        this.accounts()
        this.ram()
        this.javaPath()
        this.resolution()
        this.launcher()
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

            if (id === 'java' && !this.sliderInitialized) {
                setTimeout(() => this.ram(), 50);
            }
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
                        popupAccount.openPopup({
                            title: 'Connexion Microsoft',
                            content: '<div class="loader"></div><p class="popup-loader-text">Obtention du code...</p>',
                            color: 'var(--color)'
                        });

                        try {
                            const deviceCodeResult = await window.launcher.auth.microsoft.start();

                            if (deviceCodeResult.error) {
                                popupAccount.openPopup({
                                    title: 'Erreur',
                                    content: escapeHTML(`${deviceCodeResult.error}: ${deviceCodeResult.errorMessage || 'Erreur inconnue'}`),
                                    color: 'red',
                                    options: true
                                });
                                return;
                            }

                            const { sessionId, user_code } = deviceCodeResult;

                            const codeHtml = `
                                <div class="device-code">
                                    <p class="device-code-intro">Ouvrez votre navigateur et entrez ce code :</p>
                                    <div class="device-code-box">
                                        <span class="device-code-value">${escapeHTML(user_code)}</span>
                                        <button id="copy-code-btn-settings" class="device-code-copy" title="Copier le code">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        </button>
                                    </div>
                                    <p id="copy-feedback-settings" class="device-code-feedback">Code copié !</p>
                                    <button id="open-browser-btn-settings" class="popup-button">Ouvrir le navigateur</button>
                                    <div class="loader"></div>
                                    <p class="device-code-hint">En attente de connexion...</p>
                                </div>
                            `;

                            popupAccount.openPopup({
                                title: 'Connexion Microsoft',
                                content: codeHtml,
                                color: 'var(--color)',
                                options: true,
                                buttonLabel: 'Annuler',
                                buttonSecondary: true,
                                onButton: () => window.launcher.auth.microsoft.cancel(sessionId)
                            });

                            setTimeout(() => {
                                const openBtn = document.getElementById('open-browser-btn-settings');
                                const copyBtn = document.getElementById('copy-code-btn-settings');
                                const copyFeedback = document.getElementById('copy-feedback-settings');

                                if (openBtn) openBtn.addEventListener('click', () => {
                                    window.launcher.auth.microsoft.openBrowser(sessionId);
                                });
                                if (copyBtn) {
                                    copyBtn.addEventListener('click', async () => {
                                        await window.launcher.auth.microsoft.copyCode(sessionId);
                                        copyFeedback.classList.add('visible');
                                        setTimeout(() => copyFeedback.classList.remove('visible'), 2000);
                                    });
                                }
                            }, 100);

                            const account = await window.launcher.auth.microsoft.poll(sessionId);

                            if (account.error) {
                                if (account.error === 'cancelled') {
                                    popupAccount.closePopup();
                                    return;
                                }
                                popupAccount.openPopup({
                                    title: 'Erreur Microsoft',
                                    content: escapeHTML(`${account.error}: ${account.errorMessage || 'Erreur inconnue'}`),
                                    color: 'red',
                                    options: true
                                });
                                return;
                            }

                            await addAccount(account);
                            await accountSelect(account);

                            popupAccount.closePopup();
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
        let config = await window.launcher.settings.get();
        let memory = await window.launcher.system.memory();
        let totalMem = Math.trunc(memory.total / 1073741824 * 10) / 10;
        let freeMem = Math.trunc(memory.free / 1073741824 * 10) / 10;

        document.getElementById("total-ram").textContent = `${totalMem} Go`;
        document.getElementById("free-ram").textContent = `${freeMem} Go`;

        let sliderDiv = document.querySelector(".memory-slider");
        sliderDiv.setAttribute("max", Math.trunc((80 * totalMem) / 100));

        if (sliderDiv.offsetWidth === 0) {
            return;
        }

        let ram = config?.java_config?.java_memory ? {
            ramMin: config.java_config.java_memory.min,
            ramMax: config.java_config.java_memory.max
        } : { ramMin: "1", ramMax: "2" };

        if (totalMem < ram.ramMin) {
            window.launcher.settings.set('java_memory', { min: 1, max: 2 });
            ram = { ramMin: "1", ramMax: "2" }
        };

        let slider = new Slider(".memory-slider", parseFloat(ram.ramMin), parseFloat(ram.ramMax));

        this.sliderInitialized = true;

        let minSpan = document.querySelector(".slider-touch-left");
        let maxSpan = document.querySelector(".slider-touch-right");

        minSpan.setAttribute("value", `${ram.ramMin} Go`);
        maxSpan.setAttribute("value", `${ram.ramMax} Go`);

        slider.on("change", async (min, max) => {
            minSpan.setAttribute("value", `${min} Go`);
            maxSpan.setAttribute("value", `${max} Go`);
            window.launcher.settings.set('java_memory', { min: min, max: max });
        });
    }

    async javaPath() {
        let javaPathText = document.querySelector(".java-path-txt")
        javaPathText.textContent = await window.launcher.java.runtimePath();

        let configClient = await window.launcher.settings.get()
        let javaPath = configClient?.java_config?.java_path || 'Utiliser la version de Java livrée avec le launcher';
        let javaPathInputTxt = document.querySelector(".java-path-input-text");
        javaPathInputTxt.value = javaPath;

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

    async resolution() {
        let configClient = await window.launcher.settings.get()
        let resolution = configClient?.game_config?.screen_size || { width: 1920, height: 1080 };

        let width = document.querySelector(".width-size");
        let height = document.querySelector(".height-size");
        let resolutionReset = document.querySelector(".size-reset");

        width.value = resolution.width;
        height.value = resolution.height;

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
    }

    async launcher() {
        let configClient = await window.launcher.settings.get();

        let maxDownloadFiles = configClient?.launcher_config?.download_multi || 5;
        let maxDownloadFilesInput = document.querySelector(".max-files");
        let maxDownloadFilesReset = document.querySelector(".max-files-reset");
        maxDownloadFilesInput.value = maxDownloadFiles;

        maxDownloadFilesInput.addEventListener("change", async () => {
            await window.launcher.settings.set('download_multi', maxDownloadFilesInput.value);
        })

        maxDownloadFilesReset.addEventListener("click", async () => {
            maxDownloadFilesInput.value = 5
            await window.launcher.settings.set('download_multi', 5);
        })

        let themeBox = document.querySelector(".theme-box");
        let theme = configClient?.launcher_config?.theme || "dark";

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

        const markTheme = (value, animate) => {
            for (let [className, name] of themeButtons) {
                let button = document.querySelector(`.${className}`);
                button.classList.toggle('active-theme', name === value);
                button.setAttribute('aria-checked', String(name === value));
            }
            moveIndicator(animate);
        };

        markTheme(theme, false);
        new ResizeObserver(() => moveIndicator(false)).observe(themeBox);

        const selectTheme = async target => {
            let entry = themeButtons.find(([className]) => target.classList.contains(className));
            if (!entry || entry[1] === theme) return;
            theme = entry[1];
            markTheme(theme, true);
            await window.launcher.settings.set('theme', theme);
            await applyTheme(theme);
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

        let closeBox = document.querySelector(".close-box");
        let closeLauncher = configClient?.launcher_config?.closeLauncher || "close-launcher";

        const markClose = value => {
            for (let button of closeBox.querySelectorAll('.close-btn')) {
                let active = button.classList.contains(value);
                button.classList.toggle('active-close', active);
                button.setAttribute('aria-checked', String(active));
            }
        };

        markClose(closeLauncher);

        const selectClose = async target => {
            if (target.classList.contains('active-close')) return;
            let value = ['close-launcher', 'close-all', 'close-none'].find(name => target.classList.contains(name));
            if (!value) return;
            markClose(value);
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
