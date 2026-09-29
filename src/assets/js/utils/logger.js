/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

let console_log = console.log;
let console_info = console.info;
let console_warn = console.warn;
let console_debug = console.debug;
let console_error = console.error;

function format(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }
    return String(value);
}

function report(level, name, value) {
    try {
        window.launcher.log.report(level, String(name).slice(0, 64), format(value).slice(0, 8000)).catch(() => { });
    } catch (e) { }
}

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
            report('warning', name, value);
        };

        console.debug = value => {
            console_debug.call(console, `%c[${name}]:`, `color: ${color};`, value);
        };

        console.error = value => {
            console_error.call(console, `%c[${name}]:`, `color: ${color};`, value);
            report('error', name, value);
        };
    }
}

export default logger;
