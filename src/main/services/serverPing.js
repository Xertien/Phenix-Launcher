const net = require('net');
const dns = require('dns').promises;

const TIMEOUT_MS = 3000;
const SRV_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_PORT = 25565;
const MAX_PACKET = 2 * 1024 * 1024;

const srvCache = new Map();

function writeVarInt(value) {
    let bytes = [];
    let v = value >>> 0;
    do {
        let byte = v & 0x7f;
        v >>>= 7;
        if (v !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (v !== 0);
    return Buffer.from(bytes);
}

function readVarInt(buffer, offset) {
    let value = 0;
    let size = 0;
    let byte;
    do {
        if (offset + size >= buffer.length) return null;
        byte = buffer[offset + size];
        value |= (byte & 0x7f) << (7 * size);
        size++;
        if (size > 5) throw new Error('VarInt too big');
    } while (byte & 0x80);
    return { value, size };
}

function packet(id, ...payload) {
    let body = Buffer.concat([writeVarInt(id), ...payload]);
    return Buffer.concat([writeVarInt(body.length), body]);
}

function mcString(text) {
    let data = Buffer.from(text, 'utf8');
    return Buffer.concat([writeVarInt(data.length), data]);
}

async function resolveTarget(host, port) {
    if (port !== DEFAULT_PORT || net.isIP(host)) return { host, port };
    let cached = srvCache.get(host);
    if (cached && Date.now() - cached.time < SRV_CACHE_MS) return cached.target;
    let target = { host, port };
    try {
        let records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
        if (records.length) {
            records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
            target = { host: records[0].name, port: records[0].port };
        }
    } catch {
    }
    srvCache.set(host, { time: Date.now(), target });
    return target;
}

function query(host, port, target) {
    return new Promise((resolve, reject) => {
        let socket = net.connect({ host: target.host, port: target.port });
        let buffer = Buffer.alloc(0);
        let status = null;
        let statusSentAt = 0n;
        let pingSentAt = 0n;
        let done = false;

        let finish = (err, result) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            socket.destroy();
            if (err) reject(err);
            else resolve(result);
        };

        let elapsed = since => Math.max(0, Math.round(Number(process.hrtime.bigint() - since) / 1e6));

        let timer = setTimeout(() => {
            if (status) finish(null, { ...status, ms: elapsed(statusSentAt) });
            else finish(new Error('timeout'));
        }, TIMEOUT_MS);

        socket.setNoDelay(true);

        socket.once('connect', () => {
            let portBuffer = Buffer.alloc(2);
            portBuffer.writeUInt16BE(port);
            socket.write(packet(0x00, writeVarInt(-1), mcString(host), portBuffer, writeVarInt(1)));
            statusSentAt = process.hrtime.bigint();
            socket.write(packet(0x00));
        });

        socket.on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            try {
                while (true) {
                    let length = readVarInt(buffer, 0);
                    if (!length) return;
                    if (length.value > MAX_PACKET) return finish(new Error('packet too big'));
                    let end = length.size + length.value;
                    if (buffer.length < end) return;
                    let body = buffer.subarray(length.size, end);
                    buffer = buffer.subarray(end);

                    let id = readVarInt(body, 0);
                    if (!id) return finish(new Error('bad packet'));

                    if (id.value === 0x00 && !status) {
                        let strLength = readVarInt(body, id.size);
                        if (!strLength) return finish(new Error('bad status'));
                        let start = id.size + strLength.size;
                        let json = JSON.parse(body.subarray(start, start + strLength.value).toString('utf8'));
                        status = {
                            online: true,
                            playersConnect: Number(json?.players?.online) || 0,
                            playersMax: Number(json?.players?.max) || 0,
                            version: typeof json?.version?.name === 'string' ? json.version.name.slice(0, 64) : ''
                        };
                        let payload = Buffer.alloc(8);
                        payload.writeBigInt64BE(BigInt(Date.now()));
                        pingSentAt = process.hrtime.bigint();
                        socket.write(packet(0x01, payload));
                    } else if (id.value === 0x01 && status) {
                        return finish(null, { ...status, ms: elapsed(pingSentAt) });
                    }
                }
            } catch (err) {
                finish(err);
            }
        });

        socket.once('error', err => finish(err));
        socket.once('close', () => {
            if (status) finish(null, { ...status, ms: elapsed(statusSentAt) });
            else finish(new Error('closed'));
        });
    });
}

async function pingServer(host, port = DEFAULT_PORT) {
    let target = await resolveTarget(host, port);
    return query(host, port, target);
}

module.exports = { pingServer };
