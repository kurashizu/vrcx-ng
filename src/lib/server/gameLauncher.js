import { execFile } from 'node:child_process';
// the bridge script that runs on the game machine, bundled into the build so it can be deployed from Settings
import bundled from './vrc-game.sh?raw';
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

// host and script end up in a remote shell command: only plain names/paths are accepted
const HOST_RE = /^[A-Za-z0-9_][A-Za-z0-9._@-]*$/;
const SCRIPT_RE = /^[~A-Za-z0-9_./-]+$/;

const versionOf = (text) => Number(/^# vrc-game-version: (\d+)/m.exec(text)?.[1]) || 0;
const BUNDLED_VERSION = versionOf(bundled);

/** @type {Promise<any> | null} */
let running = null;

function config() {
	const host = String(getSetting('game.host') || '').trim();
	const script = String(getSetting('game.script') || '').trim();
	if (!HOST_RE.test(host)) throw new Error('Game machine: enter an ssh host name (Settings → Game)');
	if (!SCRIPT_RE.test(script)) throw new Error('Launch script: only letters, digits and . _ / ~ - are allowed (Settings → Game)');
	const max = Math.min(20, Math.max(1, Number(getSetting('game.maxProfiles')) || 6));
	return { host, script, max };
}

/** Run a command on the game machine over ssh (-F: the service sandbox cannot read the system ssh config). */
function ssh(host, command, timeout) {
	return new Promise((resolve) => {
		execFile(
			'ssh',
			['-F', `${process.env.HOME}/.ssh/config`, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command],
			{ timeout },
			(err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })
		);
	});
}

async function runProfile({ host, script }, profile, keep) {
	const { err, stdout, stderr } = await ssh(host, `${script} ${profile}${keep ? ' --keep' : ''}`, 5 * 60_000);
	const line = stdout.trim().split('\n').pop() || '';
	if (line.startsWith('AUTH\t')) {
		const [, id, name] = line.split('\t');
		return { kind: 'auth', id, name };
	}
	if (line === 'NOLOGIN') return { kind: 'nologin' };
	throw new Error(line === 'FAILED' ? 'The game client did not start' : (stderr || err?.message || 'ssh failed').trim());
}

/**
 * Order to try: the known profile, then profiles that had no login (that is where the user was told to log in, so the
 * login is most likely there now), then never-tried ones.
 */
function candidates(map, userId, max) {
	const all = Array.from({ length: max }, (_, i) => String(i));
	const known = all.filter((p) => map[p] === userId);
	const empty = all.filter((p) => map[p] === null);
	const fresh = all.filter((p) => map[p] === undefined);
	return [...known, ...empty, ...fresh];
}

async function launch(accountId) {
	const cfg = config();
	const userId = getSession(accountId)?.user?.id;
	if (!userId) throw new Error('Not logged in');
	const map = { ...(getSetting('game.profiles') || {}) };
	const tried = [];
	for (const p of candidates(map, userId, cfg.max)) {
		const r = await runProfile(cfg, p, map[p] !== userId);
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
	throw new Error(`No game profile (0-${cfg.max - 1}) is logged in as this account`);
}

/** One launch at a time: the client is a single process on the game box. */
export function launchGame(accountId) {
	if (running) return Promise.reject(new Error('A game launch is already in progress'));
	running = launch(accountId).finally(() => (running = null));
	return running;
}

/** Settings → Game "Test connection": is the box reachable, is the launch script there, what is running. */
export async function gameStatus() {
	const { host, script } = config();
	const t0 = Date.now();
	const { err, stdout, stderr } = await ssh(
		host,
		`test -x ${script} && echo SCRIPT; echo VER:$(grep -m1 '^# vrc-game-version:' ${script} 2>/dev/null | cut -d: -f2 | tr -d ' '); pgrep -x steam >/dev/null && echo STEAM; pgrep -x VRChat.exe >/dev/null && echo CLIENT; echo DONE`,
		20_000
	);
	if (!stdout.includes('DONE')) return { reachable: false, error: (stderr || err?.message || 'ssh failed').trim().split('\n').pop() };
	return {
		reachable: true,
		ms: Date.now() - t0,
		script: stdout.includes('SCRIPT'),
		scriptVersion: Number(/^VER:(\d*)/m.exec(stdout)?.[1]) || 0,
		bundledVersion: BUNDLED_VERSION,
		steam: stdout.includes('STEAM'),
		client: stdout.includes('CLIENT')
	};
}

/** Write the bundled bridge script to the game machine (temp file + mv, so a half-written script is never run). */
export function deployGameScript() {
	const { host, script } = config();
	return new Promise((resolve, reject) => {
		const child = execFile(
			'ssh',
			['-F', `${process.env.HOME}/.ssh/config`, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, `mkdir -p $(dirname ${script}) && cat > ${script}.tmp && chmod +x ${script}.tmp && mv ${script}.tmp ${script}`],
			{ timeout: 30_000 },
			(err, _out, stderr) => (err ? reject(new Error(String(stderr || err.message).trim())) : resolve({ version: BUNDLED_VERSION }))
		);
		child.stdin.end(bundled);
	});
}

/** Learned profile map (for the settings page). */
export function gameProfiles() {
	return { profiles: getSetting('game.profiles') || {}, max: config().max, busy: !!running };
}

/** Forget what was learned about one profile (or all with 'all'): it is searched again on the next launch. */
export function forgetGameProfile(profile) {
	const map = { ...(getSetting('game.profiles') || {}) };
	if (profile === 'all') for (const k of Object.keys(map)) delete map[k];
	else delete map[String(profile)];
	setSettings({ 'game.profiles': map });
	return map;
}
