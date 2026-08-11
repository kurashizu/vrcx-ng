<script>
	import {
		friendsData,
		filteredFriends,
		friendSearch,
		friendGroupFilter,
		friendAccountFilter
	} from '$lib/stores/friends.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { timeAgo } from '$lib/shared/format.js';
	import { showContextMenu } from '$lib/stores/contextMenu.js';
	import { openUserDetail as openUserDetailPanel } from '$lib/stores/userDetail.js';
	import { openWorldDetail } from '$lib/stores/worldDetail.js';
	import { toasts } from '$lib/stores/toast.js';
	import { trustColor, vrcLaunchUrl } from '$lib/shared/trust.js';
	import { parseLocation as parseFullLocation, accessTypeLabel, accessTypeColor, regionOf } from '$lib/shared/location.js';
	import { settings } from '$lib/stores/settings.js';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	// View options
	let viewMode = $state('smart'); // 'smart' | 'flat' | 'instance' | 'world' | 'group'
	let sortBy = $state('displayName'); // 'displayName' | 'lastSeen' | 'platform' | 'status'
	let sortDir = $state('asc');
	let statusFilter = $state(''); // '' | 'join me' | 'active' | 'busy' | 'ask me'

	// Collapsed sections
	let collapsed = $state({
		self: false,
		sameInstance: false,
		favGroups: {}, // groupName -> boolean
		online: {},
		active: {},
		offline: {},
		vrchatGroups: {}
	});

	// Friend group data (populated from /api/friend-groups)
	let friendGroups = $state([]);
	let friendGroupMembers = $state({}); // groupName -> [userIds]

	async function loadFriendGroups() {
		try {
			const r = await fetch('/api/friend-groups');
			const j = await r.json();
			friendGroups = j.groups || [];
			const members = {};
			for (const g of friendGroups) {
				members[g.name] = (j.members?.[g.name] || []).map((m) => m.userId);
			}
			friendGroupMembers = members;
		} catch (err) {
			console.error('load friend groups', err);
		}
	}

	$effect(() => {
		if (browser) loadFriendGroups();
	});

	function toggleSection(key, subKey) {
		if (subKey !== undefined) {
			collapsed[key][subKey] = !collapsed[key][subKey];
			collapsed = { ...collapsed }; // trigger reactivity
		} else {
			collapsed[key] = !collapsed[key];
			collapsed = { ...collapsed };
		}
	}

	function isCollapsed(key, subKey) {
		if (subKey !== undefined) return !!collapsed[key]?.[subKey];
		return !!collapsed[key];
	}

	function trustClass(f) {
		if (!$settings['ui.trustColors']) return '';
		return trustColor(f) || '';
	}

	function platformIcon(platform) {
		const p = String(platform || '').toLowerCase();
		const map = {
			standalonewindows: '🖥️',
			android: '📱',
			ios: '📱',
			web: '🌐'
		};
		return map[p] || '';
	}

	const STATUS_ICON = {
		active: '🔵',
		online: '🟢',
		'join me': '🟢',
		busy: '🔴',
		'ask me': '🟡',
		offline: '⚫'
	};

	function statusPillClass(s) {
		return `status-pill status-${(s || 'offline').replace(/\s+/g, '-')}`;
	}

	function accountLabel(id) {
		const a = $accounts.find((x) => x.id === id);
		return a?.displayName || id.slice(0, 6);
	}

	/**
	 * Display label for a friend's current location.
	 * Priority: cached worldName > truncated worldId.
	 */
	function displayWorld(f, showInstance = false) {
		if (!f) return '未知世界';
		const loc = f.location || '';
		if (loc === 'private') return 'Private World';
		if (!loc || loc === 'offline') return '';
		const parsed = parseFullLocation(loc);
		if (!parsed.worldId) return '未知世界';
		const shortId =
			parsed.worldId.length > 16
				? parsed.worldId.slice(0, 8) + '…' + parsed.worldId.slice(-4)
				: parsed.worldId;
		const label = f.worldName || shortId;
		if (!showInstance) return label;
		const instLabel = shortInstanceLabel(parsed);
		return instLabel ? `${label} · ${instLabel}` : label;
	}

	function parseLocation(loc) {
		// Use the detailed VRCX-style parser from shared location util.
		const full = parseFullLocation(loc);
		if (!full.isRealInstance) return null;
		const [worldId, instanceId] = loc.split(':');
		return { worldId, instanceId: instanceId || '0' };
	}

	function instanceChip(loc) {
		const full = parseFullLocation(loc);
		if (!full.isRealInstance) return null;
		const lbl = accessTypeLabel(full.accessTypeLabel);
		if (!lbl || full.accessType === 'public') return null;
		const region = regionOf(full);
		return {
			label: lbl,
			colorClass: accessTypeColor(full.accessTypeLabel),
			region: region ? region.toUpperCase() : ''
		};
	}

	function launchVrc(location) {
		const u = vrcLaunchUrl(location);
		if (!u) {
			toasts.error('无法生成启动链接');
			return;
		}
		if (browser) window.location.href = u;
	}

	function clickWorld(f, e) {
		if (e) e.stopPropagation();
		if (!f.location || f.location === 'offline' || f.location === 'private') return;
		// Open world detail dialog (with vrc:// launch inside)
		openWorldDetail(f.worldId || parseLocation(f.location)?.worldId, f.accountIds?.[0]);
	}

	/**
	 * Build menu items for a friend (right-click or context menu).
	 * @param {object} f
	 * @param {string} defaultAccountId
	 */
	function buildMenu(f, defaultAccountId) {
		const isOnline =
			f.state === 'online' && f.location && f.location !== 'offline' && f.location !== 'private';
		const acctList = $accounts.filter((a) => a.loggedIn && f.accountIds.includes(a.id));

		// If friend is in multiple accounts, sub-menus let you pick which to act as
		const inviteItems = acctList.length > 1
			? acctList.map((a) => ({
					icon: '✉️',
					label: `以 ${a.displayName} 邀请`,
					action: () => doAction(a.id, 'requestInvite', f.id)
				}))
			: [
					{
						icon: '✉️',
						label: '请求加入 TA 的实例',
						disabled: !isOnline,
						action: () => doAction(defaultAccountId, 'requestInvite', f.id)
					}
				];

		const muteItems = acctList.length > 1
			? acctList.map((a) => ({
					icon: '🔕',
					label: `以 ${a.displayName} 静音`,
					action: () => doAction(a.id, 'mute', f.id)
				}))
			: [
					{
						icon: '🔕',
						label: '静音',
						action: () => doAction(defaultAccountId, 'mute', f.id)
					}
				];

		const blockItems = acctList.length > 1
			? acctList.map((a) => ({
					icon: '🚫',
					label: `以 ${a.displayName} 屏蔽`,
					danger: true,
					action: () => doAction(a.id, 'block', f.id)
				}))
			: [
					{
						icon: '🚫',
						label: '屏蔽',
						danger: true,
						action: () => doAction(defaultAccountId, 'block', f.id)
					}
				];

		const groupItems = friendGroups.map((g) => ({
			icon: '👥',
			label: friendGroupMembers[g.name]?.includes(f.id)
				? `移出 "${g.displayName}"`
				: `加入 "${g.displayName}"`,
			action: () => toggleGroup(g.name, f.id)
		}));

		return [
			{ icon: '👤', label: '查看详情', action: () => openUserDetailPanel(f.accountIds, f.id, f.displayName) },
			{ divider: true },
			...inviteItems,
			{ icon: '🔗', label: '复制实例链接', disabled: !isOnline, action: () => copyInstanceLink(f) },
			{ divider: true },
			...muteItems,
			...blockItems,
			{ divider: true },
			{ icon: '👥', label: '分组…', sub: groupItems },
			{ divider: true },
			{ icon: '📋', label: '复制显示名', action: () => copyText(f.displayName || f.id) },
			{ icon: '🆔', label: '复制用户 ID', action: () => copyText(f.id) },
			{
				icon: '🌐',
				label: '在浏览器中打开主页',
				action: () => browser && window.open(`https://vrchat.com/home/user/${f.id}`, '_blank')
			}
		];
	}

	async function doAction(accountId, act, userId) {
		if (act === 'block' && !confirm(`确定屏蔽该用户?`)) return;
		const r = await fetch(`/api/accounts/${accountId}/actions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: act, userId })
		});
		const j = await r.json();
		j.ok ? toasts.success('操作成功') : toasts.error(j.error || '失败');
	}

	async function toggleGroup(groupName, userId) {
		const isMember = friendGroupMembers[groupName]?.includes(userId);
		await fetch('/api/friend-groups', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: isMember ? 'removeMember' : 'addMember',
				groupName,
				userId
			})
		});
		await loadFriendGroups();
		toasts.success(isMember ? '已移出分组' : '已加入分组');
	}

	function copyInstanceLink(f) {
		const [worldId, instanceId] = (f.location || '').split(':');
		const url = `https://vrchat.com/home/launch?worldId=${encodeURIComponent(worldId || '')}&instanceId=${encodeURIComponent(instanceId || '')}`;
		navigator.clipboard.writeText(url).then(() => toasts.success('已复制'), () => toasts.error('复制失败'));
	}

	function copyText(s) {
		if (!s || !browser) return;
		navigator.clipboard.writeText(s).then(() => toasts.success('已复制'), () => toasts.error('复制失败'));
	}

	function onContextMenu(e, f) {
		e.preventDefault();
		const defaultAccountId = f.accountIds[0] || $accounts[0]?.id;
		const items = buildMenu(f, defaultAccountId);
		showContextMenu({
			x: e.clientX,
			y: e.clientY,
			data: { ...f, _accountId: defaultAccountId },
			items
		});
	}

	function openDetail(f) {
		if (!f?.id) return;
		openUserDetailPanel(f.accountIds, f.id, f.displayName);
	}

	/**
	 * Sort comparator. Private friends are always pushed to the end (within
	 * their natural sort position) so they're easier to ignore.
	 */
	function sortFn(a, b) {
		// Tie-breaker: private always at the bottom regardless of sort key
		const aPriv = a.location === 'private' ? 1 : 0;
		const bPriv = b.location === 'private' ? 1 : 0;
		if (aPriv !== bPriv) return aPriv - bPriv;

		const dir = sortDir === 'asc' ? 1 : -1;
		const key = sortBy;
		if (key === 'lastSeen') {
			return ((a.lastSeen || 0) - (b.lastSeen || 0)) * dir;
		}
		if (key === 'platform') {
			return String(a.platform || '').localeCompare(String(b.platform || '')) * dir;
		}
		if (key === 'status') {
			const order = { active: 0, 'join me': 1, busy: 2, 'ask me': 3, offline: 4 };
			return ((order[a.status] ?? 9) - (order[b.status] ?? 9)) * dir;
		}
		// default: displayName
		return String(a.displayName || '').localeCompare(String(b.displayName || '')) * dir;
	}

	// Apply status + search + sort
	function prepareList(list) {
		let out = list.slice();
		if (statusFilter) out = out.filter((f) => f.status === statusFilter);
		if ($friendSearch) {
			const q = $friendSearch.toLowerCase();
			out = out.filter((f) =>
				String(f.displayName || '').toLowerCase().includes(q) ||
				String(f.location || '').toLowerCase().includes(q) ||
				String(f.worldName || '').toLowerCase().includes(q) ||
				String(f.id || '').toLowerCase().includes(q)
			);
		}
		if ($friendAccountFilter) {
			out = out.filter((f) => f.accountIds.includes($friendAccountFilter));
		}
		out.sort(sortFn);
		return out;
	}

	/**
	 * Group online friends per the current viewMode.
	 *
	 *  - 'smart':   group by instance (same instance as sub-group)
	 *  - 'flat':    no grouping
	 *  - 'instance': group by instance (wrld:inst)
	 *  - 'world':   group by world, with instance as sub-group
	 *  - 'group':   group by VRChat friend group
	 *
	 * Returns array of { key, label, worldName, worldId, location, count, friends, subGroups? }
	 * sorted by friend count descending.
	 */
	function groupOnline(list) {
		if (viewMode === 'flat') return null;

		if (viewMode === 'group') {
			// First group by friend group, then by status within
			const buckets = new Map();
			const ungrouped = [];
			for (const f of list) {
				const g = f.groupName;
				if (g) {
					if (!buckets.has(g)) buckets.set(g, []);
					buckets.get(g).push(f);
				} else {
					ungrouped.push(f);
				}
			}
			const out = [];
			for (const [gName, friends] of buckets) {
				const gMeta = friendGroups.find((g) => g.name === gName);
				out.push({
					key: `group:${gName}`,
					label: gMeta?.displayName || gName,
					color: gMeta?.color,
					isGroup: true,
					friends,
					count: friends.length
				});
			}
			if (ungrouped.length) {
				out.push({
					key: 'group:ungrouped',
					label: '未分组',
					isGroup: true,
					friends: ungrouped,
					count: ungrouped.length
				});
			}
			// Private sub-group always last
			return out.sort((a, b) => {
				const aPriv = a.key === 'group:ungrouped' && a.friends.every((f) => f.location === 'private');
				const bPriv = b.key === 'group:ungrouped' && b.friends.every((f) => f.location === 'private');
				if (aPriv !== bPriv) return aPriv ? 1 : -1;
				return b.count - a.count;
			});
		}

		// instance/world/smart grouping
		const groups = new Map();
		for (const f of list) {
			const loc = f.location || '';
			if (!loc || loc === 'offline' || loc === 'private') {
				if (!groups.has('private')) {
					groups.set('private', {
						key: 'private',
						label: 'Private / Unknown',
						friends: [],
						count: 0
					});
				}
				groups.get('private').friends.push(f);
				groups.get('private').count++;
				continue;
			}
			const parsed = parseLocation(loc);
			if (!parsed) continue;

			let topKey, subKey = null;
			if (viewMode === 'instance') {
				topKey = loc; // full instance id
			} else if (viewMode === 'world') {
				topKey = parsed.worldId;
				subKey = loc;
			} else {
				// 'smart': top-level = world; if 1 friend, no sub-header needed; if >1, sub-group by instance
				topKey = parsed.worldId;
				subKey = loc;
			}

			if (!groups.has(topKey)) {
				groups.set(topKey, {
					key: topKey,
					label: f.worldName || shortWorldId(parsed.worldId),
					worldId: parsed.worldId,
					location: loc,
					friends: [],
					count: 0,
					subGroups: new Map()
				});
			}
			const g = groups.get(topKey);
			g.friends.push(f);
			g.count++;
			if (subKey && subKey !== topKey) {
				const subParsed = parseFullLocation(subKey);
				const subLabel = shortInstanceLabel(subParsed) || '实例';
				if (!g.subGroups.has(subKey)) {
					g.subGroups.set(subKey, {
						key: subKey,
						label: subLabel,
						location: subKey,
						friends: [],
						count: 0
					});
				}
				g.subGroups.get(subKey).friends.push(f);
				g.subGroups.get(subKey).count++;
			}
		}

		const out = [];
		for (const g of groups.values()) {
			if (viewMode === 'world' || viewMode === 'smart') {
				// Convert subGroups Map to sorted array
				const subs = g.subGroups && g.subGroups.size > 1
					? Array.from(g.subGroups.values()).sort((a, b) => b.count - a.count)
					: null;
				out.push({
					key: g.key,
					label: g.label,
					worldId: g.worldId,
					location: g.location,
					friends: viewMode === 'world' ? null : g.friends,
					subGroups: subs,
					count: g.count
				});
			} else {
				out.push({
					key: g.key,
					label: g.label,
					worldId: g.worldId,
					location: g.location,
					friends: g.friends,
					subGroups: null,
					count: g.count
				});
			}
		}
		// 'Private / Unknown' bucket always last, others by friend count desc
		return out.sort((a, b) => {
			const aPriv = a.key === 'private';
			const bPriv = b.key === 'private';
			if (aPriv !== bPriv) return aPriv ? 1 : -1;
			return b.count - a.count;
		});
	}

	function shortWorldId(wid) {
		if (!wid) return '';
		return wid.length > 16 ? wid.slice(0, 8) + '…' + wid.slice(-4) : wid;
	}

	// "Same instance" section: friends in the same world/instance as one of our accounts
	const sameInstanceFriends = $derived.by(() => {
		const self = $friendsData.self || [];
		if (!self.length) return [];
		const locSet = new Set(self.map((s) => s.location).filter(Boolean));
		if (!locSet.size) return [];
		const out = [];
		for (const f of [...$friendsData.online, ...$friendsData.active]) {
			if (f.location && locSet.has(f.location)) {
				out.push(f);
			}
		}
		return out;
	});

	// VIPs = friends in any visible friend group
	const vipFriends = $derived.by(() => {
		const inAnyGroup = new Set();
		for (const g of friendGroups) {
			if (!g.visible) continue;
			for (const uid of friendGroupMembers[g.name] || []) inAnyGroup.add(uid);
		}
		return [...$friendsData.online].filter((f) => inAnyGroup.has(f.id));
	});

	// Friendly tabs
	const VIEW_TABS = [
		{ id: 'smart', label: '智能', icon: '✨' },
		{ id: 'flat', label: '平铺', icon: '☰' },
		{ id: 'instance', label: '实例', icon: '🧩' },
		{ id: 'world', label: '世界', icon: '🌍' },
		{ id: 'group', label: '分组', icon: '👥' }
	];

	// Status filter chips. 🟢=在线 (no special status, just online) and 🔵=加入我 (join me).
	const STATUS_FILTERS = [
		{ id: '', label: '全部' },
		{ id: 'online', label: '🟢 在线' },
		{ id: 'join me', label: '🔵 加入我' },
		{ id: 'active', label: '🟣 活跃' },
		{ id: 'ask me', label: '🟡 询问我' },
		{ id: 'busy', label: '🔴 忙碌' }
	];

	const SORT_OPTIONS = [
		{ id: 'displayName', label: '名字' },
		{ id: 'lastSeen', label: '最后在线' },
		{ id: 'platform', label: '平台' },
		{ id: 'status', label: '状态' }
	];

	// Prepared lists
	const onlineList = $derived(prepareList($filteredFriends.online));
	const activeList = $derived(prepareList($filteredFriends.active));
	const offlineList = $derived(prepareList($filteredFriends.offline));
	const onlineGroups = $derived(groupOnline(onlineList));
	const vipGroups = $derived(
		viewMode === 'group'
			? null
			: (() => {
					// group VIPs by their friend group
					const buckets = new Map();
					for (const f of vipFriends) {
						const g = f.groupName;
						if (!g) continue;
						if (!buckets.has(g)) buckets.set(g, []);
						buckets.get(g).push(f);
					}
					const out = [];
					for (const [gn, fs] of buckets) {
						const g = friendGroups.find((x) => x.name === gn);
						if (!g) continue;
						out.push({
							key: `vip:${gn}`,
							label: `⭐ ${g.displayName}`,
							color: g.color,
							isVip: true,
							friends: fs,
							count: fs.length
						});
					}
					return out.sort((a, b) => b.count - a.count);
				})()
	);
</script>

{#snippet friendRow(f, groupLabel)}
	<div
		class="friend {f.state}"
		class:has-group={!!groupLabel}
		oncontextmenu={(e) => onContextMenu(e, f)}
		onclick={() => openDetail(f)}
		role="button"
		tabindex="0"
		onkeydown={(e) => { if (e.key === 'Enter') openDetail(f); }}
	>
		<div class="avatar">
			{#if f.currentAvatarThumbnailImageUrl}
				<img src={f.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
			{:else}
				<span>{f.displayName.slice(0, 1).toUpperCase()}</span>
			{/if}
			<span class="state {f.state}" title={f.state}></span>
		</div>
		<div class="info">
			<div class="name-row">
				<span class="name {trustClass(f)}">{f.displayName}</span>
				<span class="platform" title={f.platform}>{platformIcon(f.platform)}</span>
				{#if f.status && STATUS_ICON[f.status]}
					<span class={statusPillClass(f.status)}>{STATUS_ICON[f.status]} {f.status}</span>
				{/if}
				{#if f.state === 'online' && f.location && f.location !== 'offline' && f.location !== 'private'}
					<button
						class="launch"
						title="在 VRChat 中打开实例"
						onclick={(e) => { e.stopPropagation(); launchVrc(f.location); }}
					>↗</button>
				{/if}
			</div>
			<div class="sub" title={f.location || ''}>
				{#if f.state === 'online' && f.location && f.location !== 'offline' && f.location !== 'private'}
					{@const parsed = parseFullLocation(f.location)}
					{@const chip = instanceChip(f.location)}
					<button class="world-link" onclick={(e) => clickWorld(f, e)} title={parsed.shortName || f.worldName || parsed.worldId}>
						{f.worldName || shortWorldId(parsed.worldId)}
					</button>
					{#if chip}
						<span class="at-badge {chip.colorClass}" title="访问类型">{chip.label}</span>
						{#if chip.region}
							<span class="region-tag" title="区域">{chip.region}</span>
						{/if}
					{/if}
					{#if $settings['ui.showInstanceId']}
						<span class="inst-detail" title={f.location}>{shortInstanceLabel(parsed)}</span>
					{/if}
				{:else if f.state === 'active'}
					<span class="muted">在 VRChat 桌面客户端中</span>
				{:else}
					<span class="muted">{f.lastSeen ? `${timeAgo(new Date(f.lastSeen).toISOString())} 离线` : '离线'}</span>
				{/if}
			</div>
			<div class="meta">
				{#if f.accountIds.length > 0}
					<span class="via" title={f.accountIds.map(accountLabel).join(', ')}>
						via {f.accountIds.map(accountLabel).join(', ')}
					</span>
				{/if}
				{#if f.groupName}
					{@const gMeta = friendGroups.find((g) => g.name === f.groupName)}
					{#if gMeta}
						<span class="grp" style:--g-color={gMeta.color}>{gMeta.displayName}</span>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/snippet}

<aside class="friend-list">
	<header>
		<div class="title">
			<span>好友 ({$friendsData.total})</span>
			<span class="counts">
				{#if true}
					{@const joinMeCount = [...$friendsData.online, ...$friendsData.active].filter((f) => f.status === 'join me').length}
					<span class="dot online" title="在线 {$friendsData.online.length}"></span>
					<span class="dot joinme" title="加入我 {joinMeCount}"></span>
					<span class="dot offline" title="离线 {$friendsData.offline.length}"></span>
				{/if}
			</span>
		</div>
	</header>

	<div class="filters">
		<input
			type="search"
			placeholder="搜索好友、世界、ID…"
			bind:value={$friendSearch}
			class="search"
		/>

		<div class="status-row">
			{#each STATUS_FILTERS as sf}
				<button
					class="chip"
					class:on={statusFilter === sf.id}
					onclick={() => (statusFilter = sf.id)}
				>
					{sf.label}
				</button>
			{/each}
		</div>

		<div class="view-tabs">
			{#each VIEW_TABS as t}
				<button
					class="view-tab"
					class:on={viewMode === t.id}
					title={t.label}
					onclick={() => (viewMode = t.id)}
				>
					<span class="ico">{t.icon}</span>
				</button>
			{/each}
			<select bind:value={sortBy} class="sort-sel" title="排序方式">
				{#each SORT_OPTIONS as s}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
			<button class="dir" onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')} title="方向">
				{sortDir === 'asc' ? '↑' : '↓'}
			</button>
		</div>

		{#if $accounts.length > 1}
			<select bind:value={$friendAccountFilter} class="account-select">
				<option value={null}>所有账号</option>
				{#each $accounts as a (a.id)}
					<option value={a.id}>{a.displayName}</option>
				{/each}
			</select>
		{/if}
	</div>

	<div class="groups">
		<!-- 1. Self -->
		{#if ($friendsData.self || []).length > 0}
			<section class="group self">
				<header onclick={() => toggleSection('self')} role="button" tabindex="0">
					<span class="chev" class:open={!collapsed.self}>▸</span>
					<span>自己 ({$friendsData.self.length})</span>
				</header>
				{#if !collapsed.self}
					{#each $friendsData.self as me}
						<div class="me-row">
							<div class="me-name">{me.displayName}</div>
							<button class="world-link" onclick={() => openWorldDetail(me.location?.split(':')[0])}>
								{me.location}
							</button>
						</div>
					{/each}
				{/if}
			</section>
		{/if}

		<!-- 2. Same instance (when we're in one) -->
		{#if sameInstanceFriends.length > 0}
			<section class="group same-instance">
				<header onclick={() => toggleSection('sameInstance')} role="button" tabindex="0">
					<span class="chev" class:open={!collapsed.sameInstance}>▸</span>
					<span>🧩 同实例 ({sameInstanceFriends.length})</span>
				</header>
				{#if !collapsed.sameInstance}
					{#each sameInstanceFriends as f (f.id)}
						{@render friendRow(f, '同实例')}
					{/each}
				{/if}
			</section>
		{/if}

		<!-- 3. VIP (friend group members who are online) -->
		{#if viewMode !== 'group' && vipGroups && vipGroups.length > 0}
			{#each vipGroups as g (g.key)}
				<section class="group vip" style:--g-color={g.color}>
					<header onclick={() => toggleSection('vipGroups', g.key)} role="button" tabindex="0">
						<span class="chev" class:open={!isCollapsed('vipGroups', g.key)}>▸</span>
						<span>{g.label} ({g.count})</span>
					</header>
					{#if !isCollapsed('vipGroups', g.key)}
						{#each g.friends as f (f.id)}
							{@render friendRow(f, g.label)}
						{/each}
					{/if}
				</section>
			{/each}
		{/if}

		<!-- 4. Online (with grouping) -->
		{#if onlineList.length > 0}
			{#if onlineGroups && viewMode !== 'flat'}
				{#each onlineGroups as g (g.key)}
					<section class="group online-group">
						<header
							style:--g-color={g.color || ''}
							onclick={() => toggleSection('online', g.key)}
							role="button"
							tabindex="0"
						>
							<span class="chev" class:open={!isCollapsed('online', g.key)}>▸</span>
							<span class="dot online"></span>
							{#if g.isGroup}
								<span class="g-name">{g.label} ({g.count})</span>
							{:else}
								<button
									class="g-name world-link"
									onclick={(e) => { e.stopPropagation(); if (g.worldId) openWorldDetail(g.worldId); }}
									title={g.label}
								>
									{g.label} ({g.count})
								</button>
								{#if g.location}
									{@const gchip = instanceChip(g.location)}
									{#if gchip}
										<span class="at-badge {gchip.colorClass}">{gchip.label}</span>
										{#if gchip.region}<span class="region-tag">{gchip.region}</span>{/if}
									{/if}
								{/if}
								{#if g.location && g.location !== 'private'}
									<button class="launch-mini" title="加入该实例" onclick={(e) => { e.stopPropagation(); launchVrc(g.location); }}>↗</button>
								{/if}
							{/if}
						</header>
						{#if !isCollapsed('online', g.key)}
							{#if g.subGroups}
								<!-- World mode: render sub-groups (per instance) inside this world -->
								{#each g.subGroups as sg (sg.key)}
									{@const sgchip = instanceChip(sg.location)}
									<div class="sub-group">
										<div class="sub-header">
											<span class="dot online small"></span>
											<span class="sg-label">{sg.label} ({sg.count})</span>
											{#if sgchip}
												<span class="at-badge {sgchip.colorClass}">{sgchip.label}</span>
												{#if sgchip.region}<span class="region-tag">{sgchip.region}</span>{/if}
											{/if}
											<button class="launch-mini" title="加入" onclick={() => launchVrc(sg.location)}>↗</button>
										</div>
										{#each sg.friends as f (f.id)}
											{@render friendRow(f, sg.label)}
										{/each}
									</div>
								{/each}
							{:else if g.friends}
								{#each g.friends as f (f.id)}
									{@render friendRow(f, g.label)}
								{/each}
							{/if}
						{/if}
					</section>
				{/each}
			{:else}
				<!-- Flat online list -->
				<section class="group online-group">
					<header onclick={() => toggleSection('online', 'flat')} role="button" tabindex="0">
						<span class="chev" class:open={!isCollapsed('online', 'flat')}>▸</span>
						<span class="dot online"></span>
						<span>在线 ({onlineList.length})</span>
					</header>
					{#if !isCollapsed('online', 'flat')}
						{#each onlineList as f (f.id)}
							{@render friendRow(f)}
						{/each}
					{/if}
				</section>
			{/if}
		{/if}

		<!-- 5. Active -->
		{#if activeList.length > 0}
			<section class="group">
				<header onclick={() => toggleSection('active', 'all')} role="button" tabindex="0">
					<span class="chev" class:open={!isCollapsed('active', 'all')}>▸</span>
					<span class="dot active"></span>
					<span>Active ({activeList.length})</span>
				</header>
				{#if !isCollapsed('active', 'all')}
					{#each activeList as f (f.id)}
						{@render friendRow(f)}
					{/each}
				{/if}
			</section>
		{/if}

		<!-- 6. Offline -->
		{#if offlineList.length > 0}
			<section class="group">
				<header onclick={() => toggleSection('offline', 'all')} role="button" tabindex="0">
					<span class="chev" class:open={!isCollapsed('offline', 'all')}>▸</span>
					<span class="dot offline"></span>
					<span>离线 ({offlineList.length})</span>
				</header>
				{#if !isCollapsed('offline', 'all')}
					{#each offlineList.slice(0, 200) as f (f.id)}
						{@render friendRow(f)}
					{/each}
					{#if offlineList.length > 200}
						<div class="more">还有 {offlineList.length - 200} 个离线好友，按 ↑↓ 排序调整</div>
					{/if}
				{/if}
			</section>
		{/if}

		{#if $friendsData.total === 0}
			<div class="empty">
				<p>好友列表为空</p>
				<p class="muted small">
					登录账号后会自动拉取好友列表。拉取后会在此显示，包括在线状态和所在世界。
				</p>
			</div>
		{:else if onlineList.length === 0 && activeList.length === 0 && offlineList.length === 0}
			<div class="empty">
				<p class="muted">没有匹配的好友</p>
			</div>
		{/if}
	</div>
</aside>

<style>
	.friend-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-1);
		border-left: 1px solid var(--border);
		min-height: 0;
	}
	header {
		padding: 14px 14px 8px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}
	.counts {
		display: flex;
		gap: 4px;
		align-items: center;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-faint);
	}
	.counts .dot {
		margin-left: 6px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--offline);
		display: inline-block;
	}
	.dot.online {
		background: var(--online);
	}
	.dot.active {
		background: var(--active);
	}
	.dot.joinme {
		background: var(--joinme, #6cb6ff);
	}
	.dot.small {
		width: 6px;
		height: 6px;
	}
	.filters {
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-bottom: 1px solid var(--border);
	}
	.search {
		font-size: 12px;
		padding: 6px 8px;
	}
	.status-row {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.chip {
		font-size: 11px;
		padding: 3px 8px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-dim);
	}
	.chip.on {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	.view-tabs {
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--bg-2);
		border-radius: 8px;
		align-items: center;
	}
	.view-tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px 6px;
		font-size: 12px;
		background: transparent;
		border: none;
		color: var(--text-dim);
		border-radius: 6px;
	}
	.view-tab.on {
		background: var(--accent);
		color: white;
	}
	.sort-sel {
		flex: 0 0 auto;
		font-size: 11px;
		padding: 3px 6px;
		width: auto;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.dir {
		padding: 3px 8px;
		font-size: 12px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-dim);
	}
	.account-select {
		font-size: 12px;
		padding: 4px 8px;
	}
	.groups {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0 20px;
	}
	.group {
		margin-bottom: 2px;
	}
	.group > header {
		padding: 6px 14px 4px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		user-select: none;
		border-bottom: none;
	}
	.group > header:hover {
		background: var(--bg-2);
		color: var(--text-dim);
	}
	.chev {
		display: inline-block;
		font-size: 9px;
		transition: transform 0.15s;
		color: var(--text-faint);
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.group .g-name {
		flex: 1;
		font-size: 12px;
		color: var(--text-dim);
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		text-align: left;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.group .g-name:hover {
		color: var(--text);
		text-decoration: underline;
	}
	.sub-group {
		margin: 4px 0 8px 14px;
		padding-left: 8px;
		border-left: 2px solid var(--border);
	}
	.sub-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		font-size: 11px;
		color: var(--text-faint);
		min-width: 0;
	}
	.sg-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 0 1 auto;
		max-width: 100%;
	}
	.online-group > header {
		color: var(--online);
	}
	.vip > header {
		color: var(--g-color, var(--text-dim));
	}
	.me-row {
		display: flex;
		gap: 8px;
		padding: 6px 14px;
		font-size: 12px;
	}
	.me-name {
		color: var(--text);
	}
	.world-link {
		font: inherit;
		color: var(--text);
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.world-link:hover {
		color: var(--accent);
		text-decoration: underline;
	}
	.friend {
		display: flex;
		gap: 10px;
		padding: 8px 14px;
		cursor: pointer;
		transition: background 0.1s;
	}
	.friend:hover {
		background: var(--bg-2);
	}
	.friend:focus-visible {
		background: rgba(124, 92, 255, 0.12);
		outline: none;
	}
	.friend.has-group {
		padding-left: 20px;
	}
	.avatar {
		position: relative;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-dim);
		font-weight: 600;
		flex-shrink: 0;
		overflow: hidden;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.state {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--bg-1);
	}
	.state.online {
		background: var(--online);
	}
	.state.active {
		background: var(--active);
	}
	.state.offline {
		background: var(--offline);
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.name-row {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 13px;
	}
	.name {
		font-weight: 600;
		color: var(--text);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.platform {
		font-size: 12px;
	}
	.status-pill {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 8px;
		background: var(--bg-3);
		color: var(--text-dim);
	}
	.status-pill.status-join-me {
		background: rgba(61, 220, 151, 0.15);
		color: var(--online);
	}
	.status-pill.status-active {
		background: rgba(31, 184, 255, 0.15);
		color: var(--active);
	}
	.status-pill.status-busy {
		background: rgba(255, 93, 108, 0.15);
		color: var(--danger);
	}
	.status-pill.status-ask-me {
		background: rgba(255, 180, 84, 0.15);
		color: var(--warn);
	}
	.at-badge {
		display: inline-block;
		padding: 0 6px;
		font-size: 10px;
		font-weight: 600;
		border-radius: 6px;
		background: var(--bg-3);
		color: var(--text-dim);
		border: 1px solid var(--border);
		margin-left: 4px;
		vertical-align: middle;
	}
	.at-badge.at-public { background: rgba(61, 220, 151, 0.15); color: var(--online); border-color: rgba(61, 220, 151, 0.3); }
	.at-badge.at-invite { background: rgba(255, 180, 84, 0.15); color: var(--warn); border-color: rgba(255, 180, 84, 0.3); }
	.at-badge.at-invite-plus { background: rgba(255, 140, 80, 0.18); color: #ff8c50; border-color: rgba(255, 140, 80, 0.35); }
	.at-badge.at-friends { background: rgba(124, 92, 255, 0.15); color: var(--accent); border-color: rgba(124, 92, 255, 0.3); }
	.at-badge.at-friends-plus { background: rgba(178, 124, 255, 0.15); color: #b27cff; border-color: rgba(178, 124, 255, 0.3); }
	.at-badge.at-group,
	.at-badge.at-groupPublic,
	.at-badge.at-groupPlus { background: rgba(31, 184, 255, 0.15); color: var(--active); border-color: rgba(31, 184, 255, 0.3); }
	.region-tag {
		display: inline-block;
		padding: 0 5px;
		font-size: 10px;
		font-weight: 700;
		border-radius: 5px;
		background: var(--bg-3);
		color: var(--text-dim);
		margin-left: 3px;
		vertical-align: middle;
		letter-spacing: 0.05em;
	}
	.launch,
	.launch-mini {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-dim);
		padding: 0;
		cursor: pointer;
		border-radius: 5px;
		font-size: 11px;
	}
	.launch {
		width: 20px;
		height: 20px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.launch-mini {
		width: 20px;
		height: 20px;
	}
	.launch:hover,
	.launch-mini:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: white;
	}
	.sub {
		font-size: 12px;
		color: var(--text-dim);
		min-width: 0;
		margin-top: 3px;
		display: flex;
		align-items: center;
		gap: 5px;
		flex-wrap: wrap;
		max-width: 100%;
		overflow: hidden;
	}
	.sub > .world-link {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		max-width: 100%;
		flex: 0 1 auto;
	}
	.sub > .at-badge,
	.sub > .region-tag,
	.sub > .inst-detail {
		flex: 0 0 auto;
	}
	.inst-detail {
		font-size: 11px;
		color: var(--text-faint);
		padding: 0 5px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 5px;
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 10px;
		color: var(--text-faint);
		margin-top: 2px;
	}
	.via {
		color: var(--text-dim);
	}
	.grp {
		padding: 1px 6px;
		border-radius: 8px;
		background: var(--g-color, var(--bg-3));
		color: white;
		font-size: 10px;
		font-weight: 600;
	}
	.more {
		padding: 10px 14px;
		font-size: 11px;
		color: var(--text-faint);
		text-align: center;
	}
	.empty {
		padding: 40px 20px;
		text-align: center;
		color: var(--text-dim);
	}
	.muted {
		color: var(--text-dim);
	}
	.small {
		font-size: 11px;
	}
</style>
