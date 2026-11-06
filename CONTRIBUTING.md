# 贡献指南

## 开发流程

本项目按 GitHub Flow 开发，流程见[开发计划 §19](docs/DEVELOPMENT_PLAN.md#19-github-项目管理)。

1. 每个任务先有 issue（标题 `[M0-1] ...`，正文写验收标准）。
2. 从 `main` 拉短命分支：`feat/<issue>-<slug>`、`fix/<issue>-<slug>`、`docs/<slug>`、`chore/<slug>`。
3. 提交用 Conventional Commits：`feat(host): ...`、`fix(pipeline): ...`、`docs: ...`。
4. 开 PR，正文写 `Closes #<issue>`，CI 通过后 Squash merge。

## 本地检查

```bash
npm test
npm run build
```

## 约定

- 不直接 push `main`。
- 一个 PR 只做一件事，尽量小于 400 行。
- 新增逻辑要有测试；用户可见变化更新 CHANGELOG。
- 不提交密钥、日志或本地内容目录。
