
(function (root) {
    'use strict';

    function escapeHTML(value) {
        if (value === undefined || value === null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isSafeExternalUrl(url) {
        try {
            const parsed = new URL(String(url));
            return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch (e) {
            return false;
        }
    }

    function isSafePathSegment(name) {
        if (typeof name !== 'string' || !name.length || name.length > 64) return false;
        if (name === '.' || name === '..' || name.includes('..')) return false;
        return /^[\p{L}\p{N}_\-. ]+$/u.test(name);
    }

    function decodeEntities(str) {
        if (str === undefined || str === null) return '';
        if (typeof DOMParser === 'undefined') return String(str);
        return new DOMParser().parseFromString(String(str), 'text/html').documentElement.textContent;
    }

    const BLOCKED_TAGS = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button',
        'textarea', 'select', 'meta', 'link', 'base', 'style', 'svg', 'math', 'template', 'noscript', 'portal', 'webview'];
    const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset', 'poster', 'background'];

    function sanitizeHTML(html) {
        if (html === undefined || html === null) return '';
        if (typeof DOMParser === 'undefined') return escapeHTML(html);
        const doc = new DOMParser().parseFromString(`<body>${String(html)}</body>`, 'text/html');

        doc.body.querySelectorAll(BLOCKED_TAGS.join(',')).forEach(el => el.remove());
        doc.body.querySelectorAll('*').forEach(el => {
            for (const attr of [...el.attributes]) {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim();
                if (name.startsWith('on') || name === 'style') {
                    el.removeAttribute(attr.name);
                } else if (URL_ATTRIBUTES.includes(name)) {
                    if (name === 'src' && /^data:image\//i.test(value)) continue;
                    if (!isSafeExternalUrl(value)) el.removeAttribute(attr.name);
                }
            }
        });
        return doc.body.innerHTML;
    }

    const SECRET_KEYS = ['access_token', 'refresh_token', 'client_token', 'device_code', 'id_token', 'identityToken',
        'Token', 'RpsTicket', 'password', 'A2F'];
    const SECRET_KEYS_REGEX = new RegExp(`(["']?(?:${SECRET_KEYS.join('|')})["']?\\s*[:=]\\s*["']?)[^"'&,\\s}]+`, 'g');

    function scrubString(str) {
        if (typeof str !== 'string') return str;
        return str
            .replace(SECRET_KEYS_REGEX, '$1[Filtered]')
            .replace(/(Bearer\s+)[\w\-.~+/=]+/gi, '$1[Filtered]')
            .replace(/(XBL3\.0 x=)[^\s"']+/g, '$1[Filtered]')
            .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[Filtered JWT]')
            .replace(/M\.[A-Z0-9_]+\.[\w!*\-$.]{40,}/g, '[Filtered]')
            .replace(/([A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+)[^\\/"'<>:|?*\r\n]+?(?=[\\/"'<>:|?*\r\n]|$)/gi, '$1[user]')
            .replace(/((?:^|[\s"'(=:])\/(?:home|Users)\/)[^/\s"']+/g, '$1[user]');
    }

    function redactSecrets(value, depth = 0) {
        if (depth > 8) return '[Depth]';
        if (typeof value === 'string') return scrubString(value);
        if (Array.isArray(value)) return value.map(v => redactSecrets(v, depth + 1));
        if (value && typeof value === 'object') {
            const out = {};
            for (const [key, val] of Object.entries(value)) {
                if (SECRET_KEYS.includes(key) || /token|password|secret/i.test(key)) out[key] = '[Filtered]';
                else out[key] = redactSecrets(val, depth + 1);
            }
            return out;
        }
        return value;
    }

    function sentryBeforeSend(event) {
        try {
            if (event.message) event.message = scrubString(event.message);
            if (event.logentry?.message) event.logentry.message = scrubString(event.logentry.message);
            if (event.exception?.values) {
                for (const ex of event.exception.values) if (ex.value) ex.value = scrubString(ex.value);
            }
            if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(sentryBeforeBreadcrumb);
            if (event.extra) event.extra = redactSecrets(event.extra);
            if (event.contexts) event.contexts = redactSecrets(event.contexts);
            if (event.user) delete event.user.ip_address;
            if (event.server_name) delete event.server_name;
        } catch (e) { }
        return event;
    }

    function sentryBeforeBreadcrumb(breadcrumb) {
        try {
            if (breadcrumb?.message) breadcrumb.message = scrubString(breadcrumb.message);
            if (breadcrumb?.data) breadcrumb.data = redactSecrets(breadcrumb.data);
        } catch (e) { }
        return breadcrumb;
    }

    const api = {
        escapeHTML,
        sanitizeHTML,
        decodeEntities,
        isSafeExternalUrl,
        isSafePathSegment,
        scrubString,
        redactSecrets,
        sentryBeforeSend,
        sentryBeforeBreadcrumb
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.security = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
