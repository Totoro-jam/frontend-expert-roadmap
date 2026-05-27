# 06 · CSS Architecture Lab

> 大项目里 CSS 失控的根本原因从来不是「样式不会写」,而是「没有方法论」。
> BEM、CSS Modules、CSS-in-JS、原子化 CSS、Tailwind —— 不是品味问题,是工程取舍。

---

## 学这个能干什么

- 在新项目里选 styling 方案时,知道每种方案在「样式隔离 / 性能 / DX / bundle 大小 / SSR」上的取舍
- 看懂 Tailwind / UnoCSS / Vanilla Extract / Stitches / styled-components / emotion 的核心原理
- 在老项目里渐进式重构 CSS(从全局 → 模块 → 原子)
- 设计 design token → CSS 变量 → 组件库的完整链路
- 应对实际问题:主题切换、暗黑、RTL、SSR critical CSS、CSS code splitting

---

## Roadmap

### 1. 历史脉络

```
2009 OOCSS (Object-Oriented CSS)
2012 BEM (Block Element Modifier)
2014 SMACSS / ITCSS
2014 CSS Modules ← 第一次「真正的隔离」
2014 CSS-in-JS (styled-components / emotion)
2017 原子 CSS(Tachyons → Tailwind)
2020 零运行时 CSS-in-JS(Linaria / Vanilla Extract)
2023 Tailwind v3 / UnoCSS / Open Props 并存
2024 RSC + CSS-in-JS 兼容性问题 → 「零运行时」成主流
```

每一代都在解决前一代的问题,**没有银弹**,只有最适合当前场景的方案。

### 2. 6 种方案对比

| 方案 | 隔离 | 性能(运行时) | 主题/动态 | SSR/RSC | 学习曲线 |
|---|---|---|---|---|---|
| **全局 CSS** | ❌ | ⭐⭐⭐⭐⭐ | ⚠️ | ✅ | 低 |
| **BEM(命名约定)** | 弱(靠纪律) | ⭐⭐⭐⭐⭐ | ⚠️ | ✅ | 低 |
| **CSS Modules** | ✅(编译期 hash) | ⭐⭐⭐⭐⭐ | ⚠️ | ✅ | 低 |
| **CSS-in-JS(运行时)** | ✅ | ⭐⭐(运行时插入 style) | ⭐⭐⭐⭐⭐ | ⚠️(RSC 不友好) | 中 |
| **零运行时 CSS-in-JS** | ✅ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ | 中 |
| **Tailwind / UnoCSS** | ✅(原子) | ⭐⭐⭐⭐⭐(JIT) | ⭐⭐⭐⭐ | ✅ | 中高 |

详细对比见下文。

### 3. BEM —— 命名约定派的代表

```css
.card {}                  /* Block */
.card__title {}           /* Element */
.card__title--large {}    /* Modifier */
```

* 优点:零工具链,跨框架通用,Sourcemap 友好
* 缺点:靠纪律保证隔离,长名字、长 class 串
* 谁还在用:很多老项目、CMS 主题、JSP/PHP 模板

### 4. CSS Modules —— 编译期作用域

```css
/* Button.module.css */
.button { padding: 8px 16px; }
```

```jsx
import s from './Button.module.css'
<button className={s.button}>OK</button>  // 编译后 → "Button_button__1a2b3"
```

* 编译期把 class 名 hash,完美隔离
* SSR 友好,零运行时
* 缺点:跨组件复用样式麻烦,动态样式需要 `style={{}}`
* 适用:中大型项目,不想引入新 DSL

### 5. CSS-in-JS(运行时:styled-components / emotion)

```jsx
const Button = styled.button`
  background: ${p => p.primary ? 'blue' : 'gray'};
  padding: 8px 16px;
`
```

* 优点:JS 完全控制样式,主题、动态 props 顺手
* 缺点:**运行时插入 style 标签**,有性能开销;**RSC 不支持**(React 19+ 推荐零运行时)
* 谁在用:Material UI v4 / Ant Design v4 时代的项目

### 6. 零运行时 CSS-in-JS(Vanilla Extract / Linaria / Panda / StyleX)

```tsx
// button.css.ts
import { style } from '@vanilla-extract/css'

export const button = style({
  padding: '8px 16px',
  background: 'blue',
  ':hover': { background: 'darkblue' }
})
```

* 编译期把 TS 转成 .css 文件
* 类型安全(autocomplete + 类型检查)+ 零运行时 + SSR 完美
* 缺点:DSL 学习成本,动态值需要 `recipe` 或 CSS 变量
* **未来趋势**(Meta StyleX / Vercel Panda)

### 7. Tailwind / UnoCSS —— 原子 CSS

```html
<button class="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-white">
  OK
</button>
```

* JIT 编译:只生成你用到的类,bundle 极小
* 优点:不命名、统一规范、design system 内建、bundle 不随项目增长
* 缺点:HTML 看起来「丑」,长 class 串需要工具(`tailwind-merge` / `clsx`)管理
* **Tailwind v4(2024)** 重写引擎,CSS 原生 `@theme` 替代 config,5-10x 速度

UnoCSS 是 Tailwind 的「可扩展替代品」,作者 antfu,Vue 生态偏好。

### 8. CSS 与 design token 的关系

理想分层:

```
Design Tokens (color, spacing, radius)
  → CSS Variables (--primary, --space-2)
    → Component Styles
      → Apps
```

* tokens 用 [Style Dictionary](https://amzn.github.io/style-dictionary/) 统一管理(JSON → CSS / iOS / Android)
* 组件库消费 CSS Variables,不直接耦合具体颜色值
* 主题切换 = 切换变量值,组件代码不变

详见 [19-design-systems-lab](../19-design-systems-lab/)。

### 9. 工程实践:CSS 也要 lint / format / 死代码删除

* **Stylelint** —— ESLint 之于 CSS
* **PurgeCSS / Tailwind 自带 JIT** —— 删除未使用的 class
* **PostCSS** + Autoprefixer + cssnano(minify)
* **CSS Modules 命名冲突检测** + **TS 类型生成**(`*.module.css.d.ts`)
* SSR 时**只内联 critical CSS**,其余 lazy load(Astro / Next.js 自动做)

### 10. 选型决策树

```
新项目?
├─ 内部系统 / SaaS:Tailwind(招人快,bundle 小)
├─ 组件库 / 设计系统:Vanilla Extract or Panda(零运行时 + 类型安全)
├─ 团队偏好 Vue:UnoCSS
└─ 内容站 / 营销页:CSS Modules + 设计 token

老项目?
├─ Sass 全局 → 渐进 CSS Modules(每个新组件用)
├─ styled-components → 锁版本,逐步迁出 RSC 边界
└─ 没有规范 → 至少先加 Stylelint
```

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [bem-example.html](src/bem-example.html) | BEM 命名约定示例 |
| [tailwind-vs-modules.md](src/tailwind-vs-modules.md) | 同一组件 3 种实现对比 |
| [tokens.json](src/tokens.json) | Design Token JSON 示例(Style Dictionary 输入) |

---

## 资源

- 📖 [CSS Architecture for Modern JavaScript Applications](https://www.smashingmagazine.com/2024/06/css-architecture-modern-javascript/)
- 📖 [Tailwind Anti-Patterns](https://www.frontendmastery.com/posts/the-modern-guide-to-css-resets/)
- 📖 [Atomic CSS 反思](https://css-tricks.com/lets-define-exactly-atomic-css/)
- 📖 [The State of CSS-in-JS 2024](https://2024.stateofcss.com/)
- 🔧 [tokens-studio/sd-transforms](https://github.com/tokens-studio/sd-transforms) — Figma → tokens
