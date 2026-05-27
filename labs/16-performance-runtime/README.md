# 16 · Performance · Runtime Lab

> 「页面卡」不是玄学。所有卡顿都是 main thread 阻塞导致的,所有阻塞都能用 Performance / Profiler 测出来。

(配套 [17-performance-loading-lab/](../17-performance-loading-lab/) 处理「加载性能」,本仓库专门讲「运行时性能」。)

---

## 学这个能干什么

- 看懂 Chrome DevTools Performance / Lighthouse / WebPageTest 全部面板
- 测量真实用户的卡顿(RUM,不止本地 dev 数据)
- 60fps 不掉帧:理解 frame budget = 16.7ms,知道每一步在哪
- INP / TBT / Long Tasks → 给出精准修复方案
- 把重活搬到 Web Worker / OffscreenCanvas / WebGPU
- 处理超长列表 / 大表格 / 实时图表的渲染

---

## Roadmap

### 1. 性能模型:RAIL & Core Web Vitals(运行时部分)

**RAIL**(Google):
- **R**esponse:用户输入到反馈 < 100ms
- **A**nimation:每帧 < 16ms(60fps)
- **I**dle:利用 idle 时间预加载
- **L**oad:首屏 < 5s

**Core Web Vitals 运行时**:
- **INP**(Interaction to Next Paint):点击/输入响应 < 200ms
- **CLS**(Cumulative Layout Shift):布局抖动 < 0.1
- **TBT**(Total Blocking Time):长任务总时长 < 200ms

### 2. Frame Budget:16.67ms 详细预算

```
[一帧 16.67ms]
  ├── JS 执行      ~6ms
  ├── Style 计算   ~1ms
  ├── Layout       ~3ms
  ├── Paint        ~2ms
  ├── Composite    ~1ms
  └── 浏览器其他   ~3ms
```

超过 50ms 的任务 = **Long Task**(Chrome 标记为红条)。

**如何看**:DevTools → Performance → 红条 + Main 火焰图

### 3. 真实场景:为什么 setState 后卡 200ms?

```jsx
function App() {
  const [items, setItems] = useState<Item[]>([])

  const handleClick = () => {
    const newItems = expensiveCompute()    // ← 100ms
    setItems(newItems)                     // ← 触发 render
    // render 5000 个组件: 100ms
    // commit DOM: 50ms
    // 总共: 250ms 卡顿
  }
}
```

**修复 3 招**:
1. `startTransition` 标记为「非紧急」更新,让浏览器先响应输入
2. `useDeferredValue` 延后过滤结果计算
3. 数据多就**虚拟化**(react-virtual / TanStack Virtual)

```jsx
import { startTransition } from 'react'

const handleClick = () => {
  startTransition(() => {
    setItems(newItems)            // 非紧急,可被打断
  })
}
```

### 4. 长任务(Long Task)优化

```js
// ❌ 一口气处理 10000 项
data.forEach(item => process(item))    // 阻塞 500ms

// ✅ 切片 + scheduler.yield()
async function processInChunks(data) {
  for (let i = 0; i < data.length; i += 50) {
    data.slice(i, i + 50).forEach(process)
    await scheduler.yield()           // 让出主线程,允许浏览器渲染 / 响应输入
  }
}
```

`scheduler.yield()`(2024+):比 `setTimeout(_, 0)` 优先级更智能;不支持时降级 `MessageChannel`。

**`isInputPending`**(Chrome 87+):
```js
if (navigator.scheduling?.isInputPending()) {
  await scheduler.yield()
}
process(item)
```
有键盘 / 鼠标输入待处理时就让出。

### 5. Web Worker:把计算搬到后台线程

```js
// main.js
const worker = new Worker(new URL('./crunch.worker.js', import.meta.url), { type: 'module' })

worker.postMessage({ data: bigArray })
worker.onmessage = (e) => setResult(e.data)
```

```js
// crunch.worker.js
self.onmessage = (e) => {
  const result = heavyComputation(e.data.data)
  self.postMessage(result)
}
```

**陷阱**:postMessage 跨线程是「拷贝」开销,小数据 OK,大对象用 **Transferable**(ArrayBuffer)零拷贝。

**Comlink**(Google,1KB):
```js
import * as Comlink from 'comlink'
const api = Comlink.wrap(new Worker('./worker.js'))
const result = await api.compute(bigData)   // 像调用本地函数
```

### 6. SharedArrayBuffer + Atomics(高级)

```js
const sab = new SharedArrayBuffer(1024)
const view = new Int32Array(sab)

// Worker 和 main 都能直接读写
worker.postMessage(sab)
Atomics.add(view, 0, 1)
```

需要 COOP / COEP header(`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`)。

适合:游戏 / 音视频处理 / WebAssembly 多线程。

### 7. 虚拟化列表

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function List({ rows }: { rows: Row[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,            // 行高
    overscan: 5,                       // 上下多渲染 5 行
  })

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map(item => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: item.start,
              left: 0,
              right: 0,
              height: item.size,
            }}
          >
            {rows[item.index].name}
          </div>
        ))}
      </div>
    </div>
  )
}
```

10000 行 → 实际只渲染 ~20 个 DOM 节点。

进阶:动态行高(`measureElement`),横向虚拟化,Grid(行 + 列双向虚拟化)

### 8. CSS / Animation 性能

| 触发 | 代价 |
|---|---|
| `width / height / margin / padding` | Layout → Paint → Composite 全跑 |
| `color / background` | Paint → Composite |
| `transform / opacity` | 只 Composite,**GPU 加速** |

```css
/* ❌ 触发 layout */
.box { left: 100px; }

/* ✅ 只 composite */
.box { transform: translateX(100px); }
```

**强制 layer 提升**:
```css
.heavy {
  will-change: transform;     /* 提示浏览器单独 layer */
  transform: translateZ(0);   /* 老 hack */
}
```

⚠️ 别滥用 `will-change`,每个 layer 占显存,数百个 layer 反而卡。

**`content-visibility: auto`**:屏外内容跳过渲染(原生虚拟化)
```css
.section {
  content-visibility: auto;
  contain-intrinsic-size: 1000px;   /* 估算高度,避免 scrollbar 抖 */
}
```

### 9. INP 调优(2024 Web Vitals 主指标)

INP = 用户每次点击到下一帧绘制的时间。Google 推荐 < 200ms。

**3 个常见 INP 杀手**:
1. **React 同步 setState 触发 5000 组件 render** → `startTransition`
2. **点击后跑 100ms 业务逻辑** → 切到 microtask 之后 / Worker
3. **第三方脚本插一脚** → `<script async>` / delay 加载

**测量**:
```js
import { onINP } from 'web-vitals'
onINP(({ value, attribution }) => {
  console.log('INP', value)
  console.log('元凶:', attribution.eventEntry?.target)
})
```

`attribution` 模式(web-vitals 4+)直接告诉你哪个事件 / 哪个 DOM 元素拖累。

### 10. Memory 优化

**常见泄漏**:
1. `setInterval` 没清理
2. EventListener 没 removeEventListener
3. Closures 引用大对象
4. Detached DOM(组件卸载了但被 state / ref 引用)
5. Map 无限增长(用 WeakMap / LRU)

**检测**:
- DevTools → Memory → Heap Snapshot,搜「Detached」
- DevTools → Memory → Allocation Timeline,看哪段操作内存暴涨

```js
// 监控真实用户内存
performance.memory                // { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit }

// 监听 OOM
window.addEventListener('error', (e) => {
  if (e.message.includes('out of memory')) report('oom')
})
```

### 11. Profiler 实战

```js
// React Profiler
import { Profiler } from 'react'

<Profiler id="App" onRender={(id, phase, actualDuration) => {
  if (actualDuration > 50) console.warn(`${id} ${phase}: ${actualDuration}ms`)
}}>
  <App />
</Profiler>

// User Timing API:打 mark / measure
performance.mark('checkout-start')
await processOrder()
performance.mark('checkout-end')
performance.measure('checkout', 'checkout-start', 'checkout-end')

// DevTools → Performance → User Timing → 看到 checkout: 1234ms
```

### 12. 真实用户监控(RUM)

```js
import { onCLS, onINP, onLCP } from 'web-vitals/attribution'

function report(metric) {
  navigator.sendBeacon('/rum', JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    attribution: metric.attribution,
    url: location.href,
    userAgent: navigator.userAgent,
  }))
}

onCLS(report)
onINP(report)
onLCP(report)
```

工具:
- Sentry Performance
- Datadog RUM
- New Relic Browser
- 自建:web-vitals + InfluxDB + Grafana

---

## src/ 示例 & demos/

| 文件 | 主题 |
|---|---|
| [demos/long-task.html](demos/long-task.html) | 长任务 vs scheduler.yield 对比 |
| [demos/virtual-list.html](demos/virtual-list.html) | 10000 项 virtual list |
| [src/comlink-worker.js](src/comlink-worker.js) | Web Worker + Comlink |
| [src/web-vitals-rum.ts](src/web-vitals-rum.ts) | RUM 上报封装 |
| [src/react-perf.tsx](src/react-perf.tsx) | startTransition / useDeferredValue / memo 实战 |

---

## 资源

- [web.dev/performance](https://web.dev/performance/)
- [Core Web Vitals](https://web.dev/vitals/)
- [Chrome DevTools docs](https://developer.chrome.com/docs/devtools/)
- [PerfTrack — Bing](https://github.com/microsoft/perftrack)
- [Optimize INP](https://web.dev/inp/)
- [TanStack Virtual](https://tanstack.com/virtual/latest)
- [Comlink](https://github.com/GoogleChromeLabs/comlink)
