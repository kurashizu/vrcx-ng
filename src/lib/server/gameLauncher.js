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

/**
 * Two clients can run at once: the MAIN one is the player's (started through Steam), the AUX one is a helper for temporary
 * logins and relays (own wine prefix, shown on the VNC display) and lives only as long as its task. One launch at a time on each.
 * @type {{ main: Promise<any> | null, aux: Promise<any> | null }}
 */
const running = { main: null, aux: null };
/** a helper client left at a login screen for the user to log in stays this long (ms timestamp), then it is closed */
let auxLoginUntil = 0;
const AUX_LOGIN_GRACE = 10 * 60_000;

const mapKey = (client) => (client === 'aux' ? 'game.auxProfiles' : 'game.profiles');
/** profile → account map of a client; the helper starts from a copy of the main one (its wine prefix was copied from it) */
function profileMap(client) {
	const own = getSetting(mapKey(client)) || {};
	if (client === 'aux' && !Object.keys(own).length) return { ...(getSetting('game.profiles') || {}) };
	return { ...own };
}

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

async function runProfile({ host, script }, profile, keep, location, fast = false, expect, client = 'main') {
	const cmd = `${script} ${profile}${client === 'aux' ? ' --aux' : ''}${keep ? ' --keep' : ''}${location ? ` --join '${location}'` : ''}${location && fast ? ' --fast' : ''}${location && expect ? ` --expect ${expect}` : ''}`;
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

async function launch(accountId, location, fast = false, client = 'main') {
	const cfg = config();
	const userId = getSession(accountId)?.user?.id;
	if (!userId) throw new Error('Not logged in');
	const map = profileMap(client);
	const save = () => setSettings({ [mapKey(client)]: map });
	const tried = [];
	// a login screen is left open for the user (helper client: they log in on the VNC display, it is closed after a while)
	const needLogin = (p) => {
		if (client === 'aux') auxLoginUntil = Date.now() + AUX_LOGIN_GRACE;
		return { needLogin: true, profile: Number(p), tried, client };
	};
	for (const p of candidates(map, userId, cfg.max)) {
		// the location only goes to a profile already known to be this account: probing another account's profile must not join it
		const known = map[p] === userId;
		let r = await runProfile(cfg, p, !known, known ? location : undefined, fast, userId, client);
		tried.push(p);
		if (r.kind === 'nologin') {
			map[p] = null;
			save();
			return needLogin(p);
		}
		// signed in through Steam (no saved login here) as someone else: this profile is not logged in for the account we want
		if (r.via === 'steam' && r.id !== userId) {
			map[p] = null;
			save();
			return needLogin(p);
		}
		map[p] = r.id;
		save();
		if (r.id === userId) {
			// found by probing: now start it again with the instance
			if (location && !known) r = await runProfile(cfg, p, false, location, fast, userId, client);
			return { profile: Number(p), name: r.name, join: r.join, tried, client };
		}
	}
	throw new Error(`No game profile (0-${cfg.max - 1}) is logged in as this account`);
}

/** Play as: the main client (the player's game) starts as this account. One launch at a time. */
export function launchGame(accountId, location) {
	if (running.main) return Promise.reject(new Error('A game launch is already in progress'));
	if (location && !LOCATION_RE.test(location)) return Promise.reject(new Error('Not a valid instance location'));
	running.main = launch(accountId, location || undefined).finally(() => (running.main = null));
	return running.main;
}

/** Log an account in on the helper client (its login screen stays open for a while) so relays can use it. */
export function launchAux(accountId) {
	if (running.aux) return Promise.reject(new Error('The helper client is busy'));
	running.aux = launch(accountId, undefined, false, 'aux').finally(() => (running.aux = null));
	return running.aux;
}

/** Settings → Game "Test connection": is the box reachable, is the launch script there, what is running. */
export async function gameStatus() {
	const { host, script } = config();
	const t0 = Date.now();
	const { err, stdout, stderr } = await ssh(
		host,
		`test -x ${script} && echo SCRIPT; echo VER:$(grep -m1 '^# vrc-game-version:' ${script} 2>/dev/null | cut -d: -f2 | tr -d ' '); pgrep -x steam >/dev/null && echo STEAM; pgrep -x VRChat.exe >/dev/null && echo CLIENT; ${script} clients 2>/dev/null | sed 's/^/C:/'; echo DONE`,
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
		client: stdout.includes('CLIENT'),
		// the running clients: { kind: 'main' | 'aux', profile }
		clients: [...stdout.matchAll(/^C:(main|aux)\t(\d*)\t/gm)].map((m) => ({ kind: m[1], profile: Number(m[2]) || 0 }))
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

/** Learned profile maps (for the settings page): the main client's and the helper's. */
export function gameProfiles() {
	return {
		profiles: getSetting('game.profiles') || {},
		auxProfiles: profileMap('aux'),
		max: config().max,
		busy: !!(running.main || running.aux),
		busyMain: !!running.main,
		busyAux: !!running.aux
	};
}

/** Forget what was learned about one profile (or all with 'all'): it is searched again on the next launch. */
export function forgetGameProfile(profile, client = 'main') {
	const map = client === 'aux' ? profileMap('aux') : { ...(getSetting('game.profiles') || {}) };
	if (profile === 'all') for (const k of Object.keys(map)) delete map[k];
	else delete map[String(profile)];
	setSettings({ [mapKey(client)]: map });
	return map;
}

/** Close the helper client at once (never touches the main one). */
export async function closeAux() {
	const { host, script } = config();
	auxLoginUntil = 0;
	await ssh(host, `${script} kill-aux; echo DONE`, 30_000);
}

/** Close the main client (the player's game) on the game box. */
export async function closeMain() {
	const { host, script } = config();
	await ssh(host, `${script} kill-main; echo DONE`, 90_000);
}

/** What runs on the game box right now: the clients with their profile, plus the learned maps and what is busy launching. */
export async function gameClientsInfo() {
	const { host, script } = config();
	const { stdout, stderr, err } = await ssh(host, `${script} clients; echo DONE`, 20_000);
	if (!stdout.includes('DONE')) throw new Error((stderr || err?.message || 'ssh failed').trim().split('\n').pop());
	const clients = [...stdout.matchAll(/^(main|aux)\t(\d*)\t(\d+)$/gm)].map((m) => ({ kind: m[1], profile: Number(m[2]) || 0 }));
	return { clients, ...gameProfiles(), loginUntil: auxLoginUntil };
}

async function auxAlive() {
	const { host, script } = config();
	const { stdout } = await ssh(host, `${script} alive-aux`, 15_000);
	return stdout.includes('ALIVE');
}

/**
 * The helper client must not linger: it is closed the moment its task is over. This is the safety net for everything
 * that slips through (a restart of the service in the middle of a relay, a login screen nobody finished): a helper client
 * that no task owns and that is not waiting for a login is killed.
 */
async function reapAux() {
	if (running.aux || Date.now() < auxLoginUntil) return;
	try {
		if (await auxAlive()) await closeAux();
	} catch {}
}
setInterval(reapAux, 30_000).unref?.();
void reapAux();

/**
 * Relay: the helper client signs in as account `fromId` (which has access), enters the instance and invites the `toIds`
 * accounts from inside it (VRChat only accepts an invite from someone who is in the instance); the helper is closed the
 * moment the invites are out. The main client (the player's game) is never touched, except in mode 'join'.
 *   mode 'invite'  nothing else: the invited accounts accept in their own client
 *   mode 'join'    (one target) the main client is started as that account in the instance
 * The helper does not have to finish loading: it only has to be in the instance as far as VRChat is concerned, which is
 * when the invite is accepted.
 */
export function relayJoin(fromId, toIds, location, mode = 'join') {
	if (running.aux) return Promise.reject(new Error('The helper client is busy'));
	if (!LOCATION_RE.test(location || '')) return Promise.reject(new Error('Not a valid instance location'));
	// the account that enters is never its own target; duplicates collapse
	const targets = [...new Set((Array.isArray(toIds) ? toIds : [toIds]).map(String).filter((t) => t && t !== String(fromId)))];
	if (!targets.length) return Promise.reject(new Error('No target account'));
	if (mode === 'join' && targets.length !== 1) return Promise.reject(new Error('Join relays one account'));
	if (mode === 'join' && running.main) return Promise.reject(new Error('A game launch is already in progress'));
	running.aux = (async () => {
		const users = targets.map((id) => {
			const u = getSession(id)?.user;
			if (!u?.id) throw new Error('A target account is not logged in');
			return { id, userId: u.id, name: u.displayName };
		});
		let invited = [];
		let from = '';
		try {
			let a = await launch(fromId, location, true, 'aux');
			if (a.needLogin) return { needLogin: true, profile: a.profile, client: 'aux' };
			if (!a.join?.launched) throw new Error(`${a.name} could not join the instance: ${a.join?.failed || 'unknown'}`);
			from = a.name;
			const meta = await getWorldMeta(fromId, location.split(':')[0]).catch(() => null);
			// the API learns the new location a moment after the client logs it: retry until the invite is accepted
			let lastError = '';
			let relaunched = false;
			for (let i = 0; i < 120 && invited.length < users.length; i++) {
				if (i) await new Promise((r) => setTimeout(r, 700));
				for (const u of users) {
					if (invited.includes(u.name)) continue;
					const inv = await sendInvite(fromId, u.userId, location, { worldName: meta?.name });
					if (inv.ok) invited.push(u.name);
					else lastError = inv.error;
				}
				// the client died after it was launched (the startup crash): start it once more instead of waiting for nothing
				if (!invited.length && i && i % 12 === 0 && !(await auxAlive())) {
					if (relaunched) break;
					relaunched = true;
					a = await launch(fromId, location, true, 'aux');
					if (a.needLogin) return { needLogin: true, profile: a.profile, client: 'aux' };
					if (!a.join?.launched) break;
					i = 0;
				}
			}
			if (!invited.length) throw new Error(`${a.name} is in the instance but the invite failed: ${lastError || 'the helper client closed'}`);
		} finally {
			// the task is over, whatever the outcome: the helper goes at once (a login screen left for the user is the one exception)
			if (Date.now() >= auxLoginUntil) await closeAux().catch(() => {});
		}
		const missed = users.filter((u) => !invited.includes(u.name)).map((u) => u.name);
		if (mode === 'invite') return { from, invited, missed };
		// join: the player's main client starts as the invited account
		if (running.main) throw new Error(`${invited[0]} was invited by ${from}, but a game launch is already in progress: join from the invite`);
		running.main = launch(targets[0], location, false, 'main').finally(() => (running.main = null));
		const b = await running.main;
		if (b.needLogin) return { needLogin: true, profile: b.profile, from, invited, client: 'main' };
		return { from, to: b.name, invited, join: b.join };
	})().finally(() => (running.aux = null));
	return running.aux;
}
