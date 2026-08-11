import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey() {
	const hex = process.env.ACCOUNT_ENCRYPTION_KEY || '';
	if (hex.length !== 64) {
		// fall back to a dev-only key (still encrypted at rest, but predictable)
		return crypto.createHash('sha256').update('vrcx-ng-dev-key').digest();
	}
	return Buffer.from(hex, 'hex');
}

/**
 * @param {string} plaintext
 * @returns {string} base64 payload (iv|tag|ciphertext)
 */
export function encrypt(plaintext) {
	if (plaintext == null) return '';
	const key = getKey();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(ALGO, key, iv);
	const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * @param {string} payload
 * @returns {string} plaintext
 */
export function decrypt(payload) {
	if (!payload) return '';
	const key = getKey();
	const buf = Buffer.from(payload, 'base64');
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const enc = buf.subarray(28);
	const decipher = crypto.createDecipheriv(ALGO, key, iv);
	decipher.setAuthTag(tag);
	const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
	return dec.toString('utf8');
}
