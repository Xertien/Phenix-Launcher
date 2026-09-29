const pkg = require('../../../package.json');
const nodeFetch = require('node-fetch');
const convert = require('xml-js');
const { isSafePathSegment, isSafeExternalUrl } = require('../../assets/js/utils/security.js');

let url = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url;

let configUrl = `${url}/launcher/config-launcher/config.json`;
let newsUrl = `${url}/launcher/news-launcher/news.json`;
let instancesUrl = `${url}/files/`;

class Remote {
    constructor() {
        this.lastConfig = null;
    }

    getConfig() {
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
        let instances = await nodeFetch(instancesUrl).then(res => res.json()).catch(err => ({}));
        let instancesList = [];
        if (!instances || typeof instances !== 'object') return instancesList;

        for (let [name, data] of Object.entries(instances)) {
            if (!isSafePathSegment(name) || !data || typeof data !== 'object') {
                console.warn(`[Config] Instance ignorée (nom invalide) : ${name}`);
                continue;
            }
            let instance = data;
            instance.name = name;
            instancesList.push(instance);
        }
        return instancesList;
    }

    async getNews() {
        let config = await this.getConfig() || {};

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
