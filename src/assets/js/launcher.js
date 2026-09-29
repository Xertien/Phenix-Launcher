/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import Login from './panels/login.js';
import Home from './panels/home.js';
import Settings from './panels/settings.js';

import { logger, config, changePanel, popup, setBackground, watchTheme, accountSelect, addAccount, pkg, escapeHTML } from './utils.js';

class Launcher {
    async init() {
        this.initLog();
        console.log('Initializing Launcher...');
        this.shortcut()
        await setBackground()
        watchTheme()
        if (window.launcher.platform == 'win32') this.initFrame();
        this.config = await config.GetConfig().then(res => res).catch(err => err);
        if (await this.config.error) return this.errorConnect()

        console.log('[Config] Remote config loaded');

        await this.createPanels(Login, Home, Settings);
        this.startLauncher();
    }

    initLog() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
                window.launcher.window.devTools();
            }
        })
        new logger(pkg.name, '#7289da')
    }

    shortcut() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.keyCode == 87) {
                window.launcher.window.close();
            }
        })
    }

    errorConnect() {
        new popup().openPopup({
            title: this.config.error.code,
            content: escapeHTML(this.config.error.message),
            color: 'red',
            exit: true,
            options: true
        });
    }

    initFrame() {
        console.log('Initializing Frame...')
        document.querySelector('.frame').classList.toggle('hide')
        document.querySelector('.dragbar').classList.toggle('hide')

        document.querySelector('#minimize').addEventListener('click', () => {
            window.launcher.window.minimize();
        });

        let maximized = false;
        let maximize = document.querySelector('#maximize')
        maximize.addEventListener('click', () => {
            window.launcher.window.maximize();
            maximized = !maximized
            maximize.classList.toggle('icon-maximize')
            maximize.classList.toggle('icon-restore-down')
        });

        document.querySelector('#close').addEventListener('click', () => {
            window.launcher.window.close();
        })
    }

    async createPanels(...panels) {
        let panelsElem = document.querySelector('.panels')
        for (let panel of panels) {
            console.log(`Initializing ${panel.name} Panel...`);
            let div = document.createElement('div');
            div.classList.add('panel', panel.id)
            div.innerHTML = await window.launcher.panels.load(panel.id);
            panelsElem.appendChild(div);
            new panel().init(this.config);
        }
    }

    async startLauncher() {
        let accounts = await window.launcher.accounts.list();
        let selected = await window.launcher.accounts.selected();
        let account_selected = selected ? selected.ID : null
        let popupRefresh = new popup();

        if (accounts?.length) {
            for (let account of accounts) {
                const loader = `<div class="loader"></div>`;
                console.log(`Account Type: ${account.type} | Username: ${account.name}`);
                if (account.type === 'Mojang') {
                    popupRefresh.openPopup({
                        title: 'Connexion',
                        content: `Connexion au compte Mojang... | Pseudo : ${escapeHTML(account.name)}`,
                        color: 'var(--color)',
                        background: false
                    });
                } else {
                    popupRefresh.openPopup({
                        title: `Bienvenue ${account.name}`,
                        content: loader,
                        color: 'var(--color)',
                        background: false
                    });
                }

                let refresh_accounts = await window.launcher.accounts.refresh(account.ID);

                if (refresh_accounts.error) {
                    console.error(`[Account] ${account.name}: ${refresh_accounts.message}`);
                    continue;
                }

                await addAccount(refresh_accounts)
                if (account.ID == account_selected) accountSelect(refresh_accounts)
            }

            accounts = await window.launcher.accounts.list();
            selected = await window.launcher.accounts.selected();

            if (!selected && accounts.length > 0 && accounts[0]?.ID) {
                selected = await window.launcher.accounts.select(accounts[0].ID);
                accountSelect(selected)
            }

            if (!accounts.length) {
                popupRefresh.closePopup()
                return changePanel("login");
            }

            popupRefresh.closePopup()
            changePanel("home");
        } else {
            popupRefresh.closePopup()
            changePanel('login');
        }
    }
}

new Launcher().init();
