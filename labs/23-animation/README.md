# 23 · Animation Lab

> 动画不是装饰,是「告诉用户发生了什么」的语言。
> 写错的动画 = 浪费 GPU + 让 vestibular 障碍用户头晕 + 拖慢 INP。
> 写对的动画 = 让产品看起来「贵」。
> 这里把 CSS / WAAPI / Framer Motion / GSAP / Lottie / FLIP / View Transitions / scroll-driven 全过一遍。

---

## 学这个能干什么

- 能用最少代码完成 90% 业务需求(transitions / spring / 列表重排 / 进入离开)
- 知道何时上 GPU(transform/opacity)、何时不(top/left/width 死刑)
- 能解释 spring 物理参数(stiffness / damping / mass)的含义
- 用 FLIP / View Transitions 做无感跨页 / 跨列表过渡
- 写出尊重 prefers-reduced-motion 的代码
- 知道何时 Lottie,何时手写,何时 Rive
- 处理动画性能(60fps / 120fps / Composite layer 暴涨)

---

## Roadmap

### 1. 动画方案矩阵

| 方案 | 适合 | 不适合 | 文件大小 | 学习曲线 |
|---|---|---|---|---|
| **CSS transition** | 简单 hover / 状态切换 | 复杂时序 | 0 | 低 |
| **CSS @keyframes** | 循环动画 / 进入动画 | 动态参数 | 0 | 低 |
| **Web Animations API** | 程序化控制 | 全栈兼容 | 0 | 中 |
| **Framer Motion** | React + 复杂 UI | bundle 敏感 | ~50KB | 中 |
| **react-spring** | physics-based React | 学曲线 | ~20KB | 中高 |
| **GSAP** | 复杂 timeline / 滚动 | bundle / 协议 | ~40KB | 中 |
| **Lottie** | After Effects 设计稿 | 大文件 / 性能 | json varies | 低(使用)/ 高(产出) |
| **Rive** | 互动动画 + 状态机 | 生态小 | 小 | 中 |
| **Three.js / Pixi** | 3D / 游戏 | 杀鸡用牛刀 | 大 | 高 |
| **CSS scroll-driven** | 滚动联动 | 老浏览器 | 0 | 低 |
| **View Transitions API** | 跨页面 / 跨视图过渡 | 兼容性 | 0 | 中 |
| **Motion One** | 现代轻量 | 复杂场景 | ~5KB | 低 |

### 2. 性能基础:能上 GPU 的只有这些

```css
/* ✅ 60fps 不抖,GPU 合成 */
transform: translate / scale / rotate / skew
opacity
filter (但便宜 vs 贵差很多)

/* ❌ 触发布局/绘制,主线程崩 */
width / height / top / left / margin / padding
font-size / line-height
border-width
```

**强制创建合成层**:
```css
will-change: transform;          /* 提示浏览器 */
transform: translateZ(0);        /* 老 hack,等价 */
```

**警告**:
- `will-change` 不是免费午餐,提前申明的层太多会爆内存
- 动画结束记得 `will-change: auto`(或 remove style)

### 3. CSS 基础动画

```css
/* transition:状态变化时插值 */
.button {
  transition: background 200ms ease-out, transform 150ms ease;
}
.button:hover {
  background: #2563eb;
  transform: translateY(-2px);
}

/* keyframes:循环 / 进入 */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner { animation: spin 1s linear infinite; }

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 4. easing 曲线速查

```
linear              匀速,机械感(loading 转圈用)
ease                默认,慢→快→慢(温和但不专业)
ease-out            快→慢(进入动画,常用)
ease-in             慢→快(离开动画)
ease-in-out         慢→快→慢(双向)
cubic-bezier(.4, 0, .2, 1)    Material Design "standard"
cubic-bezier(.2, 0, 0, 1)      iOS spring 感(soft)
cubic-bezier(.68, -0.55, .27, 1.55)   弹跳 overshoot
linear(0, .25, .5, .75, 1)   CSS linear() 函数,自定义点
```

工具:[easings.net](https://easings.net) / [cubic-bezier.com](https://cubic-bezier.com)

### 5. Spring 物理动画(react-spring / Framer / Motion One)

```ts
useSpring({ x: 100 }, { stiffness: 170, damping: 26, mass: 1 })
```

| 参数 | 含义 | 调整方向 |
|---|---|---|
| stiffness | 弹簧硬度 | ↑ 更快 / 更刚 |
| damping | 阻尼(摩擦力) | ↑ 不晃 / ↓ 弹跳 |
| mass | 物体质量 | ↑ 更慢 / 更重 |
| velocity | 初始速度 | gesture release 时传入 |

**直觉**:
- iOS 默认 spring ≈ stiffness 100, damping 15
- Material Motion = duration-based(非 spring),但 M3 已用 spring
- "snappy" 默认配:stiffness 300, damping 30

### 6. Framer Motion(React 业界标配)

```tsx
import { motion, AnimatePresence } from 'framer-motion'

// 简单
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
/>

// 列表进出
<AnimatePresence>
  {items.map(it => (
    <motion.div key={it.id} layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    />
  ))}
</AnimatePresence>

// 自动 FLIP:layout prop 让重排自动动画
```

详见 [src/framer-recipes.tsx](src/framer-recipes.tsx)。

### 7. Web Animations API(纯 JS,无依赖)

```js
const el = document.querySelector('.card')
const anim = el.animate(
  [
    { transform: 'translateY(20px)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1 },
  ],
  {
    duration: 300,
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    fill: 'forwards',
  }
)

await anim.finished       // Promise
anim.cancel()             // 中断
anim.commitStyles()       // 把 fill 状态写回 inline style
```

### 8. GSAP(老牌专业,timeline 之王)

```js
gsap.timeline()
  .from('.hero', { opacity: 0, y: 50, duration: 0.6 })
  .from('.cta', { opacity: 0, y: 20 }, '-=0.3')    // 倒退 0.3 秒
  .to('.bg', { backgroundColor: '#000', duration: 0.5 })

// ScrollTrigger:滚动驱动
gsap.to('.parallax', {
  y: -200,
  scrollTrigger: { trigger: '.section', start: 'top center', scrub: true },
})
```

**协议注意**:GSAP business 版收费(企业项目核查),non-commercial / open-source 免费。

### 9. FLIP 技术(列表重排无感)

```
F - First:记录元素当前位置 getBoundingClientRect()
L - Last: 改 DOM 后再记录新位置
I - Invert:用 transform 把元素「假装」放回原位
P - Play:transform → 0,动画过渡到新位置
```

```js
// 简化版
function flip(el, mutate) {
  const first = el.getBoundingClientRect()
  mutate()                                   // 改 DOM(移到新位置)
  const last = el.getBoundingClientRect()
  const dx = first.left - last.left
  const dy = first.top - last.top
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
    { duration: 300, easing: 'cubic-bezier(.2, 0, 0, 1)' }
  )
}
```

详见 [src/flip-helper.ts](src/flip-helper.ts)。

### 10. View Transitions API(2024+)

```js
// 跨页面/跨视图的「神奇」过渡
document.startViewTransition(() => {
  // 任何 DOM 改动都被截屏 → before / after 自动 cross-fade
  updateDOM()
})
```

```css
/* 给特定元素定制过渡 */
.hero { view-transition-name: hero-image }

::view-transition-old(hero-image),
::view-transition-new(hero-image) {
  animation-duration: 400ms;
  animation-timing-function: cubic-bezier(.2, 0, 0, 1);
}
```

详见 [src/view-transitions.ts](src/view-transitions.ts)。

### 11. Scroll-driven animations(CSS only,2024+)

```css
@keyframes appear {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; }
}

.card {
  animation: appear linear;
  /* 由视口位置驱动 */
  animation-timeline: view();
  animation-range: entry 0% cover 30%;
}

/* 全局滚动驱动 */
.parallax {
  animation: parallax linear;
  animation-timeline: scroll();
}
```

详见 [demos/scroll-driven.html](demos/scroll-driven.html)。

### 12. Lottie(After Effects 设计稿)

```html
<lottie-player
  src="/animations/hero.json"
  background="transparent"
  speed="1"
  autoplay
  loop
></lottie-player>
```

```js
// 程序化
import lottie from 'lottie-web'
const anim = lottie.loadAnimation({
  container: el,
  renderer: 'svg',         // canvas / html
  loop: false,
  autoplay: false,
  path: '/animations/hero.json',
})

anim.play()
anim.goToAndStop(60, true)
anim.setSpeed(1.5)
```

**注意**:
- Lottie SVG renderer 文件可能 200KB+,影响 LCP
- 复杂动画用 canvas / dotLottie(压缩)
- 移动慎用,GPU/CPU 成本高
- 替代:Rive(状态机 + 互动)/ SVG SMIL / 手写

### 13. prefers-reduced-motion(必须支持)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

```js
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

// 在 React
import { useReducedMotion } from 'framer-motion'
const reduce = useReducedMotion()
const anim = reduce ? {} : { y: -10, opacity: 0 }
```

**法律**:Apple / Google 都要求 accessibility,vestibular 障碍用户全屏滚动视差能引起严重不适。

### 14. 动画原则(13 原则简化版)

1. **目的**:动画必须传达信息(出现 / 关注 / 关联),不能为动而动
2. **方向**:进入快(感觉敏捷),离开慢(给反应时间)— 或者反之看场景
3. **缓动**:从不要用 linear(除了 loader / progress)
4. **时长**:UI 100-400ms,过渡 < 600ms,超过用户烦
5. **错峰**(stagger):列表项依次出现,不要同时(给眼睛跟随的轨迹)
6. **物理感**:加 spring overshoot 比纯 ease 让用户感觉"实在"
7. **focus**:同时只动一个东西,多个动 = 视觉噪音
8. **可中断**:用户再点 / 滑时动画要能立刻响应,不是排队
9. **空间一致**:从 A 点动到 B 点,而不是消失再出现
10. **性能**:60fps 起步,120fps 是目标
11. **a11y**:reduced-motion / focus 不被动画干扰
12. **品牌**:动画曲线 / 时长应该一致(像字体一样系统化)
13. **少**:大部分页面只需要 5 种动画,做精

### 15. 业务动画 cookbook

| 场景 | 推荐 |
|---|---|
| 按钮 hover | CSS transition transform/scale/box-shadow,150ms |
| 模态出现 | scale 0.95 → 1 + opacity 0 → 1,200ms ease-out |
| 抽屉 | translateX 100% → 0,300ms cubic-bezier |
| Toast | translateY 20px → 0 + fade,250ms |
| 列表重排 | Framer Motion `layout` 或 FLIP |
| 路由切换 | View Transitions API 或 Framer AnimatePresence |
| Skeleton | linear-gradient + bg-position animation |
| Spinner | rotate infinite |
| 数字滚动 | 拆位 + translate 或 react-flip-numbers |
| Tab 切换下划线 | layoutId(Framer)平滑跟随 |
| 长按反馈 | scale 0.97 + radial highlight |
| 拉到底部刷新 | Spring + gesture |

### 16. INP / Animation 性能

```
- 长任务(>50ms)期间动画卡
- 动画驱动 layout(width: 50px → 100px)= 必卡
- transform 不卡(GPU 合成)
- 大量 paint(box-shadow / filter blur)cost 高
- requestAnimationFrame 比 setTimeout 准
- 动画用 framer-motion 的 motion value(订阅式,不 re-render)
```

工具:
- Chrome DevTools → Performance 面板,看 FPS chart 和 frame timeline
- Layer panel(三点 → More tools → Layers)看合成层数
- `chrome://flags/` 启用 "Composited animation in DevTools"

### 17. 调试技巧

```js
// 减速所有 animation
document.getAnimations().forEach(a => a.updatePlaybackRate(0.1))

// 看每个元素的 animation
document.getAnimations()

// CSS 加边框看合成层
* { outline: 1px solid red }   // 不,看 DevTools Layers
```

### 18. 框架对比

| 框架 | 哲学 | 适合 |
|---|---|---|
| Framer Motion | declarative + layout magic | 大部分 React 项目 |
| react-spring | spring physics first | 物理感重的交互 |
| Motion One | 轻量 + Web Animations | bundle 极敏感 |
| GSAP | timeline + scroll | 营销页 / 复杂时序 |
| Anime.js | 简单 timeline | 小动画 |
| Theatre.js | 时间轴编辑器(可视化) | 营销 / 演示 |
| Auto-Animate | 一行接管 layout | 快速给现有组件加动画 |

### 19. SSR 注意

- SSR 时 `window.matchMedia` 不存在 → useReducedMotion 需 SSR-safe
- Framer Motion `layout` 在 SSR 输出无 transform → hydration mismatch 风险
- Lottie 要 `dynamic(() => import('@lottiefiles/dotlottie-react'), { ssr: false })`

### 20. 移动端注意

- iOS Safari 100vh 包含浏览器 UI → 用 `100svh` / `100dvh`
- iOS 弹性滚动可能干扰 scroll-driven animation
- Android 滚动事件触发频率低,scroll-triggered 不平滑 → 用 IntersectionObserver
- 触摸事件不要用 `mousedown` / `mouseup` 不触发(用 `pointerdown`)

---

## src/ 索引

| 文件 | 主题 |
|---|---|
| [src/framer-recipes.tsx](src/framer-recipes.tsx) | Framer Motion 业务场景 cookbook |
| [src/spring-physics.ts](src/spring-physics.ts) | spring 参数 + react-spring + Motion One |
| [src/flip-helper.ts](src/flip-helper.ts) | FLIP 重排动画完整实现 |
| [src/view-transitions.ts](src/view-transitions.ts) | View Transitions API + 跨页路由集成 |
| [src/waapi-utils.ts](src/waapi-utils.ts) | Web Animations API 工具集 |
| [src/gsap-timeline.ts](src/gsap-timeline.ts) | GSAP timeline + ScrollTrigger |
| [src/reduced-motion.tsx](src/reduced-motion.tsx) | 全局 reduced-motion 包装 |
| [demos/scroll-driven.html](demos/scroll-driven.html) | CSS scroll-driven 完整 demo |
| [examples/animation-principles.md](examples/animation-principles.md) | 动画设计原则深度版 |

---

## 资源

- [Material Motion](https://m3.material.io/styles/motion)
- [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [easings.net](https://easings.net/)
- [Framer Motion docs](https://www.framer.com/motion/)
- [GSAP docs](https://gsap.com/docs/v3/)
- [Web Animations API spec](https://www.w3.org/TR/web-animations-1/)
- [View Transitions spec](https://drafts.csswg.org/css-view-transitions/)
- [Scroll-driven Animations](https://scroll-driven-animations.style/)
- [Refactoring UI: Motion](https://www.refactoringui.com/) — 设计原则
- [Animation Handbook(Designcode)](https://designcode.io/)
