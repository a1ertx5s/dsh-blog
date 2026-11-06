# GitHub Pages 配置

dsh-blog 的发布模型是：**内容仓库 + `docs/` 静态产物**。文章和 `site.json` 在 `$DSH_HOME/blog`，构建后写入 `docs/`，由 GitHub Pages 直接托管。

## 1. 仓库与 Pages

- Pages 免费版要求仓库公开。
- 项目页地址是 `https://<user>.github.io/<repo>/`，`basePath` 必须是 `/<repo>/`。
- 用户页/自定义域名是根路径，`basePath` 用 `/`。

在仓库 **Settings → Pages** 选择：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

也可以用 API：

```bash
gh api -X POST repos/<user>/<repo>/pages \
  -f 'source[branch]=main' -f 'source[path]=/docs'
```

## 2. site.json

```json
{
  "schemaVersion": 1,
  "title": "我的博客",
  "description": "长文、工程笔记与思考。",
  "url": "https://<user>.github.io",
  "basePath": "/<repo>/",
  "author": "<name>",
  "lang": "zh-CN",
  "nav": [{ "label": "关于", "href": "/about.html" }],
  "deploy": { "dir": "docs", "branch": "main", "autoPush": false }
}
```

| 字段 | 说明 |
|---|---|
| `url` | 站点源，用于 canonical、RSS、sitemap。为空时构建会 warning，feed 使用相对链接 |
| `basePath` | 以 `/` 开头和结尾；项目页写 `/<repo>/`，自定义域名写 `/` |
| `deploy.dir` | 构建输出目录，默认 `docs` |
| `deploy.autoPush` | 验收通过/文章发布时是否自动 commit + push |

## 3. 构建与部署

- 「状态 → 构建站点」只写 `docs/`，不提交。
- 「状态 → 构建并部署」执行 build → `git add docs` → commit → push；推送被拒会 `pull --rebase` 后重试一次。
- 文章详情「发布」会把状态改成 `published` 并构建；`autoPush` 为 true 时同时提交 `content` + `docs`。
- 部署结果写在 `.blog/deploy.json`，失败原因在面板上可见。

## 4. 自检

「状态 → 运行自检」检查：

- `docs/index.html` 和 `.nojekyll` 是否存在
- 所有根相对链接是否以 `basePath` 开头
- 链接指向的文件是否存在

线上 404 时优先看这三项。

## 5. 常见问题

**站点 404**

- Pages 的目录是否选了 `/docs`
- 仓库是否是公开的（免费版）
- `basePath` 是否和仓库名一致，且首尾都有 `/`

**样式/图片 404**

- `basePath` 写错最常见；项目页必须是 `/<repo>/`
- 图片放在 `content/images/`，构建会复制到 `docs/images/`

**推送失败**

- 面板显示 `pending`/错误信息；修好凭据后重新点「构建并部署」
- 本地 git 需要 push 权限；插件不保存 token
