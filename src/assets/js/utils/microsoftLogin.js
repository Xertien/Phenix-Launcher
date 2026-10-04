import popup from './popup.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COPY_FEEDBACK_MS = 1500;
const SUCCESS_HOLD_MS = 1100;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const ERRORS = {
    expired: ['Code expiré', 'Le code a expiré. Générez-en un nouveau pour continuer.'],
    declined: ['Connexion refusée', 'La connexion a été refusée dans le navigateur.'],
    timeout: ['Délai dépassé', 'La connexion a pris trop de temps. Réessayez.'],
    network_error: ['Erreur réseau', 'Impossible de joindre les serveurs Microsoft. Vérifiez votre connexion.'],
    session_not_found: ['Session expirée', 'La session de connexion n\'existe plus. Générez un nouveau code.'],
    NO_MINECRAFT_ACCOUNT: ['Minecraft introuvable', 'Ce compte Microsoft ne possède pas Minecraft.'],
    NO_MINECRAFT_ENTITLEMENTS: ['Minecraft introuvable', 'Ce compte ne possède pas Minecraft Java Edition.']
};

function svg(tag, attributes = {}, children = []) {
    let node = document.createElementNS(SVG_NS, tag);
    for (let [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    node.append(...children);
    return node;
}

function element(tag, className, text) {
    let node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(className, viewBox, children, stroke = true) {
    let attributes = { class: className, viewBox, 'aria-hidden': 'true', focusable: 'false' };
    if (stroke) Object.assign(attributes, { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    else attributes.fill = 'currentColor';
    return svg('svg', attributes, children);
}

function restart(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
}

function buildView() {
    let root = element('div', 'device-code');
    root.dataset.state = 'loading';

    let intro = element('p', 'device-code-intro', 'Ouvrez votre navigateur et entrez ce code :');

    let box = element('div', 'device-code-box');
    let value = element('span', 'device-code-value');
    let copy = element('button', 'device-code-copy');
    copy.type = 'button';
    copy.append(
        icon('dc-copy-icon', '0 0 24 24', [
            svg('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
            svg('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
        ]),
        icon('dc-copy-check', '0 0 24 24', [svg('path', { d: 'M5 12.5l4.5 4.5L19 7.5', pathLength: 1 })])
    );
    box.append(value, copy);

    let actions = element('div', 'device-code-actions');
    let open = element('button', 'popup-button', 'Ouvrir le navigateur');
    open.type = 'button';
    let retry = element('button', 'popup-button', 'Réessayer');
    retry.type = 'button';
    retry.hidden = true;
    actions.append(open, retry);

    let status = element('div', 'dc-status');
    let indicator = element('div', 'dc-indicator');
    indicator.append(
        svg('svg', { class: 'dc-ring', viewBox: '0 0 40 40', 'aria-hidden': 'true', focusable: 'false' }, [
            svg('circle', { class: 'dc-ring-track', cx: 20, cy: 20, r: 17 }),
            svg('circle', { class: 'dc-ring-arc', cx: 20, cy: 20, r: 17, pathLength: 100 })
        ]),
        icon('dc-icon dc-icon-ms', '0 0 23 23', [
            svg('path', { d: 'M0 0h11v11H0z' }),
            svg('path', { d: 'M12 0h11v11H12z' }),
            svg('path', { d: 'M0 12h11v11H0z' }),
            svg('path', { d: 'M12 12h11v11H12z' })
        ], false),
        icon('dc-icon dc-icon-check', '0 0 24 24', [svg('path', { d: 'M5.5 12.5l4 4L18.5 8', pathLength: 1 })]),
        icon('dc-icon dc-icon-error', '0 0 24 24', [svg('path', { d: 'M12 6.5v7' }), svg('path', { d: 'M12 17.5h.01' })])
    );
    let texts = element('div', 'dc-status-texts');
    let title = element('p', 'dc-status-title');
    let detail = element('p', 'dc-status-detail');
    texts.append(title, detail);
    status.append(indicator, texts);

    let live = element('span', 'dc-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    root.append(intro, box, actions, status, live);

    let announceTimer = null;
    const announce = message => {
        clearTimeout(announceTimer);
        live.textContent = '';
        announceTimer = setTimeout(() => { live.textContent = message; }, 60);
    };

    const setCopyLabel = label => {
        copy.title = label;
        copy.setAttribute('aria-label', label);
    };
    setCopyLabel('Copier le code');

    return {
        root, copy, open, retry, announce, setCopyLabel,
        showPlaceholder() {
            value.textContent = 'XXXX-XXXX';
            value.classList.add('is-placeholder');
            value.setAttribute('aria-hidden', 'true');
        },
        showCode(code) {
            value.textContent = code;
            value.classList.remove('is-placeholder');
            value.removeAttribute('aria-hidden');
            restart(value, 'is-revealed');
        },
        setState(state, heading, message) {
            let changed = root.dataset.state !== state || title.textContent !== heading;
            root.dataset.state = state;
            title.textContent = heading;
            detail.textContent = message;
            let waiting = state === 'waiting';
            copy.disabled = !waiting;
            open.disabled = !waiting;
            open.hidden = state === 'error';
            retry.hidden = state !== 'error';
            if (changed) restart(texts, 'is-changing');
            if (state === 'success') restart(indicator, 'is-popping');
            announce(`${heading}. ${message}`);
        }
    };
}

export default function microsoftLogin() {
    return new Promise(resolve => {
        let modal = new popup();
        let view = buildView();
        let sessionId = null;
        let attempt = 0;
        let finished = false;
        let copyTimer = null;

        const finish = account => {
            if (finished) return;
            finished = true;
            clearTimeout(copyTimer);
            resolve(account);
        };

        const cancelSession = () => {
            if (sessionId) window.launcher.auth.microsoft.cancel(sessionId);
            sessionId = null;
        };

        const fail = result => {
            let code = result?.error || 'unknown';
            console.error(`[Microsoft] Device code error: ${code}`);
            let [heading, message] = ERRORS[code] || ['Échec de la connexion', `${code}: ${result?.errorMessage || 'Erreur inconnue'}`];
            view.setState('error', heading, message);
            modal.popupButton.textContent = 'Fermer';
            view.retry.focus({ preventScroll: true });
        };

        const run = async () => {
            let token = ++attempt;
            cancelSession();
            view.showPlaceholder();
            view.setState('loading', 'Obtention du code…', 'Préparation de la connexion sécurisée.');
            modal.popupButton.textContent = 'Annuler';

            let result = await window.launcher.auth.microsoft.start().catch(error => ({ error: 'exception', errorMessage: String(error?.message || error) }));
            if (token !== attempt || finished) {
                if (result?.sessionId) window.launcher.auth.microsoft.cancel(result.sessionId);
                return;
            }
            if (!result || result.error) return fail(result);

            sessionId = result.sessionId;
            view.showCode(String(result.user_code ?? ''));
            view.setState('waiting', 'En attente de connexion…', 'Entrez le code sur la page Microsoft puis validez.');

            let account = await window.launcher.auth.microsoft.poll(sessionId).catch(error => ({ error: 'exception', errorMessage: String(error?.message || error) }));
            if (token !== attempt || finished) return;
            sessionId = null;
            console.log(`[Microsoft] Device code poll result: ${account?.error ? account.error : account?.name}`);

            if (!account || account.error) {
                if (account?.error === 'cancelled') {
                    modal.closePopup();
                    return finish(null);
                }
                return fail(account);
            }

            view.setState('success', 'Connexion réussie', `Bienvenue, ${account.name}`);
            modal.popupButton.disabled = true;
            setTimeout(() => {
                if (finished) return;
                modal.closePopup();
                finish(account);
            }, reduceMotion.matches ? 500 : SUCCESS_HOLD_MS);
        };

        view.copy.addEventListener('click', async () => {
            if (!sessionId) return;
            let copied = await window.launcher.auth.microsoft.copyCode(sessionId).catch(() => false);
            if (!copied) return view.announce('Impossible de copier le code');
            restart(view.copy, 'copied');
            view.setCopyLabel('Code copié');
            view.announce('Code copié dans le presse-papiers');
            clearTimeout(copyTimer);
            copyTimer = setTimeout(() => {
                view.copy.classList.remove('copied');
                view.setCopyLabel('Copier le code');
            }, COPY_FEEDBACK_MS);
        });

        view.open.addEventListener('click', () => {
            if (sessionId) window.launcher.auth.microsoft.openBrowser(sessionId);
        });

        view.retry.addEventListener('click', () => run());

        modal.openPopup({
            title: 'Connexion Microsoft',
            content: view.root,
            color: 'var(--color)',
            options: true,
            buttonLabel: 'Annuler',
            buttonSecondary: true,
            onButton: () => {
                attempt++;
                cancelSession();
                finish(null);
            }
        });

        run();
    });
}
