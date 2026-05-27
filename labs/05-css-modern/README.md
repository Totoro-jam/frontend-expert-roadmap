# 05 · Modern CSS Lab

> 2020 之后 CSS 经历了「第二次爆炸」:Grid、Container Queries、`:has()`、`@layer`、subgrid、`color-mix()`、Anchor positioning、Scroll-driven animations、View Transitions。
> 你以前用 JS / 工具库做的事,一半被原生 CSS 解决了。

---

## 学这个能干什么

- 不需要 React Bricks / Tailwind 也能写出**响应式**而且**优雅**的布局
- 用 `:has()` 实现「子元素状态决定父元素样式」(以前完全做不到)
- 用 Container Queries 让组件真正独立于父布局
- 用 `@layer` 终结 CSS 优先级地狱
- 用 CSS 变量 + `color-mix()` 写主题系统,告别 Sass mixin
- 看懂 Tailwind / Open Props / Pico CSS 的源码

---

## Roadmap

### 1. 盒模型 / 包含块 / 层叠上下文(三个被滥用的概念)

* `box-sizing: border-box` —— 现代默认值,padding/border 不撑大盒子
* Containing Block 决定 `%` 单位是相对谁。`position: absolute` 的包含块是「最近的非 static 祖先」
* Stacking Context —— `z-index` 不是全局排序,只在同一个 stacking context 内有效。新建 SC 的属性:`position + z-index`、`opacity < 1`、`transform`、`filter`、`will-change`、`isolation: isolate`、`mix-blend-mode`、`contain: layout|paint|strict`
* **`isolation: isolate`** 是修复「z-index 不生效」的银弹

### 2. Flexbox 进阶

* `flex: 1` = `flex: 1 1 0%`(grow=1, shrink=1, basis=0)
* `flex: 1 1 auto` vs `flex: 1` —— basis 不同,会让子元素「按内容大小起步」
* `gap` 终于支持 flex 了(2021+),不再需要 `margin-right` hack
* `min-width: 0` —— flex 子元素**默认 `min-width: auto`**(= 内容宽度),导致 overflow 不生效。需要手动设 `min-width: 0` 才能让 `text-overflow: ellipsis` 工作

### 3. Grid —— 真正的二维布局

```css
/* 经典:auto-fit + minmax,实现「自动换行的卡片墙」*/
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
```

* `fr` 单位 = 剩余空间的比例
* `auto-fit` vs `auto-fill` —— `auto-fit` 会让剩余列被现有项目「吃掉」,`auto-fill` 保留空列
* `grid-template-areas` —— 用 ASCII 画布局
* `subgrid` —— 子 grid 共享父 grid 的轨道(2023+ 所有浏览器支持)
* `place-items: center` —— 一句话居中,告别「水平垂直居中」面试题

### 4. Container Queries —— 容器查询(组件真正独立)

```css
.card { container-type: inline-size; container-name: card; }

@container card (min-width: 400px) {
  .card-content { flex-direction: row; }
}
```

**为什么是变革**:以前响应式只能基于 viewport。同一个 Card 组件,放在 sidebar 是窄的,放在 main 是宽的,你只能用 `~lg:` 这种**外部**判断。Container Query 让组件**自己看自己宽度**。

### 5. `:has()` —— 父选择器(终于来了!)

```css
/* 卡片有 a 标签 → 加 hover 效果 */
.card:has(a:hover) { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

/* form 有 :invalid 子元素 → submit 按钮变灰 */
form:has(:invalid) button[type=submit] { opacity: 0.5; pointer-events: none; }

/* 没有图片的文章 → 加大字号 */
article:not(:has(img)) h2 { font-size: 1.5em; }
```

这个能力以前**根本不可能用纯 CSS 实现**,所有人都得加 JS。现在 1 行 CSS。

### 6. `@layer` —— 终结优先级地狱

```css
@layer reset, base, components, utilities;

@layer reset { * { margin: 0; } }
@layer base { body { font-family: system-ui; } }
@layer components { .btn { padding: 8px 16px; } }
@layer utilities { .text-red { color: red !important; } }
```

* 后定义的 layer 优先级高于前定义的
* **跨 layer 时不再比较 specificity**,而是按 layer 顺序
* 不在任何 layer 里的样式优先级**最高**(Tailwind 的 `!` 修饰符靠这个)

### 7. CSS 变量 + `color-mix()` —— 现代主题系统

```css
:root {
  --primary: #4a90e2;
  --primary-hover: color-mix(in srgb, var(--primary), white 10%);
  --primary-active: color-mix(in srgb, var(--primary), black 10%);
}

@media (prefers-color-scheme: dark) {
  :root { --primary: #6ab0ff; }
}

.btn { background: var(--primary); }
.btn:hover { background: var(--primary-hover); }
```

* `color-mix()` —— 浏览器自带颜色混合,告别 Sass `lighten()`
* `oklch()` 颜色空间 —— 比 hsl 更感知均匀(亮度调整不影响色相)
* CSS 变量是**运行时**计算,可以 JS 改;Sass 变量是**编译时**

### 8. 现代单位

| 单位 | 含义 |
|---|---|
| `rem` | 根字号倍数(用户可调) |
| `em` | 当前元素字号倍数 |
| `vh / vw` | viewport 1% |
| `svh / lvh / dvh` | 小/大/动态 viewport 高度(手机地址栏!2023+) |
| `cqi / cqb` | container query inline/block 1% |
| `clamp(min, val, max)` | 三明治函数,响应式字号神器 |

```css
/* 响应式字号:最小 14px,理想 1.5vw,最大 24px */
font-size: clamp(14px, 1.5vw, 24px);
```

### 9. Scroll-driven Animations / View Transitions(2024+)

```css
/* 滚动驱动动画 —— 不用 GSAP / Framer Motion */
@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }

.card {
  animation: fade-in linear;
  animation-timeline: view();   /* 元素进入视口时开始 */
  animation-range: entry 0% cover 30%;
}
```

```js
// View Transitions API —— SPA 路由切换原生过渡
document.startViewTransition(() => {
  render(newRoute)
})
```

### 10. 选择器精度 / 性能

* Specificity:`(inline, ID, class, element)` — 永远先比第一个
* `*` `::before` `::after` 都算 element
* 用 `:where()` 让一个选择器**优先级归零**:`:where(.btn, .button) { ... }`
* 用 `:is()` 简化但**保留**最高优先级:`:is(h1, h2, h3)` 等价于 `h1, h2, h3`

---

## demos/

| 文件 | 主题 |
|---|---|
| [grid-playground.html](demos/grid-playground.html) | auto-fit / subgrid / area 实例 |
| [container-queries.html](demos/container-queries.html) | 同个 Card 在不同容器宽度的形态 |
| [has-selector.html](demos/has-selector.html) | `:has()` 5 个实用模式 |
| [theming.html](demos/theming.html) | CSS 变量 + color-mix + 暗黑模式 |

---

## 资源

- 📖 [State of CSS](https://stateofcss.com/) — 每年的特性使用率调查
- 📖 [web.dev/learn/css](https://web.dev/learn/css/) — Google 出品教程
- 📖 [Josh Comeau CSS for JS Developers](https://css-for-js.dev/) — 付费但口碑爆棚
- 📖 [Una Kravets 的博客](https://una.im/)
- 📖 [Modern CSS Solutions](https://moderncss.dev/) — 老问题的新解法
- 🔧 [Open Props](https://open-props.style/) — 纯 CSS 变量的设计系统
