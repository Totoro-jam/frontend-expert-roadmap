// View Transitions API:浏览器原生的「跨视图」过渡
// 2024+,SPA 跨页 / 跨组件切换的杀手锏

// =====================================================
// 1. 概念
// =====================================================
//
// 你给浏览器一个回调,它:
// 1. 先把当前页面截图(::view-transition-old)
// 2. 调你的回调改 DOM
// 3. 再截图新状态(::view-transition-new)
// 4. 把 old → new 做 cross-fade(默认)
//
// 你可以通过 CSS 自定义这个过渡,甚至给单个元素命名做「shared element」
//
// 兼容:Chrome 111+(同页),Chrome 126+(跨页 same-origin)
//       Safari 18+, Firefox flag

// =====================================================
// 2. 类型声明(TS 还没正式收录,自己补)
// =====================================================
declare global {
  interface Document {
    startViewTransition?: (cb: () => void | Promise<void>) => ViewTransition
  }
  interface ViewTransition {
    finished: Promise<void>
    ready: Promise<void>
    updateCallbackDone: Promise<void>
    skipTransition: () => void
  }
  interface CSSStyleDeclaration {
    viewTransitionName: string
  }
}

// =====================================================
// 3. 基础用法:任何 DOM 改动都能过渡
// =====================================================

export function withViewTransition(mutate: () => void | Promise<void>): Promise<void> {
  if (!document.startViewTransition) {
    // 不支持的浏览器:同步执行 mutate
    return Promise.resolve(mutate()).then(() => undefined)
  }
  const transition = document.startViewTransition(mutate)
  return transition.finished.catch(() => undefined)
}

// 用法:
// withViewTransition(() => {
//   theme.value = theme.value === 'dark' ? 'light' : 'dark'
// })

// =====================================================
// 4. 命名元素(shared element)
// =====================================================
//
// CSS:
//   .hero-image { view-transition-name: hero }
//
// 前后两个不同的 DOM 元素都拥有同一个 view-transition-name →
// 浏览器把它们作为「同一个东西」做位移 / 缩放过渡
//
// 重要:同一时刻同一名字只能有一个元素

// =====================================================
// 5. 完整路由集成(SPA)
// =====================================================
//
// 拦截链接点击,用 View Transition 包装路由切换

export function installRouterTransition(router: { push: (url: string) => Promise<void> }) {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!a) return
    if (a.target === '_blank' || a.hasAttribute('download')) return
    if (a.origin !== location.origin) return                   // 外链不拦
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // 新窗口意图

    e.preventDefault()
    withViewTransition(() => router.push(a.href))
  })
}

// React Router v6+ 用法(等价的 hook):
//
// import { useNavigate, useLocation } from 'react-router-dom'
//
// export function useTransitionedNavigate() {
//   const navigate = useNavigate()
//   return (to: string) => withViewTransition(() => navigate(to))
// }

// Next.js App Router(v14+):next/link 不直接支持,需自己包
//
// import { useRouter } from 'next/navigation'
// import { useTransition } from 'react'
//
// export function useViewTransitionRouter() {
//   const router = useRouter()
//   const [, start] = useTransition()
//   return {
//     push(url: string) {
//       if (!document.startViewTransition) return router.push(url)
//       document.startViewTransition(() => {
//         start(() => router.push(url))
//       })
//     },
//   }
// }

// =====================================================
// 6. 跨页面(Multi-Page Application Transition)
// =====================================================
//
// Chrome 126+ 支持普通 MPA(传统跳转)也能 view transition
//
// HTML <head>:
//   <meta name="view-transition" content="same-origin">
//
// 然后给元素命名:
//   .product-card { view-transition-name: var(--card-id) }
//   (用 inline style 让每张卡有唯一名)
//
// 跳转到详情页,详情页的 hero 也设同名 view-transition-name → 自动 shared element

// =====================================================
// 7. CSS 自定义过渡
// =====================================================
//
// 默认:cross-fade 250ms
//
// 自定义所有元素的过渡:
//   ::view-transition-group(root) {
//     animation-duration: 400ms;
//     animation-timing-function: cubic-bezier(.2, 0, 0, 1);
//   }
//
// 自定义 old / new 分开:
//   ::view-transition-old(root) {
//     animation: 250ms fade-out cubic-bezier(.4, 0, 1, 1);
//   }
//   ::view-transition-new(root) {
//     animation: 400ms fade-in cubic-bezier(0, 0, .2, 1);
//   }
//
// shared element 自定义(name=hero):
//   ::view-transition-group(hero) { animation-duration: 500ms; }
//   ::view-transition-old(hero) { animation: none; }
//   ::view-transition-new(hero) { animation: none; }

// =====================================================
// 8. 滑入 / 滑出方向(根据导航前后)
// =====================================================
//
// CSS:
//   ::view-transition-old(root) {
//     animation: 250ms slide-out;
//   }
//   ::view-transition-new(root) {
//     animation: 250ms slide-in;
//   }
//
//   @keyframes slide-out {
//     to { transform: translateX(-30px); opacity: 0; }
//   }
//   @keyframes slide-in {
//     from { transform: translateX(30px); opacity: 0; }
//   }
//
// 进 / 后退方向不同:
//   document.documentElement.dataset.navigation = isBack ? 'back' : 'forward'
//   /* CSS 用 [data-navigation="back"] ::view-transition-... 覆盖 */

// =====================================================
// 9. 真实案例:暗黑模式切换从点击位置发散
// =====================================================

export async function toggleThemeFromPoint(x: number, y: number, mutate: () => void) {
  if (!document.startViewTransition) {
    mutate()
    return
  }

  const transition = document.startViewTransition(mutate)
  await transition.ready

  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  )

  document.documentElement.animate(
    {
      clipPath: [
        `circle(0 at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: 500,
      easing: 'cubic-bezier(.4, 0, .2, 1)',
      pseudoElement: '::view-transition-new(root)',
    },
  )
}

// 用法:
// button.addEventListener('click', (e) => {
//   toggleThemeFromPoint(e.clientX, e.clientY, () => {
//     document.documentElement.classList.toggle('dark')
//   })
// })

// =====================================================
// 10. 跳过 transition(竞争状态)
// =====================================================
//
// 用户连续点击,前一个动画还没完。两种选择:
// - 跳过当前:transition.skipTransition()
// - 等当前完:await transition.finished 再发起下一个

let currentTransition: ViewTransition | null = null

export function withSingleTransition(mutate: () => void | Promise<void>): Promise<void> {
  if (!document.startViewTransition) return Promise.resolve(mutate()).then(() => undefined)
  currentTransition?.skipTransition()
  currentTransition = document.startViewTransition(mutate)
  return currentTransition.finished.catch(() => undefined)
}

// =====================================================
// 11. prefers-reduced-motion 兼容
// =====================================================
//
// CSS:
//   @media (prefers-reduced-motion: reduce) {
//     ::view-transition-group(*),
//     ::view-transition-old(*),
//     ::view-transition-new(*) {
//       animation: none !important;
//     }
//   }
//
// 或 JS 判断:
//   if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
//     mutate()
//     return
//   }

// =====================================================
// 12. 坑速查
// =====================================================
//
// 1. 同一时刻同名 view-transition-name 只能有一个 → 列表项要用 unique key
// 2. position: fixed 元素的 transition 可能错位 → 给它单独 name
// 3. 大段截图慢 → 不要在动画过程做重排
// 4. ::view-transition-* 伪类不支持所有 CSS 属性 → opacity / transform / filter 最稳
// 5. iframe 内不能 startViewTransition(主页面发起)
// 6. SSR 时 document.startViewTransition undefined → 必须 guard
// 7. mutate 内是同步执行,异步 fetch 会让浏览器一直冻结画面 → 数据应该先 fetch 完再调用
// 8. updateCallbackDone:mutate 完成时机
//    ready:截图完成,动画准备好开始
//    finished:动画播完
//
// 兼容 fallback:
//   - 不支持:同步 mutate
//   - 支持但慢:transition.ready 还没 fire 就要 give up

// =====================================================
// 13. 何时用 / 不用
// =====================================================
//
// 用:
// - SPA 路由切换(平滑感升一档)
// - 暗黑模式 / 主题切换
// - 列表 → 详情 shared element(卡片放大)
// - 任何「截图 cross-fade」就够看的场景
//
// 不用:
// - 复杂时序(用 Framer Motion / GSAP)
// - 频繁触发(>1次/秒,截图开销)
// - 需要中途暂停 / 回放
// - 老浏览器为主要受众
//
// 退化策略:能 progressive enhancement 就这样,detection 不行就同步执行

export {}
