/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

class Config {
    async GetConfig() {
        let res = await window.launcher.config.get();
        if (!res || res.error) throw { error: res?.error || { code: 'unknown', message: 'server not accessible' } };
        return res;
    }

    async getInstanceList() {
        let instancesList = await window.launcher.instances.list();
        return Array.isArray(instancesList) ? instancesList : [];
    }

    async getNews() {
        let news = await window.launcher.news.get();
        if (!news || news.error) throw { error: news?.error || { code: 'unknown', message: 'server not accessible' } };
        return news;
    }
}

export default new Config;
