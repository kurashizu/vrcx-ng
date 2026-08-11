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
- **好友列表** — 在线 / Active / 离线分组，按世界聚合，显示
  Trust Rank 颜色
- **右键菜单** — 查看详情、复制实例链接（启动 VRChat）、请求加入实例、
  静音 / 屏蔽、复制 ID、打开主页
- **用户详情面板** — 头像 / Bio / 当前世界 / 模型 / 世界 / 徽章
- **OSC Chatbox** — 浏览器里发消息到 VRChat chatbox（自带 OSC 编码，
  不需要 Python 桥接）。目标地址在 UI 里可改
- **持久化** — SQLite (better-sqlite3)，重启后历史 feed / 好友 / 收藏
  都不丢

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
| `POST /api/accounts` | 添加账号（加密存密码） |
| `DELETE /api/accounts?id=…` | 删除账号 |
| `POST /api/accounts/:id/login` | 登录（可带 `twoFactorCode`） |
| `POST /api/accounts/:id/logout` | 登出 |
| `POST /api/accounts/:id/reconnect` | 重连 pipeline WS |
| `GET /api/accounts/:id/friends` | 该账号的好友原始列表 |
| `GET /api/accounts/:id/user/:userId` | 用户详情（含 bio / avatar / world / badge，5 分钟缓存） |
| `POST /api/accounts/:id/actions` | mute / block / requestInvite / friendRequest |
| `GET /api/friends` | 多账号去重后的聚合好友列表 |
| `GET /api/friends/locations` | 按世界聚合好友 |
| `GET /api/notifications` | 通知列表（按账号） |
| `GET /api/feed` | 历史 feed 事件 |
| `GET /api/feed/events` | SSE 实时流 |
| `GET /api/favorites` / `POST` / `DELETE` | 收藏（好友 / 模型 / 世界 / 群组） |
| `GET /api/moderations` / `DELETE` | 静音 / 屏蔽列表 |
| `POST /api/chatbox/send` | 发 chatbox 消息 |
| `POST /api/chatbox/typing` | 切换 typing 指示 |
| `GET /api/chatbox/settings` / `POST` | chatbox 目标地址（OSC UDP） |

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
| Dashboard / Charts | ✅ | ❌ |
| i18n | 多语言 | 中文 |

## 许可证

MIT
