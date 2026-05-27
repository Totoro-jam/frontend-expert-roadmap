# 同一个 Button 组件,3 种方案实现对比

## 1. CSS Modules

```jsx
// Button.module.css
.button {
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
}
.primary { background: #4af; color: white; }
.ghost   { background: transparent; color: #4af; border-color: #4af; }

// Button.tsx
import s from './Button.module.css'
import clsx from 'clsx'

export function Button({ variant = 'primary', ...p }) {
  return <button className={clsx(s.button, s[variant])} {...p} />
}
```

**特点**:
- 样式和组件物理分离,可在编辑器多 split 看
- 类型可用 `typed-css-modules` 生成
- 主题切换靠 CSS 变量

---

## 2. Tailwind

```jsx
import { cva } from 'class-variance-authority'

const button = cva('px-4 py-2 rounded font-medium cursor-pointer', {
  variants: {
    variant: {
      primary: 'bg-blue-500 text-white hover:bg-blue-600',
      ghost:   'border border-blue-500 text-blue-500 hover:bg-blue-50',
    }
  },
  defaultVariants: { variant: 'primary' }
})

export function Button({ variant, ...p }) {
  return <button className={button({ variant })} {...p} />
}
```

**特点**:
- 一处看清所有样式,无需切文件
- `cva`(class-variance-authority)管理 variant
- Bundle 小:Tailwind JIT 只生成用到的 class
- 痛点:HTML 长

---

## 3. Vanilla Extract(零运行时 CSS-in-JS)

```ts
// button.css.ts
import { style, styleVariants } from '@vanilla-extract/css'

const base = style({
  padding: '8px 16px',
  borderRadius: 4,
  fontWeight: 500,
  cursor: 'pointer',
})

export const button = styleVariants({
  primary: [base, { background: '#4af', color: 'white' }],
  ghost:   [base, { background: 'transparent', color: '#4af', border: '1px solid #4af' }],
})
```

```tsx
// Button.tsx
import { button } from './button.css'

export function Button({ variant = 'primary', ...p }) {
  return <button className={button[variant]} {...p} />
}
```

**特点**:
- 类型安全(TS autocomplete + 报错)
- 编译期生成静态 CSS,零运行时
- RSC 完美兼容

---

## 选哪个?

| 场景 | 推荐 |
|---|---|
| Next.js 14+ App Router(RSC) | Vanilla Extract / Panda / Tailwind |
| 内部系统快速开发 | Tailwind |
| 组件库开发 | Vanilla Extract / Panda |
| 已有 Sass 项目改造 | CSS Modules 渐进 |
| 团队不熟 TypeScript | CSS Modules / Tailwind |
| 严重需要主题动态切换 | CSS Variables + 任一方案 |

---

## 一个反模式:全局 + utility 混搭

```html
<!-- ❌ 灾难 -->
<div class="card text-lg !important p-4 my-card my-card--featured">
```

- 全局 class + Tailwind utility 同时存在 → 优先级混乱
- 选一个为主,另一个只在必要场景用

---

## bundle 大小实测(参考)

| 方案 | 50 组件的产物 |
|---|---|
| Tailwind JIT | ~5 KB(gzip) |
| Vanilla Extract | ~8 KB |
| CSS Modules | ~12 KB |
| styled-components(运行时) | ~25 KB(含运行时 12KB) |
