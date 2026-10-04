/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0/
 */

'use strict';

const THUMB = 20;

function formatGo(value) {
    return `${Number(value)} Go`;
}

export default class Slider {
    constructor(id, minValue, maxValue) {
        this.slider = document.querySelector(id);
        this.touchLeft = this.slider.querySelector('.slider-touch-left');
        this.touchRight = this.slider.querySelector('.slider-touch-right');
        this.lineSpan = this.slider.querySelector('.slider-line span');
        this.recoBand = this.slider.querySelector('.slider-reco');
        this.recoMin = this.slider.querySelector('.slider-reco-min');
        this.recoMax = this.slider.querySelector('.slider-reco-max');

        this.step = parseFloat(this.slider.getAttribute('step')) || 0.5;
        this.min = parseFloat(this.slider.getAttribute('min')) || this.step;
        this.max = Math.max(parseFloat(this.slider.getAttribute('max')) || this.min + this.step, this.min + this.step);
        this.handlers = {};
        this.recommended = null;
        this.minValue = this.min;
        this.maxValue = this.max;

        this.setValues(minValue ?? this.min, maxValue ?? this.max);

        for (let thumb of [this.touchLeft, this.touchRight]) {
            thumb.addEventListener('pointerdown', event => this.onPointerDown(thumb, event));
            thumb.addEventListener('keydown', event => this.onKey(thumb, event));
        }
        this.slider.addEventListener('pointerdown', event => this.onTrackDown(event));
    }

    on(name, func) {
        this.handlers[name] = func;
    }

    emit(name, ...args) {
        if (typeof this.handlers[name] === 'function') this.handlers[name](...args);
    }

    snap(value) {
        return Math.round(Number(value) / this.step) * this.step;
    }

    clamp(value, lower, upper) {
        return Math.min(Math.max(value, lower), upper);
    }

    setRange(min, max) {
        this.min = Math.max(this.step, this.snap(min));
        this.max = Math.max(this.snap(max), this.min + this.step);
        this.slider.setAttribute('min', String(this.min));
        this.slider.setAttribute('max', String(this.max));
        this.setValues(this.minValue, this.maxValue);
    }

    setValues(min, max) {
        let high = this.clamp(this.snap(max), this.min + this.step, this.max);
        let low = this.clamp(this.snap(min), this.min, high - this.step);
        this.minValue = low;
        this.maxValue = high;
        this.render();
    }

    setRecommended(range) {
        this.recommended = range && Number.isFinite(range.min) && Number.isFinite(range.max) ? { min: range.min, max: range.max } : null;
        this.render();
    }

    recommendedIssues() {
        let reco = this.recommended;
        if (!reco) return { min: false, max: false };
        return {
            min: this.minValue < Math.min(reco.min, this.max - this.step),
            max: this.maxValue < Math.min(reco.max, this.max)
        };
    }

    isBelowRecommended() {
        let issues = this.recommendedIssues();
        return issues.min || issues.max;
    }

    ratio(value) {
        return this.clamp((value - this.min) / (this.max - this.min), 0, 1);
    }

    position(value, offset = 0) {
        let ratio = this.ratio(value);
        return `calc(${(ratio * 100).toFixed(4)}% - ${(ratio * THUMB - offset).toFixed(3)}px)`;
    }

    render() {
        let left = this.ratio(this.minValue);
        let right = this.ratio(this.maxValue);
        this.touchLeft.style.left = this.position(this.minValue);
        this.touchRight.style.left = this.position(this.maxValue);
        this.lineSpan.style.marginLeft = this.position(this.minValue, THUMB / 2);
        this.lineSpan.style.width = `calc(${((right - left) * 100).toFixed(4)}% - ${((right - left) * THUMB).toFixed(3)}px)`;
        this.touchLeft.setAttribute('value', formatGo(this.minValue));
        this.touchRight.setAttribute('value', formatGo(this.maxValue));

        let reco = this.recommended;
        if (this.recoBand) this.recoBand.hidden = !reco;
        if (this.recoMin) this.recoMin.hidden = !reco;
        if (this.recoMax) this.recoMax.hidden = !reco;
        if (reco) {
            let start = this.clamp(reco.min, this.min, this.max);
            let end = this.clamp(reco.max, this.min, this.max);
            if (this.recoBand) {
                this.recoBand.style.left = this.position(start, THUMB / 2);
                this.recoBand.style.width = `calc(${((this.ratio(end) - this.ratio(start)) * 100).toFixed(4)}% - ${((this.ratio(end) - this.ratio(start)) * THUMB).toFixed(3)}px)`;
                this.recoBand.classList.toggle('slider-reco-overflow', reco.max > this.max);
            }
            let merged = this.ratio(end) - this.ratio(start) < 0.12;
            let maxLabel = reco.max > this.max ? `${formatGo(reco.max)} ›` : formatGo(reco.max);
            if (this.recoMin) {
                this.recoMin.style.left = this.position(start, THUMB / 2);
                this.recoMin.dataset.label = formatGo(reco.min);
                this.recoMin.title = `Minimum recommandé : ${formatGo(reco.min)}`;
                this.recoMin.classList.toggle('slider-reco-same', merged);
                this.recoMin.classList.toggle('slider-reco-start', this.ratio(start) < 0.08);
            }
            if (this.recoMax) {
                this.recoMax.style.left = this.position(end, THUMB / 2);
                this.recoMax.dataset.label = merged && reco.max !== reco.min ? `${reco.min}–${maxLabel}` : maxLabel;
                this.recoMax.title = `Maximum recommandé : ${formatGo(reco.max)}`;
                this.recoMax.classList.toggle('slider-reco-end', this.ratio(end) > 0.92);
            }
        }

        this.slider.classList.toggle('slider-warning', this.isBelowRecommended());
        this.updateAria();
    }

    updateAria() {
        let reco = this.recommended;
        let suffix = reco ? `, recommandé de ${formatGo(reco.min)} à ${formatGo(reco.max)}` : '';
        let below = (value, limit) => reco && value < limit ? ', en dessous de la mémoire recommandée' : '';
        this.touchLeft.setAttribute('aria-valuemin', String(this.min));
        this.touchLeft.setAttribute('aria-valuemax', String(this.maxValue - this.step));
        this.touchLeft.setAttribute('aria-valuenow', String(this.minValue));
        this.touchLeft.setAttribute('aria-valuetext', `${formatGo(this.minValue)}${below(this.minValue, reco?.min)}${suffix}`);
        this.touchRight.setAttribute('aria-valuemin', String(this.minValue + this.step));
        this.touchRight.setAttribute('aria-valuemax', String(this.max));
        this.touchRight.setAttribute('aria-valuenow', String(this.maxValue));
        this.touchRight.setAttribute('aria-valuetext', `${formatGo(this.maxValue)}${below(this.maxValue, reco ? Math.min(reco.max, this.max) : 0)}${suffix}`);
    }

    moveThumb(thumb, value) {
        let isLeft = thumb === this.touchLeft;
        let next = isLeft
            ? this.clamp(this.snap(value), this.min, this.maxValue - this.step)
            : this.clamp(this.snap(value), this.minValue + this.step, this.max);
        let current = isLeft ? this.minValue : this.maxValue;
        if (next === current) return false;
        if (isLeft) this.minValue = next;
        else this.maxValue = next;
        this.render();
        this.emit('input', this.minValue, this.maxValue);
        return true;
    }

    onKey(thumb, event) {
        let direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -2, PageUp: 2 }[event.key];
        let isLeft = thumb === this.touchLeft;
        let current = isLeft ? this.minValue : this.maxValue;
        let value;
        if (direction) value = current + direction * this.step;
        else if (event.key === 'Home') value = isLeft ? this.min : this.minValue + this.step;
        else if (event.key === 'End') value = isLeft ? this.maxValue - this.step : this.max;
        else return;
        event.preventDefault();
        if (this.moveThumb(thumb, value)) this.emit('change', this.minValue, this.maxValue);
    }

    valueAt(clientX, grab = 0) {
        let rect = this.slider.getBoundingClientRect();
        let usable = Math.max(1, rect.width - THUMB);
        let ratio = this.clamp((clientX - grab - rect.left - THUMB / 2) / usable, 0, 1);
        return this.min + ratio * (this.max - this.min);
    }

    startDrag(thumb, event, grab) {
        let changed = false;
        thumb.focus({ preventScroll: true });
        try {
            thumb.setPointerCapture(event.pointerId);
        } catch (e) { }
        thumb.classList.add('slider-dragging');
        const move = moveEvent => {
            if (this.moveThumb(thumb, this.valueAt(moveEvent.clientX, grab))) changed = true;
        };
        const stop = () => {
            thumb.removeEventListener('pointermove', move);
            thumb.removeEventListener('pointerup', stop);
            thumb.removeEventListener('pointercancel', stop);
            thumb.classList.remove('slider-dragging');
            if (changed) this.emit('change', this.minValue, this.maxValue);
        };
        thumb.addEventListener('pointermove', move);
        thumb.addEventListener('pointerup', stop);
        thumb.addEventListener('pointercancel', stop);
        return () => { changed = true; };
    }

    onPointerDown(thumb, event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        let rect = thumb.getBoundingClientRect();
        this.startDrag(thumb, event, event.clientX - (rect.left + rect.width / 2));
    }

    onTrackDown(event) {
        if (event.button !== 0 || event.target === this.touchLeft || event.target === this.touchRight) return;
        event.preventDefault();
        let value = this.valueAt(event.clientX);
        let thumb = Math.abs(value - this.minValue) < Math.abs(value - this.maxValue) || value < this.minValue ? this.touchLeft : this.touchRight;
        let moved = this.moveThumb(thumb, value);
        let markChanged = this.startDrag(thumb, event, 0);
        if (moved) markChanged();
    }
}
