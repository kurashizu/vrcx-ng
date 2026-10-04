# vrcx-ng

一个基于 SvelteKit 的多账号 VRChat 动态聚合 + Chatbox 转发 Web App，
参考 [VRCX](https://github.com/vrcx-team/VRCX) 的 API 实现。

> 名字由来：`VRCX` (Next Generation) — 在 VRCX 的 API 基础上做一个
> 轻量、纯 Web 的多账号客户端。

> ⚠️ **免责声明**：本项目仅做 API 客户端 / 转发，不参与任何 VRChat 服务端逻辑。
> 使用前请遵守 [VRChat 服务条款](https://hello.vrchat.com/legal)，
> 不要用本工具绕过任何速率限制或反作弊措施。

## 功能

- **多账号管理** — 同时添加 / 登录多个 VRChat 账号，密码用
  AES-256-GCM 本地加密存储
- **实时动态 feed** — 统一聚合所有账号的好友动态：
  - 🟢 上线 / ⚫ 离线 / 🔵 Active
  - 📍 移动世界 (GPS，可点击启动 VRChat)
  - 💬 状态变更 / ✏️ Bio 变更
  - 👤 切换模型 (带 before / after 对比)
  - 🤝 好友请求 / ✉️ 邀请 / 🚪 实例关闭
  - 🏢 群组事件 / 🎟️ 加入实例队列 / 🔔 通知 v1 / v2
- **好友列表** — 右侧栏按世界 / 分组 / 平铺三种方式展示在线好友，附带「同实例」和
  VIP 分组置顶；`/friends` 是同一份数据的全屏网格总览。显示 Trust Rank 颜色
- **右键菜单** — 查看详情、请求加入、邀请自己到 TA 的实例、复制实例链接、
  静音 / 屏蔽、加入本地分组、复制 ID、打开主页（多账号时先选操作账号）
- **详情弹窗** — 用户 / 世界 / 模型三种弹窗可以层层叠开、逐层返回（Esc 关最上面一层）：
  用户（Bio / 位置 / 模型 / 世界 / 徽章 / 备注 / 各种操作）、世界（实例列表、邀请自己 /
  邀请好友 / 请求房主邀请、创建实例）、模型（换装、收藏）
- **OSC Chatbox** — 浏览器里发消息到 VRChat chatbox（自带 OSC 编码，
  不需要 Python 桥接）。目标地址在 UI 里可改
- **邀请 / 请求** — 对好友永远可以「请求加入」（不管 TA 在不在游戏里）；也可以从
  VRChat 的 12 条预设消息里选一条一起发送，或改写后再发
- **通知操作** — 在通知面板里直接接受好友请求、邀请 TA 进你的实例、用预设消息
  回复并拒绝；「已读 / 忽略」会同步到 VRChat（游戏里和 VRCX 里也跟着变）
- **备注与收藏** — 用户备注（VRChat 的 `userNotes`，游戏里也看得到）；好友 / 世界 /
  模型可以加入 VRChat 自己的收藏分组（与游戏、VRCX 共用）
- **好友日志** — 好友改名、信任等级变化会进 feed
- **统计** — `/stats`：好友在线时长排行、上线时段分布、热门世界（来自已落库的 feed，
  从开始记录的那天起逐渐完整）
- **持久化** — SQLite (better-sqlite3)：feed 历史、通知、收藏、分组、设置
  重启后都在。feed 按「设置 → 动态 → 保留天数」清理（默认 30 天，0 = 永久）
- **自动同步** — pipeline 断线重连后、以及每小时，都会全量重新同步好友列表
  （VRChat 的 websocket 偶尔会丢事件）；重连采用 5 s → 5 min 指数退避
- **离线判定** — 好友的 Offline 事件会延迟 170 s 再进 feed，期间重新上线则两条
  都不记（与 VRCX 一致，过滤切换实例时的瞬时掉线）

## 架构

```
Browser ──SSE──> SvelteKit (Node)
                  │
                  ├── better-sqlite3  (data/vrcx-ng.db)
                  ├── dgram UDP       →  VRChat OSC chatbox
                  │
                  └── WebSocket per account → wss://pipeline.vrchat.cloud
                                              (×N 账号并行)
```

每个账号登录后：
1. 用 Basic Auth 调 `auth/user` 拿 cookie jar
2. 调 `auth` 拿 pipeline token
3. 打开 `wss://pipeline.vrchat.cloud/?auth=…`
4. 把 `friend-online/offline/location/update`、`user-location/update`、
   `notification-v2`、`group-*`、`instance-queue-*` 等事件转为
   `FeedEntry` 推给所有 SSE 订阅者
5. 同时写 SQLite（feed_events、friends、notifications、world_cache…）

Cookie 401 时自动用本地加密的密码重新登录。

## 前端结构

SvelteKit + Svelte 5（runes），纯 SPA（`ssr = false`），全局状态用 `svelte/store`，
`src/lib` 下按职责分层：

```
shared/      纯函数：格式化、location 解析、trust rank、feed 类型注册表、presence 颜色
client/      浏览器侧逻辑：api()/run() 请求封装、动作（复制 / 自邀 / 屏蔽…）、好友分组与
             排序、好友右键菜单、createResource（带过期保护的异步加载）
stores/      accounts · friends · feed · settings · notifications · overlay（弹窗栈 / 确认框 /
             右键菜单）· sse（事件流）
components/
  ui/        无业务的积木：Modal · Avatar · UserName · Place · AccessBadge · StatusPill ·
             Tabs · Section · Toggle · ListRow · Notice · Page · ContextMenu · Toasts…
  layout/    侧栏、账号列表与账号操作、弹窗宿主 OverlayHost
  friends/   好友栏（FriendRail / FriendRow）与总览卡片（FriendCard）
  feed/      FeedItem · FeedToolbar
  dialogs/   用户 / 世界 / 模型详情，通知，邀请消息，收藏，邀请好友，资料编辑，登录 / 2FA
routes/      动态 · 好友总览 · 搜索 · 统计 · 屏蔽 · Chatbox · 设置
```

约定：裸 `<button>` 无样式，需要按钮外观时用 `.btn`（`primary / ghost / danger / sm / xs / icon`）；
颜色、圆角、阴影都来自 `app.css` 里的设计 token（深色 / 浅色两套）。

## 启动

### 1. 装依赖

```bash
npm install
```

### 2. 配置

```bash
cp .env.example .env
```

编辑 `.env`，**至少**把 `ACCOUNT_ENCRYPTION_KEY` 换成你自己的 32 字节
随机 hex：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env` 是 gitignored 的，所以不会进版本库。

### 3. 启动

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
node build
# => http://0.0.0.0:3333
```

### 4. (可选) Chatbox OSC 目标

默认 `127.0.0.1:9000`（VRChat 本机）。在 chatbox 页面的右上角输入新地址
保存即可，存到 SQLite `settings` 表。

> 💡 VRChat 默认只允许本机 OSC 输入。如果你的 VRChat 跑在另一台机器
> 上，把 `VRChat → Settings → OSC → Network` 设成允许，然后把
> chatbox 目标 IP 改成那台机器的局域网 IP。
>
> ⚠️ **强烈不建议把 OSC 监听端口暴露到公网**。

## API 概览

| 路由 | 说明 |
| --- | --- |
| `GET /api/accounts` | 列出所有账号（不含密码） |
| `POST /api/accounts` | 添加账号（加密存密码；同用户名重复添加会更新原账号） |
| `DELETE /api/accounts?id=…` | 删除账号（连同它在 SQLite 里的 feed / 通知 / 收藏等数据） |
| `POST /api/accounts/:id/login` | 登录（可带 `twoFactorCode`，恢复码自动格式化为 `XXXX-XXXX`） |
| `POST /api/accounts/:id/logout` | 登出 |
| `POST /api/accounts/:id/reconnect` | 强制重连 pipeline 并重新同步好友 |
| `GET /api/accounts/:id/friends` | 该账号的好友原始列表（`n` 1–100） |
| `GET /api/accounts/:id/user/:userId` | 用户详情（bio / 头像 / 世界 / 徽章，5 分钟缓存，`?fresh=1` 跳过缓存） |
| `POST /api/accounts/:id/actions` | mute / unmute / block / unblock / requestInvite（可带 `requestSlot`）/ invite（可带 `messageSlot`）/ friendRequest / cancelFriendRequest / unfriend |
| `POST /api/accounts/:id/instance-action` | createInstance / selfInvite / requestInvite |
| `GET /api/accounts/:id/moderations?type=mute\|block` | 当前生效的静音 / 屏蔽列表 |
| `POST /api/accounts/:id/profile` | 修改自己的 bio / bioLinks（`PUT profile/:id`）与状态 / 代词（`PUT users/:id`） |
| `GET/PUT /api/accounts/:id/invite-messages?type=message\|request\|response\|requestResponse` | 12 条预设消息（读取 / 修改，修改后该槽冷却约 60 分钟） |
| `POST /api/accounts/:id/notification` | accept（好友请求）/ hide / see / respond（预设消息回复并拒绝），同时作用于 VRChat 与本地收件箱 |
| `POST /api/accounts/:id/note` | 保存用户备注 |
| `GET/POST/DELETE /api/accounts/:id/vrc-favorites` | VRChat 收藏分组与条目（好友 / 世界 / 模型） |
| `GET /api/stats?days=1\|7\|30\|90` | 活跃度统计 |
| `GET /api/friends` | 多账号去重后的聚合好友列表 |
| `GET /api/notifications` / `POST` | 通知收件箱 / 标记已读、忽略 |
| `GET /api/feed?limit&before&type&accountId&userId` | feed 历史（SQLite，向前翻页） |
| `GET /api/feed/events` | SSE 实时流（`hello` / `feed` / `accounts` / `friends` / `notifications` / `ping`） |
| `GET /api/search?q&type=friends\|users\|worlds\|avatars` | 搜索（friends 为本地缓存） |
| `GET /api/worlds/:id` | 世界详情 + 在这个世界里的好友 + 各实例 |
| `GET /api/avatars/:id` / `POST /api/avatars/:id/actions` | 模型详情 / 换装、本地收藏 |
| `GET/POST/DELETE /api/favorites` | 本地收藏（好友 / 模型 / 世界） |
| `/api/friend-groups` | 本地好友分组（一个好友同时只属于一个分组） |
| `GET/POST/DELETE /api/settings` | 设置 |
| `POST /api/chatbox/send` | 发 chatbox 消息（服务端保证两次发送间隔 ≥ 1.5 s，排队而不丢） |
| `POST /api/chatbox/typing` | 切换 typing 指示 |
| `GET /api/chatbox/health` | chatbox 目标地址（UDP 无握手，仅解析主机名） |
| `GET /api/img-proxy?u=…` | 带账号 cookie 的 VRChat 图片代理 |

## systemd 部署

参考 `vrcx-ng.service`：

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
loginctl enable-linger $USER      # 开机自启
systemctl --user enable --now vrcx-ng
journalctl --user -u vrcx-ng -f
```

## 安全 / 隐私

- 密码用 AES-256-GCM + `ACCOUNT_ENCRYPTION_KEY` 加密后存 SQLite
  `accounts.password_enc` 字段
- Cookie 只在服务端使用，**绝不会**通过 API 返回给前端
- `data/vrcx-ng.db` 含敏感数据 — gitignored，请勿提交
- `.env` 也是 gitignored
- 部署前请确保 `AccountEncryptionKey` 是你自己生成的随机值（不要用示例值）

## 与 VRCX 的差异

| | VRCX | vrcx-ng |
| --- | --- | --- |
| 平台 | Electron 桌面 | Web（任何浏览器） |
| 多账号 | ✅ | ✅ |
| 存储 | sql.js（内存 + WASM） | better-sqlite3（文件） |
| Chatbox 转发 | ✅（内置） | ✅（集成） |
| VR 模式 | ✅ | ❌（暂未实现） |
| Dashboard / Charts | ✅ | 部分（`/stats` 统计页） |
| i18n | 多语言 | 中文 |

## 许可证

MIT
