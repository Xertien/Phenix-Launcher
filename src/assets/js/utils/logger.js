/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const Sentry = require('@sentry/electron/renderer');

let console_log = console.log;
let console_info = console.info;
let console_warn = console.warn;
let console_debug = console.debug;
let console_error = console.error;

class logger {
    constructor(name, color) {
        this.Logger(name, color)
    }

    async Logger(name, color) {
        console.log = value => {
            console_log.call(console, `%c[${name}]:`, `color: ${color};`, value);
        };

        console.info = value => {
            console_info.call(console, `%c[${name}]:`, `color: ${color};`, value);
        };

        console.warn = value => {
            console_warn.call(console, `%c[${name}]:`, `color: ${color};`, value);
            Sentry.captureMessage(`[${name}] ${typeof value === 'object' ? JSON.stringify(value) : value}`, 'warning');
        };

        console.debug = value => {
            console_debug.call(console, `%c[${name}]:`, `color: ${color};`, value);
        };

        console.error = value => {
            console_error.call(console, `%c[${name}]:`, `color: ${color};`, value);
            if (value instanceof Error) {
                Sentry.captureException(value);
            } else {
                Sentry.captureMessage(`[${name}] ${typeof value === 'object' ? JSON.stringify(value) : value}`, 'error');
            }
        };
    }
}

export default logger;