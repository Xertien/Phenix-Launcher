/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup, accountSelect, addAccount, skin2D } from '../utils.js'

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')

class Home {
    static id = "home";
    async init(config) {
        this.config = config;
        this.db = new database();
        this.news()
        this.socialLick()
        this.instancesSelect()
        this.playerModal()
        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'))
    }

    async news() {
        let newsElement = document.querySelector('.news-list');
        let news = await config.getNews().then(res => res).catch(err => false);
        if (news) {
            if (!news.length) {
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block');
                blockNews.innerHTML = `
                    <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
                        <div class="header-text">
                            <div class="title">Aucune news n'est actuellement disponible.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Janvier</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Vous pourrez suivre ici toutes les news relative au serveur.</p>
                        </div>
                    </div>`
                newsElement.appendChild(blockNews);
            } else {
                news.sort((a, b) => new Date(b.publish_date) - new Date(a.publish_date));

                for (let NewsItem of news) {
                    let date = this.getdate(NewsItem.publish_date);
                    let blockNews = document.createElement('div');
                    blockNews.classList.add('news-block');
                    blockNews.innerHTML = `
                        <div class="news-header">
                            <img class="server-status-icon" src="assets/images/icon.png">
                            <div class="header-text">
                                <div class="title">${NewsItem.title}</div>
                            </div>
                            <div class="date">
                                <div class="day">${date.day}</div>
                                <div class="month">${date.month}</div>
                                <div class="year">${date.year}</div>
                            </div>
                        </div>
                        <div class="news-content">
                            <div class="bbWrapper">
                                <p>${NewsItem.content.replace(/\n/g, '</br>')}</p>
                                <p class="news-author">Auteur - <span>${NewsItem.author}</span></p>
                            </div>
                        </div>`;
                    newsElement.appendChild(blockNews);
                }
            }
        } else {
            let blockNews = document.createElement('div');
            blockNews.classList.add('news-block');
            blockNews.innerHTML = `
                <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
                        <div class="header-text">
                            <div class="title">Error.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Janvier</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Impossible de contacter le serveur des news.</br>Merci de vérifier votre configuration.</p>
                        </div>
                    </div>`
            newsElement.appendChild(blockNews);
        }
    }

    socialLick() {
        let socials = document.querySelectorAll('.social-block')

        socials.forEach(social => {
            social.addEventListener('click', e => {
                shell.openExternal(e.target.dataset.url)
            })
        });
    }

    setupNewsModal() {
        let newsPopup = document.querySelector('.news-popup');
        let closeBtn = document.querySelector('.close-news-popup');

        const closeNewsModal = () => {
            newsPopup.classList.remove('active-popup');
            setTimeout(() => {
                newsPopup.style.display = 'none';
            }, 300);
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', closeNewsModal);
        }

        if (newsPopup) {
            newsPopup.addEventListener('click', (e) => {
                if (e.target === newsPopup) closeNewsModal();
            });
        }
    }

    async playerModal() {
        let playerBtn = document.querySelector('.player-options');
        let playerPopup = document.querySelector('.player-popup');
        let addAccountBtn = document.getElementById('add-account-modal');
        let closeBtn = document.querySelector('.close-player-popup');
        let accountListContainer = document.querySelector('.accounts-list-home');

        if (playerBtn) {
            playerBtn.addEventListener('click', async () => {
                playerPopup.style.display = 'flex';
                requestAnimationFrame(() => {
                    playerPopup.classList.add('active-popup');
                });
                await this.loadAccounts(accountListContainer);
            });
        }

        const closePopup = () => {
            playerPopup.classList.remove('active-popup');
            setTimeout(() => {
                playerPopup.style.display = 'none';
            }, 300);
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', closePopup);
        }

        if (playerPopup) {
            playerPopup.addEventListener('click', (e) => {
                if (e.target === playerPopup) closePopup();
            });
        }

        if (addAccountBtn) {
            addAccountBtn.addEventListener('click', async () => {
                playerPopup.classList.remove('active-popup');
                setTimeout(() => {
                    playerPopup.style.display = 'none';
                }, 300);

                let popupLogin = new popup();
                popupLogin.openPopup({
                    title: 'Connexion Microsoft',
                    content: '<div class="loader"></div><p style="text-align: center; margin-top: 10px;">Obtention du code...</p>',
                    color: 'var(--color)'
                });

                try {
                    const deviceCodeResult = await ipcRenderer.invoke('Microsoft-device-code-start', this.config.client_id);

                    if (deviceCodeResult.error) {
                        popupLogin.openPopup({
                            title: 'Erreur',
                            content: `${deviceCodeResult.error}: ${deviceCodeResult.errorMessage || 'Erreur inconnue'}`,
                            color: 'red',
                            options: true
                        });
                        return;
                    }

                    const { sessionId, user_code, verification_uri, device_code, interval, expires_in } = deviceCodeResult;

                    const codeHtml = `
                        <div style="text-align: center;">
                            <p style="margin-bottom: 15px;">Ouvrez votre navigateur et entrez ce code :</p>
                            <div style="background: rgba(124, 77, 255, 0.2); border-radius: 12px; padding: 20px; margin: 15px 0; display: flex; align-items: center; justify-content: center; gap: 15px;">
                                <span style="font-size: 2rem; font-weight: bold; letter-spacing: 5px; font-family: monospace;">${user_code}</span>
                                <button id="copy-code-btn-home" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 12px; cursor: pointer; color: var(--color); transition: all 0.2s ease;" title="Copier le code">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                            </div>
                            <p id="copy-feedback-home" style="font-size: 0.85rem; color: #4caf50; opacity: 0; margin-bottom: 10px; transition: opacity 0.2s;">Code copié !</p>
                            <button id="open-browser-btn-home" class="popup-button" style="margin-bottom: 15px;">Ouvrir le navigateur</button>
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
                        const { shell, clipboard } = require('electron');
                        const openBtn = document.getElementById('open-browser-btn-home');
                        const copyBtn = document.getElementById('copy-code-btn-home');
                        const copyFeedback = document.getElementById('copy-feedback-home');

                        if (openBtn) openBtn.addEventListener('click', () => shell.openExternal(verification_uri));
                        if (copyBtn) {
                            copyBtn.addEventListener('click', () => {
                                clipboard.writeText(user_code);
                                copyFeedback.style.opacity = '1';
                                setTimeout(() => copyFeedback.style.opacity = '0', 2000);
                            });
                        }
                    }, 100);

                    const account_connect = await ipcRenderer.invoke('Microsoft-device-code-poll', {
                        sessionId, device_code, interval, expires_in
                    });

                    if (account_connect.error) {
                        if (account_connect.error === 'cancelled') {
                            popupLogin.closePopup();
                            return;
                        }
                        popupLogin.openPopup({
                            title: 'Erreur Microsoft',
                            content: `${account_connect.error}: ${account_connect.errorMessage || 'Erreur inconnue'}`,
                            color: 'red',
                            options: true
                        });
                        return;
                    }

                    let configClient = await this.db.readData('configClient');
                    let account = await this.db.createData('accounts', account_connect);
                    configClient.account_selected = account.ID;
                    await this.db.updateData('configClient', configClient);
                    await addAccount(account);
                    await accountSelect(account);

                    popupLogin.closePopup();

                    await this.loadAccounts(accountListContainer);
                    playerPopup.style.display = 'flex';
                    requestAnimationFrame(() => {
                        playerPopup.classList.add('active-popup');
                    });
                } catch (err) {
                    console.error('[Home] Microsoft auth error:', err);
                    popupLogin.openPopup({
                        title: 'Erreur',
                        content: err.toString(),
                        options: true
                    });
                }
            });
        }
    }

    async loadAccounts(container) {
        if (!container) return;
        container.innerHTML = '';
        let accounts = await this.db.readAllData('accounts').catch(() => []);
        if (!accounts) accounts = [];

        if (!Array.isArray(accounts)) accounts = [accounts];

        for (let account of accounts) {
            if (!account || !account.uuid || !account.name) continue;

            let skin = false;
            if (account?.profile?.skins[0]?.base64) skin = await new skin2D().creatHeadTexture(account.profile.skins[0].base64);

            let div = document.createElement("div");
            div.classList.add("account");
            div.id = account.ID;

            div.style.padding = "10px";
            div.style.display = "flex";
            div.style.alignItems = "center";
            div.style.gap = "10px";
            div.style.background = "rgba(255,255,255,0.05)";
            div.style.borderRadius = "8px";
            div.style.cursor = "pointer";

            div.innerHTML = `
                <div class="profile-image" style="width:40px; height:40px; border-radius:8px; ${skin ? 'background-image: url(' + skin + ');' : ''} background-size: cover;"></div>
                <div class="profile-infos" style="flex:1;">
                    <div class="profile-pseudo" style="font-size:1rem; font-weight:700;">${account.name}</div>
                    <div class="profile-uuid" style="font-size:0.7rem; opacity:0.7;">${account.uuid}</div>
                </div>
            `;

            div.addEventListener('click', async () => {
                let configClient = await this.db.readData('configClient');
                await accountSelect(account);
                configClient.account_selected = account.ID;
                await this.db.updateData('configClient', configClient);

                document.querySelector('.player-popup').style.display = 'none';

                this.instancesSelect();
            });

            container.appendChild(div);
        }
    }

    async instancesSelect() {
        let configClient = await this.db.readData('configClient')
        let auth = await this.db.readData('accounts', configClient.account_selected)
        let instancesList = await config.getInstanceList()
        let instanceSelect = instancesList.find(i => i.name == configClient?.instance_selct) ? configClient?.instance_selct : null

        let instanceBTN = document.querySelector('.play-instance')
        let instancePopup = document.querySelector('.instance-popup')
        let instancesListPopup = document.querySelector('.instances-List')
        let instanceCloseBTN = document.querySelector('.close-popup')
        let instanceCountText = document.querySelector('#instance-count-text');

        if (instancesList.length === 1) {
            document.querySelector('.instance-select').style.display = 'none'
            instanceBTN.style.paddingRight = '0'
            instanceCountText.innerText = 'Instance';
        } else {
            instanceCountText.innerText = 'Instances';
        }

        if (!instanceSelect) {
            let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
            let configClient = await this.db.readData('configClient')
            configClient.instance_selct = newInstanceSelect.name
            instanceSelect = newInstanceSelect.name
            await this.db.updateData('configClient', configClient)
        }

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == auth?.name)
                if (whitelist !== auth?.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        let configClient = await this.db.readData('configClient')
                        configClient.instance_selct = newInstanceSelect.name
                        instanceSelect = newInstanceSelect.name
                        setStatus(newInstanceSelect.status)
                        await this.db.updateData('configClient', configClient)
                    }
                }
            } else console.log(`Initializing instance ${instance.name}...`)
            if (instance.name == instanceSelect) setStatus(instance.status)
        }

        instancePopup.addEventListener('click', async e => {
            let configClient = await this.db.readData('configClient');

            if (e.target.classList.contains('instance-elements')) {
                let newInstanceSelect = e.target.id;
                let activeInstanceSelect = document.querySelector('.active-instance');

                if (activeInstanceSelect) activeInstanceSelect.classList.toggle('active-instance');
                e.target.classList.add('active-instance');

                configClient.instance_selct = newInstanceSelect;
                await this.db.updateData('configClient', configClient);
                instanceSelect = instancesList.filter(i => i.name == newInstanceSelect);

                instancePopup.classList.remove('fade-in-active');
                setTimeout(() => {
                    instancePopup.style.display = 'none';
                    instancePopup.classList.remove('fade-in');
                }, 500);

                let instance = await config.getInstanceList();
                let options = instance.find(i => i.name == configClient.instance_selct);
                await setStatus(options.status);
            }
        });

        instanceBTN.addEventListener('click', async e => {
            let configClient = await this.db.readData('configClient');
            let instanceSelect = configClient.instance_selct;
            let auth = await this.db.readData('accounts', configClient.account_selected);

            if (e.target.classList.contains('instance-select')) {
                instancesListPopup.innerHTML = '';
                for (let instance of instancesList) {
                    if (instance.whitelistActive) {
                        instance.whitelist.map(whitelist => {
                            if (whitelist == auth?.name) {
                                if (instance.name == instanceSelect) {
                                    instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements active-instance">${instance.name}</div>`;
                                } else {
                                    instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements">${instance.name}</div>`;
                                }
                            }
                        });
                    } else {
                        if (instance.name == instanceSelect) {
                            instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements active-instance">${instance.name}</div>`;
                        } else {
                            instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements">${instance.name}</div>`;
                        }
                    }
                }

                instancePopup.classList.add('fade-in');
                instancePopup.style.display = 'flex';

                setTimeout(() => {
                    instancePopup.classList.add('fade-in-active');
                }, 10);
            }

            if (!e.target.classList.contains('instance-select')) this.startGame();
        });

        instanceCloseBTN.addEventListener('click', () => {
            instancePopup.classList.remove('fade-in-active');
            setTimeout(() => {
                instancePopup.style.display = 'none';
                instancePopup.classList.remove('fade-in');
            }, 500);
        });
    }

    async startGame() {
        let launch = new Launch()
        let configClient = await this.db.readData('configClient')
        let instance = await config.getInstanceList()
        let authenticator = await this.db.readData('accounts', configClient.account_selected)
        let options = instance.find(i => i.name == configClient.instance_selct)

        if (!authenticator || !authenticator.meta || !authenticator.meta.type) {
            let popupError = new popup()
            popupError.openPopup({
                title: 'Erreur',
                content: 'Aucun compte valide sélectionné. Veuillez vous reconnecter.',
                color: 'red',
                options: true
            })
            return changePanel('login');
        }

        if (!options) {
            let popupError = new popup()
            popupError.openPopup({
                title: 'Erreur',
                content: 'Aucune instance sélectionnée.',
                color: 'red',
                options: true
            })
            return;
        }

        let playBtn = document.querySelector('.play-btn')
        let btnProgressFill = document.querySelector('.btn-progress-fill')
        let btnIcon = document.querySelector('.btn-icon')
        let btnSpinner = document.querySelector('.btn-spinner')
        let btnText = document.querySelector('.btn-text')

        let opt = {
            url: options.url,
            authenticator: authenticator,
            timeout: 10000,
            path: `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
            instance: options.name,
            version: options.loadder.minecraft_version,
            detached: configClient.launcher_config.closeLauncher == "close-all" ? false : true,
            downloadFileMultiple: configClient.launcher_config.download_multi,
            intelEnabledMac: configClient.launcher_config.intelEnabledMac,

            loader: {
                type: options.loadder.loadder_type,
                build: options.loadder.loadder_version,
                enable: options.loadder.loadder_type == 'none' ? false : true
            },

            verify: options.verify,

            ignored: [...options.ignored],

            javaPath: configClient.java_config.java_path,

            screen: {
                width: configClient.game_config.screen_size.width,
                height: configClient.game_config.screen_size.height
            },

            memory: {
                min: `${configClient.java_config.java_memory.min * 1024}M`,
                max: `${configClient.java_config.java_memory.max * 1024}M`
            }
        }

        launch.Launch(opt);

        playBtn.classList.add('loading')
        btnIcon.style.display = 'none'
        btnSpinner.style.display = 'block'
        btnText.textContent = 'Connexion...'
        ipcRenderer.send('main-window-progress-load')

        launch.on('extract', extract => {
            ipcRenderer.send('main-window-progress-load')
            console.log(extract);
        });

        launch.on('progress', (progress, size) => {
            let percent = ((progress / size) * 100).toFixed(0)
            btnText.textContent = `Téléchargement ${percent}%`
            btnProgressFill.style.width = `${percent}%`
            ipcRenderer.send('main-window-progress', { progress, size })
        });

        launch.on('check', (progress, size) => {
            let percent = ((progress / size) * 100).toFixed(0)
            btnText.textContent = `Vérification ${percent}%`
            btnProgressFill.style.width = `${percent}%`
            ipcRenderer.send('main-window-progress', { progress, size })
        });

        launch.on('estimated', (time) => {
            let hours = Math.floor(time / 3600);
            let minutes = Math.floor((time - hours * 3600) / 60);
            let seconds = Math.floor(time - hours * 3600 - minutes * 60);
            console.log(`${hours}h ${minutes}m ${seconds}s`);
        })

        launch.on('speed', (speed) => {
            console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
        })

        launch.on('patch', patch => {
            console.log(patch);
            ipcRenderer.send('main-window-progress-load')
            btnText.textContent = `Patch en cours...`
        });

        launch.on('data', (e) => {
            btnText.textContent = `Démarrage...`
            btnProgressFill.style.width = '100%'
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-hide")
            };
            new logger('Minecraft', '#36b030');
            ipcRenderer.send('main-window-progress-load')
            console.log(e);
        })

        launch.on('close', code => {
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')
            playBtn.classList.remove('loading')
            btnIcon.style.display = 'block'
            btnSpinner.style.display = 'none'
            btnText.textContent = 'Launch'
            btnProgressFill.style.width = '0%'
            new logger(pkg.name, '#7289da');
            console.log('Close');
        });

        launch.on('error', err => {
            let popupError = new popup()

            popupError.openPopup({
                title: 'Erreur',
                content: err.error,
                color: 'red',
                options: true
            })

            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')
            infoStartingBOX.style.display = "none"
            playInstanceBTN.style.display = "flex"
            infoStarting.innerHTML = `Vérification`
            new logger(pkg.name, '#7289da');
            console.log(err);
        });
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }
}
export default Home;