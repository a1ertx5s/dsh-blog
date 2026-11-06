# 使用文档

## 安装

把本仓库作为本地 bundle 安装到 DSH：

- 让 Agent 用 `plugin_manager install_bundle`，target 指向本目录；或
- 插件管理器里添加本地包目录 `/绝对路径/dsh-blog`

安装后刷新页面，侧栏出现「博客」。

## 内容目录

默认 `$DSH_HOME/blog`（通常 `~/.dsh/blog`）：

```
site.json            站点配置
editorial.md         作者手册
content/posts/*.md   文章（Markdown + frontmatter）
content/images/      图片
content/about.md     关于页
docs/                构建产物
.blog/               job、版本、队列、构建/部署状态（不提交）
```

## 站点配置

```json
{
  "title": "我的博客",
  "url": "https://<user>.github.io",
  "basePath": "/<repo>/",
  "lang": "zh-CN",
  "budget": { "perArticleTokens": 0, "monthlyTokens": 0 },
  "deploy": { "dir": "docs", "branch": "main", "autoPush": false }
}
```

- `basePath`：项目页 `/<repo>/`，自定义域名 `/`
- `budget`：0 表示不限；超出后 job 失败，队列暂停
- `autoPush`：验收通过或发布时自动 commit + push

## 生产

「生产」页：

1. 填 brief →「开始生产」，或「生成选题」勾选后「加入队列」
2. 流程：研究 → 大纲 → 初稿 → 门禁（不过自动回炉一次）→ 待审
3. 待审时「产物」看来源/大纲/门禁，「打开文章」看稿
4. 「通过」或「打回」（打回意见触发重写）
5. 多个 queued job 可「全部运行」，并发 1

可选定时发布：创建时选时间；job 通过后到点自动发布。停机错过的，启动时补一次。

## 门禁

- 引用对账：`[n]` 不越界，带数字无引用的段落不过多
- SEO：标题/摘要长度、slug、图片 alt
- 查重：与历史文章相似度
- 风格：按 `editorial.md` 打分
- 事实核查：逐条 supported/unsupported

模型不可用时风格/事实标记 skipped，不阻塞。

## 发布

「状态」页：

- 构建站点：只写 `docs/`
- 构建并部署：build → add docs → commit → push
- 运行自检：basePath、内链、资源、`.nojekyll`

文章详情「发布」会把状态改为 `published` 并构建；`autoPush` 为 true 时同时提交 `content` + `docs`。

GitHub Pages 设置见 [GITHUB_PAGES.md](GITHUB_PAGES.md)。

## 版本

文章详情「版本」页列出历史快照，可看行级 diff，可恢复；恢复本身也会存一份新快照。

## 预算与成本

- 每次模型调用的 usage 累计到 job
- 单篇/月度上限在 `site.json.budget`
- 「状态 → 预算 / 成本」查看本月用量与 Top job

## FAQ

**搜索 401**

插件会优先复用活跃的 `deepseek-account` 会话；没有时退回 `DEEPSEEK_API_KEY`。检查 Web search 设置或登录状态。

**部署失败**

看「状态」页错误；修好 git 凭据后重试。产物不会丢，重新部署即可。

**页面 404**

确认 Pages 目录是 `/docs`、仓库公开、`basePath` 与仓库名一致。
