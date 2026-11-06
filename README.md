# dsh-blog

DeepSeek Harness 插件：一个 AI 长文工厂。选题进，文章出，自动过质量门禁，人只做审批，成品发布到 GitHub Pages。

> 状态：早期开发中。可从本地目录安装，尚未发布到 npm。

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

## 文档

- [开发计划](docs/DEVELOPMENT_PLAN.md)

## 开发

```bash
npm install
npm test
npm run build
npm run watch   # 监听 client/，改动后重新打包
```

## 许可

[MIT](LICENSE)
