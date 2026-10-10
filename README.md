# vrcx-ng

A multi-account VRChat feed aggregator and chatbox relay built on SvelteKit,
modelled on the API usage of [VRCX](https://github.com/vrcx-team/VRCX).

> The name: `VRCX` (Next Generation) — a lightweight, web-only, multi-account
> client built on top of VRCX's API knowledge.

> **Disclaimer**: this project is only an API client / relay and takes no part
> in any VRChat server logic. Follow the [VRChat Terms of Service](https://hello.vrchat.com/legal)
> and do not use this tool to bypass rate limits or anti-cheat measures.

## Features

- **Multi-account management** — add and log in to several VRChat accounts at
  once; passwords are stored locally with AES-256-GCM encryption
- **Live feed** — friend activity of all accounts in one stream:
  - online / offline / active
  - world changes (GPS)
  - status and bio changes
  - avatar switches (with before / after comparison)
  - friend requests, invites, instance closures
  - group events, instance queue joins, notifications v1 / v2
- **Friend list** — the right rail shows online friends by world, by group or
  flat, with a "same instance" section and pinned VIP groups; `/friends` is a
  full-screen grid of the same data. Trust rank colors are shown
- **Context menu** — view details, request invite, invite yourself to their
  instance, copy instance link, mute / block, add to a local group, copy ID,
  open the vrchat.com profile (with several accounts you pick the acting one)
- **Detail dialogs** — user, world and avatar dialogs stack on top of each
  other and unwind one level at a time (Esc closes the top one):
  user (bio / location / avatars / worlds / badges / note / actions), world
  (instance list, invite yourself / friends, ask the owner for an invite,
  create an instance), avatar (wear, favorite)
- **OSC chatbox** — send messages to the VRChat chatbox from the browser (OSC
  encoding is built in, no Python bridge needed). The target address can be
  changed in the UI
- **Invites / requests** — you can always "request invite" for a friend (even
  when they are not in game); you can also attach one of VRChat's 12 preset
  messages, or rewrite one before sending
- **Notification actions** — accept friend requests, invite them to your
  instance, or reply and decline with a preset message right from the
  notification panel; "seen / dismiss" is synced to VRChat (so the game and
  VRCX follow)
- **Notes and favorites** — user notes (VRChat's `userNotes`, also visible in
  game); friends / worlds / avatars can be added to VRChat's own favorite
  groups (shared with the game and VRCX)
- **Friend log** — friend renames and trust rank changes appear in the feed
- **Stats** — `/stats`: online time ranking, sign-on hours, popular worlds
  (computed from the stored feed, so it fills in from the day recording began)
- **Persistence** — SQLite (better-sqlite3): feed history, notifications,
  favorites, groups and settings survive restarts. The feed is pruned by
  "Settings → Feed → History retention" (default 30 days, 0 = forever)
- **Auto sync** — after a pipeline reconnect, and every hour, the friend list
  is fully re-synced (VRChat's websocket occasionally drops events);
  reconnects use exponential backoff from 5 s to 5 min
- **Offline detection** — a friend's Offline event is held back for 170 s
  before it enters the feed; if they come back in that window neither event is
  recorded (same as VRCX, filters out the brief drop while switching instances)

This app is a message display panel: it never launches the VRChat client
(no `vrchat://` links); joining an instance goes through invites.

## Architecture

```
Browser ──SSE──> SvelteKit (Node)
                  │
                  ├── better-sqlite3  (data/vrcx-ng.db)
                  ├── dgram UDP       →  VRChat OSC chatbox
                  │
                  └── WebSocket per account → wss://pipeline.vrchat.cloud
                                              (×N accounts in parallel)
```

After login, for every account:
1. Call `auth/user` with Basic Auth to get the cookie jar
2. Call `auth` to get the pipeline token
3. Open `wss://pipeline.vrchat.cloud/?auth=…`
4. Turn `friend-online/offline/location/update`, `user-location/update`,
   `notification-v2`, `group-*`, `instance-queue-*` and similar events into
   `FeedEntry` objects and push them to every SSE subscriber
5. Write to SQLite as well (feed_events, friends, notifications, world_cache…)

On a cookie 401 the app logs in again with the locally encrypted password.

## Frontend structure

SvelteKit + Svelte 5 (runes), a pure SPA (`ssr = false`), global state with
`svelte/store`. `src/lib` is layered by responsibility:

```
shared/      pure functions: formatting, location parsing, trust rank, feed type registry, presence colors
client/      browser logic: api()/run() request wrappers, actions (copy / self-invite / block…),
             friend grouping and sorting, friend context menu, createResource (async loading with stale guard)
stores/      accounts · friends · feed · settings · notifications · overlay (dialog stack / confirm /
             context menu) · sse (event stream)
components/
  ui/        business-free building blocks: Modal · Avatar · UserName · Place · AccessBadge · StatusPill ·
             Tabs · Section · Toggle · ListRow · Notice · Page · ContextMenu · Toasts · Icon…
  layout/    sidebar, account list and account actions, the dialog host OverlayHost
  friends/   friend rail (FriendRail / FriendRow) and overview card (FriendCard)
  feed/      FeedItem · FeedToolbar
  dialogs/   user / world / avatar details, notifications, invite messages, favorites, invite friends,
             profile editor, login / 2FA
routes/      feed · friends overview · search · stats · moderation · chatbox · settings
```

Conventions: a bare `<button>` is unstyled; use `.btn` (`primary / ghost / danger / sm / xs / icon`)
for the button look; colors, radii and shadows come from the design tokens in `app.css`
(dark and light sets). Icons are inline SVGs from `components/ui/Icon.svelte`
(`<Icon name="user" />`); the UI contains no emoji.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and **at least** replace `ACCOUNT_ENCRYPTION_KEY` with your own
random 32-byte hex string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env` is gitignored, so it never enters version control.

### 3. Run

```bash
# development
npm run dev

# production
npm run build
node build
# => http://0.0.0.0:3333
```

### 4. (Optional) Chatbox OSC target

Defaults to `127.0.0.1:9000` (VRChat on the same machine). Enter a new address
at the top right of the chatbox page and save it; it is stored in the SQLite
`settings` table.

> Note: VRChat only accepts OSC input from the local machine by default. If
> your VRChat runs on another machine, allow it under
> `VRChat → Settings → OSC → Network` and change the chatbox target IP to that
> machine's LAN IP.
>
> **Exposing the OSC listening port to the internet is strongly discouraged.**

## API overview

| Route | Description |
| --- | --- |
| `GET /api/accounts` | List all accounts (without passwords) |
| `POST /api/accounts` | Add an account (password stored encrypted; adding the same username again updates the existing account) |
| `DELETE /api/accounts?id=…` | Remove an account (together with its feed / notifications / favorites in SQLite) |
| `POST /api/accounts/:id/login` | Log in (accepts `twoFactorCode`; recovery codes are formatted to `XXXX-XXXX` automatically) |
| `POST /api/accounts/:id/logout` | Log out |
| `POST /api/accounts/:id/reconnect` | Force a pipeline reconnect and re-sync friends |
| `GET /api/accounts/:id/friends` | Raw friend list of that account (`n` 1–100) |
| `GET /api/accounts/:id/user/:userId` | User details (bio / avatars / worlds / badges, cached 5 min, `?fresh=1` skips the cache) |
| `POST /api/accounts/:id/actions` | mute / unmute / block / unblock / requestInvite (optional `requestSlot`) / invite (optional `messageSlot`) / friendRequest / cancelFriendRequest / unfriend |
| `POST /api/accounts/:id/instance-action` | createInstance / selfInvite / requestInvite |
| `GET /api/accounts/:id/moderations?type=mute\|block` | Currently active mute / block list |
| `POST /api/accounts/:id/profile` | Edit your own bio / bioLinks (`PUT profile/:id`) and status / pronouns (`PUT users/:id`) |
| `GET/PUT /api/accounts/:id/invite-messages?type=message\|request\|response\|requestResponse` | The 12 preset messages (read / edit; an edited slot cools down for about 60 minutes) |
| `POST /api/accounts/:id/notification` | accept (friend request) / hide / see / respond (reply and decline with a preset message); applies to VRChat and the local inbox |
| `POST /api/accounts/:id/note` | Save a user note |
| `GET/POST/DELETE /api/accounts/:id/vrc-favorites` | VRChat favorite groups and entries (friends / worlds / avatars) |
| `GET /api/stats?days=1\|7\|30\|90` | Activity statistics |
| `GET /api/friends` | Aggregated friend list, de-duplicated across accounts |
| `GET /api/notifications` / `POST` | Notification inbox / mark seen, dismiss |
| `GET /api/feed?limit&before&type&accountId&userId` | Feed history (SQLite, paged backwards) |
| `GET /api/feed/events` | Live SSE stream (`hello` / `feed` / `accounts` / `friends` / `notifications` / `ping`) |
| `GET /api/search?q&type=friends\|users\|worlds\|avatars` | Search (friends uses the local cache) |
| `GET /api/worlds/:id` | World details + friends in that world + its instances |
| `GET /api/avatars/:id` / `POST /api/avatars/:id/actions` | Avatar details / wear, local favorite |
| `GET/POST/DELETE /api/favorites` | Local favorites (friends / avatars / worlds) |
| `/api/friend-groups` | Local friend groups (a friend belongs to one group at a time) |
| `GET/POST/DELETE /api/settings` | Settings |
| `POST /api/chatbox/send` | Send a chatbox message (the server keeps sends ≥ 1.5 s apart, queueing instead of dropping) |
| `POST /api/chatbox/typing` | Toggle the typing indicator |
| `GET /api/chatbox/health` | Chatbox target address (UDP has no handshake; only resolves the hostname) |
| `GET /api/img-proxy?u=…` | VRChat image proxy using the account cookie |

## systemd deployment

See `vrcx-ng.service`:

```ini
[Unit]
Description=vrcx-ng — multi-account VRChat feed
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/krsz/Documents/vrc-activity
ExecStart=/usr/bin/env node build
Restart=on-failure
RestartSec=5
EnvironmentFile=/home/krsz/Documents/vrc-activity/.env

[Install]
WantedBy=default.target
```

```bash
mkdir -p ~/.config/systemd/user
cp vrcx-ng.service ~/.config/systemd/user/
systemctl --user daemon-reload
loginctl enable-linger $USER      # start at boot
systemctl --user enable --now vrcx-ng
journalctl --user -u vrcx-ng -f
```

## Security / privacy

- Passwords are encrypted with AES-256-GCM + `ACCOUNT_ENCRYPTION_KEY` and stored
  in the SQLite `accounts.password_enc` column
- Cookies are only used on the server and are **never** returned to the frontend through the API
- `data/vrcx-ng.db` contains sensitive data — it is gitignored, do not commit it
- `.env` is gitignored as well
- Before deploying, make sure `ACCOUNT_ENCRYPTION_KEY` is a random value you generated yourself (not the example value)

## Differences from VRCX

| | VRCX | vrcx-ng |
| --- | --- | --- |
| Platform | Electron desktop | Web (any browser) |
| Multi-account | yes | yes |
| Storage | sql.js (in memory + WASM) | better-sqlite3 (file) |
| Chatbox relay | yes (built in) | yes (integrated) |
| Launching VRChat | yes | no (display panel only) |
| VR mode | yes | no (not implemented) |
| Dashboard / charts | yes | partial (`/stats` page) |
| i18n | many languages | English |

## License

MIT
