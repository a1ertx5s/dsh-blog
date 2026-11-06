# dsh-blog 开发计划

| 项目 | 内容 |
|---|---|
| 版本 | v0.4（评审后） |
| 日期 | 2026-11-06 |
| 状态 | 已定稿，待开工 |
| 目标 | DSH 插件：AI 长文工厂，v1 发布到 GitHub Pages |

---

## 0. 一句话

装在 DSH 侧栏里的长文工厂：选题进，文章出，自动过质量门禁，人只做审批，成品直接发 GitHub Pages。

---

## 1. 目标与非目标

### 1.1 v1 目标

- 从一句 brief 出发，自动完成 **研究 → 大纲 → 初稿 → 质量门禁**，产出可审的长文。
- 人在三个点介入：批选题、验收、改规则；其余自动。
- 长文支持图片：上传、插入、封面、构建时拷贝。
- 验收通过后自动构建、提交并推送，GitHub Pages 直接托管（`main` 分支 `/docs`）。
- 内容即文件，git 即历史；脱离 DSH 仍可维护。
- 单机、单用户、本地优先；不依赖云端服务。
- 开源、可移植：默认目录跟随 `DSH_HOME`，不写死机器路径。

### 1.2 非目标（v1 不做）

- 富文本编辑器、评论、多用户/多租户。
- 平台自动发布（公众号/小红书等）、图床。
- 站内搜索、标签页、分页（v1.1）。
- GitHub Actions 构建（v1 本地预渲染）。
- 多博客实例（一个插件实例一个 `blogRoot`）。
- 真正的自主选题（v1 为 AI 提案 + 人批；自动选题 v1.1）。

---

## 2. 关键决策

| # | 决策 | 理由 | 可逆性 |
|---|---|---|---|
| D1 | 重写，不 fork media-desk | 它是短内容 + 单 `state.json` + 直调模型的假设，改造量≈重写 | 高 |
| D2 | 内容即文件（Markdown + frontmatter） | git 历史、可迁移、Agent/编辑器都能改、无锁定 | 低 |
| D3 | 显式阶段流水线，不用后台 agent 会话 | 可重试、可约束、可观测、成本可控、不污染侧栏 | 中（阶段内可加工具循环） |
| D4 | 本地预渲染到 `docs/`，提交后由 Pages 直接托管 | 零 CI、离线可构建、产物可审 | 中（可换 Actions） |
| D5 | 项目页用 `basePath` 统一重写内链 | 同时兼容 `user.github.io/repo/` 与自定义域名 | 低 |
| D6 | 只做最小源码编辑器 | 不给富文本与 Markdown 争“真相”的机会 | 低 |
| D7 | 模型走 DSH 当前默认模型，不另配密钥 | 与宿主一致、计费走用户账号 | 中 |
| D8 | 鉴权用 `connection.requestRejection` + 同源校验 | media-desk 已验证，绕开 typert 生成 | 低 |

---

## 3. 假设与待确认

### 3.1 默认假设（未确认前按此执行）

- `blogRoot` 默认 `$DSH_HOME/blog`（通常是 `~/.dsh/blog`），与插件代码仓库分离；设置里可改，测试可用 `DSH_BLOG_ROOT` 覆盖。
- GitHub Pages 使用 **main 分支 /docs**，只负责托管，不做构建。
- 部署全自动：验收通过 → 构建 → 提交 → 推送；失败进 `pending-push` 可重试。
- 首版面向 **`https://<user>.github.io/<repo>/`** 项目页，`basePath = /<repo>/`。
- 图片 **v1 只支持上传**，AI 生封面放到 v1.1。
- 文章语言 **中文**；插件 UI 中文，英文 v1.1。

### 3.2 已定与待确认

已定：

- 开源项目：不写死作者机器路径，默认目录跟随 DSH。
- `blogRoot` 默认 `$DSH_HOME/blog`，与插件代码分离。
- 部署自动化：插件构建 `docs/` 并推送到 `main`，Pages 用 main `/docs` 托管。

待确认：

1. 远程仓库地址（`user/repo`）是否已建好？还是插件首次引导时创建？
2. 是否已有自定义域名（决定 `basePath`）？
3. 图片 v1 仅上传，确认？

---

## 4. 产品形态

四个工位，人的三个动作。

| 工位 | 内容 | 人的动作 |
|---|---|---|
| 选题台 | AI 提案卡片：题目、角度、为什么现在写、需要的来源 | 批准 / 毙掉 / 手动加题 |
| 生产线 | 队列、阶段进度、耗时、token 成本 | 查看、暂停 |
| 验收台 | 预览、来源、门禁 checklist、版本 | 通过 / 打回（写意见） |
| 规则库 | 语气、结构、禁区、SEO 规范（`editorial.md`） | 编辑 |

页面：**看板 / 选题 / 文章 / 设置**。

---

## 5. 架构

```
Client（React 面板，esbuild → lazy CJS）
   │  fetch /blog/*   同源 + requestRejection
Host 插件（ESM）
   ├─ routes.js / auth.js     前缀路由、鉴权、入参校验
   ├─ store.js                blogRoot、原子写、写锁、路径安全
   ├─ jobs.js                 状态机、队列、成本
   ├─ stages/                 research / outline / draft / gates / revise
   ├─ llm.js                  agentDefaultModel + llm.prepareCall
   ├─ web.js                  web.search / web.fetch + SSRF 防护
   ├─ render.js               markdown-it + sanitize-html
   ├─ build.js                docs/ 静态站、RSS、sitemap
   ├─ deploy.js               git add/commit/push
   └─ config.js / i18n.js
```

**边界**：Client 不直接读写文件，只调用 Host 路由；Host 不依赖页面存活，任务在后台跑完并落盘。

---

## 6. 数据模型

### 6.1 目录

默认根目录 `$DSH_HOME/blog`（`~/.dsh/blog`）；解析顺序：设置 → `DSH_BLOG_ROOT` → `$DSH_HOME/blog`。测试用临时目录，不碰真实数据。

```
blogRoot/
  site.json                 # 站点配置（进 git）
  editorial.md              # 编辑部手册（进 git）
  content/
    posts/<slug>.md         # 文章（进 git）
    images/                 # 图片原图（进 git）
  docs/                     # 构建产物（进 git）
  .blog/                    # 机器状态（gitignore）
    jobs/<id>.json
    runs/<id>/sources.json | outline.json | draft.md | gates.json | log.ndjson
    versions/<slug>/<ts>.md
    secrets.json            # 0600，不进 git
```

### 6.2 `site.json`

```json
{
  "title": "我的博客",
  "description": "一句话介绍",
  "url": "https://user.github.io",
  "basePath": "/dsh-blog/",
  "author": "名字",
  "lang": "zh-CN",
  "theme": "paper",
  "nav": [{ "label": "首页", "href": "/" }, { "label": "关于", "href": "/about.html" }],
  "deploy": { "dir": "docs", "branch": "main", "autoPush": false }
}
```

### 6.3 文章 frontmatter

```yaml
---
title: 用 Agent 做内容工厂
slug: agent-content-factory
date: 2026-11-06
status: review          # draft | review | published
tags: [AI, 工程]
description: 一句话摘要，列表与 SEO 共用
cover: /images/cover-xxxx.webp
---
```

正文中的图片与内链一律使用**根相对路径**（`/images/...`、`/posts/...`），构建时统一加 `basePath`。

### 6.4 Job

```json
{
  "id": "job_xxx",
  "slug": "agent-content-factory",
  "title": "用 Agent 做内容工厂",
  "brief": "写给独立开发者的长文……",
  "status": "drafting",
  "stage": "draft",
  "attempts": { "research": 1, "outline": 1, "draft": 2 },
  "usage": { "input": 12000, "output": 8000, "cost": 0.0 },
  "createdAt": "...",
  "updatedAt": "...",
  "error": null
}
```

---

## 7. 生产流水线

### 7.1 状态机

```
idea → briefed → researching → outlined → drafting → gated
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                           review                        (自动回炉一次)
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
             approved                  rejected → revising → gated
                 │
                 ▼
             publishing ──失败──→ pending-push ──重试──→ publishing
                 │
                 ▼
             published
```

### 7.2 阶段契约

| 阶段 | 输入 | 输出 | 失败处理 |
|---|---|---|---|
| research | brief、关键词 | `sources.json`（≥3 条，含摘录） | 来源不足标记，不硬写 |
| outline | brief + 来源摘要 | 标题/摘要/标签/5–8 节/目标字数 | 解析失败重试 1 次 |
| draft | 大纲 + 规则 + 来源 | `draft.md`（逐节写，拼装） | 按节重试，不重写全文 |
| gates | 初稿 + 来源 + 历史 | `gates.json` | 不过则自动 revise 一次 |
| revise | 初稿 + 打回意见 | 新版本 `draft.md` | 人工触发或自动 |
| build | published 文章 | `docs/` | 构建失败保留旧产物 |

### 7.3 长文策略

- 大纲定稿后**逐节生成**；每节 prompt 带：全文摘要、本节职责、相关来源摘录、已写部分的最后一段。
- 目标 1500–3000 字；超出拆系列。
- 拼装后统一检查：小标题层级、引用编号连续、开头结尾呼应。

### 7.4 提示词分层

1. 系统层：角色 + 硬规则（来自 `editorial.md`）
2. 站点层：读者画像、栏目、最近 20 篇标题（避免重复）
3. 素材层：来源摘录（带编号）
4. 任务层：本节要做什么、字数、输出格式

每次调用记录 `promptHash`，便于复现与回归。

### 7.5 成本

- 从流式 `finish` 事件取 usage；拿不到则按字符估算。
- 每阶段记账，汇总到 job 与月度总额。
- 设置里配月度预算与单篇上限，超限暂停队列。

---

## 8. 质量门禁

| 检查 | 通过标准 | 不过怎么办 |
|---|---|---|
| 引用覆盖 | 事实段至少一个 `[n]`，且能对上来源 | 回炉补来源/删论断 |
| 事实核查 | 逐条判定“支持/不支持/无来源”，不支持 ≤2 条 | 打回 |
| 查重 | 与历史标题/大纲相似度低于阈值 | 换角度/毙掉 |
| 风格 | rubric 打分（语气/结构/具体性）≥3.5 | 回炉 |
| SEO | 标题 10–60 字、description 50–160、slug、alt | 自动修 |
| 可读性 | 段落/句子长度、术语一致 | 提示 |

结果写 `gates.json`，验收台显示 checklist；全部通过才进人工待审。

---

## 9. 图片

- **上传**：`POST /blog/upload`，原始 body；校验 magic bytes 与大小（≤10MB）；拒绝 SVG；存 `content/images/<hash>.<ext>`。
- **插入**：源码编辑器光标处插入 `![alt](/images/xxx.webp)`；工具栏“插入图片 / 设为封面”。
- **构建**：`content/images → docs/images`，`<img loading="lazy">`。
- **封面**：frontmatter `cover`，列表与 OG 使用；无封面时用文字版。
- **AI 封面**：v1.1，OpenAI 兼容接口，密钥存 `.blog/secrets.json`（0600）。

---

## 10. 构建与发布

### 10.1 产物

```
docs/
  .nojekyll
  index.html
  about.html
  404.html
  rss.xml
  sitemap.xml
  assets/site.css
  images/...
  posts/<slug>.html
```

### 10.2 规则

- 只发布 `status: published`。
- `url(path) = site.basePath + path`，所有内链/资源/canonical 统一走它。
- RSS 取最近 20 篇；sitemap 全量；canonical 用 `site.url + basePath`。
- 纯静态、零 JS、`prefers-color-scheme`、正文 720px。
- 构建先写临时目录，成功后替换 `docs/`，避免半成品。

### 10.3 自动化部署

**一次性配置**（设置页 / 首次引导）：

1. 确认 `blogRoot`（默认 `$DSH_HOME/blog`，不存在则创建并 `git init`）
2. 远程仓库：`git@github.com:<user>/<repo>.git` 或 HTTPS
3. 分支 `main`，产物目录 `docs`
4. GitHub 仓库 → Settings → Pages → Deploy from a branch → `main` / `docs`
5. 首次 `git push`，把内容与 `docs/` 一起推上去

**之后全自动**：

```
验收通过（或到达 publishAt）
  → build（写临时目录，成功才替换 docs/）
  → git add docs + commit
  → git push
  → 可选：fetch 线上 URL 探测 200
```

- 设置项 `autoPublish`（默认开）：验收通过即发布；关闭后需点“发布”。
- 推送失败 → 状态置 `pending-push`，产物保留，给“重试 / 检查凭据”入口。
- 非快进时先 `git pull --rebase` 再重试一次，仍失败则停下等人处理。
- 同一时间只允许一个部署任务；部署期间新内容进队列。
- `execFile('git', [...])` 固定参数，`GIT_TERMINAL_PROMPT=0`；不存 token，走用户凭据/SSH。
- 成功记录 commit hash 与线上 URL；失败保留完整 stderr。
- v1.1 可选：GitHub Actions 模板（内容 push → CI 构建 → `deploy-pages`），不再提交 `docs/`。

---

## 11. 客户端与 API

### 11.1 页面

| 页面 | 关键内容 |
|---|---|
| 看板 | 本月产出/待审/成本；队列与阶段进度；“跑下一批” |
| 选题 | 提案卡片；批准/毙掉；手动加题 |
| 文章 | 列表 + 详情（预览/源码/来源/门禁/日志）；通过/打回/重跑 |
| 设置 | 站点、规则、模型与预算、图片、发布、节奏 |

### 11.2 API

```
GET  /blog/state
GET/PUT /blog/settings
GET  /blog/posts
GET  /blog/posts/:slug
PUT  /blog/posts/:slug
POST /blog/posts/:slug/approve
POST /blog/posts/:slug/reject      { comment }
POST /blog/jobs                    { topicId | brief }
GET  /blog/jobs/:id
POST /blog/jobs/:id/retry          { stage }
POST /blog/jobs/:id/cancel
POST /blog/topics/propose
POST /blog/upload
POST /blog/render                  { markdown }
POST /blog/publish
GET  /blog/site/*
```

所有路由：`connection.requestRejection` + `sec-fetch-site` 同源校验 + 入参白名单。

---

## 12. 目录结构

```
dsh-blog/
  package.json            # dsh.bundle / dsh.client / exports
  cordis.patch.yml
  src/
    host.js               # apply()，注册路由
    routes.js
    auth.js
    store.js
    config.js
    jobs.js
    stages/{research,outline,draft,gates,revise}.js
    llm.js
    web.js
    render.js
    build.js
    deploy.js
    templates/
    i18n.js
  client/
    index.jsx
    pages/{board,topics,posts,settings}.jsx
    ui/
    styles.css
  scripts/build.mjs       # esbuild → dist/client.js
  test/
```

---

## 13. 里程碑与任务

> 人日为粗估，含自测，不含评审等待。

### M0 骨架与技术探针（1.5–2 人日）

- [ ] M0-0 仓库工程化：`git init`、README/LICENSE/CONTRIBUTING、`.github` 模板、CI、labels/milestones、Projects 看板
- [ ] M0-1 包骨架：`package.json`、`cordis.patch.yml`、`dsh.client`、`./client` 导出
- [ ] M0-2 esbuild 构建链：lazy CJS、React external、CSS 字符串
- [ ] M0-3 客户端挂载：`main`（key `blog`）+ `sidebar.panellist`
- [ ] M0-4 前缀路由 + 鉴权 + `/blog/state` 探针
- [ ] M0-5 服务探针：`llm.prepareCall`、`web.search`、`web.fetch`
- [ ] M0-6 安装到 profile，验证页面与接口

**验收**：侧栏出现入口，面板可开，`/blog/state` 返回 200，跨站请求 403，探针全部有结果。

### M1 内容与图片（3–4 人日）

- [ ] M1-1 `blogRoot` 初始化（默认 `$DSH_HOME/blog`）：目录、`site.json`、git 检测、`DSH_BLOG_ROOT` 覆盖
- [ ] M1-2 frontmatter 解析/序列化、slug 生成与去重
- [ ] M1-3 文章 CRUD API + 原子写 + 路径安全
- [ ] M1-4 markdown 渲染 + `/blog/render` 预览 + sanitize
- [ ] M1-5 图片上传、校验、md 插入、封面设置
- [ ] M1-6 客户端：文章列表、详情、源码编辑器、预览

**验收**：手动建一篇、插两张图、改元信息、保存并预览，刷新不丢。

### M2 生产流水线（5–7 人日）

- [ ] M2-1 job 状态机、持久化、恢复
- [ ] M2-2 `llm.js`：模型选择、流式、超时、重试、usage
- [ ] M2-3 research：query 生成、搜索、抓取、摘录、SSRF 防护
- [ ] M2-4 outline：JSON schema + 校验 + 重试
- [ ] M2-5 draft：逐节生成、拼装、字数检查
- [ ] M2-6 gates：引用对账、事实核查、查重、风格、SEO
- [ ] M2-7 revise：打回意见 → 新版本
- [ ] M2-8 验收台：预览/来源/门禁/日志 + 通过/打回/重跑
- [ ] M2-9 版本落盘与简单 diff

**验收**：一条 brief 产出过门禁的初稿；故意让第 3 节失败，能只重跑第 3 节；打回后生成新版本。

### M3 构建与 GitHub Pages（3–4 人日）

- [ ] M3-1 页面模板与主题（首页/文章/关于/404）
- [ ] M3-2 `build.js`：渲染、资源拷贝、原子替换
- [ ] M3-3 RSS、sitemap、`.nojekyll`、canonical、OG
- [ ] M3-4 自动部署：验收通过 → build → commit → push；`autoPublish` 开关
- [ ] M3-5 部署韧性：`pending-push`、rebase 重试、凭据错误提示
- [ ] M3-6 构建自检：内链、资源、basePath、线上探测
- [ ] M3-7 首次配置引导与文档（remote、Pages main/docs、首次 push）

**验收**：验收通过后无需手动操作即可上线；断开凭据时进入 `pending-push` 且可重试；项目页子路径资源不 404，RSS 可读。

### M4 工厂化（2–3 人日，v1.1 可延后）

- [ ] M4-1 队列批跑（顺序、并发 1）
- [ ] M4-2 定时发布（`publishAt`）+ 漏跑补一次
- [ ] M4-3 月度/单篇预算与暂停
- [ ] M4-4 选题提案（基于栏目、历史、关键词）
- [ ] M4-5 成本看板

**验收**：批准 3 个选题后一键跑完；预算超限自动停。

### M5 打磨（2 人日，v1.1）

- [ ] M5-1 版本列表与 diff 视图
- [ ] M5-2 英文 UI 与英文写作
- [ ] M5-3 示例内容与首次引导
- [ ] M5-4 主题与排版打磨
- [ ] M5-5 使用文档

### 版本切分

- **v1.0** = M0 + M1 + M2 + M3 + M4-1（队列手动批跑）
- **v1.1** = M4 剩余 + M5 + AI 封面 + 标签页/搜索

---

## 14. 测试策略

- **单元**：frontmatter、slug、`url()`、gate 判定、构建路径。
- **集成**：mock `llm`（固定 JSON）与 `web`（本地 fixture），跑完整流水线，断言 `docs/` 产物。
- **golden**：固定 fixture → 快照 `docs/` 关键文件。
- **手动清单**：安装、打开面板、上传图片、发布到测试仓库、线上检查。
- CI 不联网、不调真实模型。

---

## 15. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| `llm.prepareCall` 接口变动 | 高 | 收口在 `llm.js`；锁 engines；升级前跑探针 |
| `web` 无可用 provider | 中 | research 降级为“用户贴链接”；门禁标记“无来源” |
| GitHub 推送鉴权失败 | 中 | 自动 push 失败进 `pending-push`；错误给出修复命令；凭据不落盘 |
| 长文质量不稳 | 高 | 分段写 + 门禁 + 抽样人审；先固定 2–3 个栏目 |
| basePath/内链拼错 | 中 | `/repo/` 作为测试夹具；构建后自检 |
| XSS | 中 | markdown 禁原生 HTML；sanitize 白名单；拒 SVG |
| 单篇成本失控 | 中 | 单篇/月度预算；阶段级上限 |
| 路径含空格/中文、`DSH_HOME` 未设置 | 中 | 统一 `path.join`；`dshHome()` 兜底 `~/.dsh`；测试覆盖 |

---

## 16. 完成定义（v1.0）

- [ ] 插件可安装、可卸载，重启后状态不丢。
- [ ] 一条 brief 能产出可审长文，含来源与门禁结果。
- [ ] 图片可上传、插入、构建后正常显示。
- [ ] 一键发布到 GitHub Pages，线上可访问；验收通过后无需手动操作。
- [ ] 部署失败可进入 `pending-push` 并重试，不丢产物。
- [ ] 打回与单阶段重跑可用。
- [ ] 队列可批量跑，成本可见。
- [ ] 文档：安装、首次配置、发布步骤、常见问题。
- [ ] 干净环境按 README 可安装；默认内容在 `$DSH_HOME/blog`，卸载不丢。

---

## 17. 开发顺序理由

先做 M0 探针，因为四个高风险假设必须先证实：

1. 客户端 lazy CJS 能正常加载；
2. `main` / `sidebar.panellist` 注册与切换正常；
3. 前缀路由 + 鉴权可用；
4. `llm` 与 `web` 服务在当前版本可调。

这四条任何一条不成立，架构就要调整。之后按“内容 → 流水线 → 发布”推进，每一步都有可演示的产物。

---

## 18. 开源发布要求

这是开源项目，不是个人脚本，以下从 M0 就按标准执行：

### 18.1 可移植性

- [ ] 代码里不出现作者机器的绝对路径；统一走 `dshHome()` / `DSH_HOME`。
- [ ] 目录解析顺序固定：插件设置 → `DSH_BLOG_ROOT` → `$DSH_HOME/blog`。
- [ ] Windows / macOS / Linux 路径都用 `path.join`，不拼字符串。
- [ ] 测试用临时 `DSH_HOME`，不读写真实内容。

### 18.2 首次引导

- [ ] 首次打开检测 `blogRoot`：存在则读取，不存在则引导创建。
- [ ] 创建时生成 `site.json`、`editorial.md`、`content/`、`.blog/`，并 `git init`。
- [ ] 远程仓库可跳过；部署前再校验。
- [ ] 提供“在文件管理器中显示目录”入口。

### 18.3 包与文档

- [ ] `package.json`：`name`、`version`、`license: MIT`、`engines.dsh`、`files` 白名单。
- [ ] README：安装、截图、数据位置、首次配置、发布步骤、卸载、安全说明。
- [ ] CHANGELOG 与版本号策略；`site.json` / job 结构带 `schemaVersion` 迁移。
- [ ] 插件图标、中英文文案、locale 资源齐全。
- [ ] 不采集遥测；密钥只存 `.blog/secrets.json`（0600），永不进 git。

### 18.4 工程与 CI

- [ ] 仓库 CI 只跑 `npm test` 与 `npm run build`（构建插件，不构建博客站）。
- [ ] 测试覆盖 frontmatter、slug、URL 重写、门禁、构建产物。
- [ ] `npm pack` 产物可在干净环境安装验证。
- [ ] CONTRIBUTING、Issue 模板、SECURITY 说明。

### 18.5 数据与卸载

- [ ] 卸载插件不删 `blogRoot`；文档明确写出内容位置。
- [ ] 删除内容只走显式操作，并提示先备份/推送。

---

## 19. GitHub 项目管理

### 19.1 仓库与分支

- 公开仓库，MIT；`main` 为唯一长期分支，开启保护：禁止直接 push，要求 PR + CI 通过。
- Trunk-based：分支短命，命名 `feat/<issue>-<slug>`、`fix/<issue>-<slug>`、`docs/<slug>`、`chore/<slug>`。
- Conventional Commits：`feat(host): ...`、`fix(pipeline): ...`、`docs: ...`。
- Squash merge；PR 标题同样用 Conventional 格式。

### 19.2 工作项

- **一个任务一个 issue**，标题如 `[M0-1] 包骨架与双半片导出`，正文写验收标准。
- Labels：
  - `type:feature` / `type:bug` / `type:docs` / `type:chore`
  - `area:host` / `area:client` / `area:pipeline` / `area:publish` / `area:dx`
  - `priority:P0` / `P1` / `P2`
  - `status:blocked` / `status:needs-review`
- Milestone 对应 M0–M5；GitHub Projects 看板列：Backlog / Ready / In progress / In review / Done。
- Issue 模板：feature、task、bug；bug 必须带复现步骤、DSH 版本、日志。

### 19.3 PR

- 模板固定：关联 issue、改了什么、为什么、怎么验证、截图/录屏、风险与回滚。
- 正文写 `Closes #<issue>`；一个 PR 只做一件事，尽量 < 400 行。
- CI 绿才能合并；合并前自审一遍 diff。
- 不合并自己都说不清验证方式的 PR。

### 19.4 CI

- `.github/workflows/ci.yml`：PR 与 main 触发。
- Node 20 / 22 矩阵：`npm ci` → `npm test` → `npm run build` → `npm pack --dry-run`。
- CI 不联网、不调真实模型、不读写 `~/.dsh`；缓存 npm。
- Dependabot 每周检查依赖。

### 19.5 发布

- 每个里程碑一个 release；版本映射：

| 里程碑 | 版本 |
|---|---|
| M0 | v0.1.0 |
| M1 | v0.2.0 |
| M2 | v0.3.0 |
| M3 | v0.4.0 |
| v1.0 DoD | v1.0.0 |

- 流程：release PR 更新 CHANGELOG → 合并 → tag `vX.Y.Z` → GitHub Release（附 tgz）。
- 预发布用 `v0.x.0-rc.N`；npm publish 可选，不阻塞。

### 19.6 每个 issue 的完成定义

- 测试覆盖新增逻辑；`npm test` 与 `npm run build` 通过。
- 用户可见变化更新 CHANGELOG 与文档。
- 不引入回归；PR 已自审并合并。

### 19.7 我们俩的协作方式

- 我按任务开 issue → 建分支 → 小步提交 → 开 PR → 写验证说明；你 review 后合并。
- 如果本机 `gh` 已登录且远程仓库就绪，我可以直接用 `gh` 建 issue/PR；否则我本地建分支与提交，你推送或合并。
- 每个里程碑结束出一次简短复盘：完成了什么、延期什么、下一阶段风险。


