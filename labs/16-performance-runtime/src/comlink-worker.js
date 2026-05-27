// Web Worker + Comlink:像调用本地函数一样使用 Worker
// 适合:大型计算 / image / video / wasm / 离线 DB(SQLite WASM)

// ========================================
// crunch.worker.js
// ========================================
/*
import * as Comlink from 'comlink'

const api = {
  // 简单计算
  fib(n) {
    if (n < 2) return n
    return this.fib(n - 1) + this.fib(n - 2)
  },

  // 大数据处理
  async sortLargeArray(arr) {
    const t0 = performance.now()
    arr.sort((a, b) => a - b)
    return { sorted: arr, ms: performance.now() - t0 }
  },

  // 进度回调
  async processImage(file, onProgress) {
    const total = file.size
    let done = 0
    // ... 处理
    await onProgress(50)            // 跨线程调用 callback!
    await onProgress(100)
    return { thumbnailBlob: someBlob }
  },
}

Comlink.expose(api)
*/

// ========================================
// main.js
// ========================================
import * as Comlink from 'comlink'

// 创建 worker(Vite / Webpack 5 自动处理 URL)
const worker = new Worker(
  new URL('./crunch.worker.js', import.meta.url),
  { type: 'module' },
)

const api = Comlink.wrap(worker)

// 调用就像调用本地异步函数
const result = await api.fib(40)

// 传 callback 也行(Comlink 自动 proxy)
await api.processImage(file, Comlink.proxy(progress => {
  console.log(`${progress}%`)
}))

// ========================================
// Transferable:零拷贝传递 ArrayBuffer
// ========================================
const buffer = new ArrayBuffer(100 * 1024 * 1024)        // 100MB
// 默认会被「结构化克隆」(拷贝一份)→ 慢
// Comlink.transfer 让所有权转移,主线程后再访问 buffer 是空的
await api.processBuffer(Comlink.transfer(buffer, [buffer]))

// ========================================
// OffscreenCanvas:在 Worker 里绘图
// ========================================
const canvas = document.querySelector('canvas')
const offscreen = canvas.transferControlToOffscreen()

worker.postMessage({ canvas: offscreen }, [offscreen])

// worker.js
self.onmessage = (e) => {
  const ctx = e.data.canvas.getContext('2d')
  // 在 worker 线程里绘制,完全不阻塞主线程
  function loop() {
    ctx.fillRect(0, 0, 100, 100)
    requestAnimationFrame(loop)
  }
  loop()
}

// ========================================
// 注意事项
// ========================================
//
// 1. Worker 没有 DOM、window、localStorage,但有 fetch / IndexedDB / Crypto
// 2. 启动开销:~10ms(创建 worker),不适合「一次性 1ms 计算」
// 3. postMessage 大对象会序列化 → 用 Transferable 零拷贝
// 4. 调试:DevTools → Sources → Threads,能 breakpoint Worker
// 5. SharedArrayBuffer 需要 COOP/COEP header
//
// 典型用途:
//   - 大数据排序 / 过滤
//   - JSON 解析 (parse 10MB)
//   - 图片 / 视频处理(配合 OffscreenCanvas / WebCodecs)
//   - SQLite WASM 数据库
//   - PDF 渲染(pdf.js 内置 worker)
//   - Markdown / 代码高亮(prismjs / shiki)
//
// 反例:
//   - DOM 操作(Worker 没有 DOM)
//   - 极小计算(Worker overhead 比计算还久)
//   - 需要频繁通信(每次 postMessage 都是开销)
