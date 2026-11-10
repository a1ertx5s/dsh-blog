# Tab 液态玻璃样式 开发计划

| 项目 | 内容 |
|---|---|
| 版本 | v1.0.2（UI 小改） |
| 日期 | 2026-11-10 |
| 状态 | 待评审 |
| 范围 | 仅顶部 Tab 栏的视觉与交互 |
| 前置 | v1.0.1 已发布；四 Tab 已就位 |

---

## 0. 一句话

把顶部 Tab 从“普通按钮条”改成 iOS 液态玻璃质感：半透明、模糊、高光边缘、胶囊滑动指示器。

---

## 1. 目标与非目标

### 1.1 目标

- Tab 栏呈现玻璃质感：背景模糊、半透明、细高光边框、内阴影。
- 选中态用一枚**滑动胶囊**，在 Tab 之间平滑移动，而不是切换背景色。
- 支持浅色 / 暗色 / 玻璃后面的内容透出。
- 动效克制：200–300ms，`cubic-bezier(0.22, 1, 0.36, 1)`，尊重 `prefers-reduced-motion`。
- 不改变四个 Tab 的文案与顺序。

### 1.2 非目标

- 不做全站玻璃化（只改 Tab 栏）。
- 不引入 UI 组件库或动画库。
- 不改路由 / 数据 / 权限。
- 不做 iOS 原生毛玻璃的完全复刻（Web 上靠 `backdrop-filter` 近似）。

---

## 2. 关键决策

| # | 决策 | 理由 | 可逆性 |
|---|---|---|---|
| D1 | 用纯 CSS 实现，不引第三方库 | 体积敏感（client 已 440KB） | 高 |
| D2 | 选中态用滑动胶囊（一个绝对定位元素） | 比逐项改背景更接近 iOS | 高 |
| D3 | 依赖 `backdrop-filter: blur()`，不支持时降级为半透明底色 | Safari/Chrome 均支持；Firefox 旧版降级 | 高 |
| D4 | 玻璃层用 `::before` + `box-shadow` 做高光 | 避免额外 DOM | 高 |
| D5 | 胶囊位置由 JS 测量 Tab 的 offset 计算 | 文本宽度不固定（中英文），CSS 无法精确 | 中 |
| D6 | 动效用 transform + transition，不用 layout 属性 | 避免重排 | 高 |

---

## 3. 视觉规格

### 3.1 容器

```
圆角：999px（胶囊条）
高度：44px
内边距：4px
背景：rgba(255,255,255,0.55) / 暗色 rgba(30,30,32,0.55)
模糊：backdrop-filter: blur(18px) saturate(180%)
边框：1px solid rgba(255,255,255,0.35)（暗色 rgba(255,255,255,0.12)）
外阴影：0 8px 30px rgba(0,0,0,0.10)
内高光：inset 0 1px 0 rgba(255,255,255,0.6)
```

### 3.2 选中胶囊

```
位置：绝对定位，left/top 由 JS 计算
圆角：999px
背景：rgba(255,255,255,0.85) / 暗色 rgba(255,255,255,0.14)
阴影：0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)
过渡：transform 260ms cubic-bezier(0.22,1,0.36,1), width 260ms
```

### 3.3 Tab 文字

```
默认：次要色，13px，字重 500
选中：主文字色，字重 600
hover：主文字色 + 轻微背景提亮
```

### 3.4 布局

- Tab 栏居中或靠左？保持现有“靠左、kicker 右侧留白”的布局。
- 窄屏下允许横向滚动，胶囊随之移动。
- 与页面内容之间保持 12–16px 间距。

---

## 4. 交互

1. 点击 Tab：胶囊滑到目标位置，内容切换。
2. 键盘：Tab 键聚焦，左右方向键切换，Enter 激活；焦点环用内描边，不用外部粗框。
3. 窗口 resize：重新测量胶囊位置。
4. 字体加载完成：重新测量（避免宽度变化导致错位）。
5. 首次渲染：胶囊无动画，直接定位；之后才有过渡。

---

## 5. 实现

### 5.1 组件

`client/GlassTabs.jsx`

```jsx
<GlassTabs
  items={[{ key, label }]}
  value={tab}
  onChange={setTab}
/>
```

内部：

- `ref` 到容器和每个 tab
- `useLayoutEffect` 测量选中项 `offsetLeft/offsetWidth`，写入 CSS 变量 `--pill-x` / `--pill-w`
- `ResizeObserver` 监听容器与字体
- `role="tablist"` / `role="tab"` / `aria-selected`

### 5.2 样式

新增 `client/glass-tabs.css`（或并入 styles.css）：

- `.glass-tabs`、`.glass-tabs__pill`、`.glass-tabs__item`
- 用 `:root` 或 `.blog-root` 变量区分明暗
- 降级：`@supports not (backdrop-filter: blur(1px))` → 不透明底色

### 5.3 接入

`client/index.jsx` 顶部 `nav.blog-nav` 替换为 `<GlassTabs />`，其余逻辑不变。

---

## 6. 验收

- [ ] 四个 Tab 视觉为玻璃胶囊条，选中项有滑动胶囊
- [ ] 浅色/暗色都清晰，文字对比度达标
- [ ] 点击、键盘、resize 后胶囊位置正确
- [ ] `prefers-reduced-motion` 下无滑动动画
- [ ] 不支持 `backdrop-filter` 时降级可读
- [ ] 窄屏可横向滚动
- [ ] 不改变 Tab 顺序与路由行为
- [ ] client 体积增量 < 2KB（纯 CSS + 小组件）

---

## 7. 任务

### M12 玻璃 Tab（0.5 人日）

- [ ] M12-1 `GlassTabs` 组件与测量逻辑
- [ ] M12-2 玻璃容器与胶囊样式
- [ ] M12-3 暗色与降级
- [ ] M12-4 键盘与无障碍
- [ ] M12-5 接入 index，替换旧 nav

---

## 8. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| `backdrop-filter` 性能 | 中 | 只作用于 Tab 栏；避免大面积 |
| 中文字体加载后宽度变化 | 低 | 字体加载后重新测量 |
| Firefox 旧版无模糊 | 低 | `@supports` 降级为不透明 |
| 胶囊与文字错位 | 中 | 用 `offsetLeft/offsetWidth`，加 `ResizeObserver` |
| 键盘方向键与页面滚动冲突 | 低 | 仅在 Tab 获得焦点时拦截 |

---

## 9. GitHub Flow

- 一个 issue：`[M12] Tab 液态玻璃样式`
- 分支 `feat/<issue>-glass-tabs`
- PR 带前后截图
- CI 绿后 squash merge
- 版本 `v1.0.2`，更新 CHANGELOG
