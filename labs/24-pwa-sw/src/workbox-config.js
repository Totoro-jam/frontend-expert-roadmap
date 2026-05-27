// Workbox 完整 sw.js 配置(生产可用)
// 用 InjectManifest 模式:你写 sw.js,Workbox build 时注入 precache 列表
//
// 适用:Vite (vite-plugin-pwa) / Webpack (workbox-webpack-plugin) / Next.js
//
// 包大小:核心 + 常用模块 ~25KB gzip

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
  NetworkOnly,
} from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { setCacheNameDetails, clientsClaim } from 'workbox-core'

// =====================================================
// 1. 全局配置
// =====================================================

setCacheNameDetails({
  prefix: 'myapp',
  suffix: 'v1',
  precache: 'precache',
  runtime: 'runtime',
})

// 立即接管旧客户端(只在配合 skipWaiting 使用时打开)
self.skipWaiting()
clientsClaim()

// =====================================================
// 2. Precache(由 build 注入清单)
// =====================================================
//
// self.__WB_MANIFEST 是 Workbox build 时注入的占位符
// 内容形如 [{ url: '/app.js', revision: 'abc123' }, ...]

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()                                            // 清掉旧 precache

// =====================================================
// 3. Navigation 路由(HTML 文档)
// =====================================================
//
// SPA 路由:任何 navigation 请求都返回 /index.html (NetworkFirst 兜底)

const navigationHandler = new NetworkFirst({
  cacheName: 'pages',
  networkTimeoutSeconds: 3,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 }),
  ],
})

registerRoute(
  new NavigationRoute(navigationHandler, {
    // 这些路径不走 SW(后端管理 / OAuth 回调)
    denylist: [/^\/admin/, /^\/auth\/callback/, /^\/api/],
  }),
)

// =====================================================
// 4. 静态资源:Stale While Revalidate
// =====================================================

registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),         // 0 = opaque
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
)

// =====================================================
// 5. 图片:Cache First + 7 天过期
// =====================================================

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 7 * 24 * 60 * 60,
        purgeOnQuotaError: true,                                   // 配额满时优先清这个
      }),
    ],
  }),
)

// =====================================================
// 6. 字体:Cache First(几乎不变)
// =====================================================

registerRoute(
  ({ request, url }) =>
    request.destination === 'font' || /\.(woff|woff2|ttf|otf)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
)

// 跨域字体(Google Fonts)
registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts' }),
)

// =====================================================
// 7. API:Network First + 离线 fallback
// =====================================================

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') && url.pathname !== '/api/post',
  new NetworkFirst({
    cacheName: 'api',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 }),
    ],
  }),
  'GET',
)

// =====================================================
// 8. POST + BackgroundSync(离线提交)
// =====================================================

const bgSyncPlugin = new BackgroundSyncPlugin('post-queue', {
  maxRetentionTime: 24 * 60,                                       // 24 小时
  onSync: async ({ queue }) => {
    let entry
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request.clone())
      } catch (err) {
        await queue.unshiftRequest(entry)
        throw err
      }
    }
    // 全部成功后通知页面
    const clients = await self.clients.matchAll()
    clients.forEach(c => c.postMessage({ type: 'SYNC_DONE' }))
  },
})

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly({ plugins: [bgSyncPlugin] }),
  'POST',
)

// =====================================================
// 9. 离线 fallback 页面
// =====================================================

import { setDefaultHandler, setCatchHandler } from 'workbox-routing'
import { matchPrecache } from 'workbox-precaching'

setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    return (await matchPrecache('/offline.html')) ?? Response.error()
  }
  if (request.destination === 'image') {
    return (await matchPrecache('/offline-image.svg')) ?? Response.error()
  }
  return Response.error()
})

// =====================================================
// 10. Push notifications
// =====================================================

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'Notification', body: '' }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: data.tag,
      data: { url: data.url ?? '/' },
      actions: data.actions,
      vibrate: [200, 100, 200],
      requireInteraction: data.requireInteraction ?? false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if (client.url === url && 'focus' in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})

// =====================================================
// 11. 升级提示消息
// =====================================================

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CLAIM_CLIENTS') self.clients.claim()
})

// =====================================================
// 12. vite-plugin-pwa 集成(vite.config.ts)
// =====================================================
//
// import { VitePWA } from 'vite-plugin-pwa'
//
// export default {
//   plugins: [
//     VitePWA({
//       strategies: 'injectManifest',                              // 用这个 sw.js
//       srcDir: 'src',
//       filename: 'sw.js',
//       registerType: 'prompt',                                    // 让我们手动提示
//       injectRegister: false,                                     // 我们自己 register
//       manifest: {
//         name: 'My App',
//         short_name: 'App',
//         theme_color: '#2563eb',
//         icons: [
//           { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
//           { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
//         ],
//       },
//       injectManifest: {
//         globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
//         maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,          // 5MB
//       },
//       devOptions: {
//         enabled: false,                                          // dev 模式开启 SW 容易踩坑
//         type: 'module',
//       },
//     })
//   ]
// }

// =====================================================
// 13. Workbox 调试
// =====================================================
//
// import { setConfig } from 'workbox-core'
// setConfig({ debug: true })          // 默认生产关,开发自动开
//
// 或在 sw.js 顶部:
//   self.__WB_DISABLE_DEV_LOGS = false
