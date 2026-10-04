function isString(value, maxLength = 256) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isInteger(value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    return Number.isInteger(value) && value >= min && value <= max;
}

function isNumber(value, min = -Infinity, max = Infinity) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isOneOf(value, allowed) {
    return allowed.includes(value);
}

function toInteger(value, min, max) {
    let number = typeof value === 'string' && /^\d{1,9}$/.test(value.trim()) ? parseInt(value, 10) : value;
    return isInteger(number, min, max) ? number : null;
}

function isAccountId(value) {
    return isInteger(value, 1) || (typeof value === 'string' && /^\d{1,15}$/.test(value));
}

const ARG_TOKEN = /^[A-Za-z0-9_.:+=,/%@-]{1,255}$/;
const MAX_ARGS = 32;

const JVM_DENIED = [
    '-xms', '-xmx', '-cp', '-classpath', '--class-path', '-jar', '-javaagent', '-agentlib', '-agentpath',
    '-xbootclasspath', '--module-path', '--upgrade-module-path', '--patch-module', '--module', '--source',
    '-xx:onoutofmemoryerror', '-xx:onerror', '-xx:flags', '-xx:vmoptionsfile', '-xx:compilecommandfile',
    '-xx:sharedarchivefile', '-xx:archiveclassesatexit', '-xx:heapdumppath', '-xx:errorfile', '-xx:logfile',
    '-xlog', '-xloggc', '-djava.library.path', '-djava.class.path', '-djava.system.class.loader',
    '-djava.security', '-djna.tmpdir', '-dorg.lwjgl', '-dio.netty.native.workdir', '-dlog4j', '-dcom.sun.jndi'
];
const JVM_DENIED_EXACT = ['-p', '-m', '-version', '--version', '-help', '--help', '-?', '-showversion', '--show-version', '--dry-run'];

const GAME_DENIED = [
    '--username', '--uuid', '--accesstoken', '--usertype', '--xuid', '--clientid', '--userproperties', '--profileproperties',
    '--gamedir', '--assetsdir', '--assetindex', '--version', '--versiontype', '--width', '--height', '--fullscreen',
    '--resourcepackdir', '--quickplaypath', '--session'
];

function tokenizeArgs(value, maxLength) {
    if (typeof value !== 'string') return { error: 'Valeur invalide.' };
    if (value.length > maxLength) return { error: `${maxLength} caractères maximum.` };
    let tokens = value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > MAX_ARGS) return { error: `${MAX_ARGS} arguments maximum.` };
    for (let token of tokens) {
        if (!ARG_TOKEN.test(token)) return { error: `Caractères non autorisés dans « ${token.slice(0, 40)} ».` };
    }
    return { args: tokens };
}

function parseJvmArgs(value) {
    let result = tokenizeArgs(value, 1024);
    if (result.error) return result;
    for (let token of result.args) {
        let lower = token.toLowerCase();
        if (!token.startsWith('-')) return { error: `« ${token.slice(0, 40)} » doit commencer par un tiret.` };
        if (JVM_DENIED_EXACT.includes(lower) || JVM_DENIED.some(prefix => lower.startsWith(prefix))) {
            return { error: `L'argument « ${token.slice(0, 40)} » n'est pas autorisé.` };
        }
    }
    return result;
}

function parseGameArgs(value) {
    let result = tokenizeArgs(value, 512);
    if (result.error) return result;
    for (let token of result.args) {
        if (!token.startsWith('-')) continue;
        if (!token.startsWith('--') || token.length < 3) return { error: `« ${token.slice(0, 40)} » : les options commencent par deux tirets.` };
        let name = token.split('=')[0];
        if (GAME_DENIED.includes(name.toLowerCase())) return { error: `L'option « ${name.slice(0, 40)} » est gérée par le launcher.` };
    }
    return result;
}

module.exports = {
    isString,
    isInteger,
    isNumber,
    isOneOf,
    toInteger,
    isAccountId,
    parseJvmArgs,
    parseGameArgs
};
