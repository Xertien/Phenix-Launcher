/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import Login from './panels/login.js';
import Home from './panels/home.js';
import Settings from './panels/settings.js';

import { logger, config, changePanel, popup, setBackground, watchTheme, accountSelect, addAccount, skin2D, pkg, escapeHTML } from './utils.js';

const REFRESH_TIMEOUT_MS = 15000;
const BOOT_FAILSAFE_MS = 45000;
const SLOW_CONFIG_MS = 8000;
const TIMED_OUT = Symbol('timeout');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const JOIN_DURATION_MS = 420;
const JOIN_STAGGER_MS = 20;
const JOIN_EASING = 'cubic-bezier(0.11, 0, 0.5, 0)';
const SOLID_FADE_MS = 70;
const FUSE_LEAD_MS = 80;
const PULSE_MS = 180;
const SOLID_HOLD_MS = 160;
const JOIN_SAFETY_MS = 1400;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        Promise.resolve(promise).finally(() => clearTimeout(timer)),
        new Promise(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), ms); })
    ]);
}

class BootScreen {
    constructor() {
        this.root = document.querySelector('.boot');
        this.status = document.querySelector('.boot-status');
        this.welcome = document.querySelector('.boot-welcome');
        this.welcomeText = document.querySelector('.boot-welcome-text');
        this.head = document.querySelector('.boot-head');
        this.welcomeId = null;
        this.closed = !this.root;
    }

    setStatus(text, tone) {
        if (this.closed) return;
        this.status.classList.toggle('boot-status-warn', tone === 'warn');
        if (this.status.textContent === text) return;
        this.status.textContent = text;
        this.status.classList.remove('boot-status-in');
        void this.status.offsetWidth;
        this.status.classList.add('boot-status-in');
    }

    async setWelcome(account) {
        if (this.closed || !account?.name) return;
        if (this.welcomeId === account.ID) return;
        this.welcomeId = account.ID;
        this.welcomeText.textContent = `Bienvenue, ${account.name}`;
        this.welcome.classList.add('visible');
        this.head.classList.remove('has-skin');
        this.head.style.backgroundImage = '';
        let head = account.skin ? await new skin2D().creatHeadTexture(account.skin).catch(() => false) : false;
        if (!head || this.welcomeId !== account.ID) return;
        this.head.style.backgroundImage = `url("${head}")`;
        this.head.classList.add('has-skin');
    }

    clearWelcome() {
        if (this.closed) return;
        this.welcomeId = null;
        this.welcome.classList.remove('visible');
    }

    halt(text) {
        if (this.closed) return;
        this.setStatus(text, 'warn');
        this.root.classList.add('boot-halted');
        this.root.setAttribute('aria-busy', 'false');
    }

    reassemble() {
        let solid = this.root.querySelector('.boot-solid');
        let mark = this.root.querySelector('.boot-mark');
        let blocks = [...this.root.querySelectorAll('.boot-px')];
        if (reduceMotion.matches || !solid || !mark || !blocks.length || typeof solid.animate !== 'function') return null;
        if (getComputedStyle(blocks[0]).visibility === 'hidden') return null;
        let states = blocks.map(block => {
            let style = getComputedStyle(block);
            return { block, opacity: style.opacity, transform: style.transform === 'none' ? 'scale(1)' : style.transform };
        });
        let solidOpacity = getComputedStyle(solid).fillOpacity;
        let last = blocks.length - 1;
        let joined = JOIN_DURATION_MS + last * JOIN_STAGGER_MS;
        let fuseAt = joined - FUSE_LEAD_MS;
        let opaqueAt = fuseAt + SOLID_FADE_MS;
        let animations = states.map(({ block, opacity, transform }, index) => block.animate([
            { transform, opacity, visibility: 'visible' },
            { transform: 'scale(1)', opacity: 1, visibility: 'visible' }
        ], { duration: joined - (last - index) * JOIN_STAGGER_MS, delay: (last - index) * JOIN_STAGGER_MS, easing: JOIN_EASING, fill: 'both' }));
        for (let block of blocks) block.animate([{ visibility: 'hidden' }, { visibility: 'hidden' }], { duration: 1, delay: opaqueAt, fill: 'forwards' });
        animations.push(solid.animate([{ fillOpacity: solidOpacity }, { fillOpacity: 1 }], { duration: SOLID_FADE_MS, delay: fuseAt, fill: 'both' }));
        animations.push(mark.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(1.04)', offset: 0.35 },
            { transform: 'scale(1)' }
        ], { duration: PULSE_MS, delay: fuseAt, easing: 'ease-out' }));
        const settle = () => {
            solid.style.fillOpacity = '1';
            for (let block of blocks) block.style.visibility = 'hidden';
        };
        return Promise.race([Promise.all(animations.map(animation => animation.finished)), wait(JOIN_SAFETY_MS)]).catch(() => { }).then(settle);
    }

    async reveal() {
        if (this.closed) return;
        this.closed = true;
        let root = document.documentElement;
        let joining = this.reassemble();
        this.root.classList.add('boot-ready');
        this.root.setAttribute('aria-busy', 'false');
        if (joining) {
            await joining;
            await wait(SOLID_HOLD_MS);
        } else {
            await wait(reduceMotion.matches ? 60 : 340);
        }
        root.classList.add('boot-reveal');
        root.classList.remove('booting');
        this.root.classList.add('boot-hide');
        await wait(reduceMotion.matches ? 220 : 900);
        root.classList.remove('boot-reveal');
        this.root.remove();
    }
}

class Launcher {
    async init() {
        this.boot = new BootScreen();
        this.initLog();
        console.log('Initializing Launcher...');
        this.shortcut()
        try {
            await setBackground()
            watchTheme()
            if (window.launcher.platform == 'win32') this.initFrame();
            this.boot.setStatus('Chargement de la configuration…');
            let slowConfig = setTimeout(() => this.boot.setStatus('Le serveur met du temps à répondre…', 'warn'), SLOW_CONFIG_MS);
            this.config = await config.GetConfig().then(res => res).catch(err => err);
            clearTimeout(slowConfig);
            if (await this.config.error) return this.errorConnect()

            console.log('[Config] Remote config loaded');

            this.boot.setStatus('Préparation de l\'interface…');
            await this.createPanels(Login, Home, Settings);
        } catch (error) {
            console.error(`[Launcher] Startup error: ${error?.message || error}`);
            this.boot.halt('Le launcher n\'a pas pu démarrer.');
            return new popup().openPopup({
                title: 'Erreur',
                content: escapeHTML(String(error?.message || error)),
                color: 'red',
                exit: true,
                options: true
            });
        }
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
        this.boot.halt('Impossible de joindre le serveur.');
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
        let failsafe = setTimeout(() => {
            console.warn('[Boot] Startup is taking too long, showing the interface');
            this.finishBoot();
        }, BOOT_FAILSAFE_MS);
        try {
            await this.refreshAccounts();
        } catch (error) {
            console.error(`[Boot] Account refresh failed: ${error?.message || error}`);
        }
        clearTimeout(failsafe);
        await this.finishBoot();
    }

    accountStatus(account, index, total, selected) {
        let progress = total > 1 ? ` (${index + 1}/${total})` : '';
        if (!selected) return `Actualisation du compte ${account.name}…${progress}`;
        if (account.type === 'Xbox') return `Connexion à votre compte Microsoft…${progress}`;
        if (account.type === 'Mojang') return `Chargement de votre profil…${progress}`;
        return `Connexion à votre compte…${progress}`;
    }

    async refreshAccounts() {
        this.boot.setStatus('Chargement des comptes…');
        let [accounts, selected] = await Promise.all([
            withTimeout(window.launcher.accounts.list(), REFRESH_TIMEOUT_MS).catch(() => []),
            withTimeout(window.launcher.accounts.selected(), REFRESH_TIMEOUT_MS).catch(() => null)
        ]);
        if (!Array.isArray(accounts)) accounts = [];
        if (selected === TIMED_OUT) selected = null;
        let account_selected = selected ? selected.ID : null;
        this.hasAccounts = accounts.length > 0;

        if (!accounts.length) return;

        let ordered = [...accounts].sort((a, b) => (b.ID == account_selected) - (a.ID == account_selected));
        this.boot.setWelcome(ordered[0]);
        let remaining = accounts.length;
        let stalled = false;

        for (let [index, account] of ordered.entries()) {
            console.log(`Account Type: ${account.type} | Username: ${account.name}`);
            let isSelected = account.ID == account_selected || (!account_selected && index === 0);
            this.boot.setStatus(this.accountStatus(account, index, ordered.length, isSelected));

            let request = window.launcher.accounts.refresh(account.ID);
            let refresh_accounts = await withTimeout(request, REFRESH_TIMEOUT_MS).catch(error => ({ error: true, message: String(error?.message || error) }));

            if (refresh_accounts === TIMED_OUT) {
                console.warn(`[Account] ${account.name}: refresh timed out`);
                stalled = true;
                this.boot.setStatus(`Le compte ${account.name} ne répond pas, chargement de l'interface…`, 'warn');
                request.then(async late => {
                    if (!late || late.error || document.getElementById(`${late.ID}`)) return;
                    await addAccount(late);
                    if (late.ID == account_selected) accountSelect(late);
                }).catch(() => { });
                await wait(700);
                continue;
            }

            if (!refresh_accounts || refresh_accounts.error) {
                console.error(`[Account] ${account.name}: ${refresh_accounts?.message}`);
                remaining--;
                this.boot.setStatus(`La session de ${account.name} a expiré.`, 'warn');
                await wait(900);
                continue;
            }

            await addAccount(refresh_accounts)
            if (account.ID == account_selected) accountSelect(refresh_accounts)
        }

        this.hasAccounts = remaining > 0;
        if (stalled) return;

        accounts = await window.launcher.accounts.list();
        selected = await window.launcher.accounts.selected();

        if (!selected && accounts.length > 0 && accounts[0]?.ID) {
            selected = await window.launcher.accounts.select(accounts[0].ID);
            accountSelect(selected)
        }

        this.hasAccounts = accounts.length > 0;
        if (selected) this.boot.setWelcome(selected);
    }

    async finishBoot() {
        if (this.booted) return;
        this.booted = true;
        if (this.hasAccounts) {
            this.boot.setStatus('Prêt');
            changePanel('home');
        } else {
            this.boot.clearWelcome();
            this.boot.setStatus('Connectez-vous pour commencer');
            changePanel('login');
        }
        await this.boot.reveal();
    }
}

new Launcher().init();
