/** How a friend's presence is drawn: state (online / active / offline) plus the status they picked in game. */

export const STATUS_COLOR = {
	'join me': 'var(--st-join)',
	active: 'var(--online)',
	'ask me': 'var(--st-ask)',
	busy: 'var(--st-busy)'
};

export const STATUS_LABEL = {
	'join me': '加入我',
	active: '在线',
	'ask me': '询问我',
	busy: '忙碌',
	offline: '离线'
};

/** Dot colour: the status colour while in game, violet for "active", grey offline. */
export function presenceColor(state, status) {
	if (state === 'online') return STATUS_COLOR[status] || 'var(--online)';
	if (state === 'active') return 'var(--active)';
	return 'var(--offline)';
}

export const PLATFORM_LABEL = {
	standalonewindows: 'PC',
	android: 'Quest',
	ios: 'iOS',
	web: 'Web'
};

export const platformLabel = (p) => PLATFORM_LABEL[String(p || '').toLowerCase()] || p || '';
