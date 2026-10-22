import { execFile } from 'node:child_process';
// the bridge script that runs on the game machine, bundled into the build so it can be deployed from Settings
import bundled from './vrc-game.sh?raw';
import { getSession } from './accounts.js';
import { sendInvite } from './vrchat.js';
import { getWorldMeta } from './worldCache.js';
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
// an instance location, e.g. wrld_x:12345~hidden(usr_y)~region(jp); no quote characters, so it is safe inside '...'
const LOCATION_RE = /^wrld_[A-Za-z0-9-]+:[A-Za-z0-9_~().,:+-]{1,300}$/;

const versionOf = (text) => Number(/^# vrc-game-version: (\d+)/m.exec(text)?.[1]) || 0;
const BUNDLED_VERSION = versionOf(bundled);

/** @type {Promise<any> | null} */
let running = null;

function config() {
	const host = String(getSetting('game.host') || '').trim();
	const script = String(getSetting('game.script') || '').trim();
	if (!HOST_RE.test(host)) throw new Error('Game machine: enter an ssh host name (Settings → Game)');
	if (!SCRIPT_RE.test(script)) throw new Error('Launch script: only letters, digits and . _ / ~ - are allowed (Settings → Game)');
	const max = Math.min(50, Math.max(1, Number(getSetting('game.maxProfiles')) || 20));
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

async function runProfile({ host, script }, profile, keep, location, fast = false) {
	const cmd = `${script} ${profile}${keep ? ' --keep' : ''}${location ? ` --join '${location}'` : ''}${location && fast ? ' --fast' : ''}`;
	const { err, stdout, stderr } = await ssh(host, cmd, 5 * 60_000);
	const lines = stdout.trim().split('\n');
	const auth = lines.find((l) => l.startsWith('AUTH\t'));
	if (auth) {
		const [, id, name, via] = auth.split('\t');
		const j = lines.find((l) => l.startsWith('JOIN') || l === 'LAUNCHED');
		const join = !location ? undefined : j === 'LAUNCHED' ? { launched: true } : j?.startsWith('JOINED\t') ? { room: j.split('\t')[1] } : { failed: j === 'JOINFAIL' ? 'The game could not open that instance (no access, or it is closed)' : 'The instance did not finish loading' };
		return { kind: 'auth', id, name, join, via };
	}
	const last = lines[lines.length - 1] || '';
	if (last === 'NOLOGIN') return { kind: 'nologin' };
	throw new Error(last === 'FAILED' ? 'The game client did not start' : (stderr || err?.message || 'ssh failed').trim());
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

async function launch(accountId, location, fast = false) {
	const cfg = config();
	const userId = getSession(accountId)?.user?.id;
	if (!userId) throw new Error('Not logged in');
	const map = { ...(getSetting('game.profiles') || {}) };
	const tried = [];
	for (const p of candidates(map, userId, cfg.max)) {
		// the location only goes to a profile already known to be this account: probing another account's profile must not join it
		const known = map[p] === userId;
		let r = await runProfile(cfg, p, !known, known ? location : undefined, fast);
		tried.push(p);
		if (r.kind === 'nologin') {
			map[p] = null;
			setSettings({ 'game.profiles': map });
			// no saved login here: the client is left open at the login screen so the user can log in once
			return { needLogin: true, profile: Number(p), tried };
		}
		// signed in through Steam (no saved login here) as someone else: this profile is not logged in for the account we want
		if (r.via === 'steam' && r.id !== userId) {
			map[p] = null;
			setSettings({ 'game.profiles': map });
			return { needLogin: true, profile: Number(p), tried };
		}
		map[p] = r.id;
		setSettings({ 'game.profiles': map });
		if (r.id === userId) {
			// found by probing: now start it again with the instance
			if (location && !known) r = await runProfile(cfg, p, false, location, fast);
			return { profile: Number(p), name: r.name, join: r.join, tried };
		}
	}
	throw new Error(`No game profile (0-${cfg.max - 1}) is logged in as this account`);
}

/** One launch at a time: the client is a single process on the game box. */
export function launchGame(accountId, location) {
	if (running) return Promise.reject(new Error('A game launch is already in progress'));
	if (location && !LOCATION_RE.test(location)) return Promise.reject(new Error('Not a valid instance location'));
	running = launch(accountId, location || undefined).finally(() => (running = null));
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

/** Kill the running game client on the game box at once (the invite is out: nothing in the first account is worth waiting for). */
async function closeClient() {
	const { host } = config();
	await ssh(host, 'pkill -KILL -x VRChat.exe; for i in 1 2 3 4 5 6 7 8 9 10; do pgrep -x VRChat.exe >/dev/null || break; sleep 0.3; done; echo DONE', 20_000);
}

/**
 * Relay: account `fromId` (has access) enters the instance in the game and invites the `toIds` accounts from inside it
 * (VRChat only accepts an invite from someone who is in the instance), then the client is closed.
 *   mode 'invite'  nothing else: the invited accounts accept in their own client
 *   mode 'join'    (one target) the game is started as that account in the instance
 * The first account does not have to finish loading: it only has to be in the instance as far as VRChat is concerned,
 * which is when the invite is accepted.
 */
export function relayJoin(fromId, toIds, location, mode = 'join') {
	if (running) return Promise.reject(new Error('A game launch is already in progress'));
	if (!LOCATION_RE.test(location || '')) return Promise.reject(new Error('Not a valid instance location'));
	const targets = (Array.isArray(toIds) ? toIds : [toIds]).map(String).filter(Boolean);
	if (!targets.length) return Promise.reject(new Error('No target account'));
	if (mode === 'join' && targets.length !== 1) return Promise.reject(new Error('Join relays one account'));
	running = (async () => {
		const users = targets.map((id) => {
			const u = getSession(id)?.user;
			if (!u?.id) throw new Error('A target account is not logged in');
			return { id, userId: u.id, name: u.displayName };
		});
		const a = await launch(fromId, location, true);
		if (a.needLogin) return { needLogin: true, profile: a.profile };
		if (!a.join?.launched) throw new Error(`${a.name} could not join the instance: ${a.join?.failed || 'unknown'}`);
		const meta = await getWorldMeta(fromId, location.split(':')[0]).catch(() => null);
		// the API learns the new location a moment after the client logs it: retry until the invite is accepted
		const invited = [];
		let lastError = '';
		for (let i = 0; i < 120 && invited.length < users.length; i++) {
			if (i) await new Promise((r) => setTimeout(r, 700));
			for (const u of users) {
				if (invited.includes(u.name)) continue;
				const inv = await sendInvite(fromId, u.userId, location, { worldName: meta?.name });
				if (inv.ok) invited.push(u.name);
				else lastError = inv.error;
			}
		}
		if (!invited.length) throw new Error(`${a.name} is in the instance but the invite failed: ${lastError}`);
		await closeClient();
		if (mode === 'invite') return { from: a.name, invited };
		const b = await launch(targets[0], location);
		if (b.needLogin) return { needLogin: true, profile: b.profile, from: a.name, invited };
		return { from: a.name, to: b.name, invited, join: b.join };
	})().finally(() => (running = null));
	return running;
}
