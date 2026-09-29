/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

export default class popup {
    constructor() {
        this.popup = document.querySelector('.popup');
        this.popupTitle = document.querySelector('.popup-title');
        this.popupContent = document.querySelector('.popup-content');
        this.popupOptions = document.querySelector('.popup-options');
        this.popupButton = document.querySelector('.popup-button');
    }

    openPopup(info) {
        this.popup.style.display = 'flex';
        this.popup.classList.toggle('popup-no-overlay', info.background == false);
        this.popupTitle.textContent = info.title ?? '';
        const isError = !info.color || info.color == 'red';
        this.popupContent.classList.toggle('popup-content-error', isError);
        this.popupContent.style.color = isError ? '' : info.color;
        this.popupContent.innerHTML = info.content;

        if (info.options) this.popupOptions.style.display = 'flex';

        if (this.popupOptions.style.display !== 'none') {
            this.popupButton.addEventListener('click', () => {
                if (info.exit) return window.launcher.window.close();
                this.closePopup();
            })
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
            this.popup.style.display = 'flex';
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
                cancelButton.remove();
                confirmButton.remove();
                this.popupButton.hidden = false;
                this.popupOptions.classList.remove('popup-options-confirm');
                this.closePopup();
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

    closePopup() {
        this.popup.style.display = 'none';
        this.popupTitle.textContent = '';
        this.popupContent.innerHTML = '';
        this.popupOptions.style.display = 'none';
    }
}