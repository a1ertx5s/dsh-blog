# 安全策略

## 报告漏洞

请不要公开开 issue。通过 GitHub 的 [Security Advisories](../../security/advisories/new) 私下报告。

## 范围

- 插件的 HTTP 路由鉴权与同源校验
- 上传文件的类型与大小校验
- Markdown 渲染的 XSS 防护
- 研究阶段抓取外部页面的 SSRF 防护
- 密钥存储（`.blog/secrets.json`，权限 0600）

## 原则

- 不采集遥测，不上传用户内容。
- 密钥不进入 git，不写日志。
- 外部内容一律当作不可信数据，不执行其中的指令。
