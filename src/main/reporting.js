const Sentry = require('@sentry/electron/main');
const { scrubString, redactSecrets } = require('../assets/js/utils/security.js');

const MAX_KEYS = 200;
const seen = new Set();

function describe(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            code: error.code ?? error.errcode ?? null,
            message: scrubString(String(error.message || error.name))
        };
    }
    if (error && typeof error === 'object') {
        let inner = error.error && typeof error.error === 'object' ? error.error : error;
        return {
            name: 'Error',
            code: inner.code ?? null,
            message: scrubString(String(inner.message || inner.errorMessage || inner.error || 'unknown'))
        };
    }
    return { name: 'Error', code: null, message: scrubString(String(error ?? 'unknown')) };
}

function toError(error, info) {
    if (error instanceof Error) {
        let copy = new Error(info.message);
        copy.name = info.name;
        copy.stack = typeof error.stack === 'string' ? scrubString(error.stack) : undefined;
        return copy;
    }
    let created = new Error(info.message);
    created.name = info.name;
    return created;
}

function firstTime(key) {
    if (seen.has(key)) return false;
    if (seen.size >= MAX_KEYS) return false;
    seen.add(key);
    return true;
}

function send(area, operation, level, payload, options) {
    try {
        Sentry.withScope(scope => {
            scope.setLevel(level);
            scope.setTag('area', area);
            scope.setTag('operation', operation);
            for (let [key, value] of Object.entries(options.tags || {})) {
                if (value !== undefined && value !== null) scope.setTag(key, scrubString(String(value)).slice(0, 200));
            }
            if (options.extra) scope.setContext('details', redactSecrets(options.extra));
            scope.setFingerprint(['launcher', area, operation, ...(options.fingerprint || []).map(part => String(part))]);
            if (payload instanceof Error) Sentry.captureException(payload);
            else Sentry.captureMessage(payload, level);
        });
    } catch (e) { }
}

function reportError(area, operation, error, options = {}) {
    let info = describe(error);
    let level = options.level || 'error';
    if (options.once) {
        let key = `${area}|${operation}|${options.once === true ? '' : options.once}`;
        if (!firstTime(key)) return false;
    }
    console.info(`[${area}] ${operation}: ${info.message}`);
    let tags = { ...options.tags };
    if (info.code !== null && tags.code === undefined) tags.code = info.code;
    send(area, operation, level, toError(error, info), { ...options, tags });
    return true;
}

function reportMessage(area, operation, message, options = {}) {
    let level = options.level || 'warning';
    if (options.once) {
        let key = `${area}|${operation}|${options.once === true ? '' : options.once}`;
        if (!firstTime(key)) return false;
    }
    let text = scrubString(String(message));
    console.info(`[${area}] ${operation}: ${text}`);
    send(area, operation, level, `[${area}] ${text}`, options);
    return true;
}

module.exports = {
    reportError,
    reportMessage,
    describe
};
