// React 性能优化全套技巧
// startTransition / useDeferredValue / memo / virtual list / Suspense streaming

import {
  useState,
  useMemo,
  useCallback,
  useDeferredValue,
  startTransition,
  memo,
  Profiler,
  type ReactNode,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

// ====================================================
// 场景 1:5000 项过滤,输入时不卡
// ====================================================
function SearchableListNaive({ items }: { items: string[] }) {
  const [q, setQ] = useState('')

  // ❌ 每次输入都同步过滤 5000 项 + 渲染 → 卡 200ms
  const filtered = items.filter(i => i.includes(q))

  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} />
      <ul>{filtered.map(i => <li key={i}>{i}</li>)}</ul>
    </>
  )
}

// ✅ 用 useDeferredValue:输入立刻响应,过滤可延后
function SearchableListBetter({ items }: { items: string[] }) {
  const [q, setQ] = useState('')
  const deferredQ = useDeferredValue(q)

  // 用 useMemo 让过滤结果稳定(同 deferredQ 不重算)
  const filtered = useMemo(
    () => items.filter(i => i.includes(deferredQ)),
    [items, deferredQ],
  )

  const isStale = q !== deferredQ

  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} />
      <ul style={{ opacity: isStale ? 0.5 : 1 }}>
        {filtered.map(i => <li key={i}>{i}</li>)}
      </ul>
    </>
  )
}

// ====================================================
// 场景 2:点击触发昂贵切换,UI 不冻结
// ====================================================
function TabSwitchNaive() {
  const [tab, setTab] = useState('home')

  return (
    <>
      <button onClick={() => setTab('home')}>Home</button>
      <button onClick={() => setTab('heavy')}>Heavy</button>
      {tab === 'home' && <Home />}
      {tab === 'heavy' && <HeavyPage />}     {/* 5000 个 chart */}
    </>
  )
}

// ✅ startTransition:tab 切换被标记非紧急,可以被打断
function TabSwitchBetter() {
  const [tab, setTab] = useState('home')
  const [isPending, setIsPending] = useState(false)

  const switchTab = (next: string) => {
    setIsPending(true)
    startTransition(() => {
      setTab(next)
      setIsPending(false)
    })
  }

  return (
    <>
      <button onClick={() => switchTab('home')}>Home</button>
      <button onClick={() => switchTab('heavy')} disabled={isPending}>
        Heavy {isPending && '(loading…)'}
      </button>
      {tab === 'home' && <Home />}
      {tab === 'heavy' && <HeavyPage />}
    </>
  )
}

// ====================================================
// 场景 3:React.memo 的正确用法
// ====================================================
const Row = memo(function Row({ item, onSelect }: { item: Item; onSelect: (id: string) => void }) {
  return (
    <div onClick={() => onSelect(item.id)}>
      {item.name}
    </div>
  )
})

function List({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  // ⚠️ 没 useCallback,每次 List re-render 都生成新 onSelect → memo 全部失效!
  const handleSelect = useCallback((id: string) => setSelected(id), [])

  return (
    <>
      <div>Selected: {selected}</div>
      {items.map(item => (
        <Row key={item.id} item={item} onSelect={handleSelect} />
      ))}
    </>
  )
}

// 💡 React Compiler(2024+)开启后,自动 memoize 一切,不再需要手动 useCallback / memo

// ====================================================
// 场景 4:Suspense streaming(慢的部分不阻塞快的)
// ====================================================
function Dashboard() {
  return (
    <>
      <Header />                                {/* 快 */}

      <Suspense fallback={<Spinner />}>
        <Stats />                               {/* 中等 */}
      </Suspense>

      <Suspense fallback={<Spinner />}>
        <RecentActivity />                      {/* 慢 */}
      </Suspense>
    </>
  )
}

// 配合 use() hook + React Query / Next App Router,每个 Suspense 独立加载

// ====================================================
// 场景 5:虚拟化大列表
// ====================================================
function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const v = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  })

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map(vItem => (
          <div
            key={vItem.key}
            style={{
              position: 'absolute',
              top: vItem.start,
              height: vItem.size,
              left: 0, right: 0,
            }}
          >
            {items[vItem.index].name}
          </div>
        ))}
      </div>
    </div>
  )
}

// ====================================================
// 场景 6:用 Profiler 监控慢渲染
// ====================================================
function App({ children }: { children: ReactNode }) {
  return (
    <Profiler
      id="App"
      onRender={(id, phase, actualDuration, baseDuration, startTime) => {
        if (actualDuration > 16) {
          console.warn(`[slow] ${id} ${phase}: ${actualDuration.toFixed(2)}ms`)
          // 真实场景:上报到 RUM
        }
      }}
    >
      {children}
    </Profiler>
  )
}

// ====================================================
// 性能优化决策树
// ====================================================
//
// 卡顿 → 打开 Performance 面板
//   ├── 红条 > 50ms → Long Task
//   │   ├── 是 React render → memo + useCallback + 虚拟化
//   │   ├── 是同步计算 → Web Worker / scheduler.yield
//   │   └── 是第三方 SDK → defer / async
//   ├── 大量 Layout/Paint → 看 CSS(transform/opacity 代替 width/top)
//   ├── 内存溢出 → Heap Snapshot 找 Detached DOM / Closure 泄漏
//   └── 输入 → 反馈延迟 → useDeferredValue / debounce / startTransition
//
// 工具优先级:
//   1. Chrome DevTools Performance(本机定位)
//   2. React DevTools Profiler(找慢组件)
//   3. web-vitals 上报(真实用户)
//   4. Lighthouse(综合报告)

import { useRef, Suspense } from 'react'
import type { ReactElement } from 'react'

type Item = { id: string; name: string }
declare function Home(): ReactElement
declare function HeavyPage(): ReactElement
declare function Header(): ReactElement
declare function Stats(): ReactElement
declare function RecentActivity(): ReactElement
declare function Spinner(): ReactElement
