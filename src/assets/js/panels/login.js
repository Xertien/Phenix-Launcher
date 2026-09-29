/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { popup, changePanel, accountSelect, addAccount, config, setStatus, escapeHTML } from '../utils.js';

class Login {
    static id = "login";
    async init(config) {
        this.config = config;

        if (typeof this.config.online == 'boolean') {
            this.config.online ? this.getMicrosoft() : this.getCrack()
        } else if (typeof this.config.online == 'string') {
            if (this.config.online.match(/^(http|https):\/\/[^ "]+$/)) {
                this.getAZauth();
            }
        }

        document.querySelector('.cancel-home').addEventListener('click', () => {
            document.querySelector('.cancel-home').style.display = 'none'
            changePanel('settings')
        })
    }

    async getMicrosoft() {
        console.log('Initializing Microsoft Device Code login...');
        let popupLogin = new popup();
        let loginHome = document.querySelector('.login-home');
        let microsoftBtn = document.querySelector('.connect-home');
        loginHome.style.display = 'block';

        microsoftBtn.addEventListener("click", async () => {
            console.log('[Login] Starting Device Code Flow');

            popupLogin.openPopup({
                title: 'Connexion Microsoft',
                content: '<div class="loader"></div><p class="popup-loader-text">Obtention du code...</p>',
                color: 'var(--color)'
            });

            const deviceCodeResult = await window.launcher.auth.microsoft.start();

            if (deviceCodeResult.error) {
                console.error(`[Login] Device code request error: ${deviceCodeResult.error}`);
                popupLogin.openPopup({
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
                        <span id="user-code-display" class="device-code-value">${escapeHTML(user_code)}</span>
                        <button id="copy-code-btn" class="device-code-copy" title="Copier le code">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <p id="copy-feedback" class="device-code-feedback">Code copié !</p>
                    <button id="open-browser-btn" class="popup-button">
                        Ouvrir le navigateur
                    </button>
                    <div class="loader"></div>
                    <p class="device-code-hint">En attente de connexion...</p>
                </div>
            `;

            popupLogin.openPopup({
                title: 'Connexion Microsoft',
                content: codeHtml,
                color: 'var(--color)',
                options: true
            });

            setTimeout(() => {
                const openBrowserBtn = document.getElementById('open-browser-btn');
                const copyCodeBtn = document.getElementById('copy-code-btn');
                const copyFeedback = document.getElementById('copy-feedback');

                if (openBrowserBtn) {
                    openBrowserBtn.addEventListener('click', () => {
                        window.launcher.auth.microsoft.openBrowser(sessionId);
                    });
                }

                if (copyCodeBtn) {
                    copyCodeBtn.addEventListener('click', async () => {
                        await window.launcher.auth.microsoft.copyCode(sessionId);
                        copyFeedback.classList.add('visible');
                        setTimeout(() => {
                            copyFeedback.classList.remove('visible');
                        }, 2000);
                    });
                }
            }, 100);

            const pollResult = await window.launcher.auth.microsoft.poll(sessionId);

            console.log(`[Login] Device code poll result: ${pollResult.error ? pollResult.error : pollResult.name}`);

            if (pollResult.error) {
                if (pollResult.error === 'cancelled') {
                    popupLogin.closePopup();
                    return;
                }
                popupLogin.openPopup({
                    title: 'Erreur Microsoft',
                    content: escapeHTML(`${pollResult.error}: ${pollResult.errorMessage || 'Erreur inconnue'}`),
                    color: 'red',
                    options: true
                });
                return;
            }

            await this.saveData(pollResult);
            popupLogin.closePopup();
        });
    }

    async getCrack() {
        console.log('Initializing offline login...');
        let popupLogin = new popup();
        let loginOffline = document.querySelector('.login-offline');

        let emailOffline = document.querySelector('.email-offline');
        let connectOffline = document.querySelector('.connect-offline');
        loginOffline.style.display = 'block';

        connectOffline.addEventListener('click', async () => {
            if (emailOffline.value.length < 3) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Votre pseudo doit faire au moins 3 caractères.',
                    options: true
                });
                return;
            }

            if (emailOffline.value.match(/ /g)) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Votre pseudo ne doit pas contenir d\'espaces.',
                    options: true
                });
                return;
            }

            let MojangConnect = await window.launcher.auth.offline.login(emailOffline.value);

            if (MojangConnect.error) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: escapeHTML(MojangConnect.message),
                    options: true
                });
                return;
            }
            await this.saveData(MojangConnect)
            popupLogin.closePopup();
        });
    }

    async getAZauth() {
        console.log('Initializing AZauth login...');
        let PopupLogin = new popup();
        let loginAZauth = document.querySelector('.login-AZauth');
        let loginAZauthA2F = document.querySelector('.login-AZauth-A2F');

        let AZauthEmail = document.querySelector('.email-AZauth');
        let AZauthPassword = document.querySelector('.password-AZauth');
        let AZauthA2F = document.querySelector('.A2F-AZauth');
        let connectAZauthA2F = document.querySelector('.connect-AZauth-A2F');
        let AZauthConnectBTN = document.querySelector('.connect-AZauth');
        let AZauthCancelA2F = document.querySelector('.cancel-AZauth-A2F');

        loginAZauth.style.display = 'block';

        AZauthConnectBTN.addEventListener('click', async () => {
            PopupLogin.openPopup({
                title: 'Connexion en cours...',
                content: 'Veuillez patienter...',
                color: 'var(--color)'
            });

            if (AZauthEmail.value == '' || AZauthPassword.value == '') {
                PopupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Veuillez remplir tous les champs.',
                    options: true
                });
                return;
            }

            let AZauthConnect = await window.launcher.auth.azauth.login(AZauthEmail.value, AZauthPassword.value);

            if (AZauthConnect.error) {
                PopupLogin.openPopup({
                    title: 'Erreur',
                    content: escapeHTML(AZauthConnect.message),
                    options: true
                });
                return;
            } else if (AZauthConnect.A2F) {
                loginAZauthA2F.style.display = 'block';
                loginAZauth.style.display = 'none';
                PopupLogin.closePopup();

                AZauthCancelA2F.addEventListener('click', () => {
                    loginAZauthA2F.style.display = 'none';
                    loginAZauth.style.display = 'block';
                });

                connectAZauthA2F.addEventListener('click', async () => {
                    PopupLogin.openPopup({
                        title: 'Connexion en cours...',
                        content: 'Veuillez patienter...',
                        color: 'var(--color)'
                    });

                    if (AZauthA2F.value == '') {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: 'Veuillez entrer le code A2F.',
                            options: true
                        });
                        return;
                    }

                    AZauthConnect = await window.launcher.auth.azauth.login(AZauthEmail.value, AZauthPassword.value, AZauthA2F.value);

                    if (AZauthConnect.error) {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: escapeHTML(AZauthConnect.message),
                            options: true
                        });
                        return;
                    }

                    await this.saveData(AZauthConnect)
                    PopupLogin.closePopup();
                });
            } else if (!AZauthConnect.A2F) {
                await this.saveData(AZauthConnect)
                PopupLogin.closePopup();
            }
        });
    }

    async saveData(account) {
        let configClient = await window.launcher.settings.get();
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == account.name)
                if (whitelist !== account.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        await window.launcher.settings.set('instance_selct', newInstanceSelect.name)
                        await setStatus(newInstanceSelect)
                    }
                }
            }
        }

        await addAccount(account);
        await accountSelect(account);
        changePanel('home');
    }
}
export default Login;
