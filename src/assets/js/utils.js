/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import config from './utils/config.js';
import logger from './utils/logger.js';
import popup from './utils/popup.js';
import { skin2D } from './utils/skin.js';
import slider from './utils/slider.js';

const { escapeHTML, sanitizeHTML, decodeEntities, isSafeExternalUrl, isSafePathSegment } = window.security;
const pkg = await window.launcher.app.info().catch(() => ({ name: 'Launcher' }));

let currentDark = null;
let themeWatcher = null;

async function getThemeSetting() {
    let configClient = await window.launcher.settings.get().catch(() => null);
    return configClient?.launcher_config?.theme || 'dark';
}

async function setBackground(theme) {
    if (typeof theme == 'undefined') {
        theme = await window.launcher.theme.isDark(await getThemeSetting()).catch(() => true);
    }
    let isDark = !!theme;
    currentDark = isDark;
    let background
    let body = document.body;
    body.className = isDark ? 'dark global' : 'light global';
    let image = await window.launcher.theme.background(isDark).catch(() => null);
    if (currentDark !== isDark) return;
    let overlay = isDark ? '#00000080' : '#E9E6F285';
    if (image?.easterEgg) {
        background = `url("${image.path}")`;
    } else if (image?.path) {
        background = `linear-gradient(${overlay}, ${overlay}), url("${image.path}")`;
    }
    body.style.backgroundImage = background ? background : 'none';
    body.style.backgroundSize = 'cover';
}

let themeSwitchTimer = null;

async function applyTheme(theme) {
    let isDark = await window.launcher.theme.isDark(theme).catch(() => true);
    if (isDark === currentDark) return;
    let root = document.documentElement;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        root.classList.add('theme-switching');
        clearTimeout(themeSwitchTimer);
        themeSwitchTimer = setTimeout(() => root.classList.remove('theme-switching'), 450);
    }
    await setBackground(isDark);
}

function watchTheme() {
    if (themeWatcher) return;
    themeWatcher = window.launcher.theme.onUpdated(async () => {
        let theme = await getThemeSetting();
        if (theme === 'auto') await applyTheme('auto');
    });
}

async function changePanel(id) {
    let panel = document.querySelector(`.${id}`);
    let active = document.querySelector(`.active`)
    if (active) active.classList.toggle("active");
    panel.classList.add("active");
}

async function addAccount(data) {
    let skin = false
    if (data?.skin) skin = await new skin2D().creatHeadTexture(data.skin);
    let div = document.createElement("div");
    div.classList.add("account");
    div.id = data.ID;
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    div.innerHTML = `
        <div class="profile-image" ${skin ? 'style="background-image: url(' + skin + ');"' : ''}></div>
        <div class="profile-infos">
            <div class="profile-pseudo">${escapeHTML(data.name)}</div>
            <div class="profile-uuid">${escapeHTML(data.uuid)}</div>
        </div>
        <span class="account-badge">Sélectionné</span>
        <button type="button" class="delete-profile" id="${escapeHTML(data.ID)}" title="Supprimer le compte" aria-label="Supprimer le compte ${escapeHTML(data.name)}">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" aria-hidden="true"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
        </button>
    `
    return document.querySelector('.accounts-list').appendChild(div);
}

async function accountSelect(data) {
    let account = document.getElementById(`${data?.ID}`);
    let activeAccount = document.querySelector('.account-select')

    if (activeAccount) activeAccount.classList.toggle('account-select');
    if (account) account.classList.add('account-select');
    if (data?.skin) headplayer(data.skin);
}

async function headplayer(skinBase64) {
    let skin = await new skin2D().creatHeadTexture(skinBase64);
    if (skin) document.querySelector(".player-head").style.backgroundImage = `url(${skin})`;
}

const STATUS_REFRESH_MS = 2000;
let statusInstance = null;
let statusTimer = null;
let statusBusy = false;

async function refreshStatus() {
    if (statusBusy || !statusInstance?.status || document.hidden) return;
    statusBusy = true;
    try {
        await renderStatus(statusInstance);
    } finally {
        statusBusy = false;
    }
}

async function setStatus(instance) {
    statusInstance = instance;
    if (!statusTimer) {
        statusTimer = setInterval(refreshStatus, STATUS_REFRESH_MS);
        document.addEventListener('visibilitychange', refreshStatus);
    }
    await renderStatus(instance);
}

async function renderStatus(instance) {
    let nameServerElement = document.querySelector('.server-status-name')
    let statusServerElement = document.querySelector('.server-status-text')
    let playersOnline = document.querySelector('.status-player-count .player-count')

    if (!instance?.status) {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Hors ligne - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.innerHTML = '0'
        return
    }

    nameServerElement.textContent = decodeEntities(instance.status.nameServer)
    let statusServer = await window.launcher.server.status(instance.name).catch(() => ({ online: false }));
    if (instance !== statusInstance) return;

    if (statusServer?.online) {
        statusServerElement.classList.remove('red')
        document.querySelector('.status-player-count').classList.remove('red')
        renderLatency(statusServerElement, statusServer.ms)
        playersOnline.textContent = statusServer.playersConnect
    } else {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Hors ligne - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.innerHTML = '0'
    }
}

const LATENCY_ANIMATION_MS = 400;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let latencyFrame = null;

function renderLatency(element, ms) {
    let value = element.querySelector('.ms-value');
    if (!value) {
        value = document.createElement('span');
        value.classList.add('ms-value');
        value.textContent = '0';
        value.dataset.value = '0';
        let label = document.createElement('span');
        label.append('En ligne - ', value, ' ms');
        element.replaceChildren(label);
    }

    let from = Number(value.dataset.value) || 0;
    let to = Math.max(0, Math.round(Number(ms) || 0));
    if (from === to) return;
    value.dataset.value = String(to);

    cancelAnimationFrame(latencyFrame);
    value.classList.remove('ms-changed');
    void value.offsetWidth;
    value.classList.add('ms-changed');

    if (reducedMotion.matches) {
        value.textContent = String(to);
        return;
    }

    let start = performance.now();
    let step = now => {
        let progress = Math.min(1, Math.max(0, (now - start) / LATENCY_ANIMATION_MS));
        let eased = 1 - Math.pow(1 - progress, 3);
        value.textContent = String(Math.round(from + (to - from) * eased));
        if (progress < 1) latencyFrame = requestAnimationFrame(step);
    };
    latencyFrame = requestAnimationFrame(step);
}

export {
    changePanel as changePanel,
    config as config,
    logger as logger,
    popup as popup,
    setBackground as setBackground,
    applyTheme as applyTheme,
    watchTheme as watchTheme,
    skin2D as skin2D,
    addAccount as addAccount,
    accountSelect as accountSelect,
    slider as Slider,
    pkg as pkg,
    setStatus as setStatus,
    escapeHTML as escapeHTML,
    sanitizeHTML as sanitizeHTML,
    decodeEntities as decodeEntities,
    isSafeExternalUrl as isSafeExternalUrl,
    isSafePathSegment as isSafePathSegment
}
