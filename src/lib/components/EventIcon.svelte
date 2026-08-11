<script>
	/**
	 * @typedef {'Online'|'Offline'|'Active'|'GPS'|'Status'|'Bio'|'Avatar'|'Join'|'Leave'|'FriendRequest'|'Invite'|'Instance.Closed'} FeedType
	 */

	/** @type {{ type: FeedType, size?: number }} */
	let { type, size = 18 } = $props();

	const iconMap = {
		Online: '🟢',
		Offline: '⚫',
		Active: '🔵',
		GPS: '📍',
		Status: '💬',
		Bio: '✏️',
		Avatar: '👤',
		Join: '➡️',
		Leave: '⬅️',
		FriendRequest: '🤝',
		Invite: '✉️',
		'Instance.Closed': '🚪'
	};

	const colorMap = {
		Online: 'var(--online)',
		Offline: 'var(--offline)',
		Active: 'var(--active)',
		GPS: '#ffb454',
		Status: '#1fb8ff',
		Bio: '#7c5cff',
		Avatar: '#ff8ec6',
		Join: 'var(--join)',
		Leave: 'var(--leave)',
		FriendRequest: 'var(--request)',
		Invite: 'var(--request)',
		'Instance.Closed': 'var(--danger)'
	};

	const symbol = $derived(iconMap[type] ?? '•');
	const color = $derived(colorMap[type] ?? 'var(--text-dim)');
</script>

<span
	class="icon"
	style:--c={color}
	style:font-size="{size}px"
	style:width="{size + 6}px"
	style:height="{size + 6}px"
	title={type}
>
	<span class="emoji">{symbol}</span>
</span>

<style>
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: color-mix(in srgb, var(--c) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
		flex-shrink: 0;
	}
	.emoji {
		font-size: 0.9em;
		line-height: 1;
	}
</style>
