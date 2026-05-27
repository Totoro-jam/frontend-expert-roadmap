# 03 · Browser Internals Lab

> 浏览器是个操作系统。看懂它的进程模型、渲染管线、事件循环、网络栈,你才知道为什么 React/Vue 那些 API 长成那个样。
> 没看过 Chromium / Firefox 架构文档的前端,就是「在 iframe 里跑业务」的开发者。

---

## 学这个能干什么

- 解释「为什么 `setTimeout(fn, 0)` 比 `Promise.resolve().then(fn)` 慢」
- 看 Performance 面板的火焰图,知道每一帧的预算去哪了
- 不再被 reflow / repaint / composite 这些词忽悠,能精确指出什么改了
- 调用 `requestAnimationFrame` / `requestIdleCallback` / scheduler.postTask 时知道在调什么
- 写出真正不卡的滚动 / 拖拽 / 大列表
- 看懂 Chrome DevTools Memory / Performance / Coverage / Network 面板的全部数据

---

## Roadmap

### 1. 进程模型(Site Isolation)

Chrome 多进程架构:

```
Browser Process(主)
├─ GPU Process
├─ Network Service
├─ Storage Service
└─ Renderer Process(每个 site 一个)
    ├─ Main Thread(运行你的 JS、Style、Layout、Paint)
    ├─ Compositor Thread(独立合成,不被 JS 卡住)
    ├─ Raster Threads
    └─ Worker Threads(Web Worker / Service Worker)
```

* Site Isolation(2018+):每个 origin 独立进程 → Spectre 漏洞之后的强制安全设计
* 这就是为什么 `postMessage` / `SharedArrayBuffer` 跨 origin 那么受限

### 2. 渲染管线(关键路径)

```
HTML → DOM Tree
CSS  → CSSOM Tree
         ↓ 合并
       Render Tree
         ↓
       Layout(reflow)      ← 重排,O(n) 影响巨大
         ↓
       Paint(repaint)      ← 重绘
         ↓
       Composite           ← 合成,GPU 上跑,最便宜
```

**精确分类**(关键!面试常考):

| 改的属性 | 触发什么 |
|---|---|
| `width` `height` `padding` `margin` `top` `left` `font-size` | Layout + Paint + Composite |
| `color` `background` `box-shadow` | Paint + Composite |
| `transform` `opacity` `filter` | **只触发 Composite** ← GPU 加速的关键 |

* 完整列表查 [csstriggers.com](https://csstriggers.com)
* CSS 动画用 `transform` 不用 `top`,根本原因在这

### 3. 事件循环(精确版)

```
while (true) {
  task = pickOldestMacroTask()       // 一个 macrotask
  execute(task)
  drainMicrotasks()                  // 全部 microtask
  if (shouldRender()) {
    requestAnimationFrame callbacks  // RAF
    Style / Layout / Paint
    Composite
  }
  drainIdleCallbacks()               // 浏览器空闲时
}
```

* macrotask:`setTimeout` `setInterval` `MessageChannel` `setImmediate(IE)` `I/O`
* microtask:`Promise.then` `queueMicrotask` `MutationObserver`
* **microtask 会清空到底**,所以无限 `Promise.then` 会饿死渲染(经典 bug)
* `requestAnimationFrame` 一定在 paint 之前,所以适合做动画;`requestIdleCallback` 在 paint 之后,适合非紧急任务

### 4. 关键渲染指标(LCP/CLS/INP/FID/TTFB)

Core Web Vitals(Google 排名因素):

| 指标 | 含义 | 好阈值 |
|---|---|---|
| **LCP** Largest Contentful Paint | 最大元素显示时间 | < 2.5s |
| **CLS** Cumulative Layout Shift | 累计布局抖动 | < 0.1 |
| **INP** Interaction to Next Paint(2024 取代 FID) | 交互响应延迟 | < 200ms |
| **TTFB** Time To First Byte | 首字节到达 | < 800ms |
| **FCP** First Contentful Paint | 首次内容绘制 | < 1.8s |

* 用 `web-vitals` 库直接采集上报
* INP 是新的核心:卡顿不是「长任务一次」,而是「任何一次交互响应慢」

### 5. 网络栈

* DNS → TCP 握手 → TLS 握手 → HTTP 请求 → 解析 → 渲染
* HTTP/1.1 vs HTTP/2(多路复用)vs HTTP/3(QUIC,基于 UDP,0-RTT)
* TLS 1.3 三个握手缩减为一个 round trip
* `<link rel="preconnect">` `dns-prefetch` `preload` `prefetch` `modulepreload` 各自的语义和触发时机
* `Cache-Control: immutable` 配合带 hash 的文件名(`app.a1b2c3.js`)是现代 SPA 的标准
* Service Worker 拦截策略:Cache First / Network First / Stale While Revalidate

### 6. 存储

| 机制 | 容量 | 同步? | 跨 tab? |
|---|---|---|---|
| `localStorage` | ~5MB | 同步阻塞 | ✅(`storage` 事件) |
| `sessionStorage` | ~5MB | 同步 | ❌ |
| Cookie | ~4KB | 每个请求都带,极其昂贵 | ✅ |
| IndexedDB | 几百 MB ~ GB | 异步(事务) | ✅ |
| Cache Storage(SW) | 大 | 异步 | ✅ |
| `OPFS`(File System Access) | 大 | 同步(Worker 内) | ✅ |

* SQLite-in-Browser 的趋势:`@sqlite.org/sqlite-wasm` 跑在 OPFS 上,适合大型离线应用

### 7. 安全模型

* Same-Origin Policy 三要素:**协议 + 域名 + 端口**
* CORS:`Access-Control-Allow-Origin`,Preflight(`OPTIONS`)触发条件
* CSP(Content Security Policy):防 XSS 的最后一道防线
* SameSite Cookie:`Strict` / `Lax`(默认)/ `None; Secure`
* `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`:开启 `SharedArrayBuffer` 的隔离条件
* Trusted Types:DOM XSS 的根治方案
* 详细攻防见 [22-security-lab](../22-security-lab/)

### 8. Worker 三件套

| | 用途 | 拿不到的 |
|---|---|---|
| **Web Worker** | CPU 密集任务,主线程不卡 | DOM |
| **Service Worker** | 离线、推送、网络拦截 | DOM |
| **Shared Worker** | 多 tab 共享一个 worker | DOM |
| **AudioWorklet / PaintWorklet / LayoutWorklet** | 特殊用途 | DOM |

`postMessage` + `Transferable Object`(ArrayBuffer 等)= 零拷贝传输

### 9. 调试技能(DevTools 七大面板)

每个面板都该会用到大师级:

* **Elements**:Force state、Layout overlay(Grid/Flex)、Computed 样式来源
* **Console**:`$0`(最后选中的元素)、`monitor()` `monitorEvents()` `getEventListeners()`
* **Sources**:Conditional breakpoint、Logpoint、`debugger` + DevTools Workspace 把 Sources 当编辑器
* **Network**:Throttling、Initiator、HAR 导出
* **Performance**:火焰图、long task、Total Blocking Time
* **Memory**:三次堆快照法找泄漏(打开页 → 操作 → GC → 快照 → 操作 → GC → 快照 → 对比)
* **Application**:LocalStorage、IndexedDB、Service Worker、Cookie、Storage Quota
* **Lighthouse**:跑分,但要会**读 Opportunities** 部分

### 10. 现代 API 全家桶

* `IntersectionObserver` — 取代 scroll listener,做懒加载/曝光统计
* `ResizeObserver` — 取代 window.resize,精确到元素
* `MutationObserver` — 监听 DOM 变化
* `AbortController` — 取消 fetch / addEventListener / animation
* `BroadcastChannel` — tab 间通信
* `View Transitions API` — 跨页面动画(2024 在 SPA 也可用)
* `requestVideoFrameCallback` — 视频精确同步
* `Scheduler.postTask` — 优先级调度(React 19 内部用)
* `URLPattern` — 类型安全的 URL 模式匹配

---

## demos/ 实操

| 文件 | 主题 |
|---|---|
| [event-loop.html](demos/event-loop.html) | macro/micro/RAF/idle 顺序可视化 |
| [layout-thrashing.html](demos/layout-thrashing.html) | reflow vs only-composite 性能对比 |
| [intersection-observer.html](demos/intersection-observer.html) | 现代懒加载实现 |
| [abort-controller.html](demos/abort-controller.html) | fetch 可取消 + 防抖搜索 |

直接用 `open demos/event-loop.html` 跑(无需构建,纯 HTML)。

---

## 资源

- 📖 [The Browser Story](https://www.smashingmagazine.com/2021/09/web-platform-overview/) (Smashing Magazine 综述)
- 📖 [How Browsers Work](https://web.dev/howbrowserswork/) — Tali Garsiel 经典长文
- 📖 [Inside look at modern web browser](https://developer.chrome.com/blog/inside-browser-part1) (Chrome 团队 4 篇)
- 📖 [V8 团队博客](https://v8.dev/blog) — 看 JS 引擎进化
- 📖 [What every web developer should know about networking](https://hpbn.co/) (High Performance Browser Networking 整本免费)
- 📺 [Jake Archibald: In The Loop](https://www.youtube.com/watch?v=cCOL7MC4Pl0) — 事件循环最权威讲解
