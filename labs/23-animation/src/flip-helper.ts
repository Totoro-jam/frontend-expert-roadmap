// FLIP 重排动画完整实现
// First / Last / Invert / Play —— 把"突然变化"变成"平滑过渡"
//
// 适用:列表 reorder、grid → list 切换、卡片放大、shared element
// 优势:任何 DOM 变化都能动起来,不限于 CSS 可过渡的属性
// 代价:必须在变化前后各读一次 getBoundingClientRect(强制 reflow)

// =====================================================
// 1. 核心算法
// =====================================================
//
// First:  记录元素当前位置 / 尺寸(变化之前)
// Last:   执行 DOM 变化,记录新位置 / 尺寸
// Invert: 用 transform 把元素「假装」放回原位
// Play:   transform → identity,让浏览器插值过渡

export interface FlipOptions {
  duration?: number
  easing?: string
  delay?: number
  scale?: boolean       // 是否动尺寸(默认 true)
}

export interface FlipState {
  rect: DOMRect
  opacity: string
}

/** First: 记录元素当前 layout 状态 */
export function recordFirst(el: HTMLElement): FlipState {
  return {
    rect: el.getBoundingClientRect(),
    opacity: getComputedStyle(el).opacity,
  }
}

/** Last + Invert + Play: 在 DOM 改完后调用 */
export function playFlip(el: HTMLElement, first: FlipState, opts: FlipOptions = {}): Animation | null {
  const last = el.getBoundingClientRect()
  const dx = first.rect.left - last.left
  const dy = first.rect.top - last.top
  const dw = first.rect.width / last.width
  const dh = first.rect.height / last.height

  // 没有任何变化 → 不动画
  if (dx === 0 && dy === 0 && dw === 1 && dh === 1) return null

  const useScale = opts.scale !== false
  const duration = opts.duration ?? 300
  const easing = opts.easing ?? 'cubic-bezier(.2, 0, 0, 1)'

  const fromTransform = useScale
    ? `translate(${dx}px, ${dy}px) scale(${dw}, ${dh})`
    : `translate(${dx}px, ${dy}px)`

  return el.animate(
    [
      { transform: fromTransform, transformOrigin: 'top left' },
      { transform: 'none', transformOrigin: 'top left' },
    ],
    { duration, easing, delay: opts.delay ?? 0, fill: 'both' },
  )
}

// =====================================================
// 2. 简易 helper:一行接管任何 mutation
// =====================================================
//
// flip(el, () => moveDOM())
// flip([el1, el2, el3], () => reorderAll())

export function flip(
  target: HTMLElement | HTMLElement[],
  mutate: () => void | Promise<void>,
  opts: FlipOptions = {},
): Promise<void> {
  const els = Array.isArray(target) ? target : [target]
  const firsts = els.map(el => [el, recordFirst(el)] as const)

  return Promise.resolve(mutate()).then(() => {
    const anims = firsts
      .map(([el, first]) => playFlip(el, first, opts))
      .filter((a): a is Animation => !!a)

    return Promise.all(anims.map(a => a.finished))
      .then(() => undefined)
      .catch(() => undefined)
  })
}

// =====================================================
// 3. FlipGroup:多个元素的协调动画(列表重排)
// =====================================================
//
// 通常 reorder 一个列表,会有 enter / exit / move 三种节点。
// FlipGroup 通过 key 区分,自动选不同动画。

export interface FlipGroupOptions extends FlipOptions {
  enterFrom?: Keyframe                     // 新元素初始状态
  exitTo?: Keyframe                        // 离开元素终态
  onEnter?: (el: HTMLElement) => void
  onExit?: (el: HTMLElement) => void
}

export class FlipGroup {
  private snapshots = new Map<string, FlipState>()

  /** 在 DOM 改动前调用,记录所有当前元素 */
  snapshot(container: HTMLElement) {
    this.snapshots.clear()
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-flip-key]'))) {
      const key = el.dataset.flipKey!
      this.snapshots.set(key, recordFirst(el))
    }
  }

  /** 在 DOM 改动后调用,自动动画 enter / move / exit */
  play(container: HTMLElement, opts: FlipGroupOptions = {}) {
    const currentEls = new Map<string, HTMLElement>()
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-flip-key]'))) {
      currentEls.set(el.dataset.flipKey!, el)
    }

    const duration = opts.duration ?? 300
    const easing = opts.easing ?? 'cubic-bezier(.2, 0, 0, 1)'

    // ENTER:新增的
    for (const [key, el] of currentEls) {
      if (!this.snapshots.has(key)) {
        el.animate(
          [opts.enterFrom ?? { opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }],
          { duration, easing, fill: 'both' },
        )
        opts.onEnter?.(el)
      }
    }

    // MOVE:已存在但位置变了
    for (const [key, el] of currentEls) {
      const first = this.snapshots.get(key)
      if (first) {
        playFlip(el, first, { duration, easing, scale: opts.scale })
      }
    }

    // EXIT:消失的(注意:DOM 已没了,需调用方在 mutate 前保留 ghost)
    // 见下方 playExit
  }

  /** EXIT 单独走:在 DOM 移除之前 clone 一个 ghost 播放离开动画 */
  static playExit(el: HTMLElement, opts: FlipGroupOptions = {}): Promise<void> {
    const rect = el.getBoundingClientRect()
    const ghost = el.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, {
      position: 'fixed',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      margin: '0',
      pointerEvents: 'none',
      zIndex: '9999',
    })
    document.body.appendChild(ghost)
    const anim = ghost.animate(
      [{ opacity: 1, transform: 'scale(1)' }, opts.exitTo ?? { opacity: 0, transform: 'scale(0.9)' }],
      { duration: opts.duration ?? 250, easing: opts.easing ?? 'cubic-bezier(.4, 0, 1, 1)', fill: 'both' },
    )
    return anim.finished.then(() => ghost.remove()).catch(() => ghost.remove())
  }
}

// 用法:
// const fg = new FlipGroup()
// fg.snapshot(listEl)
// list.sort(...)
// renderList()                // 改 DOM
// fg.play(listEl)
//
// 删除:
// FlipGroup.playExit(el).then(() => removeItem())

// =====================================================
// 4. Shared Element Transition(放大卡片场景)
// =====================================================
//
// 列表卡片点击 → 详情页全屏。FLIP 让用户感觉「就是这张卡放大了」。

export function sharedElementTransition(
  fromEl: HTMLElement,
  toEl: HTMLElement,
  opts: FlipOptions = {},
): Animation {
  const first = fromEl.getBoundingClientRect()
  const last = toEl.getBoundingClientRect()

  const dx = first.left - last.left
  const dy = first.top - last.top
  const dw = first.width / last.width
  const dh = first.height / last.height

  return toEl.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${dw}, ${dh})`,
        transformOrigin: 'top left',
        opacity: 0,
      },
      {
        transform: 'none',
        transformOrigin: 'top left',
        opacity: 1,
      },
    ],
    { duration: opts.duration ?? 400, easing: opts.easing ?? 'cubic-bezier(.2, 0, 0, 1)', fill: 'both' },
  )
}

// 用法:
// onClick(card) {
//   navigate('/detail/' + id)
//   requestAnimationFrame(() => {
//     const target = document.querySelector('.detail-hero')
//     sharedElementTransition(card, target)
//   })
// }

// =====================================================
// 5. React Hook 包装
// =====================================================
//
// 在 React 里用:在 layout effect 阶段记录,commit 后动画
//
// import { useLayoutEffect, useRef } from 'react'
//
// export function useFlip<T extends HTMLElement>(deps: unknown[]) {
//   const ref = useRef<T>(null)
//   const firstRef = useRef<FlipState | null>(null)
//
//   // 渲染前:记录上一次位置
//   if (ref.current && !firstRef.current) {
//     firstRef.current = recordFirst(ref.current)
//   }
//
//   useLayoutEffect(() => {
//     if (ref.current && firstRef.current) {
//       playFlip(ref.current, firstRef.current)
//       firstRef.current = null
//     }
//   }, deps)
//
//   return ref
// }

// =====================================================
// 6. 坑速查
// =====================================================
//
// 1. getBoundingClientRect 触发 reflow → 批量读完再写
// 2. transform-origin 必须是 'top left'(默认 center 会算偏)
// 3. 父元素 transform 会改变 getBoundingClientRect 基准 → 慎用嵌套 FLIP
// 4. 元素被 display: none → rect 全 0 → 跳过动画
// 5. 元素 size 变了用 scale,不要变 width/height(贵)
// 6. WAAPI 动画期间元素再 mutate → 必须 cancel 旧 animation 再启新的
// 7. 大列表(>50)所有项一起 reflow → 卡顿,考虑只动可见区域
//
// 优化:
// - 用 ResizeObserver / IntersectionObserver 只动视口内
// - 复杂场景考虑 Framer Motion 的 layout(它内部就是 FLIP)
// - WAAPI 比 Animation Driver / Web Animations 还要早期 → polyfill 留心

// =====================================================
// 7. FLIP vs View Transitions API
// =====================================================
//
//                          FLIP            View Transitions
// 跨页面?                 ❌              ✅(基于 DOM 快照)
// 自定义动画?             完全自由        受限于 ::view-transition-* 伪类
// 浏览器要求?             所有现代浏览器  Chrome 111+,Firefox/Safari 部分支持
// 实现复杂度?             中              低(交给浏览器)
// 性能?                   差(主动 reflow)更好(浏览器 GPU 优化)
//
// 建议:
// - 同页面列表重排:FLIP(或 Framer Motion layout)
// - 跨页面 / 跨视图:View Transitions(降级用 FLIP)

export {}
