/**
 * Minimal OSC (Open Sound Control) message builder + UDP sender.
 * Implements just enough of the OSC 1.0 spec to talk to VRChat's chatbox:
 *   /chatbox/input [string, bool, bool]
 *   /chatbox/typing [bool]
 *
 * We use Node's built-in dgram module rather than the 'osc' npm package to
 * keep dependencies minimal and avoid serialport/native dependencies.
 */

import dgram from 'node:dgram';

/**
 * Pad a string to a 4-byte boundary with NUL bytes (OSC strings).
 * @param {string} s
 * @returns {Buffer}
 */
function padString(s) {
	const buf = Buffer.from(s, 'utf8');
	const padded = Buffer.alloc(Math.ceil((buf.length + 1) / 4) * 4, 0);
	buf.copy(padded);
	return padded;
}

/**
 * Pad a buffer to a 4-byte boundary with NUL bytes (OSC blobs).
 * @param {Buffer} b
 */
function padBlob(b) {
	const padded = Buffer.alloc(Math.ceil(b.length / 4) * 4, 0);
	b.copy(padded);
	return padded;
}

/**
 * Encode an OSC type tag. Returns the type-tag string buffer + argument buffers.
 * @param {any[]} args
 */
function encodeArgs(args) {
	const typeTags = [];
	const argBuffers = [];
	for (const a of args) {
		if (typeof a === 'string') {
			typeTags.push('s');
			argBuffers.push(padString(a));
		} else if (typeof a === 'boolean') {
			typeTags.push(a ? 'T' : 'F');
			// No payload bytes for T/F
		} else if (typeof a === 'number') {
			if (Number.isInteger(a) && a >= -2147483648 && a <= 2147483647) {
				typeTags.push('i');
				argBuffers.push(Buffer.alloc(4));
				argBuffers[argBuffers.length - 1].writeInt32BE(a, 0);
			} else {
				typeTags.push('f');
				argBuffers.push(Buffer.alloc(4));
				argBuffers[argBuffers.length - 1].writeFloatBE(a, 0);
			}
		} else if (a === null || a === undefined) {
			typeTags.push('N');
		} else if (Buffer.isBuffer(a)) {
			typeTags.push('b');
			// length prefix (int32) + padded blob
			const len = Buffer.alloc(4);
			len.writeInt32BE(a.length, 0);
			argBuffers.push(len, padBlob(a));
		} else {
			throw new Error('OSC: unsupported argument type: ' + typeof a);
		}
	}
	const tagBuf = padString(',' + typeTags.join(''));
	return { tagBuf, argBuffers };
}

/**
 * Build an OSC message packet.
 * @param {string} address e.g. "/chatbox/input"
 * @param {any[]} args
 * @returns {Buffer}
 */
export function encodeOscMessage(address, args = []) {
	const addrBuf = padString(address);
	const { tagBuf, argBuffers } = encodeArgs(args);
	return Buffer.concat([addrBuf, tagBuf, ...argBuffers]);
}

/**
 * Create a singleton UDP socket (reused across sends — creating a new socket
 * per send was causing "bind already in use" issues on Windows in the VRCX
 * reference). On Linux/macOS we just send and let dgram handle ephemeral
 * source ports.
 */
let _socket = null;
function getSocket() {
	if (!_socket) {
		_socket = dgram.createSocket('udp4');
		_socket.on('error', (err) => {
			console.error('[osc] socket error', err.message);
		});
		_socket.unref();
	}
	return _socket;
}

/**
 * Send an OSC message to host:port.
 * @param {string} host
 * @param {number} port
 * @param {string} address
 * @param {any[]} args
 * @returns {Promise<{bytes:number, address:string, args:any[]}>}
 */
export function sendOsc(host, port, address, args = []) {
	return new Promise((resolve, reject) => {
		let packet;
		try {
			packet = encodeOscMessage(address, args);
		} catch (err) {
			return reject(err);
		}
		const sock = getSocket();
		sock.send(packet, 0, packet.length, port, host, (err, bytes) => {
			if (err) return reject(err);
			resolve({ bytes, address, args });
		});
	});
}

/**
 * DNS check — used by /health to give a "target reachable" hint. UDP doesn't
 * have handshakes, so we can only confirm the host resolves.
 * @param {string} host
 */
export async function checkOscTarget(host) {
	const dns = await import('node:dns/promises');
	try {
		await dns.lookup(host);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err.message };
	}
}
