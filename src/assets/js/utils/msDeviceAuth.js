/**
 * @author Xertien
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const crypto = require('crypto');

async function getBase64(url) {
    try {
        const response = await fetch(url);
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return buffer.toString('base64');
        }
    } catch (e) {
        console.error('[DeviceAuth] Failed to fetch image:', e);
    }
    return '';
}

class MicrosoftDeviceAuth {
    constructor(client_id) {
        this.client_id = client_id || '00000000402b5328';
        this.deviceCodeEndpoint = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
        this.tokenEndpoint = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
        this.scope = 'XboxLive.signin offline_access';
        this.polling = false;
        this.cancelled = false;
    }

    async requestDeviceCode() {
        try {
            const response = await fetch(this.deviceCodeEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `client_id=${this.client_id}&scope=${encodeURIComponent(this.scope)}`
            });

            const data = await response.json();

            if (data.error) {
                return { error: data.error, errorMessage: data.error_description };
            }

            return {
                device_code: data.device_code,
                user_code: data.user_code,
                verification_uri: data.verification_uri,
                expires_in: data.expires_in,
                interval: data.interval || 5
            };
        } catch (err) {
            return { error: 'network_error', errorMessage: err.message };
        }
    }

    async pollForToken(device_code, interval = 5, expires_in = 900, onPoll = null) {
        const startTime = Date.now();
        const expiresAt = startTime + (expires_in * 1000);
        this.polling = true;
        this.cancelled = false;

        while (this.polling && !this.cancelled && Date.now() < expiresAt) {
            await this.sleep(interval * 1000);

            if (this.cancelled) {
                return { error: 'cancelled', errorMessage: 'Authentication cancelled by user' };
            }

            if (onPoll) onPoll();

            try {
                const response = await fetch(this.tokenEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id=${this.client_id}&code=${device_code}`
                });

                const data = await response.json();

                if (data.error) {
                    if (data.error === 'authorization_pending') {
                        continue;
                    } else if (data.error === 'slow_down') {
                        interval += 5;
                        continue;
                    } else if (data.error === 'expired_token') {
                        this.polling = false;
                        return { error: 'expired', errorMessage: 'The code has expired. Please try again.' };
                    } else if (data.error === 'authorization_declined') {
                        this.polling = false;
                        return { error: 'declined', errorMessage: 'Authorization was declined by the user.' };
                    } else {
                        this.polling = false;
                        return { error: data.error, errorMessage: data.error_description };
                    }
                }

                this.polling = false;
                return {
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    expires_in: data.expires_in
                };
            } catch (err) {
                console.error('[DeviceAuth] Poll error:', err);
                continue;
            }
        }

        if (this.cancelled) {
            return { error: 'cancelled', errorMessage: 'Authentication cancelled by user' };
        }

        return { error: 'timeout', errorMessage: 'Authentication timed out' };
    }

    cancel() {
        this.cancelled = true;
        this.polling = false;
    }

    async exchangeForMinecraft(oauth2) {
        try {
            const xblResponse = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    Properties: {
                        AuthMethod: 'RPS',
                        SiteName: 'user.auth.xboxlive.com',
                        RpsTicket: `d=${oauth2.access_token}`,
                    },
                    RelyingParty: 'http://auth.xboxlive.com',
                    TokenType: 'JWT',
                }),
            });
            const xbl = await xblResponse.json();
            if (xbl.error) {
                return { error: xbl.error, errorType: 'xbl', ...xbl, refresh_token: oauth2.refresh_token };
            }

            const xstsResponse = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    Properties: {
                        SandboxId: 'RETAIL',
                        UserTokens: [xbl.Token],
                    },
                    RelyingParty: 'rp://api.minecraftservices.com/',
                    TokenType: 'JWT',
                }),
            });
            const xsts = await xstsResponse.json();
            if (xsts.error) {
                return { error: xsts.error, errorType: 'xsts', ...xsts, refresh_token: oauth2.refresh_token };
            }

            const mcLoginResponse = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    identityToken: `XBL3.0 x=${xbl.DisplayClaims.xui[0].uhs};${xsts.Token}`
                }),
            });
            const mcLogin = await mcLoginResponse.json();
            if (mcLogin.error) {
                return { error: mcLogin.error, errorType: 'mcLogin', ...mcLogin, refresh_token: oauth2.refresh_token };
            }
            if (!mcLogin.username) {
                return { error: 'NO_MINECRAFT_ACCOUNT', errorType: 'mcLogin', errorMessage: 'This Microsoft account does not own Minecraft', refresh_token: oauth2.refresh_token };
            }

            const mcstoreResponse = await fetch('https://api.minecraftservices.com/entitlements/mcstore', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${mcLogin.access_token}` },
            });
            const mcstore = await mcstoreResponse.json();
            if (mcstore.error) {
                return { error: mcstore.error, errorType: 'mcStore', ...mcstore, refresh_token: oauth2.refresh_token };
            }

            if (!mcstore.items.some(item => item.name === "game_minecraft" || item.name === "product_minecraft")) {
                return { error: 'NO_MINECRAFT_ENTITLEMENTS', errorType: 'mcStore', errorMessage: 'This account does not own Minecraft Java Edition', refresh_token: oauth2.refresh_token };
            }

            const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${mcLogin.access_token}` }
            });
            const profile = await profileResponse.json();
            if (profile.error) {
                return { error: profile.error, errorType: 'mcProfile', ...profile, refresh_token: oauth2.refresh_token };
            }

            if (Array.isArray(profile.skins)) {
                for (const skin of profile.skins) {
                    if (skin.url) {
                        skin.base64 = `data:image/png;base64,${await getBase64(skin.url)}`;
                    }
                }
            }
            if (Array.isArray(profile.capes)) {
                for (const cape of profile.capes) {
                    if (cape.url) {
                        cape.base64 = `data:image/png;base64,${await getBase64(cape.url)}`;
                    }
                }
            }

            const xboxAccountResponse = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    Properties: {
                        SandboxId: 'RETAIL',
                        UserTokens: [xbl.Token]
                    },
                    RelyingParty: 'http://xboxlive.com',
                    TokenType: 'JWT'
                })
            });
            const xboxAccount = await xboxAccountResponse.json();
            if (xboxAccount.error) {
                return { error: xboxAccount.error, errorType: 'xboxAccount', ...xboxAccount, refresh_token: oauth2.refresh_token };
            }

            return {
                access_token: mcLogin.access_token,
                client_token: crypto.randomUUID(),
                uuid: profile.id,
                name: profile.name,
                refresh_token: oauth2.refresh_token,
                user_properties: "{}",
                meta: {
                    type: 'Xbox',
                    access_token_expires_in: Date.now() + (mcLogin.expires_in * 1000),
                    demo: false
                },
                xboxAccount: {
                    xuid: xboxAccount.DisplayClaims.xui[0].xid,
                    gamertag: xboxAccount.DisplayClaims.xui[0].gtg,
                    ageGroup: xboxAccount.DisplayClaims.xui[0].agg
                },
                profile: {
                    skins: [...(profile.skins || [])],
                    capes: [...(profile.capes || [])]
                }
            };
        } catch (err) {
            return { error: 'network_error', errorMessage: err.message };
        }
    }

    async authenticate(onDeviceCode, onPoll = null) {
        const deviceCode = await this.requestDeviceCode();
        if (deviceCode.error) {
            return deviceCode;
        }

        if (onDeviceCode) {
            onDeviceCode({
                user_code: deviceCode.user_code,
                verification_uri: deviceCode.verification_uri,
                expires_in: deviceCode.expires_in
            });
        }

        const tokenResult = await this.pollForToken(
            deviceCode.device_code,
            deviceCode.interval,
            deviceCode.expires_in,
            onPoll
        );

        if (tokenResult.error) {
            return tokenResult;
        }

        return await this.exchangeForMinecraft(tokenResult);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = MicrosoftDeviceAuth;
