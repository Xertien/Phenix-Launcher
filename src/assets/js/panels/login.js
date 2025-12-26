/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
const { AZauth, Mojang } = require('minecraft-java-core');
const { ipcRenderer } = require('electron');

import { popup, database, changePanel, accountSelect, addAccount, config, setStatus } from '../utils.js';

class Login {
    static id = "login";
    async init(config) {
        this.config = config;
        this.db = new database();

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
            console.log('[Login] Starting Device Code Flow, client_id:', this.config.client_id);

            popupLogin.openPopup({
                title: 'Connexion Microsoft',
                content: '<div class="loader"></div><p style="text-align: center; margin-top: 10px;">Obtention du code...</p>',
                color: 'var(--color)'
            });

            const deviceCodeResult = await ipcRenderer.invoke('Microsoft-device-code-start', this.config.client_id);

            if (deviceCodeResult.error) {
                console.error('[Login] Device code request error:', deviceCodeResult);
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: `${deviceCodeResult.error}: ${deviceCodeResult.errorMessage || 'Unknown error'}`,
                    color: 'red',
                    options: true
                });
                return;
            }

            const { sessionId, user_code, verification_uri, device_code, interval, expires_in } = deviceCodeResult;
            const authUrl = verification_uri;

            const codeHtml = `
                <div style="text-align: center;">
                    <p style="margin-bottom: 15px;">Ouvrez votre navigateur et entrez ce code :</p>
                    <div style="background: rgba(124, 77, 255, 0.2); border-radius: 12px; padding: 20px; margin: 15px 0; display: flex; align-items: center; justify-content: center; gap: 15px;">
                        <span id="user-code-display" style="font-size: 2rem; font-weight: bold; letter-spacing: 5px; font-family: monospace;">${user_code}</span>
                        <button id="copy-code-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 12px; cursor: pointer; color: var(--color); transition: all 0.2s ease;" title="Copier le code">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <p id="copy-feedback" style="font-size: 0.85rem; color: #4caf50; opacity: 0; margin-bottom: 10px; transition: opacity 0.2s;">Code copié !</p>
                    <button id="open-browser-btn" class="popup-button" style="margin-bottom: 15px;">
                        Ouvrir le navigateur
                    </button>
                    <div class="loader" style="margin: 15px auto;"></div>
                    <p style="font-size: 0.85rem; opacity: 0.7;">En attente de connexion...</p>
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
                const { shell, clipboard } = require('electron');

                if (openBrowserBtn) {
                    openBrowserBtn.addEventListener('click', () => {
                        shell.openExternal(authUrl);
                    });
                }

                if (copyCodeBtn) {
                    copyCodeBtn.addEventListener('click', () => {
                        clipboard.writeText(user_code);
                        copyFeedback.style.opacity = '1';
                        setTimeout(() => {
                            copyFeedback.style.opacity = '0';
                        }, 2000);
                    });

                    copyCodeBtn.addEventListener('mouseenter', () => {
                        copyCodeBtn.style.background = 'rgba(255,255,255,0.2)';
                    });
                    copyCodeBtn.addEventListener('mouseleave', () => {
                        copyCodeBtn.style.background = 'rgba(255,255,255,0.1)';
                    });
                }
            }, 100);

            const popupElement = document.querySelector('.popup');
            const originalCloseHandler = () => {
                ipcRenderer.invoke('Microsoft-device-code-cancel', sessionId);
            };

            const pollResult = await ipcRenderer.invoke('Microsoft-device-code-poll', {
                sessionId,
                device_code,
                interval,
                expires_in
            });

            console.log('[Login] Device code poll result:', pollResult);

            if (pollResult.error) {
                if (pollResult.error === 'cancelled') {
                    popupLogin.closePopup();
                    return;
                }
                popupLogin.openPopup({
                    title: 'Erreur Microsoft',
                    content: `${pollResult.error}: ${pollResult.errorMessage || 'Unknown error'}`,
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

            let MojangConnect = await Mojang.login(emailOffline.value);

            if (MojangConnect.error) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: MojangConnect.message,
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
        let AZauthClient = new AZauth(this.config.online);
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

            let AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value);

            if (AZauthConnect.error) {
                PopupLogin.openPopup({
                    title: 'Erreur',
                    content: AZauthConnect.message,
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

                    AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value, AZauthA2F.value);

                    if (AZauthConnect.error) {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: AZauthConnect.message,
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

    async saveData(connectionData) {
        let configClient = await this.db.readData('configClient');
        let account = await this.db.createData('accounts', connectionData)
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()
        configClient.account_selected = account.ID;

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == account.name)
                if (whitelist !== account.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        configClient.instance_selct = newInstanceSelect.name
                        await setStatus(newInstanceSelect.status)
                    }
                }
            }
        }

        await this.db.updateData('configClient', configClient);
        await addAccount(account);
        await accountSelect(account);
        changePanel('home');
    }
}
export default Login;