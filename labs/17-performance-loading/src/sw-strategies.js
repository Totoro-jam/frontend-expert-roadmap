// Service Worker 5 种核心缓存策略
// 真实项目用 Workbox(Google 官方,内置全部 5 种)
// 这里手写让你看清原理

const CACHE_NAME = 'app-v3'        // bump version 触发更新
const RUNTIME = 'runtime'

// ====================================================
// install / activate:版本管理
// ====================================================
self.addEventListener('install', (event) => {
  // 预缓存(Precache):shell 资源一次性下完
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/',
        '/index.html',
        '/main.css',
        '/main.js',
        '/offline.html',           // 离线兜底页
        '/icons/192.png',
      ]),
    ),
  )
  // self.skipWaiting()           // 立刻替换旧 SW(谨慎,可能版本不一致)
})

self.addEventListener('activate', (event) => {
  // 清理老缓存
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME)
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  // self.clients.claim()         // 接管未刷新的 tab
})

// ====================================================
// 策略 1:Cache First(静态资源 / 字体 / 图片)
// → 缓存命中立刻返回,没缓存再请求
// → 配合文件名 hash,版本变了就请求新 URL
// ====================================================
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(RUNTIME)
    cache.put(request, response.clone())
  }
  return response
}

// ====================================================
// 策略 2:Network First(API / HTML)
// → 网络优先,失败时用缓存兜底
// → 适合内容时常更新但要离线可用
// ====================================================
async function networkFirst(request, timeout = 3000) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
    ])
    if (response.ok) {
      const cache = await caches.open(RUNTIME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // 最终兜底:离线页
    return caches.match('/offline.html')
  }
}

// ====================================================
// 策略 3:Stale While Revalidate(CSS / 头像 / 列表)
// → 立刻返回缓存(快),同时背景更新(下次新鲜)
// → 用户友好但有 1 次过时
// ====================================================
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME)
  const cached = await cache.match(request)
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone())
    return response
  })
  return cached || networkPromise
}

// ====================================================
// 策略 4:Network Only(支付 / POST / 鉴权)
// → 永不缓存,无网就 fail
// ====================================================
async function networkOnly(request) {
  return fetch(request)
}

// ====================================================
// 策略 5:Cache Only(预缓存的 shell)
// → 仅查缓存,不命中也不请求
// ====================================================
async function cacheOnly(request) {
  return caches.match(request)
}

// ====================================================
// fetch 路由
// ====================================================
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 只处理 GET
  if (request.method !== 'GET') return

  // 跨域 API 不处理(让浏览器自然请求)
  if (url.origin !== location.origin && !url.host.endsWith('mycdn.com')) return

  // HTML 导航:network first(保证最新)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  // API:network first(短超时)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, 2000))
    return
  }

  // 字体 / 字体文件:cache first(几乎不会变)
  if (request.destination === 'font' || /\.(woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 图片:stale-while-revalidate(快但允许旧)
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // JS / CSS 带 hash:cache first(版本变了 URL 也变)
  if (/\.[a-f0-9]{8}\.(js|css)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 其他:network first
  event.respondWith(networkFirst(request))
})

// ====================================================
// 后台同步(Background Sync):离线时排队,联网时发送
// 适合:发评论 / 点赞 / 上传 / 表单
// ====================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'send-queued-messages') {
    event.waitUntil(sendQueuedMessages())
  }
})

async function sendQueuedMessages() {
  // 从 IndexedDB 取出离线时存的消息,逐个 POST
  // ...
}

// 页面端注册:
// const reg = await navigator.serviceWorker.ready
// await reg.sync.register('send-queued-messages')

// ====================================================
// Push 通知
// ====================================================
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || '新消息', {
      body: data.body,
      icon: '/icons/192.png',
      badge: '/icons/badge.png',
      tag: data.tag,              // 同 tag 替换旧通知
      data: { url: data.url },
      actions: [
        { action: 'open', title: '打开' },
        { action: 'dismiss', title: '忽略' },
      ],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data?.url || '/'
      // 已有窗口则聚焦,否则打开
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    }),
  )
})

// ====================================================
// 注册:页面端
// ====================================================
/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',     // SW 文件本身不缓存(必须!)
      })

      // 监听更新
      reg.addEventListener('updatefound', () => {
        const newSw = reg.installing
        newSw?.addEventListener('statechange', () => {
          if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
            // 提示用户「有新版本,点这里更新」
            showUpdateBanner(() => {
              newSw.postMessage({ type: 'SKIP_WAITING' })
              window.location.reload()
            })
          }
        })
      })

      // 每小时检查一次更新
      setInterval(() => reg.update(), 60 * 60 * 1000)
    } catch (e) {
      console.error('[SW] register failed', e)
    }
  })
}

// SW 收到 SKIP_WAITING 消息
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
*/

// ====================================================
// Workbox 等价写法(推荐生产用)
// ====================================================
/*
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

precacheAndRoute(self.__WB_MANIFEST)            // Workbox 注入构建产物清单

registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  }),
)
*/

// ====================================================
// 注意事项
// ====================================================
//
// 1. SW 只在 HTTPS 工作(localhost 例外)
// 2. SW 文件本身的更新:浏览器每 24h 检查一次(可手动 reg.update())
// 3. 调试:DevTools → Application → Service Workers → Update on reload
// 4. 跨域资源 cache.put 要求 response.type !== 'opaque',或者用 { mode: 'no-cors' } 时只能 cache.add
// 5. 版本切换:旧 SW 控制的页面不会变,直到所有 tab 关闭或 skipWaiting+claim
// 6. 错误的策略 = 用户看到旧数据 / 离线打不开 / 钱付重了
//    → 写完用「断网 / 慢网 / 部分缓存」分别测一遍
