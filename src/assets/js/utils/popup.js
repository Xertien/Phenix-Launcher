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

    closePopup() {
        this.popup.style.display = 'none';
        this.popupTitle.textContent = '';
        this.popupContent.innerHTML = '';
        this.popupOptions.style.display = 'none';
    }
}