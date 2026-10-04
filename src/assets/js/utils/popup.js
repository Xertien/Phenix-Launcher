/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const CLOSE_DURATION = 300;
let closing = null;

function settleClosing(hide) {
    if (!closing) return;
    let { timer, element, callbacks } = closing;
    closing = null;
    clearTimeout(timer);
    if (hide) element.style.display = 'none';
    for (let callback of callbacks) callback();
}

export default class popup {
    constructor() {
        this.popup = document.querySelector('.popup');
        this.popupTitle = document.querySelector('.popup-title');
        this.popupContent = document.querySelector('.popup-content');
        this.popupOptions = document.querySelector('.popup-options');
        this.popupButton = this.popupOptions.querySelector('.popup-button');
    }

    show() {
        let opening = !this.popup.classList.contains('popup-open') && !closing;
        settleClosing(false);
        this.popup.style.display = 'flex';
        if (opening) void this.popup.offsetWidth;
        this.popup.classList.add('popup-open');
    }

    reset() {
        this.popupTitle.textContent = '';
        this.popupContent.replaceChildren();
        this.popupOptions.style.display = 'none';
        this.popupButton.disabled = false;
    }

    openPopup(info) {
        this.show();
        this.popup.classList.toggle('popup-no-overlay', info.background == false);
        this.popupTitle.textContent = info.title ?? '';
        const isError = !info.color || info.color == 'red';
        this.popupContent.classList.toggle('popup-content-error', isError);
        this.popupContent.style.color = isError ? '' : info.color;
        if (info.content instanceof Node) this.popupContent.replaceChildren(info.content);
        else this.popupContent.innerHTML = info.content ?? '';

        if (info.options) this.popupOptions.style.display = 'flex';

        this.popupButton.textContent = info.buttonLabel || 'OK';
        this.popupButton.disabled = false;
        this.popupButton.classList.toggle('popup-button-secondary', !!info.buttonSecondary);

        if (this.popupOptions.style.display !== 'none') {
            this.popupButton.onclick = () => {
                if (info.exit) return window.launcher.window.close();
                if (typeof info.onButton === 'function') info.onButton();
                this.closePopup();
            };
        }
    }

    confirm(info) {
        return new Promise(resolve => {
            let cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.classList.add('popup-button', 'popup-button-secondary');
            cancelButton.textContent = info.cancelLabel || 'Annuler';

            let confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.classList.add('popup-button');
            confirmButton.classList.toggle('popup-button-danger', !!info.danger);
            confirmButton.textContent = info.confirmLabel || 'Confirmer';

            let previousFocus = document.activeElement;
            this.show();
            this.popup.classList.remove('popup-no-overlay');
            this.popupTitle.textContent = info.title ?? '';
            this.popupContent.classList.remove('popup-content-error');
            this.popupContent.style.color = '';
            this.popupContent.replaceChildren();
            for (let line of [].concat(info.text ?? [])) {
                let paragraph = document.createElement('p');
                paragraph.classList.add('popup-confirm-text');
                paragraph.textContent = line;
                this.popupContent.appendChild(paragraph);
            }
            this.popupButton.hidden = true;
            this.popupOptions.classList.add('popup-options-confirm');
            this.popupOptions.append(cancelButton, confirmButton);
            this.popupOptions.style.display = 'flex';

            const finish = value => {
                document.removeEventListener('keydown', onKey, true);
                cancelButton.disabled = true;
                confirmButton.disabled = true;
                this.closePopup(() => {
                    cancelButton.remove();
                    confirmButton.remove();
                    this.popupButton.hidden = false;
                    this.popupOptions.classList.remove('popup-options-confirm');
                });
                if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
                resolve(value);
            };

            const onKey = e => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(false);
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    e.stopPropagation();
                    (document.activeElement === cancelButton ? confirmButton : cancelButton).focus();
                }
            };

            cancelButton.addEventListener('click', () => finish(false), { once: true });
            confirmButton.addEventListener('click', () => finish(true), { once: true });
            document.addEventListener('keydown', onKey, true);
            cancelButton.focus();
        });
    }

    closePopup(onClosed) {
        if (closing) {
            if (typeof onClosed === 'function') closing.callbacks.push(onClosed);
            return;
        }
        let callbacks = [() => this.reset()];
        if (typeof onClosed === 'function') callbacks.push(onClosed);
        let animate = this.popup.classList.contains('popup-open') && !reduceMotion.matches;
        this.popup.classList.remove('popup-open');
        closing = { element: this.popup, callbacks, timer: null };
        if (!animate) return settleClosing(true);
        closing.timer = setTimeout(() => settleClosing(true), CLOSE_DURATION);
    }
}
