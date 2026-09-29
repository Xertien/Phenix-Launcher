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
        document.querySelector('.nav-box').addEventListener('click', e => {
            if (e.target.classList.contains('nav-settings-btn')) {
                let id = e.target.id

                let activeSettingsBTN = document.querySelector('.active-settings-BTN')
                let activeContainerSettings = document.querySelector('.active-container-settings')

                if (id == 'save') {
                    if (activeSettingsBTN) activeSettingsBTN.classList.toggle('active-settings-BTN');
                    document.querySelector('#account').classList.add('active-settings-BTN');

                    if (activeContainerSettings) activeContainerSettings.classList.toggle('active-container-settings');
                    document.querySelector(`#account-tab`).classList.add('active-container-settings');
                    return changePanel('home')
                }

                if (activeSettingsBTN) activeSettingsBTN.classList.toggle('active-settings-BTN');
                e.target.classList.add('active-settings-BTN');

                if (activeContainerSettings) activeContainerSettings.classList.toggle('active-container-settings');
                document.querySelector(`#${id}-tab`).classList.add('active-container-settings');

                if (id === 'java' && !this.sliderInitialized) {
                    setTimeout(() => this.ram(), 50);
                }
            }
        })
    }

    accounts() {
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
                                options: true
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

        const markTheme = value => {
            for (let [className, name] of themeButtons) {
                let button = document.querySelector(`.${className}`);
                button.classList.toggle('active-theme', name === value);
                button.setAttribute('aria-checked', String(name === value));
            }
        };

        markTheme(theme);

        const selectTheme = async target => {
            let entry = themeButtons.find(([className]) => target.classList.contains(className));
            if (!entry || entry[1] === theme) return;
            theme = entry[1];
            markTheme(theme);
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

        if (closeLauncher == "close-launcher") {
            document.querySelector('.close-launcher').classList.add('active-close');
        } else if (closeLauncher == "close-all") {
            document.querySelector('.close-all').classList.add('active-close');
        } else if (closeLauncher == "close-none") {
            document.querySelector('.close-none').classList.add('active-close');
        }

        closeBox.addEventListener("click", async e => {
            if (e.target.classList.contains('close-btn')) {
                let activeClose = document.querySelector('.active-close');
                if (e.target.classList.contains('active-close')) return
                activeClose?.classList.toggle('active-close');

                if (e.target.classList.contains('close-launcher')) {
                    e.target.classList.toggle('active-close');
                    await window.launcher.settings.set('closeLauncher', 'close-launcher');
                } else if (e.target.classList.contains('close-all')) {
                    e.target.classList.toggle('active-close');
                    await window.launcher.settings.set('closeLauncher', 'close-all');
                } else if (e.target.classList.contains('close-none')) {
                    e.target.classList.toggle('active-close');
                    await window.launcher.settings.set('closeLauncher', 'close-none');
                }
            }
        })
    }
}
export default Settings;
