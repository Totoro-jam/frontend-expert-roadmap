# Figma → Code 同步全流程

> 解决:设计师改了颜色,前端不知道 → 三周后才发现产品已经不一致

---

## 三层架构

```
Figma                Tokens Studio              Git Repo                  CI
 │                       │                          │                       │
 │ 设计师调颜色          │                          │                       │
 ├──────────────────────>│ 同步 JSON                │                       │
 │                       ├─────────────────────────>│ Pull Request          │
 │                       │                          ├──────────────────────>│ Style Dictionary
 │                       │                          │                       │   生成
 │                       │                          │<──────────────────────┤
 │                       │                          │ commit 多平台代码     │
 │                       │                          │                       │
 │                       │                          │  npm publish @org/tokens
 │                       │                          │                       │
 │                       │                          │  应用 npm update
 V                       V                          V                       V
```

---

## 步骤

### 1. Figma 端:Tokens Studio 插件

1. 装 [Tokens Studio for Figma](https://tokens.studio/) (免费版够用)
2. 在 Figma 文件里定义 tokens(color / spacing / typography / shadow / radius / motion)
3. 在 token 编辑器里绑 Git remote(GitHub / GitLab / Bitbucket / ADO)
   - 仓库:`org/design-tokens`
   - 分支:`figma-tokens`(隔离,工程师再 review)
   - 路径:`tokens/`(对应 Style Dictionary source)

设计师改完点「Push」→ 自动开 PR。

### 2. Git 端:JSON 结构

```
tokens/
├── color/
│   ├── reference.json      # blue.500 之类原始值
│   └── semantic.json       # bg.canvas / text.primary
├── spacing.json
├── typography.json
├── radius.json
├── shadow.json
└── $themes.json            # 主题映射(light / dark)
```

格式遵循 [W3C Design Tokens 草案](https://design-tokens.github.io/community-group/format/):

```json
{
  "color": {
    "blue": {
      "500": { "$type": "color", "$value": "#3b82f6" }
    }
  }
}
```

### 3. CI:Style Dictionary 自动构建

`.github/workflows/build-tokens.yml`:

```yaml
name: Build tokens
on:
  pull_request:
    paths: ['tokens/**']
  push:
    branches: [main]
    paths: ['tokens/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }

      - run: pnpm install
      - run: pnpm run build:tokens           # 跑 style-dictionary

      # PR:仅 diff 检查
      - if: github.event_name == 'pull_request'
        run: git diff --exit-code dist/      # 输出有变则失败,要求 commit
        continue-on-error: true              # 加评论提示

      # main:自动 commit 输出 + 发包
      - if: github.event_name == 'push'
        run: |
          git config user.name "tokens-bot"
          git config user.email "bot@example.com"
          git add dist/
          git diff --staged --quiet || git commit -m "chore: rebuild tokens"
          git push

      # changesets 发包
      - if: github.event_name == 'push'
        uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4. 应用端:消费

```json
// package.json
{
  "dependencies": {
    "@yourorg/tokens": "^1.4.0"
  }
}
```

```css
/* 应用入口 */
@import '@yourorg/tokens/css/tokens.css';

.button {
  background: var(--color-action-primary);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
  transition: background var(--motion-duration-fast) var(--motion-easing-out);
}
```

```ts
// 或 TS 消费
import { tokens } from '@yourorg/tokens'
const primary = tokens['color-action-primary']
```

### 5. 反向流(代码 → Figma)

少见但有用:工程师修了 token,推 JSON 回 Figma。
Tokens Studio 也支持 pull 模式,但要给设计师培训。

---

## 治理规则

| 谁 | 能改什么 | Review 谁 |
|---|---|---|
| 设计师 | reference + semantic value | 设计 + 工程 lead |
| 工程师 | platform 输出 + 配置 | 工程师 + 设计 lead |
| Bot | dist/* 自动生成 | 无 |

**版本约定**:
- token 改值 → patch(`1.4.0 → 1.4.1`)
- 新增 token → minor
- 删除 / 重命名 → **major**(breaking,产品全量 codemod)

**改 token 的 PR 模板**:
```
影响:
- [ ] 已 review 视觉差异(截屏对比)
- [ ] 已通知工程团队
- [ ] 已记 changelog 并加 visual regression 测试
```

---

## 常见坑

### 1. Figma 颜色和 CSS 不一致
Figma 默认 sRGB,Display P3 屏幕显示偏色 → 输出时统一用 sRGB hex / 显式 P3。

### 2. 设计师在 Figma 上「直接画颜色」绕过 token
→ 用 Figma Linter / Plugin 扫描使用了哪些 token 之外的值。

### 3. token 改了但应用 cache 没刷
→ CSS 文件名带 hash(`tokens.[hash].css`)+ 应用走 import 重新打包。

### 4. 设计师改一个 token 影响 50 个组件,review 时看不出
→ Chromatic / Percy 跑视觉回归:任何组件像素差异都开 review,设计师必须批准。

### 5. 暗色模式 token 不对称
→ 不要按 light/dark 命名 token(❌ `colorLightBg`),用语义名(✅ `colorSurface`),映射在主题层处理。

### 6. 跨平台输出走样(iOS 不接 var())
→ Style Dictionary 自动生成 Swift class / Android XML,移动端直接消费输出文件,不消费 CSS。

---

## 真实案例

- **Atlassian Design Tokens**:[GitHub](https://github.com/atlassian/design-tokens-website)
- **Shopify Polaris Tokens**:[GitHub](https://github.com/Shopify/polaris/tree/main/polaris-tokens)
- **GitHub Primer**:[GitHub](https://github.com/primer/primitives)
- **Adobe Spectrum Tokens**:[GitHub](https://github.com/adobe/spectrum-tokens)

逐个读源码 → 看大公司怎么组织 token 命名和 Figma 同步。
