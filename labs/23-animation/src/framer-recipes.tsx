// Framer Motion 业务场景 cookbook
// 覆盖 80% UI 动画需求,可直接复用

import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  useReducedMotion,
  LayoutGroup,
  type Variants,
  type Transition,
} from 'framer-motion'
import { useState, useRef } from 'react'

// =====================================================
// 1. 全局 transition preset(团队统一)
// =====================================================
export const ease = {
  standard: [0.4, 0, 0.2, 1] as const,       // material
  emphasized: [0.2, 0, 0, 1] as const,        // iOS like
  bounce: [0.68, -0.55, 0.27, 1.55] as const, // overshoot
}

export const spring = {
  snappy: { type: 'spring' as const, stiffness: 300, damping: 30 },
  soft: { type: 'spring' as const, stiffness: 170, damping: 26 },
  wobbly: { type: 'spring' as const, stiffness: 200, damping: 15 },
}

// =====================================================
// 2. Fade In Up(进入动画,最常用)
// =====================================================
export function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: ease.emphasized, delay }}
    >
      {children}
    </motion.div>
  )
}

// =====================================================
// 3. Stagger 列表错峰
// =====================================================
const listVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring.snappy },
}

export function StaggerList({ items }: { items: string[] }) {
  return (
    <motion.ul variants={listVariants} initial="hidden" animate="show">
      {items.map((it, i) => (
        <motion.li key={i} variants={itemVariants}>{it}</motion.li>
      ))}
    </motion.ul>
  )
}

// =====================================================
// 4. Modal(进 + 出 + a11y)
// =====================================================
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: ease.emphasized }}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#fff', padding: '2rem', borderRadius: 12,
              zIndex: 1001,
            }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// =====================================================
// 5. 抽屉(从右侧滑入)
// =====================================================
export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000 }}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 400 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x > 100) onClose()
            }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 400, background: '#fff', zIndex: 1001,
            }}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// =====================================================
// 6. Toast(自动消失)
// =====================================================
export function Toast({ id, message, onClose }: { id: string; message: string; onClose: () => void }) {
  return (
    <motion.div
      layout
      key={id}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={spring.snappy}
      style={{
        background: '#333', color: '#fff', padding: '0.75rem 1rem',
        borderRadius: 8, marginTop: 8,
      }}
    >
      {message}
    </motion.div>
  )
}

// =====================================================
// 7. Tabs underline 跟随(layoutId 是核心)
// =====================================================
export function Tabs({ tabs }: { tabs: string[] }) {
  const [active, setActive] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {tabs.map((t, i) => (
        <button
          key={t}
          onClick={() => setActive(i)}
          style={{ position: 'relative', padding: '8px 16px', background: 'none', border: 'none' }}
        >
          {t}
          {active === i && (
            <motion.div
              layoutId="tab-underline"
              transition={spring.snappy}
              style={{
                position: 'absolute', left: 0, right: 0, bottom: -2, height: 2,
                background: '#2563eb',
              }}
            />
          )}
        </button>
      ))}
    </div>
  )
}

// =====================================================
// 8. Layout animation:重排自动过渡
// =====================================================
export function ReorderList() {
  const [items, setItems] = useState([1, 2, 3, 4, 5])
  const shuffle = () => setItems([...items].sort(() => Math.random() - 0.5))

  return (
    <>
      <button onClick={shuffle}>shuffle</button>
      <LayoutGroup>
        {items.map(n => (
          <motion.div
            key={n}
            layout
            transition={spring.snappy}
            style={{ padding: 12, border: '1px solid #ccc', margin: 4 }}
          >
            Item {n}
          </motion.div>
        ))}
      </LayoutGroup>
    </>
  )
}

// =====================================================
// 9. Parallax scroll
// =====================================================
export function Parallax({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['-50%', '50%'])

  return (
    <div ref={ref} style={{ overflow: 'hidden', height: 400 }}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  )
}

// =====================================================
// 10. 拖拽 + spring release
// =====================================================
export function DraggableCard() {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-25, 25])

  return (
    <motion.div
      drag
      dragSnapToOrigin
      dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
      style={{ x, y, rotate, width: 200, height: 300, background: '#2563eb', borderRadius: 12 }}
      whileTap={{ cursor: 'grabbing', scale: 1.05 }}
      whileHover={{ scale: 1.02 }}
    />
  )
}

// =====================================================
// 11. 长按反馈
// =====================================================
export function PressableButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      style={{ padding: '10px 20px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none' }}
    >
      {children}
    </motion.button>
  )
}

// =====================================================
// 12. 数字滚动(简单版)
// =====================================================
export function CountUp({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 80, damping: 18 })
  spring.set(value)

  return <motion.span>{spring}</motion.span>
}

// =====================================================
// 13. Reduced motion 包装
// =====================================================
export function MotionSafe({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const reduce = useReducedMotion()
  return reduce ? <>{fallback ?? children}</> : <>{children}</>
}

// 用法:
// <MotionSafe fallback={<StaticHero />}>
//   <AnimatedHero />
// </MotionSafe>

// =====================================================
// 14. Page transition(配合路由)
// =====================================================
export function PageWrapper({ children, key }: { children: React.ReactNode; key: string }) {
  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: ease.emphasized }}
    >
      {children}
    </motion.div>
  )
}
// 父组件用 <AnimatePresence mode="wait"> 包,key 用 route path

// =====================================================
// 15. Sequence(分步动画)
// =====================================================
export function SequenceDemo() {
  const text = 'Animations are language'.split('')
  return (
    <div>
      {text.map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.3 }}
          style={{ display: 'inline-block' }}
        >
          {char === ' ' ? ' ' : char}
        </motion.span>
      ))}
    </div>
  )
}

// =====================================================
// 16. 性能 tips
// =====================================================
//
// 1. 用 transform/opacity,别动 width/height/top/left
// 2. 大列表 stagger 别超过 20 个(否则总时长爆炸)
// 3. layout 动画很美但贵 — 不要在 60+ item 列表用
// 4. useMotionValue 订阅式,不触发 re-render(性能比 useState 好)
// 5. 把动画包装成单独组件,memo 一下,父 re-render 不重启
// 6. AnimatePresence 必须给子元素加 key

export {}
