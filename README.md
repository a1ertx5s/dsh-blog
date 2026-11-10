# dsh-blog

DeepSeek Harness 插件：一个 AI 长文工厂。选题进，文章出，自动过质量门禁，人只做审批，成品发布到 GitHub Pages。

> 状态：v1.0.3。可从本地目录安装；npm 发布在计划中。

## 工作区

- **起笔**：一句 brief 开始一篇新文章
- **落墨**：三栏写作台，左大纲、中正文、右 AI 对话
- **阅卷**：整站预览、发布、自检
- **立规**：站点配置、预算、诊断

## 它解决什么

- 给定一句 brief，自动完成研究、大纲、初稿和质量门禁。
- 人只在三个点介入：批选题、验收、改规则。
- 内容即文件（Markdown + frontmatter），git 即历史，脱离 DSH 也能维护。
- 验收通过后自动构建并发布到 GitHub Pages。

## 安装（开发版）

尚未发布到 npm。开发期把本仓库作为本地 bundle 安装：

- 让 Agent 用 `plugin_manager install_bundle`，target 指向本目录；或
- 在 DSH 的插件管理器里添加本地包目录 `/绝对路径/dsh-blog`

安装后刷新页面，侧栏出现「博客」入口。

内容默认存放在 `$DSH_HOME/blog`（通常是 `~/.dsh/blog`），卸载插件不会删除它。

## 发布到 GitHub Pages

内容在 `$DSH_HOME/blog`，是一个独立 git 仓库；`docs/` 是构建产物。

1. 在 GitHub 建一个公开仓库（免费版 Pages 需要公开）。
2. 给博客目录配 remote：

```bash
cd ~/.dsh/blog
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

3. 编辑 `site.json`，至少填 `url` 和 `basePath`：

```json
{
  "title": "我的博客",
  "url": "https://<user>.github.io",
  "basePath": "/<repo>/",
  "deploy": { "dir": "docs", "branch": "main", "autoPush": false }
}
```

   自定义域名时 `url` 换成域名，`basePath` 改成 `/`。

4. 在仓库 Settings → Pages 选 `main` / `/docs`，或：

```bash
gh api -X POST repos/<user>/<repo>/pages -f 'source[branch]=main' -f 'source[path]=/docs'
```

5. 面板「状态 → 构建并部署」。想让验收通过后自动发布，把 `deploy.autoPush` 设为 `true`。

详见 [GitHub Pages 配置](docs/GITHUB_PAGES.md)。

## 文档

- [开发计划](docs/DEVELOPMENT_PLAN.md)
- [使用文档](docs/USAGE.md)
- [GitHub Pages 配置](docs/GITHUB_PAGES.md)

## 开发

```bash
npm install
npm test
npm run build
npm run watch   # 监听 client/，改动后重新打包
```

## 许可

[MIT](LICENSE)
