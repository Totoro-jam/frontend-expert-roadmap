# 19 · Design Systems Lab

> 设计系统不是「组件库」,是「设计 → 代码」的整套契约。
> Tokens(数据)→ Primitives(无样式行为)→ Components(样式化)→ Patterns(组合)→ Docs(用法)。

---

## 学这个能干什么

- 拆 design tokens:color / spacing / typography / radius / motion 全部数据化
- 用 Style Dictionary / Tokens Studio 把 Figma tokens → CSS vars / TS const / iOS / Android
- 选 headless 库做底层(Radix / Headless UI / Ark UI),自己只管视觉
- 落主题切换 + dark mode + 高对比度模式 + 国际化(RTL)
- 用 Storybook + Chromatic 维护组件文档 + 视觉回归测试
- 让设计师和工程师在 Figma + Tokens Studio 同步,不再口口相传

---

## Roadmap

### 1. 设计系统的 5 层架构

```
                ┌─────────────────────────┐
                │   Patterns / Templates  │  ← 登录页 / 商品卡 / 设置面板
                ├─────────────────────────┤
                │      Components         │  ← Button / Input / Card / Modal
                ├─────────────────────────┤
                │    Primitives (Headless)│  ← Radix Dialog / Menu / Combobox
                ├─────────────────────────┤
                │   Tokens (Semantic)     │  ← color.bg.primary / spacing.4
                ├─────────────────────────┤
                │   Tokens (Reference)    │  ← blue.500 / 16px
                └─────────────────────────┘
```

**Reference tokens** = 原始值(`blue-500: #3b82f6`)
**Semantic tokens** = 语义引用(`color-action-primary: var(--blue-500)`)
**dark mode** = 语义层换源(`color-action-primary: var(--blue-400)` in dark)

### 2. Design Tokens 分类

| 类别 | 例子 | 数量 |
|---|---|---|
| Color | bg, text, border, action × 各种状态 | 50-200 |
| Spacing | 0, 1, 2, 3, 4, 6, 8, 12, 16... | 10-20 |
| Typography | font-family / size / weight / lineHeight | 20-50 |
| Radius | none, sm, md, lg, full | 5-8 |
| Shadow | sm, md, lg, focus-ring | 5-10 |
| Motion | duration / easing / spring | 10-20 |
| Z-index | dropdown, sticky, modal, toast | 5-10 |
| Breakpoint | sm, md, lg, xl, 2xl | 5-6 |

### 3. 工具链

#### 3.1 Style Dictionary(Amazon,业界标准)
```json
// tokens/color.json
{
  "color": {
    "blue": {
      "500": { "value": "#3b82f6" }
    },
    "action": {
      "primary": { "value": "{color.blue.500}" }
    }
  }
}
```

```js
// build.js → 输出 CSS / SCSS / JS / iOS / Android
StyleDictionary.extend('config.json').buildAllPlatforms()
```

输出:
```css
:root {
  --color-blue-500: #3b82f6;
  --color-action-primary: #3b82f6;
}
```
```ts
export const color = { actionPrimary: '#3b82f6' }
```

#### 3.2 Tokens Studio(Figma 插件)
- 设计师在 Figma 改 tokens
- 推 JSON 到 Git
- CI 跑 Style Dictionary 生成代码
- 工程师 npm i 就拿到最新 tokens
- → 设计/开发不再 sync 颜色

#### 3.3 现代替代
- **Panda CSS**:运行时 0,token 驱动,recipe / pattern 强
- **Vanilla Extract**:zero-runtime CSS-in-TS
- **Stitches**:CSS-in-JS + theme tokens(虽已停维护,思想精彩)
- **CSS Custom Properties + PostCSS**:最朴素也最不会废弃

### 4. 主题切换(Light / Dark / Custom)

```css
:root {                              /* light(默认)*/
  --color-bg: #fff;
  --color-text: #111;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #111;
    --color-text: #f5f5f5;
  }
}

[data-theme='dark'] {                /* 手动覆盖 */
  --color-bg: #111;
  --color-text: #f5f5f5;
}

[data-theme='midnight'] {            /* 第三套 */
  --color-bg: #0a0a23;
  --color-text: #c9d1d9;
}
```

切换:
```ts
document.documentElement.dataset.theme = 'dark'
localStorage.setItem('theme', 'dark')

// 防 FOUC:HTML head 里同步读取并设置(再 hydrate)
<script>
  document.documentElement.dataset.theme = localStorage.theme ?? 'light'
</script>
```

完整方案:`next-themes`(SSR 友好,处理 hydration mismatch)

### 5. headless 组件库选型

| 库 | 框架 | 风格 | 推荐场景 |
|---|---|---|---|
| **Radix Primitives** | React | 完整 a11y, asChild | 中大型设计系统 |
| **Headless UI** | React / Vue | Tailwind 团队出品 | Tailwind 项目 |
| **Ark UI** | React/Vue/Solid | 多框架同源 | 跨框架团队 |
| **React Aria** | React | Adobe,a11y 最严 | 严格 a11y 要求 |
| **Floating UI** | 任意 | popper / tooltip 定位 | 任何弹层 |
| **TanStack** | 任意 | Table / Virtual / Form | 数据密集 UI |

### 6. shadcn/ui 模式(最热门 2024+)

不是 npm 包,是「复制源码」:
```sh
npx shadcn-ui@latest add button
# → 把 Button 源码拷贝到你的 components/ui/button.tsx
```

**优点**:
- 完全可改(源码在你仓库里)
- 不锁版本(不会跟着库走崩)
- Tailwind + Radix + class-variance-authority 黄金三件套

**缺点**:
- 升级要手动 merge
- 多人/多项目共享要自建分发

### 7. class-variance-authority(cva)

```ts
// 解决「组件 + variant 组合爆炸」
import { cva, type VariantProps } from 'class-variance-authority'

const button = cva('inline-flex items-center font-medium rounded', {
  variants: {
    intent: {
      primary: 'bg-blue-500 text-white hover:bg-blue-600',
      ghost: 'bg-transparent text-blue-500 hover:bg-blue-50',
    },
    size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-6 text-lg' },
    fullWidth: { true: 'w-full' },
  },
  compoundVariants: [
    { intent: 'primary', size: 'lg', class: 'shadow-lg' },
  ],
  defaultVariants: { intent: 'primary', size: 'md' },
})

type Props = VariantProps<typeof button> & ButtonHTMLAttributes<HTMLButtonElement>

function Button({ intent, size, fullWidth, className, ...p }: Props) {
  return <button className={button({ intent, size, fullWidth, className })} {...p} />
}
```

替代品:`tailwind-variants` / `vanilla-extract recipes`。

### 8. Tailwind 风格 vs CSS-in-JS vs CSS Modules

| | 优点 | 缺点 |
|---|---|---|
| **Tailwind** | 一致性高 / 配 design tokens 完美 / 0 运行时 | class 一长串 / 学曲线 |
| **CSS-in-JS (Emotion/SC)** | 动态化好 / 主题切换灵活 | 运行时开销 / SSR 复杂 |
| **CSS Modules** | 标准 / 简单 / 无运行时 | 主题切换需 CSS vars 配合 |
| **Vanilla Extract** | TS 类型 + 零运行时 | 学曲线 |
| **Panda CSS** | tokens 友好 / 零运行时 / cva 原生 | 新,生态小 |

2024+ 主流:Tailwind + CSS vars 主题 + cva variants + Radix primitives = 最稳。

### 9. Storybook(组件文档 / 测试 / 协作)

```ts
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Inputs/Button',
  component: Button,
  argTypes: {
    intent: { control: 'select', options: ['primary', 'ghost'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
}
export default meta

export const Primary: StoryObj<typeof Button> = {
  args: { intent: 'primary', children: 'Click me' },
}

export const AllSizes: StoryObj<typeof Button> = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button size="sm">SM</Button>
      <Button size="md">MD</Button>
      <Button size="lg">LG</Button>
    </div>
  ),
}
```

配套:
- **Chromatic**:Storybook 截屏 + 视觉回归 + Figma diff
- **@storybook/addon-a11y**:每 story 跑 axe
- **@storybook/test-runner**:Storybook 当 e2e 跑(Playwright)

### 10. 文档站

| 工具 | 特色 |
|---|---|
| **Storybook** | 组件展示 + controls + a11y |
| **Docusaurus** | 介绍文档(Meta 出品)|
| **Nextra** | Next 写 mdx 文档 |
| **VitePress** | Vue 团队 |
| **Astro Starlight** | 多框架 |
| **Mintlify** | 商业,体验最佳 |

### 11. 设计师协作流程

```
Figma(token + 组件)
   │
   ↓ Tokens Studio 插件
   │
JSON token (Git PR)
   │
   ↓ CI 跑 Style Dictionary
   │
CSS / TS / iOS / Android 输出
   │
   ↓ 自动发包 @org/tokens@1.2.0
   │
应用 npm update
```

设计师审 PR → 设计 sync 保证。
真实大公司:Atlassian / Shopify Polaris / Adobe Spectrum / IBM Carbon。

### 12. 常见陷阱

- **token 太多记不住** → 限制语义层数量(最好 < 100 个语义 token)
- **暗色模式语义乱套** → 不要按 light/dark 起名(用 surface-elevated 之类)
- **a11y 后补** → headless 选好,colorContrast / focus ring 一开始就要
- **版本断层** → 改 token 要 semver(`color.action.primary` 改语义就是 breaking)
- **组件 props 过载** → 用 variants,不要 `<Button big primary danger ghost />`
- **i18n / RTL 不考虑** → margin-left → margin-inline-start

---

## src/ 索引

| 文件 | 主题 |
|---|---|
| [tokens/color.json](tokens/color.json) | Reference + Semantic 双层 token 设计 |
| [tokens/spacing.json](tokens/spacing.json) | Spacing scale |
| [src/style-dictionary.config.js](src/style-dictionary.config.js) | 多平台输出配置 |
| [src/theme-provider.tsx](src/theme-provider.tsx) | next-themes 风格 + SSR 防闪 |
| [src/cva-button.tsx](src/cva-button.tsx) | cva + Radix asChild 实战 |
| [src/figma-tokens-sync.md](src/figma-tokens-sync.md) | Figma → Git → CI 全流程 |

---

## 资源

- [Design Tokens W3C 草案](https://design-tokens.github.io/community-group/format/)
- [Style Dictionary](https://amzn.github.io/style-dictionary/)
- [Tokens Studio for Figma](https://tokens.studio/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Radix Themes](https://www.radix-ui.com/themes)
- [Adobe Spectrum](https://spectrum.adobe.com/) — 标杆设计系统
- [Shopify Polaris](https://polaris.shopify.com/)
- [IBM Carbon](https://carbondesignsystem.com/)
- [Atlassian Design System](https://atlassian.design/)
- [Material 3](https://m3.material.io/)
- [Design Systems Repo](https://designsystemsrepo.com/) — 收集 200+ 系统
- [Refactoring UI](https://refactoringui.com/) — Tailwind 作者写的设计书
