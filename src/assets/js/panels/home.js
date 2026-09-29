/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { config, logger, changePanel, setStatus, pkg, popup, accountSelect, addAccount, skin2D, escapeHTML, sanitizeHTML, decodeEntities, isSafeExternalUrl } from '../utils.js'

const PIN_ICON = 'M640-760v280l68 68q6 6 9 13.5t3 15.5v23q0 17-11.5 28.5T680-320H520v234q0 17-11.5 28.5T480-46q-17 0-28.5-11.5T440-86v-234H280q-17 0-28.5-11.5T240-360v-23q0-8 3-15.5t9-13.5l68-68v-280q-17 0-28.5-11.5T280-800q0-17 11.5-28.5T320-840h320q17 0 28.5 11.5T680-800q0 17-11.5 28.5T640-760ZM354-400h252l-46-46v-314H400v314l-46 46Zm126 0Z';
const PIN_ICON_FILLED = 'M640-760v280l68 68q6 6 9 13.5t3 15.5v23q0 17-11.5 28.5T680-320H520v234q0 17-11.5 28.5T480-46q-17 0-28.5-11.5T440-86v-234H280q-17 0-28.5-11.5T240-360v-23q0-8 3-15.5t9-13.5l68-68v-280q-17 0-28.5-11.5T280-800q0-17 11.5-28.5T320-840h320q17 0 28.5 11.5T680-800q0 17-11.5 28.5T640-760Z';
const LOCK_ICON = 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z';
const TRASH_ICON = 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z';
const DOWNLOAD_DONE_ICON = 'M200-160v-80h560v80H200Zm202-160L204-518l56-56 142 142 298-298 56 56-354 354Z';
const DOWNLOAD_ICON = 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z';
const CHECK_ICON = 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z';

class Home {
    static id = "home";
    async init(config) {
        this.config = config;
        this.news()
        this.socialLick()
        this.instancesSelect()
        this.playerModal()
        this.gameEvents()
        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'))
    }

    async news() {
        let newsElement = document.querySelector('.news-list');
        let news = await config.getNews().then(res => res).catch(err => false);
        newsElement.replaceChildren();
        this.newsItems = [];

        if (!news) {
            newsElement.appendChild(this.createNewsState('Impossible de charger les actualités.', 'Le serveur des news ne répond pas. Vérifiez votre connexion puis relancez le launcher.', true));
        } else if (!Array.isArray(news) || !news.length) {
            newsElement.appendChild(this.createNewsState('Aucune actualité pour le moment.', 'Les nouveautés du serveur apparaîtront ici.', false));
        } else {
            this.newsItems = news.filter(item => item && typeof item === 'object')
                .sort((a, b) => (new Date(b.publish_date).getTime() || 0) - (new Date(a.publish_date).getTime() || 0));
            this.newsItems.forEach((item, index) => newsElement.appendChild(this.createNewsTile(item, index)));
        }

        this.setupNewsModal();
        this.setupNewsScroll(newsElement);
    }

    createNewsState(title, text, error) {
        let block = document.createElement('div');
        block.classList.add('news-state');
        block.classList.toggle('news-state-error', error);

        let heading = document.createElement('div');
        heading.classList.add('news-state-title');
        heading.textContent = title;

        let body = document.createElement('p');
        body.classList.add('news-state-text');
        body.textContent = text;

        block.append(heading, body);
        return block;
    }

    newsTitle(item) {
        return decodeEntities(item?.title ?? '').trim() || 'Actualité';
    }

    newsAuthor(item) {
        return decodeEntities(item?.author ?? '').trim();
    }

    createNewsTile(item, index) {
        let tile = document.createElement('button');
        tile.type = 'button';
        tile.classList.add('news-tile');
        tile.dataset.index = String(index);
        tile.setAttribute('aria-haspopup', 'dialog');

        let date = this.formatNewsDate(item?.publish_date, 'short');
        let dateElement = document.createElement('span');
        dateElement.classList.add('news-tile-date');
        dateElement.textContent = date ? date.label : '';

        let title = document.createElement('span');
        title.classList.add('news-tile-title');
        title.textContent = this.newsTitle(item);

        let footer = document.createElement('span');
        footer.classList.add('news-tile-footer');

        let author = this.newsAuthor(item);
        let authorElement = document.createElement('span');
        authorElement.classList.add('news-tile-author');
        if (author) {
            let name = document.createElement('strong');
            name.textContent = author;
            authorElement.append(document.createTextNode('Par '), name);
        }

        let more = document.createElement('span');
        more.classList.add('news-tile-more');
        more.setAttribute('aria-hidden', 'true');
        more.textContent = 'Lire';

        footer.append(authorElement, more);
        tile.append(dateElement, title, footer);
        tile.setAttribute('aria-label', [this.newsTitle(item), author ? `par ${author}` : '', date ? date.long : ''].filter(Boolean).join(', '));
        return tile;
    }

    formatNewsDate(value, style = 'long') {
        let date = new Date(value);
        if (!value || Number.isNaN(date.getTime())) return null;
        let long = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
        let short = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
        return { iso: date.toISOString(), long, label: style === 'short' ? short : long };
    }

    setupNewsScroll(newsElement) {
        const update = () => {
            let maxScroll = newsElement.scrollHeight - newsElement.clientHeight;
            newsElement.classList.toggle('fade-top', newsElement.scrollTop > 4);
            newsElement.classList.toggle('fade-bottom', maxScroll - newsElement.scrollTop > 4);
        };

        if (!this.newsScrollReady) {
            this.newsScrollReady = true;
            newsElement.addEventListener('scroll', update, { passive: true });
            new ResizeObserver(update).observe(newsElement);
        }
        update();
    }

    setupNewsModal() {
        if (this.newsModalReady) return;
        this.newsModalReady = true;

        let newsList = document.querySelector('.news-list');
        let newsPopup = document.querySelector('.news-popup');
        let dialog = document.querySelector('.news-modal-tab');
        let closeBtn = document.querySelector('.close-news-popup');
        let content = document.querySelector('.news-modal-content');

        newsList.addEventListener('click', e => {
            let tile = e.target.closest('.news-tile');
            if (tile) this.openNewsModal(Number(tile.dataset.index), tile);
        });

        closeBtn.addEventListener('click', () => this.closeNewsModal());

        newsPopup.addEventListener('click', e => {
            if (e.target === newsPopup) this.closeNewsModal();
        });

        newsPopup.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeNewsModal();
            } else if (e.key === 'Tab') {
                let focusables = [closeBtn, ...content.querySelectorAll('a[href]')];
                let index = focusables.indexOf(document.activeElement);
                e.preventDefault();
                let next = e.shiftKey ? index - 1 : index + 1;
                if (next < 0) next = focusables.length - 1;
                if (next >= focusables.length) next = 0;
                focusables[next].focus();
            }
        });

        content.addEventListener('click', e => {
            let link = e.target.closest('a');
            if (!link) return;
            e.preventDefault();
            let href = link.getAttribute('href');
            if (href && isSafeExternalUrl(href)) window.launcher.shell.openExternal(href);
        });

        dialog.addEventListener('keydown', e => {
            if (e.target !== dialog) return;
            let step = { ArrowDown: 40, ArrowUp: -40, PageDown: content.clientHeight - 40, PageUp: -(content.clientHeight - 40) }[e.key];
            if (step) {
                e.preventDefault();
                content.scrollBy({ top: step });
            }
        });
    }

    openNewsModal(index, tile) {
        let item = this.newsItems?.[index];
        if (!item) return;
        let newsPopup = document.querySelector('.news-popup');
        let dialog = document.querySelector('.news-modal-tab');
        let content = document.querySelector('.news-modal-content');
        let author = this.newsAuthor(item);
        let date = this.formatNewsDate(item.publish_date);

        this.newsReturnFocus = tile;
        clearTimeout(this.newsModalTimer);

        document.querySelector('.news-modal-title').textContent = this.newsTitle(item);

        let authorElement = document.querySelector('.news-modal-author');
        authorElement.replaceChildren();
        if (author) {
            let name = document.createElement('strong');
            name.textContent = author;
            authorElement.append(document.createTextNode('Par '), name);
        }
        authorElement.hidden = !author;

        let dateElement = document.querySelector('.news-modal-date');
        dateElement.textContent = date ? date.long : '';
        dateElement.dateTime = date ? date.iso : '';
        dateElement.hidden = !date;

        content.innerHTML = sanitizeHTML(String(item.content ?? '').replace(/\n/g, '<br>'));
        for (let link of content.querySelectorAll('a')) {
            link.setAttribute('rel', 'noopener noreferrer');
            if (link.hasAttribute('href')) link.title = link.getAttribute('href');
        }
        content.scrollTop = 0;

        newsPopup.style.display = 'flex';
        void newsPopup.offsetWidth;
        newsPopup.classList.add('active-popup');
        dialog.focus({ preventScroll: true });
    }

    closeNewsModal() {
        let newsPopup = document.querySelector('.news-popup');
        if (!newsPopup.classList.contains('active-popup')) return;
        newsPopup.classList.remove('active-popup');
        clearTimeout(this.newsModalTimer);
        this.newsModalTimer = setTimeout(() => {
            newsPopup.style.display = 'none';
            document.querySelector('.news-modal-content').replaceChildren();
        }, 300);
        if (this.newsReturnFocus?.isConnected) this.newsReturnFocus.focus({ preventScroll: true });
    }

    socialLick() {
        let socials = document.querySelectorAll('.social-block')

        socials.forEach(social => {
            social.addEventListener('click', e => {
                let url = e.currentTarget.dataset.url
                window.launcher.shell.openExternal(url)
            })
        });
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
                    content: '<div class="loader"></div><p class="popup-loader-text">Obtention du code...</p>',
                    color: 'var(--color)'
                });

                try {
                    const deviceCodeResult = await window.launcher.auth.microsoft.start();

                    if (deviceCodeResult.error) {
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
                                <span class="device-code-value">${escapeHTML(user_code)}</span>
                                <button id="copy-code-btn-home" class="device-code-copy" title="Copier le code">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                            </div>
                            <p id="copy-feedback-home" class="device-code-feedback">Code copié !</p>
                            <button id="open-browser-btn-home" class="popup-button">Ouvrir le navigateur</button>
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
                        const openBtn = document.getElementById('open-browser-btn-home');
                        const copyBtn = document.getElementById('copy-code-btn-home');
                        const copyFeedback = document.getElementById('copy-feedback-home');

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
                            popupLogin.closePopup();
                            return;
                        }
                        popupLogin.openPopup({
                            title: 'Erreur Microsoft',
                            content: escapeHTML(`${account.error}: ${account.errorMessage || 'Erreur inconnue'}`),
                            color: 'red',
                            options: true
                        });
                        return;
                    }

                    await addAccount(account);
                    await accountSelect(account);

                    popupLogin.closePopup();

                    await this.loadAccounts(accountListContainer);
                    playerPopup.style.display = 'flex';
                    requestAnimationFrame(() => {
                        playerPopup.classList.add('active-popup');
                    });
                } catch (err) {
                    console.error(`[Home] Microsoft auth error: ${err}`);
                    popupLogin.openPopup({
                        title: 'Erreur',
                        content: escapeHTML(err.toString()),
                        options: true
                    });
                }
            });
        }
    }

    async loadAccounts(container) {
        if (!container) return;
        container.innerHTML = '';
        let accounts = await window.launcher.accounts.list().catch(() => []);
        if (!Array.isArray(accounts)) accounts = [];

        for (let account of accounts) {
            if (!account || !account.uuid || !account.name) continue;

            let skin = false;
            if (account.skin) skin = await new skin2D().creatHeadTexture(account.skin);

            let div = document.createElement("div");
            div.classList.add("account");
            div.dataset.id = account.ID;

            div.innerHTML = `
                <div class="profile-image" ${skin ? 'style="background-image: url(' + skin + ');"' : ''}></div>
                <div class="profile-infos">
                    <div class="profile-pseudo">${escapeHTML(account.name)}</div>
                    <div class="profile-uuid">${escapeHTML(account.uuid)}</div>
                </div>
            `;

            div.addEventListener('click', async () => {
                await accountSelect(account);
                await window.launcher.accounts.select(account.ID);

                document.querySelector('.player-popup').style.display = 'none';

                this.instancesSelect();
            });

            container.appendChild(div);
        }
    }

    canAccessInstance(instance, auth) {
        if (!instance?.whitelistActive) return true;
        return Array.isArray(instance.whitelist) && instance.whitelist.includes(auth?.name);
    }

    availableInstances() {
        return (this.instancesList || []).filter(instance => this.canAccessInstance(instance, this.auth));
    }

    async instancesSelect() {
        this.setupInstanceMenu();
        let configClient = await window.launcher.settings.get();
        this.auth = await window.launcher.accounts.selected();
        this.instancesList = await config.getInstanceList();
        this.pinnedInstances = Array.isArray(configClient?.pinned_instances) ? configClient.pinned_instances : [];

        let available = this.availableInstances();
        let instanceSelect = available.find(i => i.name == configClient?.instance_selct)?.name ?? null;

        this.singleInstance = available.length <= 1;

        if (!instanceSelect) {
            let fallback = available.find(i => !i.whitelistActive) || available[0];
            if (fallback) {
                instanceSelect = fallback.name;
                await window.launcher.settings.set('instance_selct', fallback.name);
            }
        }

        for (let instance of available) console.log(`Initializing instance ${instance.name}...`);

        this.instanceSelect = instanceSelect;
        this.updateInstanceButton();
        setStatus(this.instancesList.find(i => i.name == instanceSelect));
        this.refreshInstanceStates();
    }

    setupInstanceMenu() {
        if (this.instanceMenuReady) return;
        this.instanceMenuReady = true;

        let instancePopup = document.querySelector('.instance-popup');
        let selectButton = document.querySelector('.instance-select');
        let closeButton = document.querySelector('.close-instance-popup');
        let search = document.querySelector('.instances-search-input');
        let list = document.querySelector('.instances-list');

        document.querySelector('.play-btn').addEventListener('click', () => this.startGame());

        selectButton.addEventListener('click', () => this.openInstanceMenu());
        selectButton.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.openInstanceMenu();
            }
        });

        closeButton.addEventListener('click', () => this.closeInstanceMenu());

        instancePopup.addEventListener('click', e => {
            if (e.target === instancePopup) this.closeInstanceMenu();
        });

        instancePopup.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeInstanceMenu();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                let current = list.querySelector('.instance-elements[tabindex="0"]');
                if (document.activeElement === search && current) this.focusInstanceOption(current);
                else search.focus();
            }
        });

        search.addEventListener('input', () => this.renderInstanceList());
        search.addEventListener('keydown', e => {
            let options = this.instanceOptions();
            if (e.key === 'ArrowDown' && options.length) {
                e.preventDefault();
                this.focusInstanceOption(list.querySelector('.instance-elements[tabindex="0"]') || options[0]);
            } else if (e.key === 'Enter' && options.length) {
                e.preventDefault();
                this.selectInstance(options[0].dataset.name);
            }
        });

        list.addEventListener('click', e => {
            let option = e.target.closest('.instance-elements');
            if (!option) return;
            if (e.target.closest('.instance-pin')) return this.togglePin(option.dataset.name);
            if (e.target.closest('.instance-delete')) return this.deleteInstance(option.dataset.name);
            this.selectInstance(option.dataset.name);
        });

        list.addEventListener('keydown', e => {
            let option = e.target.closest('.instance-elements');
            if (!option) return;
            let options = this.instanceOptions();
            let index = options.indexOf(option);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.focusInstanceOption(options[Math.min(index + 1, options.length - 1)]);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (index <= 0) search.focus();
                else this.focusInstanceOption(options[index - 1]);
            } else if (e.key === 'Home') {
                e.preventDefault();
                this.focusInstanceOption(options[0]);
            } else if (e.key === 'End') {
                e.preventDefault();
                this.focusInstanceOption(options[options.length - 1]);
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectInstance(option.dataset.name);
            } else if (e.key === 'Delete') {
                e.preventDefault();
                this.deleteInstance(option.dataset.name);
            } else if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                this.togglePin(option.dataset.name);
            } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                search.focus();
            }
        });
    }

    async openInstanceMenu() {
        let instancePopup = document.querySelector('.instance-popup');
        let search = document.querySelector('.instances-search-input');
        if (instancePopup.classList.contains('active-popup') || this.singleInstance) return;

        clearTimeout(this.instanceMenuTimer);
        let configClient = await window.launcher.settings.get().catch(() => null);
        if (configClient) {
            this.instanceSelect = configClient.instance_selct ?? this.instanceSelect;
            if (Array.isArray(configClient.pinned_instances)) this.pinnedInstances = configClient.pinned_instances;
        }
        this.auth = await window.launcher.accounts.selected().catch(() => this.auth);

        search.value = '';
        this.renderInstanceList();
        instancePopup.style.display = 'flex';
        void instancePopup.offsetWidth;
        instancePopup.classList.add('active-popup');
        search.focus();

        let current = document.querySelector('.instances-list .instance-elements[tabindex="0"]');
        if (current) current.scrollIntoView({ block: 'nearest' });
        this.refreshInstanceStates();
    }

    closeInstanceMenu() {
        let instancePopup = document.querySelector('.instance-popup');
        if (!instancePopup.classList.contains('active-popup')) return;
        instancePopup.classList.remove('active-popup');
        clearTimeout(this.instanceMenuTimer);
        this.instanceMenuTimer = setTimeout(() => {
            instancePopup.style.display = 'none';
        }, 300);
        let selectButton = document.querySelector('.instance-select');
        if (selectButton.offsetParent) selectButton.focus({ preventScroll: true });
    }

    instanceOptions() {
        return [...document.querySelectorAll('.instances-list .instance-elements')];
    }

    focusInstanceOption(option) {
        if (!option) return;
        for (let item of this.instanceOptions()) item.tabIndex = item === option ? 0 : -1;
        option.focus({ preventScroll: true });
        option.scrollIntoView({ block: 'nearest' });
    }

    normalizeSearch(value) {
        return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    instanceDescription(instance) {
        let parts = [];
        let serverName = decodeEntities(instance?.status?.nameServer ?? '').trim();
        if (serverName) parts.push(serverName);
        let version = instance?.loadder?.minecraft_version;
        if (typeof version === 'string' && version.length) parts.push(`Minecraft ${version}`);
        return parts.join(' · ');
    }

    fillInstanceMeta(element, instance) {
        element.replaceChildren();
        let serverName = decodeEntities(instance?.status?.nameServer ?? '').trim();
        let version = instance?.loadder?.minecraft_version;
        if (serverName) {
            let server = document.createElement('span');
            server.classList.add('meta-server');
            server.textContent = serverName;
            element.appendChild(server);
        }
        if (typeof version === 'string' && version.length) {
            let versionElement = document.createElement('span');
            versionElement.classList.add('meta-version');
            versionElement.textContent = serverName ? `· Minecraft ${version}` : `Minecraft ${version}`;
            element.appendChild(versionElement);
        }
    }

    renderInstanceList(focusName = null) {
        let list = document.querySelector('.instances-list');
        let search = document.querySelector('.instances-search-input');
        let rawQuery = search.value.trim();
        let query = this.normalizeSearch(rawQuery);

        let available = this.availableInstances();
        let collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
        let matches = available
            .filter(instance => !query || this.normalizeSearch(instance.name).includes(query) || this.normalizeSearch(this.instanceDescription(instance)).includes(query))
            .sort((a, b) => collator.compare(a.name, b.name));
        let pinned = matches.filter(instance => this.pinnedInstances.includes(instance.name));
        let others = matches.filter(instance => !this.pinnedInstances.includes(instance.name));


        list.replaceChildren();

        if (!matches.length) {
            let empty = document.createElement('div');
            empty.classList.add('instances-empty');
            empty.textContent = rawQuery ? `Aucune instance ne correspond à « ${rawQuery} ».` : 'Aucune instance disponible.';
            list.appendChild(empty);
            return;
        }

        if (pinned.length) list.appendChild(this.createInstanceGroup('pinned', 'Épinglées', pinned));
        if (others.length) list.appendChild(this.createInstanceGroup('all', 'Toutes les instances', others));

        let options = this.instanceOptions();
        let current = options.find(option => option.dataset.name === focusName)
            || options.find(option => option.dataset.name === this.instanceSelect)
            || options[0];
        current.tabIndex = 0;
        if (focusName && current.dataset.name === focusName) this.focusInstanceOption(current);
    }

    createInstanceGroup(id, title, instances) {
        let group = document.createElement('div');
        group.classList.add('instances-group');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', `instances-group-${id}`);

        let header = document.createElement('div');
        header.classList.add('instances-group-title');
        header.id = `instances-group-${id}`;

        let label = document.createElement('span');
        label.textContent = title;
        let count = document.createElement('span');
        count.classList.add('instances-group-count');
        count.textContent = String(instances.length);
        header.append(label, count);
        group.appendChild(header);

        for (let instance of instances) group.appendChild(this.createInstanceOption(instance));
        return group;
    }

    createIcon(pathData) {
        let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 -960 960 960');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('aria-hidden', 'true');
        let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
        return svg;
    }

    createInstanceOption(instance) {
        let selected = instance.name === this.instanceSelect;
        let pinned = this.pinnedInstances.includes(instance.name);
        let description = this.instanceDescription(instance);

        let option = document.createElement('div');
        option.classList.add('instance-elements');
        option.classList.toggle('active-instance', selected);
        option.classList.toggle('pinned-instance', pinned);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(selected));
        option.tabIndex = -1;
        option.dataset.name = instance.name;


        let stateInfo = this.instanceStates?.get(instance.name);
        let infos = document.createElement('div');
        infos.classList.add('instance-infos');
        let name = document.createElement('div');
        name.classList.add('instance-name');
        name.textContent = instance.name;
        name.title = instance.name;
        infos.appendChild(name);
        if (description) {
            let meta = document.createElement('div');
            meta.classList.add('instance-meta');
            this.fillInstanceMeta(meta, instance);
            meta.title = description;
            infos.appendChild(meta);
        }

        let badges = document.createElement('div');
        badges.classList.add('instance-badges');
        if (instance.whitelistActive) {
            let badge = document.createElement('span');
            badge.classList.add('instance-badge', 'badge-private');
            badge.title = 'Instance réservée aux joueurs autorisés';
            badge.append(this.createIcon(LOCK_ICON), document.createTextNode('Privée'));
            badges.appendChild(badge);
        }
        if (selected) {
            let badge = document.createElement('span');
            badge.classList.add('instance-badge', 'badge-selected');
            badge.append(this.createIcon(CHECK_ICON), document.createTextNode('Sélectionnée'));
            badges.appendChild(badge);
        }

        let pin = document.createElement('button');
        pin.type = 'button';
        pin.tabIndex = -1;
        pin.classList.add('instance-pin');
        pin.classList.toggle('pinned', pinned);
        pin.setAttribute('aria-pressed', String(pinned));
        pin.title = pinned ? 'Désépingler' : 'Épingler';
        pin.setAttribute('aria-label', `${pinned ? 'Désépingler' : 'Épingler'} ${instance.name}`);
        pin.appendChild(this.createIcon(pinned ? PIN_ICON_FILLED : PIN_ICON));

        let actions = document.createElement('div');
        actions.classList.add('instance-actions');
        let slot = document.createElement('div');
        slot.classList.add('instance-delete-slot');
        actions.appendChild(slot);
        if (stateInfo?.deletable) {
            let remove = document.createElement('button');
            remove.type = 'button';
            remove.tabIndex = -1;
            remove.classList.add('instance-delete');
            remove.title = 'Supprimer de votre PC (Suppr)';
            remove.setAttribute('aria-label', `Supprimer ${instance.name} de votre PC`);
            remove.appendChild(this.createIcon(TRASH_ICON));
            slot.appendChild(remove);
        }
        actions.appendChild(pin);

        option.classList.toggle('deletable-instance', !!stateInfo?.deletable);
        option.classList.toggle('has-badges', badges.childElementCount > 0);
        option.append(this.createInstanceState(stateInfo?.state ?? 'unknown', false), infos, badges, actions);
        return option;
    }

    instanceStateLabel(state, card) {
        if (state === 'installed') return 'Installée';
        if (state === 'incomplete') return 'Téléchargement incomplet';
        return card ? 'À télécharger' : 'Non installée';
    }

    createInstanceState(state, card) {
        let element = document.createElement('span');
        let key = state === 'installed' ? 'installed' : (state === 'incomplete' ? 'incomplete' : (state === 'unknown' ? 'unknown' : 'missing'));
        element.classList.add('instance-state', `state-${key}`);
        if (key === 'unknown') {
            element.setAttribute('aria-hidden', 'true');
            return element;
        }
        let label = this.instanceStateLabel(state, card);
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', label);
        element.title = label;
        element.appendChild(this.createIcon(key === 'installed' ? DOWNLOAD_DONE_ICON : DOWNLOAD_ICON));
        return element;
    }

    async refreshInstanceStates() {
        let list = await window.launcher.instances.status().catch(() => null);
        if (!Array.isArray(list)) return false;
        let next = new Map();
        for (let item of list) {
            if (item && typeof item.name === 'string') next.set(item.name, { state: item.state, deletable: item.deletable === true });
        }
        let changed = !this.instanceStates || this.instanceStates.size !== next.size || [...next].some(([name, value]) => {
            let previous = this.instanceStates.get(name);
            return !previous || previous.state !== value.state || previous.deletable !== value.deletable;
        });
        this.instanceStates = next;
        if (changed) {
            this.updateInstanceButton();
            let instancePopup = document.querySelector('.instance-popup');
            if (instancePopup.classList.contains('active-popup')) {
                let focused = document.activeElement?.closest?.('.instance-elements')?.dataset.name ?? null;
                this.renderInstanceList(focused);
            }
        }
        return changed;
    }

    showInstanceToast(message, error) {
        let toast = document.querySelector('.instances-toast');
        toast.textContent = message;
        toast.classList.toggle('toast-error', !!error);
        toast.hidden = false;
        void toast.offsetWidth;
        toast.classList.add('visible');
        clearTimeout(this.instanceToastTimer);
        this.instanceToastTimer = setTimeout(() => {
            toast.classList.remove('visible');
            this.instanceToastTimer = setTimeout(() => { toast.hidden = true; }, 250);
        }, 3500);
    }

    async deleteInstance(name) {
        let stateInfo = this.instanceStates?.get(name);
        if (!stateInfo?.deletable || this.deletingInstance) return;
        let confirmed = await new popup().confirm({
            title: 'Supprimer l\'instance',
            text: [
                `Supprimer ${name} de votre PC ?`,
                'Les fichiers de l\'instance seront supprimés, vos sauvegardes (saves) aussi. Cette action est irréversible.'
            ],
            confirmLabel: 'Supprimer',
            cancelLabel: 'Annuler',
            danger: true
        });
        if (!confirmed) return;

        this.deletingInstance = name;
        let row = this.instanceOptions().find(option => option.dataset.name === name);
        if (row) row.classList.add('deleting-instance');
        let result = await window.launcher.instances.remove(name).catch(() => ({ error: 'failed', message: 'La suppression a échoué.' }));
        this.deletingInstance = null;

        if (result?.deleted) this.showInstanceToast('Instance supprimée.', false);
        else this.showInstanceToast(String(result?.message || 'La suppression a échoué.'), true);

        await this.refreshInstanceStates();
        this.renderInstanceList(name);
    }

    async selectInstance(name) {
        let instance = this.availableInstances().find(i => i.name === name);
        if (!instance) return;
        this.closeInstanceMenu();
        if (this.instanceSelect === name) return;
        this.instanceSelect = name;
        this.updateInstanceButton();
        await window.launcher.settings.set('instance_selct', name);
        await setStatus(instance);
    }

    async togglePin(name) {
        if (!this.availableInstances().some(i => i.name === name)) return;
        let previous = this.pinnedInstances;
        let pinned = previous.includes(name) ? previous.filter(item => item !== name) : [...previous, name];
        this.pinnedInstances = pinned;
        this.renderInstanceList(name);
        let saved = await window.launcher.settings.set('pinned_instances', pinned).catch(() => false);
        if (!saved && this.pinnedInstances === pinned) {
            this.pinnedInstances = previous;
            this.renderInstanceList(name);
        }
    }

    updateInstanceButton() {
        let selectButton = document.querySelector('.instance-select');
        let instance = (this.instancesList || []).find(i => i.name === this.instanceSelect);
        let single = !!this.singleInstance;
        let name = instance ? instance.name : 'Aucune instance';
        let description = instance ? this.instanceDescription(instance) : '';

        selectButton.classList.toggle('single-instance', single);
        selectButton.classList.toggle('no-instance', !instance);
        selectButton.tabIndex = single ? -1 : 0;
        selectButton.setAttribute('aria-disabled', String(single));
        selectButton.querySelector('.instance-select-name').textContent = name;
        let stateInfo = instance ? this.instanceStates?.get(instance.name) : null;
        let meta = selectButton.querySelector('.instance-select-meta');
        this.fillInstanceMeta(meta, instance);
        meta.title = description;
        meta.hidden = !description;
        let stateSlot = selectButton.querySelector('.instance-select-state');
        stateSlot.replaceChildren();
        if (stateInfo) stateSlot.appendChild(this.createInstanceState(stateInfo.state, true));
        stateSlot.hidden = !stateInfo;

        let stateLabel = stateInfo ? this.instanceStateLabel(stateInfo.state, true) : '';
        let details = [stateLabel, description].filter(Boolean).join(', ');
        let label = instance ? `Instance : ${instance.name}${details ? ` (${details})` : ''}` : 'Choisir une instance';
        selectButton.title = single ? label : `${label}. Cliquer pour changer d'instance`;
        selectButton.setAttribute('aria-label', single ? label : `${label}. Changer d'instance`);
    }

    resetPlayButton() {
        document.querySelector('.play-btn').classList.remove('loading')
        document.querySelector('.btn-icon').style.display = 'block'
        document.querySelector('.btn-spinner').style.display = 'none'
        document.querySelector('.btn-text').textContent = 'Jouer'
        document.querySelector('.btn-progress-fill').style.width = '0%'
    }

    gameEvents() {
        let btnProgressFill = document.querySelector('.btn-progress-fill')
        let btnText = document.querySelector('.btn-text')

        window.launcher.game.on('extract', extract => {
            console.log(extract);
        });

        window.launcher.game.on('progress', (progress, size) => {
            let percent = ((progress / size) * 100).toFixed(0)
            btnText.textContent = `Téléchargement ${percent}%`
            btnProgressFill.style.width = `${percent}%`
        });

        window.launcher.game.on('check', (progress, size) => {
            let percent = ((progress / size) * 100).toFixed(0)
            btnText.textContent = `Vérification ${percent}%`
            btnProgressFill.style.width = `${percent}%`
        });

        window.launcher.game.on('estimated', (time) => {
            let hours = Math.floor(time / 3600);
            let minutes = Math.floor((time - hours * 3600) / 60);
            let seconds = Math.floor(time - hours * 3600 - minutes * 60);
            console.log(`${hours}h ${minutes}m ${seconds}s`);
        })

        window.launcher.game.on('speed', (speed) => {
            console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
        })

        window.launcher.game.on('patch', patch => {
            console.log(patch);
            btnText.textContent = `Patch en cours...`
        });

        window.launcher.game.on('data', (e) => {
            btnText.textContent = `Démarrage...`
            btnProgressFill.style.width = '100%'
            if (!this.gameLogger) {
                this.refreshInstanceStates();
                this.gameLogger = true;
                new logger('Minecraft', '#36b030');
            }
            console.log(e);
        })

        window.launcher.game.on('close', code => {
            this.refreshInstanceStates();
            this.resetPlayButton();
            this.gameLogger = false;
            new logger(pkg.name, '#7289da');
            console.log('Close');
        });

        window.launcher.game.on('error', err => {
            let popupError = new popup()

            popupError.openPopup({
                title: 'Erreur',
                content: escapeHTML(err),
                color: 'red',
                options: true
            })

            this.resetPlayButton();
            this.gameLogger = false;
            new logger(pkg.name, '#7289da');
            console.log(err);
        });
    }

    async startGame() {
        let playBtn = document.querySelector('.play-btn')
        let btnIcon = document.querySelector('.btn-icon')
        let btnSpinner = document.querySelector('.btn-spinner')
        let btnText = document.querySelector('.btn-text')

        if (playBtn.classList.contains('loading')) return;

        playBtn.classList.add('loading')
        btnIcon.style.display = 'none'
        btnSpinner.style.display = 'block'
        btnText.textContent = 'Connexion...'

        let result = await window.launcher.game.launch().catch(err => ({ error: 'exception', message: String(err?.message || err) }));

        if (result?.error) {
            this.resetPlayButton();
            if (result.error === 'already_running') return;
            new popup().openPopup({
                title: 'Erreur',
                content: escapeHTML(result.message),
                color: 'red',
                options: true
            })
            if (result.error === 'no_account') return changePanel('login');
        }
    }
}
export default Home;
