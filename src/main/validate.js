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

module.exports = {
    isString,
    isInteger,
    isNumber,
    isOneOf,
    toInteger,
    isAccountId
};
