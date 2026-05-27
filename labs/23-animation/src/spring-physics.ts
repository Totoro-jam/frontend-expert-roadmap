// Spring 物理动画:理论 + react-spring + Motion One + 手写
// 搞懂 stiffness/damping/mass 才能调出"对"的感觉

// =====================================================
// 1. 物理模型
// =====================================================
//
// 弹簧 + 阻尼系统(damped spring oscillator):
//
//   F = -k(x - target) - c*v
//
// k = stiffness     弹簧硬度(N/m)
// c = damping       阻尼(N·s/m)
// v = velocity      当前速度
// m = mass          质量
//
//
// 加速度:
//   a = F / m = (-k(x - target) - c*v) / m
//
// 每帧(dt = 1/60):
//   v += a * dt
//   x += v * dt
//
// 直到 |v| < threshold 且 |x - target| < threshold → 收敛

// =====================================================
// 2. 手写 spring(教学用)
// =====================================================
export interface SpringConfig {
  stiffness?: number
  damping?: number
  mass?: number
  precision?: number
  initialVelocity?: number
}

export function spring(
  from: number,
  to: number,
  cfg: SpringConfig = {},
  onUpdate: (v: number) => void,
): () => void {
  const stiffness = cfg.stiffness ?? 170
  const damping = cfg.damping ?? 26
  const mass = cfg.mass ?? 1
  const precision = cfg.precision ?? 0.01

  let x = from
  let v = cfg.initialVelocity ?? 0
  let last = performance.now()
  let raf = 0
  let stopped = false

  function tick(now: number) {
    if (stopped) return
    const dt = Math.min((now - last) / 1000, 1 / 30)        // 卡 30fps 兜底
    last = now

    const Fspring = -stiffness * (x - to)
    const Fdamper = -damping * v
    const a = (Fspring + Fdamper) / mass

    v += a * dt
    x += v * dt

    onUpdate(x)

    if (Math.abs(x - to) < precision && Math.abs(v) < precision) {
      onUpdate(to)
      return
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
  }
}

// 用法:
// const cancel = spring(0, 200, { stiffness: 200, damping: 20 }, v => {
//   el.style.transform = `translateX(${v}px)`
// })

// =====================================================
// 3. 直觉参数表
// =====================================================
//
// stiffness=100, damping=10  → 软弹,过冲明显
// stiffness=170, damping=26  → react-spring 默认,温和(default)
// stiffness=210, damping=20  → wobbly
// stiffness=300, damping=30  → snappy(常用 UI)
// stiffness=500, damping=50  → 极快收敛(几乎无弹性)
// stiffness=1000, damping=100 → 像 ease,但物理感
//
// damping ≥ 2*sqrt(stiffness*mass) → critically damped(无过冲)
// damping < 上述 → underdamped(会弹)
// damping > 上述 → overdamped(慢收敛)

// =====================================================
// 4. 计算理论持续时间(给文档用)
// =====================================================
export function estimateSpringDuration(stiffness: number, damping: number, mass = 1) {
  const angular = Math.sqrt(stiffness / mass)
  const ratio = damping / (2 * Math.sqrt(stiffness * mass))
  if (ratio < 1) {
    // 欠阻尼:大约几个周期收敛
    return (8 / (angular * ratio)) * 1000
  }
  return (4 / angular) * 1000
}

// =====================================================
// 5. react-spring 用法
// =====================================================
//
// import { useSpring, animated, config } from '@react-spring/web'
//
// // 内置 config
// config.default   { tension: 170, friction: 26 }
// config.gentle    { tension: 120, friction: 14 }
// config.wobbly    { tension: 180, friction: 12 }
// config.stiff     { tension: 210, friction: 20 }
// config.slow      { tension: 280, friction: 60 }
// config.molasses  { tension: 280, friction: 120 }
//
// 注意:react-spring 用 tension / friction(等价 stiffness / damping)
//
// function MyComponent({ open }) {
//   const styles = useSpring({
//     opacity: open ? 1 : 0,
//     transform: open ? 'translateY(0px)' : 'translateY(20px)',
//     config: config.stiff,
//   })
//   return <animated.div style={styles}>...</animated.div>
// }
//
// 拖拽 + spring release:
// import { useDrag } from '@use-gesture/react'
// const [{ x, y }, api] = useSpring(() => ({ x: 0, y: 0 }))
// const bind = useDrag(({ movement: [mx, my], down }) => {
//   api.start({ x: down ? mx : 0, y: down ? my : 0, immediate: down })
// })

// =====================================================
// 6. Motion One(轻量替代,~3KB)
// =====================================================
//
// import { animate, spring } from 'motion'
//
// animate(el, { transform: 'translateX(200px)' }, { easing: spring({ stiffness: 200, damping: 20 }) })
//
// // 或纯 spring 函数生成 easing
// const easing = spring({ stiffness: 200, damping: 20 })

// =====================================================
// 7. CSS 模拟 spring(no JS)
// =====================================================
//
// 用 cubic-bezier 近似(不真物理但够看):
//   stiffness=300, damping=30 ≈ cubic-bezier(.2, .8, .2, 1.05)
//
// 或用 CSS @keyframes 多关键帧模拟:
//   @keyframes spring {
//     0%   { transform: translateX(0); }
//     50%  { transform: translateX(220px); }
//     70%  { transform: translateX(180px); }
//     85%  { transform: translateX(208px); }
//     100% { transform: translateX(200px); }
//   }

// =====================================================
// 8. 何时不用 spring
// =====================================================
//
// 用 duration-based(transition / ease) 当:
// - 进度条 / loader(spring 不好估时长)
// - 节奏要精确同步(配合音频 / 视频)
// - 简单 hover(spring 是浪费)
// - 极小动画(<100ms,看不出来)
//
// 用 spring 当:
// - 拖拽释放(必须 spring 才像「弹回去」)
// - UI 元素出现(感觉「自然」)
// - 物理类游戏 / 触觉反馈
// - 跟随手势的动画

// =====================================================
// 9. 高级:velocity 传递(连续手势)
// =====================================================
//
// 用户拖完释放,spring 接续:
//
//   const v0 = gesture.velocity.x        // px/ms,gesture lib 提供
//   spring(currentX, targetX, { initialVelocity: v0 * 1000 }, ...)
//
// 不传 velocity → 释放感僵硬(像是从 0 重新弹回去)
// 传了 → 感觉惯性连续(iOS 那种滑顺)

// =====================================================
// 10. 调参 workflow
// =====================================================
//
// 1. 先用 default(stiffness 170, damping 26)看看
// 2. 嫌慢 → 提 stiffness
// 3. 嫌晃 → 提 damping
// 4. 嫌没"分量" → 加 mass
// 5. 用 Chrome Perf 看真实帧率,确认 60fps
// 6. 用真机测(不要在 Mac 上调好就上线 — 手机性能差异大)

export {}
