const pkg = require('../../../package.json');
const nodeFetch = require('node-fetch');
const convert = require('xml-js');
const { isSafePathSegment, isSafeExternalUrl } = require('../../assets/js/utils/security.js');
const { reportError, reportMessage } = require('../reporting.js');

let url = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url;

let configUrl = `${url}/launcher/config-launcher/config.json`;
let newsUrl = `${url}/launcher/news-launcher/news.json`;
let instancesUrl = `${url}/files/`;

const OFFLINE_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'network'];

function isRamValue(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 64;
}

function sanitizeRam(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!isRamValue(value.min) || !isRamValue(value.max) || value.min > value.max) return null;
    let min = Math.max(0.5, Math.round(value.min * 2) / 2);
    let max = Math.max(min, Math.round(value.max * 2) / 2);
    return { min, max };
}

function reportFetch(operation, error) {
    let code = error?.error?.code || error?.code || 'unknown';
    let offline = OFFLINE_CODES.includes(code);
    reportError('remote', operation, error, { once: true, level: offline ? 'info' : 'warning', tags: { code, offline } });
}

class Remote {
    constructor() {
        this.lastConfig = null;
    }

    getConfig() {
        return this.fetchConfig().catch(error => {
            reportFetch('config', error);
            throw error;
        });
    }

    fetchConfig() {
        return new Promise((resolve, reject) => {
            nodeFetch(configUrl).then(async res => {
                if (res.status === 200) {
                    let json = await res.json();
                    this.lastConfig = json;
                    return resolve(json);
                }
                return reject({ error: { code: res.statusText, message: 'server not accessible' } });
            }).catch(error => {
                return reject({ error: { code: error?.code || 'network', message: error?.message || String(error) } });
            });
        });
    }

    async getCachedConfig() {
        if (this.lastConfig) return this.lastConfig;
        return await this.getConfig();
    }

    async getInstanceList() {
        let instances = await nodeFetch(instancesUrl).then(res => res.json()).catch(error => {
            reportFetch('instances', error);
            return {};
        });
        let instancesList = [];
        if (!instances || typeof instances !== 'object') return instancesList;

        for (let [name, data] of Object.entries(instances)) {
            if (!isSafePathSegment(name) || !data || typeof data !== 'object') {
                reportMessage('remote', 'invalid_instance', `Instance ignorée (nom invalide) : ${String(name).slice(0, 80)}`, { once: String(name).slice(0, 80) });
                continue;
            }
            let instance = data;
            instance.name = name;
            let ram = sanitizeRam(data.ram);
            if (data.ram !== undefined && !ram) {
                reportMessage('remote', 'invalid_ram', `Recommandation RAM ignorée : ${name.slice(0, 80)}`, { once: name.slice(0, 80), level: 'warning' });
            }
            if (ram) instance.ram = ram;
            else delete instance.ram;
            instancesList.push(instance);
        }
        return instancesList;
    }

    async getNews() {
        try {
            return await this.fetchNews();
        } catch (error) {
            reportFetch('news', error);
            throw error;
        }
    }

    async fetchNews() {
        let config = await this.fetchConfig() || {};

        if (config.rss) {
            if (!isSafeExternalUrl(config.rss)) throw { error: { code: 'invalid_rss', message: 'invalid rss url' } };
            let res = await nodeFetch(config.rss).catch(error => {
                throw { error: { code: error?.code || 'network', message: error?.message || String(error) } };
            });
            if (res.status !== 200) throw { error: { code: res.statusText, message: 'server not accessible' } };
            let news = [];
            let response = await res.text();
            response = (JSON.parse(convert.xml2json(response, { compact: true })))?.rss?.channel?.item;

            if (!Array.isArray(response)) response = [response];
            for (let item of response) {
                if (!item) continue;
                news.push({
                    title: item.title?._text,
                    content: item['content:encoded']?._text,
                    author: item['dc:creator']?._text,
                    publish_date: item.pubDate?._text
                });
            }
            return news;
        }

        let res = await nodeFetch(newsUrl).catch(error => {
            throw { error: { code: error?.code || 'network', message: error?.message || String(error) } };
        });
        if (res.status !== 200) throw { error: { code: res.statusText, message: 'server not accessible' } };
        return await res.json();
    }
}

module.exports = new Remote();
