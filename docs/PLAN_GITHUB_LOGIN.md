# GitHub 登录与立规页重构 开发计划

| 项目 | 内容 |
|---|---|
| 版本 | v1.1.0 |
| 日期 | 2026-11-13 |
| 状态 | 待评审 |
| 范围 | 立规页 1:1 复刻 macOS 设置 + GitHub Device Flow 登录 |
| 前置 | v1.0.9 已发布；立规页当前为单页表单 |

---

## 0. 一句话

把立规页做成 macOS 设置的样子：左灰右白、搜索框、分组列表、主卡登录 GitHub、右栏分组卡与子页面；登录走 Device Flow，用户不碰终端、不填 token。

---

## 1. 目标与非目标

### 1.1 目标

- 立规页 1:1 复刻 macOS 设置（去掉窗口三点与「立规」标题行）。
- 左栏：搜索框 + 主卡（GitHub 登录）+ 六个分组。
- 右栏：左上角胶囊 `‹ ›` + 标题，下面是分组卡；点行进子页面。
- GitHub 登录用 Device Flow：点登录 → 显示 8 位码 + 自动打开浏览器 → 授权 → 回来已登录。
- 登录后 token 用于部署推送，不再依赖用户自己配置 `gh`。
- token 不落 git、不进 `site.json`。

### 1.2 非目标

- 不做 OAuth App 的本机回环回调（需要 client_secret）。
- 不做 GitHub App / installation token。
- 不做多账号切换。
- 不做仓库创建与 Pages 自动开启（后续）。
- 不做搜索框的全文搜索（只过滤左栏分组名）。

---

## 2. 关键决策

| # | 决策 | 理由 | 可逆性 |
|---|---|---|---|
| D1 | Device Flow，不回调 | 本地进程无需公网回调，不内置 client_secret | 中 |
| D2 | `client_id` 内置，公开 | OAuth App 的 client_id 不是密钥 | 高 |
| D3 | 左灰右白、无分割线、分组卡 | 1:1 复刻 macOS 设置 | 高 |
| D4 | 去掉窗口三点与「立规」标题行 | 用户明确要求 | 高 |
| D5 | 导航胶囊在右栏左上角 | 对应用户指出的位置 | 高 |
| D6 | 点行进子页面（push/pop） | macOS 结构，胶囊配套 | 中 |
| D7 | token 优先存 DSH credentials，回退 `.blog/secrets.json`（0600） | 与宿主一致，避免另建密钥体系 | 中 |
| D8 | 部署用 `GIT_ASKPASS` 注入 token | 不写 git config、不进 shell history | 高 |
| D9 | 保留 gh 作为回退 | 已登录用户零操作复用 | 高 |

---

## 3. GitHub Device Flow

### 3.1 流程

```
1. 用户点「用 GitHub 登录」
2. Host POST https://github.com/login/device/code
     client_id, scope
   ← device_code, user_code, verification_uri, interval
3. 前端显示 user_code + 「打开 GitHub」按钮
4. 浏览器打开 https://github.com/login/device，用户输入码并授权
5. Host 按 interval 轮询 POST https://github.com/login/oauth/access_token
     client_id, device_code, grant_type=urn:ietf:params:oauth:grant-type:device_code
   ← access_token 或 authorization_pending / slow_down / expired_token
6. 拿到 token → 请求 GET https://api.github.com/user 取 login/avatar_url
7. 存 token，返回用户信息
```

### 3.2 参数

| 参数 | 值 |
|---|---|
| scope | `repo`（私有仓库需要；公开仓库可降到 `public_repo`） |
| interval | 服务端返回，默认 5s |
| 超时 | 15 分钟，过期提示重新登录 |
| `slow_down` | interval +5s |

### 3.3 OAuth App 注册（一次性）

- 位置：GitHub → Settings → Developer settings → OAuth Apps → New
- 名称：`dsh-blog`
- Homepage：仓库地址
- Authorization callback URL：`http://127.0.0.1`（Device Flow 不使用，但必填）
- **勾选 Enable Device Flow**
- 记录 `client_id`，写入代码常量与文档

---

## 4. 存储

- 优先 `ctx.credentials`（若提供写接口）
- 回退 `.blog/secrets.json`，权限 0600
- 结构：

```json
{
  "github": {
    "accessToken": "gho_...",
    "login": "a1ertx5s",
    "avatarUrl": "https://...",
    "scope": "repo",
    "obtainedAt": "2026-11-13T..."
  }
}
```

- 登出删除该节点，并清理内存中的 git 环境
- 任何情况下不写入 `site.json`、不提交

---

## 5. 部署接入

- `deploySite` 前读取 token，若存在：
  - 生成临时 askpass 脚本（0600，进程退出删除）
  - `GIT_ASKPASS=<script>`、`GIT_TERMINAL_PROMPT=0`
  - 用户名 `x-access-token`，密码为 token
- 若不存在 token，走现有本地 git 凭据（gh / SSH / keychain）
- token 失效（401/403）：标记 `pending-push`，提示重新登录

---

## 6. 立规页结构（1:1）

### 6.1 布局

```
┌──────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────┐ ┌──────────┐                  │
│ │ 🔍 搜索                     │ │  ‹   ›   │  站点            │
│ ├────────────────────────────┤ └──────────┘                  │
│ │ ┌────────────────────────┐ │                               │
│ │ │ [头像] 我的博客         │ │  ┌─────────────────────────┐  │
│ │ │        站点             │ │  │ ⬜ 标题   我的博客    › │  │
│ │ └────────────────────────┘ │  └─────────────────────────┘  │
│ │                            │                               │
│ │  ⬜ 站点                    │  ┌─────────────────────────┐  │
│ │  ⬜ 内容                    │  │ ⬜ 描述   一句话介绍  › │  │
│ │  ⬜ 工厂                    │  └─────────────────────────┘  │
│ │  ⬜ 发布                    │                               │
│ │  ⬜ 模型与搜索              │                               │
│ │  ⬜ 诊断                    │                               │
│ └────────────────────────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

- 无窗口三点、无「立规」标题行。
- 左栏宽 260px，底色 `#f5f5f7`（暗色 `#1c1c1e`）。
- 右栏白底（暗色 `#000`）。
- 整体圆角 20px，阴影 `0 20px 60px rgba(0,0,0,0.18)`。

### 6.2 左栏

| 元素 | 规格 |
|---|---|
| 内边距 | 16px |
| 搜索框 | 高 32px，圆角 8px，`#e8e8ed`，占位「搜索」 |
| 主卡 | 高 64px，圆角 10px，选中蓝 `#0a84ff` |
| 主卡头像 | 圆形 36px，未登录为 GitHub 图标，已登录为 GitHub 头像 |
| 主卡文字 | 标题 15px/600 白；副标题 13px 半透明白 |
| 列表项 | 高 40px，图标 20px 圆角 5px，文字 14px |
| 选中态 | 整行 `#0a84ff`，白字 |
| 图标色 | 站点蓝 / 内容紫 / 工厂橙 / 发布绿 / 模型青 / 诊断灰 |

### 6.3 右栏

| 元素 | 规格 |
|---|---|
| 导航胶囊 | 高 34px，宽 76px，白底，圆角 999px，`‹` `›` 各半，中间 1px 分隔 |
| 胶囊位置 | 右栏左上角，距左 24px、距顶 16px |
| 标题 | 距胶囊 16px，15px/600 |
| 分组标题 | 13px，`#1d1d1f`，距上一组 28px |
| 分组卡 | `#f5f5f7`，圆角 12px，无边框 |
| 行 | 高 56px，左右 16px，无分割线 |
| 行图标 | 24px 圆角 6px |
| 行标签 | 15px `#1d1d1f` |
| 行值 | 13px `#86868b` |
| 行箭头 | `›` `#c7c7cc` |

### 6.4 分组与字段

**站点**
- 标题、描述、作者、语言

**内容**
- 默认状态、默认标签、作者手册路径（只读）

**工厂**
- 单篇预算、月度预算、队列并发（只读 1）

**发布**
- 部署目录、分支、autoPush、远程仓库（只读状态）

**模型与搜索**
- 当前模型（只读）、搜索 provider（只读）、运行探针（按钮行）

**诊断**
- 博客目录、git、构建状态、自检

### 6.5 子页面

- 点行 → 右栏切换为子页面
- 顶部胶囊 `‹` 可用，标题为该字段名
- 内容：字段标题 + 输入/开关 + 说明文字
- 底部：保存 / 取消（或即时保存）
- `‹` 返回分组

### 6.6 未登录状态

- 主卡：GitHub 图标 + 「用 GitHub 登录」 + 「未连接」
- 点击 → 主卡切换为授权码状态：`ABCD-1234` + 「打开 GitHub」+「等待授权…」
- 登录成功 → 头像 + `login` + 「已连接」
- 点击已登录主卡 → 子页面：账号信息 + 登出

---

## 7. API

```
POST /blog/github/device          → { userCode, verificationUri, deviceCode, interval, expiresIn }
GET  /blog/github/device/:code    → { status: pending|slow_down|expired|ok, login?, avatarUrl? }
GET  /blog/github/me              → { connected, login?, avatarUrl?, scope? }
POST /blog/github/logout          → { ok }

GET  /blog/settings               → 现有
PUT  /blog/settings               → 现有
```

- device 轮询由前端按 interval 发起，Host 每次只查一次，避免长连接
- `deviceCode` 不下发给前端，用短 id 映射

---

## 8. 实现

### 8.1 后端

- `src/github.js`
  - `startDeviceFlow()` / `pollDeviceFlow()` / `fetchViewer()` / `saveToken()` / `clearToken()`
  - `getToken()` 读取 credentials 或 secrets
- `src/git-auth.js`（或并入 deploy）
  - `withGitAuth(token, fn)`：创建临时 askpass，注入环境
- `deploy.js` 调用 `withGitAuth`

### 8.2 前端

- `client/SettingsPage.jsx` 重写为 macOS 布局
- `client/settings/Nav.jsx`（左栏）
- `client/settings/Rows.jsx`（分组卡与行）
- `client/settings/Detail.jsx`（子页面）
- `client/GitHubCard.jsx`（主卡与授权态）

---

## 9. 任务

### M14 立规页骨架（1 人日）

- [ ] M14-1 左右分栏 + 搜索框
- [ ] M14-2 分组列表与选中态
- [ ] M14-3 右栏导航胶囊与标题
- [ ] M14-4 分组卡与行组件
- [ ] M14-5 子页面 push/pop
- [ ] M14-6 暗色与窄屏

### M15 GitHub 登录（1 人日）

- [ ] M15-1 OAuth App 注册与 client_id 内置
- [ ] M15-2 Device Flow 后端
- [ ] M15-3 主卡登录态 UI
- [ ] M15-4 token 存储与登出
- [ ] M15-5 部署接入 `GIT_ASKPASS`

### M16 收尾（0.5 人日）

- [ ] M16-1 六个分组的字段落地
- [ ] M16-2 校验与错误提示
- [ ] M16-3 文档与 CHANGELOG
- [ ] M16-4 v1.1.0 发布

---

## 10. 验收

- [ ] 立规页与 macOS 设置结构一致：左灰右白、搜索、主卡、分组、分组卡、行箭头
- [ ] 无窗口三点、无「立规」标题行
- [ ] 胶囊在右栏左上角，子页面可返回
- [ ] 未登录点主卡 → 显示 8 位码 → 浏览器授权 → 回来已登录
- [ ] 登录后显示 GitHub 头像与 login
- [ ] 登出后回到未登录态
- [ ] 部署使用登录 token，不依赖用户配置 gh
- [ ] token 不在 git、不在 site.json
- [ ] 暗色可读，窄屏可用
- [ ] CI 绿

---

## 11. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| OAuth App 未注册 | 登录不可用 | 上线前置动作，写进发布清单 |
| Device Flow 输入码体验 | 中 | 自动复制 + 一键打开 |
| token 泄露 | 高 | 0600、不进 git、可登出 |
| token 失效 | 中 | 401 时提示重新登录 |
| scope 过大 | 中 | 文档说明，后续可降到 public_repo |
| 1:1 视觉在 Web 上失真 | 中 | 用系统字体栈，按截图取色 |
| 子页面层级过深 | 低 | 只做一层 |

---

## 12. GitHub Flow

- M14/M15/M16 三个 PR，各自 issue
- 分支 `feat/<issue>-settings-mac`、`feat/<issue>-github-login`
- PR 带前后截图
- CI 绿后 squash merge
- 版本 v1.1.0
