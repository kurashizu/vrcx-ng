import { sendOsc, checkOscTarget } from './osc.js';
import { getSetting } from './settings.js';

// VRChat chatbox limits
export const MAX_CHARS = 144;
export const MAX_LINES = 9;

/**
 * Validate chatbox text against VRChat limits.
 * @param {string} text
 */
export function validateChatText(text) {
	if (typeof text !== 'string') throw new Error('text must be a string');
	if (text.length === 0) throw new Error('text 不能为空');
	if (text.length > MAX_CHARS) throw new Error(`text 过长: ${text.length} > ${MAX_CHARS} 字符`);
	const nlines = text.split('\n').length;
	if (nlines > MAX_LINES) throw new Error(`text 换行过多: ${nlines} > ${MAX_LINES} 行`);
	return text;
}

/**
 * Get current chatbox target settings.
 */
export function getTarget() {
	return {
		host: getSetting('chatbox.host') || '127.0.0.1',
		port: Number(getSetting('chatbox.port')) || 9000
	};
}

/**
 * Send text to VRChat chatbox.
 * @param {{text:string, immediate?:boolean, sfx?:boolean}} req
 */
export async function send(req) {
	const text = validateChatText(req.text);
	const immediate = req.immediate !== false; // default true
	const sfx = req.sfx !== false;
	const { host, port } = getTarget();
	await sendOsc(host, port, '/chatbox/input', [text, !!immediate, !!sfx]);
	return {
		ok: true,
		text,
		len: text.length,
		immediate,
		sfx,
		target: { host, port }
	};
}

/**
 * Toggle typing indicator.
 * @param {{typing:boolean}} req
 */
export async function setTyping(req) {
	const typing = !!req?.typing;
	const { host, port } = getTarget();
	await sendOsc(host, port, '/chatbox/typing', [typing]);
	return { ok: true, typing, target: { host, port } };
}

/**
 * Health check — DNS lookup only, since UDP has no handshake.
 */
export async function health() {
	const { host, port } = getTarget();
	const result = await checkOscTarget(host);
	return {
		...result,
		vrc_host: host,
		vrc_port: port,
		max_chars: MAX_CHARS,
		max_lines: MAX_LINES
	};
}
