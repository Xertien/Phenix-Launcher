const fs = require('fs');
const path = require('path');
const settings = require('./settings.js');
const remote = require('./remote.js');
const { isSafePathSegment } = require('../../assets/js/utils/security.js');
const { reportError } = require('../reporting.js');

const STATES = {
    installed: 'installed',
    incomplete: 'incomplete',
    missing: 'not_installed'
};

function game() {
    return require('./game.js');
}

function samePath(a, b) {
    let left = path.resolve(a);
    let right = path.resolve(b);
    return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

class Instances {
    constructor() {
        this.deleting = null;
    }

    async root() {
        let config = await remote.getCachedConfig().catch(() => null);
        if (!config || !isSafePathSegment(config.dataDirectory)) return null;
        return path.resolve(game().getGamePath(config.dataDirectory), 'instances');
    }

    async inspect(root, name) {
        let target = path.join(root, name);
        let stat;
        try {
            stat = await fs.promises.lstat(target);
        } catch (e) {
            return { exists: false, link: false };
        }
        if (stat.isSymbolicLink()) return { exists: true, link: true };
        if (!stat.isDirectory()) return { exists: false, link: false };
        let entries = await fs.promises.readdir(target).catch(() => []);
        return { exists: entries.length > 0, link: false };
    }

    async status() {
        let list = await remote.getInstanceList().catch(() => []);
        let root = await this.root();
        let pending = await settings.getPendingInstances();
        let result = [];
        for (let instance of Array.isArray(list) ? list : []) {
            let name = instance?.name;
            if (!isSafePathSegment(name)) continue;
            let info = root ? await this.inspect(root, name) : { exists: false, link: false };
            let state = !info.exists ? STATES.missing : (pending.includes(name) ? STATES.incomplete : STATES.installed);
            result.push({ name, state, deletable: info.exists && !info.link });
        }
        return result;
    }

    async remove(name) {
        if (!isSafePathSegment(name)) return { error: 'invalid_name', message: 'Nom d\'instance invalide.' };
        if (game().running) return { error: 'busy', message: 'Impossible pendant que le jeu est lancé.' };
        if (this.deleting) return { error: 'busy', message: 'Une suppression est déjà en cours.' };

        let list = await remote.getInstanceList().catch(() => []);
        if (!Array.isArray(list) || !list.some(instance => instance?.name === name)) {
            return { error: 'unknown_instance', message: 'Instance inconnue.' };
        }

        let root = await this.root();
        if (!root) return { error: 'invalid_config', message: 'Configuration distante invalide.' };

        this.deleting = name;
        try {
            let rootReal;
            try {
                rootReal = await fs.promises.realpath(root);
            } catch (e) {
                return { error: 'not_installed', message: 'Cette instance n\'est pas installée.' };
            }

            let target = path.join(rootReal, name);
            if (!samePath(path.dirname(target), rootReal) || path.basename(target) !== name) {
                return { error: 'invalid_path', message: 'Chemin d\'instance refusé.' };
            }

            let stat;
            try {
                stat = await fs.promises.lstat(target);
            } catch (e) {
                return { error: 'not_installed', message: 'Cette instance n\'est pas installée.' };
            }
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
                return { error: 'invalid_path', message: 'Dossier d\'instance non supprimable.' };
            }

            let targetReal = await fs.promises.realpath(target);
            if (!samePath(path.dirname(targetReal), rootReal) || samePath(targetReal, rootReal)) {
                return { error: 'invalid_path', message: 'Chemin d\'instance refusé.' };
            }

            if (game().running) return { error: 'busy', message: 'Impossible pendant que le jeu est lancé.' };

            await fs.promises.rm(targetReal, { recursive: true, force: false, maxRetries: 2, retryDelay: 200 });
            await settings.setInstancePending(name, false);
            return { deleted: true };
        } catch (error) {
            let code = error?.code === 'EBUSY' || error?.code === 'EPERM' ? 'locked' : 'failed';
            reportError('instances', 'delete', error, { once: `${code}|${error?.code || ''}`, level: code === 'locked' ? 'warning' : 'error', tags: { result: code } });
            return {
                error: code,
                message: code === 'locked'
                    ? 'Fichiers utilisés, fermez le jeu et réessayez.'
                    : 'La suppression a échoué.'
            };
        } finally {
            this.deleting = null;
        }
    }
}

module.exports = new Instances();
