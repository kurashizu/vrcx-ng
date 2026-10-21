import { execFile } from 'node:child_process';
import { getSession } from './accounts.js';
import { getSetting, setSettings } from './settings.js';

/**
 * "Play as": start the desktop VRChat client on the game profile that is logged in as this account.
 * The profile → account map is learned, not configured: an account without a known profile is searched by
 * launching profiles 0, 1, 2 … (`vrc-game N` on the game box) and reading who the client logged in as. Every
 * probe is remembered, so each account is searched at most once.
 *
 * `game.profiles`: { "<profile>": "usr_…" (logged in as) | null (no saved login) }; absent = never tried.
 */

const MAX_PROFILES = 6;
const SCRIPT = '~/Documents/vrchat-dev/scripts/vrc-game';

/** @type {Promise<any> | null} */
let running = null;

function runProfile(profile, keep) {
	const host = getSetting('game.host') || 'krsz-desktop';
	return new Promise((resolve, reject) => {
		execFile(
			'ssh',
			['-F', `${process.env.HOME}/.ssh/config`, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, `${SCRIPT} ${profile}${keep ? ' --keep' : ''}`],
			{ timeout: 5 * 60_000 },
			(err, stdout, stderr) => {
				const line = String(stdout || '').trim().split('\n').pop() || '';
				if (line.startsWith('AUTH\t')) {
					const [, id, name] = line.split('\t');
					return resolve({ kind: 'auth', id, name });
				}
				if (line === 'NOLOGIN') return resolve({ kind: 'nologin' });
				reject(new Error(line === 'FAILED' ? 'The game client did not start' : String(stderr || err?.message || 'ssh failed').trim()));
			}
		);
	});
}

/** Order to try: the known profile, then never-tried ones, then profiles that had no login (the user may have logged in since). */
function candidates(map, userId) {
	const all = Array.from({ length: MAX_PROFILES }, (_, i) => String(i));
	const known = all.filter((p) => map[p] === userId);
	const fresh = all.filter((p) => map[p] === undefined);
	const empty = all.filter((p) => map[p] === null);
	return [...known, ...fresh, ...empty];
}

async function launch(accountId) {
	const userId = getSession(accountId)?.user?.id;
	if (!userId) throw new Error('Not logged in');
	const map = { ...(getSetting('game.profiles') || {}) };
	const tried = [];
	for (const p of candidates(map, userId)) {
		const r = await runProfile(p, map[p] !== userId);
		tried.push(p);
		if (r.kind === 'nologin') {
			map[p] = null;
			setSettings({ 'game.profiles': map });
			// no saved login here: the client is left open at the login screen so the user can log in once
			return { needLogin: true, profile: Number(p), tried };
		}
		map[p] = r.id;
		setSettings({ 'game.profiles': map });
		if (r.id === userId) return { profile: Number(p), name: r.name, tried };
	}
	throw new Error(`No game profile (0-${MAX_PROFILES - 1}) is logged in as this account`);
}

/** One launch at a time: the client is a single process on the game box. */
export function launchGame(accountId) {
	if (running) return Promise.reject(new Error('A game launch is already in progress'));
	running = launch(accountId).finally(() => (running = null));
	return running;
}
