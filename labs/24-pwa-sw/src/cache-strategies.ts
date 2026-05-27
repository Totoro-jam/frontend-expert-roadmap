// 5 种 SW 缓存策略 —— 手写实现 + 何时用
//
// 这些代码运行在 sw.js 里(self === ServiceWorkerGlobalScope)
// 在主页面 import 它(用 importScripts 或 build 时 inline)

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

// =====================================================
// 1. Cache First(缓存优先)
// =====================================================
//
// 适合:版本化静态资源(app.[hash].js / style.[hash].css / 图片)
// 流程:cache hit → 返回 / miss → 网络 → 存 cache + 返回
// 优势:最快(无网也行)
// 风险:缓存可能过期(必须用 hash 文件名)

export async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    cache.put(request, response.clone()).catch(() => {})            // 不阻塞返回
  }
  return response
}

// =====================================================
// 2. Network First(网络优先,离线兜底)
// =====================================================
//
// 适合:HTML 文档 / API 数据(要新鲜,但能离线兜底)
// 流程:网络 → ok → 存 cache + 返回 / fail → cache fallback
// 风险:网慢时也慢(可加 timeout)

export interface NetworkFirstOpts {
  cacheName: string
  timeoutMs?: number
}

export async function networkFirst(request: Request, opts: NetworkFirstOpts): Promise<Response> {
  const cache = await caches.open(opts.cacheName)
  const timeout = opts.timeoutMs ?? 5000

  try {
    const response = await Promise.race([
      fetch(request),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Network timeout')), timeout),
      ),
    ])
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {})
      return response
    }
    throw new Error('Bad response')
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    // 兜底:返回 offline 页(如果是 navigation)
    if (request.mode === 'navigate') {
      const offline = await cache.match('/offline.html')
      if (offline) return offline
    }
    return Response.error()
  }
}

// =====================================================
// 3. Stale While Revalidate(SWR)
// =====================================================
//
// 适合:头像、用户资料、不严格实时的数据
// 流程:同时发起 cache 和 network → 返回 cache(快)→ 后台用 network 更新 cache
// 优势:用户感觉「快」 + 数据「逐步新鲜」
// 风险:用户看到一次旧数据(下次才新)

export async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {})
    return response
  }).catch(() => null)

  // 优先返回 cache(没有就等 network)
  return cached ?? (await networkPromise) ?? Response.error()
}

// =====================================================
// 4. Network Only(必须新鲜)
// =====================================================
//
// 适合:支付 / 下单 / 鉴权
// 一切交给 fetch,不做任何 cache 兜底

export async function networkOnly(request: Request): Promise<Response> {
  return fetch(request)
}

// =====================================================
// 5. Cache Only(仅离线 fallback)
// =====================================================
//
// 适合:offline.html / 离线 logo
// 流程:必须 precache,否则空

export async function cacheOnly(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  return cached ?? Response.error()
}

// =====================================================
// 6. 完整 fetch handler(根据 request 类型分发)
// =====================================================

const PRECACHE_NAME = 'v1-precache'
const RUNTIME_NAME = 'v1-runtime'
const IMAGE_CACHE = 'v1-images'
const API_CACHE = 'v1-api'

const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/app.js',
  '/style.css',
  '/icon-192.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then(c => c.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const expected = new Set([PRECACHE_NAME, RUNTIME_NAME, IMAGE_CACHE, API_CACHE])
    await Promise.all(keys.filter(k => !expected.has(k)).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // 只处理同源 GET
  if (req.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // 不缓存 SSE / WebSocket
  if (req.headers.get('accept')?.includes('text/event-stream')) return

  // 路由分发
  if (req.mode === 'navigate') {
    // HTML 页面:network first
    event.respondWith(networkFirst(req, { cacheName: RUNTIME_NAME, timeoutMs: 3000 }))
  } else if (req.destination === 'image') {
    // 图片:cache first + 过期清理
    event.respondWith(cacheFirstWithExpiration(req, IMAGE_CACHE, 60, 30))
  } else if (url.pathname.startsWith('/api/')) {
    // API:network first(短超时,失败 cache fallback)
    event.respondWith(networkFirst(req, { cacheName: API_CACHE, timeoutMs: 2000 }))
  } else if (PRECACHE_URLS.some(u => url.pathname.endsWith(u))) {
    // 预缓存的资源:cache first
    event.respondWith(cacheFirst(req, PRECACHE_NAME))
  } else if (
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.destination === 'font'
  ) {
    // 其他静态:SWR
    event.respondWith(staleWhileRevalidate(req, RUNTIME_NAME))
  }
  // 不 respondWith 就走默认 network
})

// =====================================================
// 7. 过期清理(LRU + maxAge)
// =====================================================

interface CacheMeta { url: string; time: number }

async function cacheFirstWithExpiration(
  request: Request,
  cacheName: string,
  maxEntries: number,
  maxAgeDays: number,
): Promise<Response> {
  const cache = await caches.open(cacheName)
  const metaCache = await caches.open(cacheName + '-meta')

  const cached = await cache.match(request)
  if (cached) {
    const metaRes = await metaCache.match(request.url)
    if (metaRes) {
      const meta = (await metaRes.json()) as CacheMeta
      const age = (Date.now() - meta.time) / 1000 / 60 / 60 / 24
      if (age < maxAgeDays) return cached
    } else {
      return cached
    }
  }

  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    await metaCache.put(
      request.url,
      new Response(JSON.stringify({ url: request.url, time: Date.now() })),
    )
    await trimCache(cacheName, maxEntries)
  }
  return response
}

async function trimCache(cacheName: string, maxEntries: number) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)))
}

// =====================================================
// 8. POST / 突变请求 - Background Sync
// =====================================================
//
// 不能直接缓存 POST。失败时存 IndexedDB + sync 事件重试。
//
// import { openDB } from 'idb'
//
// const dbPromise = openDB('outbox', 1, {
//   upgrade(db) { db.createObjectStore('requests', { keyPath: 'id' }) }
// })
//
// self.addEventListener('fetch', (event) => {
//   if (event.request.method === 'POST' && url.pathname.startsWith('/api/posts')) {
//     event.respondWith(handleMutation(event.request))
//   }
// })
//
// async function handleMutation(req) {
//   try {
//     return await fetch(req)
//   } catch {
//     // 离线 → 排队
//     const body = await req.clone().text()
//     const db = await dbPromise
//     await db.put('requests', { id: Date.now(), url: req.url, body, headers: [...req.headers] })
//     await self.registration.sync.register('outbox-replay')
//     return new Response(JSON.stringify({ queued: true }), {
//       status: 202,
//       headers: { 'Content-Type': 'application/json' },
//     })
//   }
// }
//
// self.addEventListener('sync', (event) => {
//   if (event.tag === 'outbox-replay') {
//     event.waitUntil(replayOutbox())
//   }
// })

// =====================================================
// 9. Range 请求(视频 / 大文件)
// =====================================================
//
// 视频 <video> 会发 Range: bytes=0-1024 请求,部分缓存难处理
// → 一般跳过 SW(不 respondWith 即可),让浏览器直接处理
//
// 真要缓存:
// - 完整下载存 cache
// - 拦截 Range 时手动 slice
// - 用 Workbox RangeRequestsPlugin

// =====================================================
// 10. 注意事项 / 安全
// =====================================================
//
// 1. 永远 .clone() Response 再 put cache(Response body 是 stream,只能读一次)
// 2. 不要 cache 带 Authorization / Cookie 的私密 response
//    → 检查 Cache-Control: private,private 不缓存
// 3. opaque response(no-cors)cache.put 会失败,要忽略
//    if (response.type === 'opaque') return
// 4. cache 是按 URL 索引,带 query 不同 = 不同 entry
//    → 商用 SW 时考虑 ignoreSearch / 忽略某些参数
// 5. CacheStorage 总大小受配额限制,过 N MB 浏览器会 evict 整个 origin

export {}
