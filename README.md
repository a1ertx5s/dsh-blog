# dsh-blog

DeepSeek Harness 插件：一个 AI 长文工厂。选题进，文章出，自动过质量门禁，人只做审批，成品发布到 GitHub Pages。

> 状态：早期开发中，尚不可安装。

## 它解决什么

- 给定一句 brief，自动完成研究、大纲、初稿和质量门禁。
- 人只在三个点介入：批选题、验收、改规则。
- 内容即文件（Markdown + frontmatter），git 即历史，脱离 DSH 也能维护。
- 验收通过后自动构建并发布到 GitHub Pages。

## 文档

- [开发计划](docs/DEVELOPMENT_PLAN.md)

## 开发

开发环境在 M0 建立，届时补齐以下命令：

```bash
npm install
npm test
npm run build
```

## 许可

[MIT](LICENSE)
