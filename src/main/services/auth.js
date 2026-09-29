const crypto = require('crypto');
const { clipboard, shell } = require('electron');
const { AZauth, Mojang } = require('minecraft-java-core');
const Sentry = require('@sentry/electron/main');
const MicrosoftDeviceAuth = require('./msDeviceAuth.js');
const accounts = require('./accounts.js');
const remote = require('./remote.js');
const { redactSecrets, isSafeExternalUrl } = require('../../assets/js/utils/security.js');
const { isString } = require('../validate.js');

const MAX_SESSIONS = 3;

class Auth {
    constructor() {
        this.sessions = new Map();
    }

    getSession(event, sessionId) {
        if (!isString(sessionId, 64)) return null;
        let session = this.sessions.get(sessionId);
        if (!session || session.owner !== event.sender.id) return null;
        return session;
    }

    dropSession(sessionId) {
        let session = this.sessions.get(sessionId);
        if (!session) return;
        clearTimeout(session.timeout);
        session.auth.cancel();
        this.sessions.delete(sessionId);
    }

    async microsoftStart(event) {
        try {
            let config = await remote.getCachedConfig().catch(() => ({}));
            console.log('[Auth] Starting Microsoft Device Code authentication');

            while (this.sessions.size >= MAX_SESSIONS) this.dropSession(this.sessions.keys().next().value);

            let auth = new MicrosoftDeviceAuth(config.client_id);
            let deviceCode = await auth.requestDeviceCode();
            if (deviceCode.error) {
                Sentry.captureMessage(`[Auth] Device code request error: ${JSON.stringify(redactSecrets(deviceCode))}`, 'error');
                return { error: String(deviceCode.error), errorMessage: String(deviceCode.errorMessage || '') };
            }

            let sessionId = crypto.randomUUID();
            let expiresIn = Number(deviceCode.expires_in) || 900;
            this.sessions.set(sessionId, {
                auth,
                owner: event.sender.id,
                deviceCode,
                polling: false,
                timeout: setTimeout(() => this.dropSession(sessionId), (expiresIn + 60) * 1000)
            });

            return {
                sessionId,
                user_code: String(deviceCode.user_code),
                verification_uri: String(deviceCode.verification_uri),
                expires_in: expiresIn
            };
        } catch (error) {
            console.error(`[Auth] Device code error: ${error?.message || error}`);
            Sentry.captureException(error);
            return { error: 'exception', errorMessage: String(error?.message || error) };
        }
    }

    async microsoftPoll(event, sessionId) {
        let session = this.getSession(event, sessionId);
        if (!session) return { error: 'session_not_found', errorMessage: 'Auth session not found' };
        if (session.polling) return { error: 'already_polling', errorMessage: 'Auth session already in progress' };
        session.polling = true;

        try {
            let { device_code, interval, expires_in } = session.deviceCode;
            let tokenResult = await session.auth.pollForToken(device_code, interval, expires_in);

            if (tokenResult.error) {
                if (tokenResult.error !== 'cancelled') {
                    Sentry.captureMessage(`[Auth] Device code poll error: ${JSON.stringify(redactSecrets(tokenResult))}`, 'error');
                }
                return { error: String(tokenResult.error), errorMessage: String(tokenResult.errorMessage || '') };
            }

            let result = await session.auth.exchangeForMinecraft(tokenResult);
            if (result.error) {
                Sentry.captureMessage(`[Auth] Minecraft exchange error: ${JSON.stringify(redactSecrets(result))}`, 'error');
                return { error: String(result.error), errorMessage: String(result.errorMessage || result.message || '') };
            }

            console.log(`[Auth] Device code auth success: ${result.name} (${result.uuid})`);
            return await accounts.add(result);
        } catch (error) {
            console.error(`[Auth] Device code poll error: ${error?.message || error}`);
            Sentry.captureException(error);
            return { error: 'exception', errorMessage: String(error?.message || error) };
        } finally {
            this.dropSession(sessionId);
        }
    }

    microsoftCancel(event, sessionId) {
        if (this.getSession(event, sessionId)) this.dropSession(sessionId);
        return { success: true };
    }

    microsoftCopyCode(event, sessionId) {
        let session = this.getSession(event, sessionId);
        if (!session) return false;
        clipboard.writeText(String(session.deviceCode.user_code));
        return true;
    }

    async microsoftOpenVerification(event, sessionId) {
        let session = this.getSession(event, sessionId);
        if (!session) return false;
        let url = String(session.deviceCode.verification_uri);
        if (!isSafeExternalUrl(url) || !url.startsWith('https://')) return false;
        await shell.openExternal(url);
        return true;
    }

    async offlineLogin(name) {
        if (typeof name !== 'string' || name.length < 3 || name.length > 32 || /\s/.test(name)) {
            return { error: true, message: 'Pseudo invalide.' };
        }
        let config = await remote.getCachedConfig().catch(() => ({}));
        if (config.online !== false) return { error: true, message: 'Connexion hors ligne désactivée.' };

        let MojangConnect = await Mojang.login(name);
        if (MojangConnect.error) return { error: true, message: String(MojangConnect.message || '') };
        return await accounts.add(MojangConnect);
    }

    async azauthLogin(email, password, code) {
        if (!isString(email, 256) || !isString(password, 1024)) return { error: true, message: 'Veuillez remplir tous les champs.' };
        if (code !== undefined && code !== null && !isString(code, 32)) return { error: true, message: 'Code A2F invalide.' };

        let config = await remote.getCachedConfig().catch(() => ({}));
        if (typeof config.online !== 'string' || !isSafeExternalUrl(config.online)) {
            return { error: true, message: 'Connexion AZauth désactivée.' };
        }

        let client = new AZauth(config.online);
        let result = code ? await client.login(email, password, code) : await client.login(email, password);

        if (result.error) return { error: true, message: String(result.message || '') };
        if (result.A2F) return { A2F: true };
        return await accounts.add(result);
    }
}

module.exports = new Auth();
