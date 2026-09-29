const fs = require("fs");

const builder = require('electron-builder')
const JavaScriptObfuscator = require('javascript-obfuscator');
const nodeFetch = require('node-fetch')
const png2icons = require('png2icons');
const Jimp = require('jimp');

const { preductname, author } = require('./package.json');

const env = name => {
    let value = process.env[name]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

class Index {
    async init() {
        this.obf = true
        this.Fileslist = []
        process.argv.forEach(async val => {
            if (val.startsWith('--icon')) {
                return this.iconSet(val.split('=')[1])
            }

            if (val.startsWith('--obf')) {
                this.obf = JSON.parse(val.split('=')[1])
                this.Fileslist = this.getFiles("src");
            }

            if (val.startsWith('--build')) {
                let buildType = val.split('=')[1]
                if (buildType == 'platform') return await this.buildPlatform()
                if (buildType == 'dir') return await this.buildPlatform({ dir: true, publish: 'never' })
            }
        });
    }

    async Obfuscate() {
        if (fs.existsSync("./app")) fs.rmSync("./app", { recursive: true })

        for (let path of this.Fileslist) {
            if (fs.statSync(path).isDirectory()) {
                fs.mkdirSync(path.replace('src', 'app'), { recursive: true })
                continue
            }
            let fileName = path.split('/').pop()
            let extFile = fileName.split(".").pop()
            let folder = path.replace(`/${fileName}`, '').replace('src', 'app')

            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })

            if (extFile == 'js') {
                let code = fs.readFileSync(path, "utf8");
                code = code.replace(/src\//g, 'app/');
                if (this.obf) {
                    await new Promise((resolve) => {
                        console.log(`Obfuscate ${path}`);
                        let obf = JavaScriptObfuscator.obfuscate(code, { optionsPreset: 'medium-obfuscation', disableConsoleOutput: false });
                        resolve(fs.writeFileSync(`${folder}/${fileName}`, obf.getObfuscatedCode(), { encoding: "utf-8" }));
                    })
                } else {
                    console.log(`Copy ${path}`);
                    fs.writeFileSync(`${folder}/${fileName}`, code, { encoding: "utf-8" });
                }
            } else {
                fs.copyFileSync(path, `${folder}/${fileName}`);
            }
        }
    }

    windowsSigning() {
        let publisherName = env('WIN_PUBLISHER_NAME')
        let azure = {
            endpoint: env('AZURE_TRUSTED_SIGNING_ENDPOINT'),
            codeSigningAccountName: env('AZURE_TRUSTED_SIGNING_ACCOUNT'),
            certificateProfileName: env('AZURE_TRUSTED_SIGNING_PROFILE')
        }

        if (azure.endpoint && azure.codeSigningAccountName && azure.certificateProfileName && env('AZURE_TENANT_ID') && env('AZURE_CLIENT_ID')) {
            console.log('Windows signing: Azure Trusted Signing')
            return {
                azureSignOptions: {
                    publisherName: publisherName || author.name,
                    ...azure
                }
            }
        }

        if (env('WIN_CSC_LINK') || env('CSC_LINK')) {
            console.log('Windows signing: certificate')
            return {
                signtoolOptions: {
                    signingHashAlgorithms: ['sha256'],
                    ...(publisherName ? { publisherName } : {})
                }
            }
        }

        console.log('Windows signing: disabled (no credentials)')
        return {}
    }

    macSigning() {
        let hasCertificate = Boolean(env('CSC_LINK') || env('CSC_NAME'))
        let hasNotarization = Boolean(
            (env('APPLE_API_KEY') && env('APPLE_API_KEY_ID') && env('APPLE_API_ISSUER')) ||
            (env('APPLE_ID') && env('APPLE_APP_SPECIFIC_PASSWORD') && env('APPLE_TEAM_ID'))
        )

        let common = {
            hardenedRuntime: true,
            gatekeeperAssess: false,
            entitlements: 'build/entitlements.mac.plist',
            entitlementsInherit: 'build/entitlements.mac.plist'
        }

        if (!hasCertificate) {
            console.log('macOS signing: disabled (no certificate)')
            return { ...common, identity: null, notarize: false }
        }

        console.log(`macOS signing: Developer ID${hasNotarization ? ' + notarization' : ''}`)
        return { ...common, notarize: hasNotarization }
    }

    async buildPlatform(options = {}) {
        await this.Obfuscate();
        return builder.build({
            ...options,
            config: {
                generateUpdatesFilesForAllChannels: false,
                appId: preductname,
                productName: preductname,
                copyright: 'Phe-Modded',
                artifactName: "${productName}-${os}-${arch}.${ext}",
                extraMetadata: { main: 'app/app.js' },
                files: ["app/**/*", "package.json", "LICENSE.md"],
                directories: { "output": "dist", "buildResources": "build" },
                compression: 'maximum',
                asar: true,
                electronFuses: {
                    runAsNode: false,
                    enableCookieEncryption: true,
                    enableNodeOptionsEnvironmentVariable: false,
                    enableNodeCliInspectArguments: false,
                    enableEmbeddedAsarIntegrityValidation: true,
                    onlyLoadAppFromAsar: true,
                    resetAdHocDarwinSignature: true
                },
                publish: [{
                    provider: "github",
                    releaseType: 'release',
                }],
                win: {
                    icon: "./app/assets/images/icon.ico",
                    ...this.windowsSigning(),
                    target: [{
                        target: "nsis",
                        arch: "x64"
                    }]
                },
                nsis: {
                    oneClick: true,
                    allowToChangeInstallationDirectory: false,
                    createDesktopShortcut: true,
                    runAfterFinish: true
                },
                mac: {
                    icon: "./app/assets/images/icon.icns",
                    category: "public.app-category.games",
                    ...this.macSigning(),
                    target: [{
                        target: "dmg",
                        arch: "universal"
                    },
                    {
                        target: "zip",
                        arch: "universal"
                    }]
                },
                linux: {
                    icon: "./app/assets/images/icon.png",
                    target: [{
                        target: "AppImage",
                        arch: "x64"
                    }]
                }
            }
        }).then(() => {
            console.log('le build est terminé')
        }).catch(err => {
            console.error('Error during build!', err)
            process.exitCode = 1
        })
    }

    getFiles(path, file = []) {
        if (fs.existsSync(path)) {
            let files = fs.readdirSync(path);
            if (files.length == 0) file.push(path);
            for (let i in files) {
                let name = `${path}/${files[i]}`;
                if (fs.statSync(name).isDirectory()) this.getFiles(name, file);
                else file.push(name);
            }
        }
        return file;
    }

    async iconSet(url) {
        let Buffer = await nodeFetch(url)
        if (Buffer.status == 200) {
            Buffer = await Buffer.buffer()
            const image = await Jimp.read(Buffer);
            Buffer = await image.resize(256, 256).getBufferAsync(Jimp.MIME_PNG)
            fs.writeFileSync("src/assets/images/icon.icns", png2icons.createICNS(Buffer, png2icons.BILINEAR, 0));
            fs.writeFileSync("src/assets/images/icon.ico", png2icons.createICO(Buffer, png2icons.HERMITE, 0, false));
            fs.writeFileSync("src/assets/images/icon.png", Buffer);
            console.log('new icon set')
        } else {
            console.log('connection error')
        }
    }
}

new Index().init();
