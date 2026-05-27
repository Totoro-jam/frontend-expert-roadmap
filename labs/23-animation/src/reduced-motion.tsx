// 全局 prefers-reduced-motion 处理
// 不只是 a11y 合规,也是真实需要 —— 1/3 的 vestibular 障碍用户开了这个

import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'

// =====================================================
// 1. 为什么必须支持
// =====================================================
//
// vestibular(前庭)障碍用户:
// - 视差滚动 / 全屏淡入 / 缩放过渡 → 头晕 / 眩晕 / 呕吐
// - 不是「偏好」,是「无法使用」
//
// 法规:
// - WCAG 2.1 Success Criterion 2.3.3(Animation from Interactions)
// - Section 508(美国)
// - EAA(欧盟 2025)
//
// OS 来源:
// - macOS: System Preferences → Accessibility → Display → Reduce motion
// - iOS: Settings → Accessibility → Motion → Reduce Motion
// - Windows: Settings → Accessibility → Visual effects → Animation effects
// - Android: Settings → Accessibility → Remove animations
//
// 浏览器读取:matchMedia('(prefers-reduced-motion: reduce)')

// =====================================================
// 2. 基础 hook
// =====================================================

export function useReducedMotion(defaultValue = false): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

// =====================================================
// 3. Context(全局 + 用户覆盖)
// =====================================================
//
// 不止依赖 OS,允许用户在网站上自己开关(写到 localStorage)

type MotionPreference = 'system' | 'on' | 'off'

interface MotionContextValue {
  reduced: boolean                                        // 最终决议
  preference: MotionPreference                            // 用户选择
  setPreference: (p: MotionPreference) => void
}

const MotionContext = createContext<MotionContextValue | null>(null)

export function MotionProvider({ children, storageKey = 'motion-pref' }: { children: ReactNode; storageKey?: string }) {
  const systemReduced = useReducedMotion()

  const [preference, setPrefState] = useState<MotionPreference>(() => {
    if (typeof window === 'undefined') return 'system'
    const v = localStorage.getItem(storageKey)
    return v === 'on' || v === 'off' ? v : 'system'
  })

  const reduced = preference === 'system' ? systemReduced : preference === 'off'

  const setPreference = (p: MotionPreference) => {
    setPrefState(p)
    try { localStorage.setItem(storageKey, p) } catch {}
  }

  return (
    <MotionContext.Provider value={{ reduced, preference, setPreference }}>
      {children}
    </MotionContext.Provider>
  )
}

export function useMotion() {
  const ctx = useContext(MotionContext)
  if (!ctx) throw new Error('useMotion must be used within MotionProvider')
  return ctx
}

// =====================================================
// 4. 用户设置 UI
// =====================================================

export function MotionToggle() {
  const { preference, setPreference } = useMotion()

  return (
    <fieldset>
      <legend>动画偏好</legend>
      <label>
        <input
          type="radio"
          checked={preference === 'system'}
          onChange={() => setPreference('system')}
        />
        跟随系统
      </label>
      <label>
        <input
          type="radio"
          checked={preference === 'on'}
          onChange={() => setPreference('on')}
        />
        始终开启
      </label>
      <label>
        <input
          type="radio"
          checked={preference === 'off'}
          onChange={() => setPreference('off')}
        />
        减少动画
      </label>
    </fieldset>
  )
}

// =====================================================
// 5. Conditional 组件
// =====================================================
//
// 完全不动 / 弱动 / 强动 三段式

interface MotionSafeProps {
  reduced?: ReactNode                                     // 减少动画时显示这个
  full?: ReactNode                                        // 正常显示这个
}

export function MotionSafe({ reduced, full }: MotionSafeProps) {
  const { reduced: isReduced } = useMotion()
  return <>{isReduced ? reduced : full}</>
}

// 用法:
// <MotionSafe
//   reduced={<StaticHeroImage />}
//   full={<AnimatedHero />}
// />

// =====================================================
// 6. Framer Motion 集成
// =====================================================
//
// 内置 useReducedMotion 用我们的 context 包一层
//
// import { MotionConfig } from 'framer-motion'
//
// export function FramerSetup({ children }: { children: ReactNode }) {
//   const { reduced } = useMotion()
//   return (
//     <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
//       {children}
//     </MotionConfig>
//   )
// }
//
// reducedMotion 选项:
//   'never'   忽略 reduced motion 偏好(不推荐)
//   'always'  始终减少
//   'user'    跟随系统(默认)

// =====================================================
// 7. CSS 全局兜底(必加)
// =====================================================
//
// 即使 JS 没处理到的地方,CSS 也兜住:
//
// @media (prefers-reduced-motion: reduce) {
//   *, *::before, *::after {
//     animation-duration: 0.01ms !important;
//     animation-iteration-count: 1 !important;
//     transition-duration: 0.01ms !important;
//     scroll-behavior: auto !important;
//   }
// }
//
// 为啥不是 animation: none —— 因为有些动画在 from/to 之间依赖结束态
// 用极短时长既快进到 to,又不 break 逻辑
//
// 注意 0.01ms 不是 0,某些浏览器 0 会跳过 onfinish 事件

// =====================================================
// 8. JS 层级判断什么该减
// =====================================================
//
// 完全去掉:
// - 自动播放视频 / GIF
// - 视差滚动(全屏 / 大幅 transform)
// - 全屏 cross-fade
// - 360 度旋转 / loop
// - 闪烁 / 频闪(癫痫风险)
//
// 保留但弱化:
// - hover / focus 反馈(改 instant)
// - 进入动画(改瞬时 fade,无位移)
// - 加载 spinner(可以保留但放慢)
//
// 总是保留:
// - 状态指示(success / error)
// - 数据更新提示
// - 必要的反馈

// =====================================================
// 9. 决策辅助 hook
// =====================================================

export function useAnimationProps<T>(full: T, reducedTo?: Partial<T>): T {
  const { reduced } = useMotion()
  if (!reduced) return full
  if (reducedTo) return { ...full, ...reducedTo }
  // 默认:duration 改 0,position 不变,scale 不变
  return {
    ...full,
    ...({ duration: 0, x: 0, y: 0 } as Partial<T>),
  }
}

// 用法:
// const props = useAnimationProps(
//   { initial: { y: 50, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { duration: 0.4 } },
//   { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.1 } }
// )

// =====================================================
// 10. 视频 / 自动播放
// =====================================================
//
// 自动播放视频也算 motion → reduced 时改 controls 让用户主动播
//
// export function SmartVideo(props: { src: string; poster?: string }) {
//   const { reduced } = useMotion()
//   return reduced
//     ? <img src={props.poster} alt="" />
//     : <video src={props.src} autoPlay muted loop playsInline poster={props.poster} />
// }

// =====================================================
// 11. 测试
// =====================================================
//
// Chrome DevTools:
//   Command Palette → "Show Rendering" → Emulate CSS media feature prefers-reduced-motion
//
// Playwright:
//   await page.emulateMedia({ reducedMotion: 'reduce' })
//
// 单元测试 mock matchMedia:
//   beforeAll(() => {
//     Object.defineProperty(window, 'matchMedia', {
//       value: (q: string) => ({
//         matches: q.includes('reduce'),
//         media: q,
//         addEventListener: () => {},
//         removeEventListener: () => {},
//       }),
//     })
//   })

// =====================================================
// 12. SSR 注意
// =====================================================
//
// matchMedia 在 server 端不存在 → useReducedMotion 必须做 typeof window guard
// 否则 build / hydrate 报错
//
// hydration mismatch 风险:
//   server 渲染时 reduced=false,client 用户偏好 reduced=true → 第一次渲染不一致
// 解决:用 useEffect 第二次渲染,或接受第一次「全动画」
//
// 推荐:initial state 用 false(全动),useEffect 后切到真实值
// → 即便闪一下也比 hydration error 好

// =====================================================
// 13. 不要做的事
// =====================================================
//
// ❌ 检测到 reduced 就把整个站点改成静态
// ✅ 只去掉装饰性 motion,功能性(loading / status)留下
//
// ❌ 弹窗问用户「你需要减少动画吗」
// ✅ 默认尊重系统设置,设置页加可选覆盖
//
// ❌ 只在某些组件加 reduced motion
// ✅ 全局策略 + CSS 兜底,而不是组件级补丁

export {}
