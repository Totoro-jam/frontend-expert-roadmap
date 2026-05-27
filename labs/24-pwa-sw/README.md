# 24 · PWA & Service Worker Lab

> Service Worker 是浏览器里的「后台进程」 —— 装错了用户清缓存都救不了。
> 装对了,网站离线能用、安装到桌面、推送通知、后台同步。
> 这里把 SW 生命周期、缓存策略、Workbox、Web Push、Background Sync、Manifest 全过一遍。

---

## 学这个能干什么

- 设计离线优先的应用,无网络也能用核心功能
- 用 Workbox 5 分钟搭好工程级 SW
- 写出可控的「版本切换 / 强制更新 / 紧急下线」机制
- 不让 SW 卡死老用户(updateViaCache 等坑)
- 实现 Web Push 通知(VAPID / push service / 后端配合)
- 加 manifest + install prompt 让用户「装到桌面」
- 处理 iOS Safari 的 PWA 限制(无 push 直到 16.4 / 装到桌面后限制)
- 用 Background Sync / Periodic Sync 做数据同步

---

## Roadmap

### 1. PWA 三大件 + 浏览器红线

```
PWA = HTTPS + Manifest + Service Worker

[ ] HTTPS(localhost 可以,其他必须)
[ ] manifest.webmanifest 完整(name / icons / start_url / display / theme_color)
[ ] sw.js 注册在 scope 范围,根目录最稳
[ ] 192x192 + 512x512 PNG icons,可选 maskable
[ ] start_url 在 manifest 和 SW scope 内
```

iOS 限制:
- 必须用户手动「Add to Home Screen」(无 install prompt)
- iOS 16.4+ 才支持 Web Push(且要装到桌面后)
- 100MB cache 限制
- 后台 SW 经常被 kill

### 2. Service Worker 生命周期

```
download → install → waiting → activate → running → redundant

install
  - 装载新 SW
  - 通常在这里 pre-cache 静态资源
  - 不会立即生效(等老 SW 释放)

waiting
  - 老 SW 还在控制页面
  - 新 SW 等所有老页面关闭(或 skipWaiting)

activate
  - 新 SW 接管
  - 通常在这里清旧 cache
  - 不会自动接管当前页面(等 client claim)

skipWaiting()    强制跳过 waiting,立即激活
clients.claim()  立即控制所有已打开的页面
```

详见 [src/sw-lifecycle.ts](src/sw-lifecycle.ts)。

### 3. 缓存策略 5 种

| 策略 | 适合 | 例子 |
|---|---|---|
| **Cache First** | 静态资源(js/css/img with hash) | precache |
| **Network First** | 实时数据(API)+ 离线兜底 | 新闻 |
| **Stale While Revalidate** | 不严格实时(头像) | 用户资料 |
| **Network Only** | 必须新鲜(支付) | order create |
| **Cache Only** | 离线 fallback | offline.html |

详见 [src/cache-strategies.ts](src/cache-strategies.ts)。

### 4. Workbox(Google 出的,业界标配)

```js
// sw.js
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

precacheAndRoute(self.__WB_MANIFEST)        // 构建时注入

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
)
```

详见 [src/workbox-config.js](src/workbox-config.js)。

### 5. Manifest 完整字段

```json
{
  "name": "My App",
  "short_name": "App",
  "description": "what it does",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#2563eb",
  "background_color": "#ffffff",
  "lang": "en-US",
  "dir": "ltr",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-mask-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "screenshots": [
    { "src": "/ss1.png", "sizes": "1080x1920", "type": "image/png", "form_factor": "narrow" },
    { "src": "/ss2.png", "sizes": "1920x1080", "type": "image/png", "form_factor": "wide" }
  ],
  "shortcuts": [
    { "name": "New Post", "url": "/new", "icons": [{ "src": "/icon-new.png", "sizes": "192x192" }] }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": { "title": "title", "text": "text", "url": "url", "files": [{ "name": "file", "accept": ["image/*"] }] }
  },
  "categories": ["productivity"],
  "id": "/?source=pwa"
}
```

[public/manifest.webmanifest](public/manifest.webmanifest) 含全字段实例。

### 6. Install Prompt(beforeinstallprompt)

Chrome / Edge 才有(Firefox / Safari 无):

```ts
let deferredPrompt: BeforeInstallPromptEvent | null = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()                                      // 阻止自动弹
  deferredPrompt = e as BeforeInstallPromptEvent
  showInstallButton()
})

installBtn.onclick = async () => {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  console.log(outcome)                                    // 'accepted' / 'dismissed'
  deferredPrompt = null
}

window.addEventListener('appinstalled', () => {
  analytics.track('pwa_installed')
})
```

详见 [src/install-prompt.ts](src/install-prompt.ts)。

### 7. 显示模式 / standalone 检测

```ts
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as any).standalone)

// iOS Safari standalone:navigator.standalone === true
// 其他浏览器(Chrome 等):matchMedia('(display-mode: standalone)')
```

CSS:
```css
@media (display-mode: standalone) {
  .browser-only { display: none; }
}
```

### 8. Web Push(完整链路)

```
浏览器 → 用户允许 → 拿到 subscription endpoint
       ↓
       endpoint + keys 发到自己后端存
       ↓
       后端用 VAPID 密钥 + endpoint 给 push service 发请求
       ↓
       浏览器接收 push 事件,SW 显示 notification
```

详见 [src/push-notifications.ts](src/push-notifications.ts)。

VAPID 生成:`npx web-push generate-vapid-keys`

### 9. Background Sync

网络断了点提交 → 等有网了自动重试:

```ts
// 页面侧
const sw = await navigator.serviceWorker.ready
await sw.sync.register('upload-form')

// sw.js
self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-form') {
    event.waitUntil(uploadPendingForms())
  }
})
```

兼容:Chrome / Edge,Firefox / Safari 无 → 仅作 enhancement,降级用普通重试。

### 10. Periodic Background Sync(后台周期任务)

```ts
const status = await navigator.permissions.query({ name: 'periodic-background-sync' as any })
if (status.state === 'granted') {
  await sw.periodicSync.register('news-fetch', {
    minInterval: 24 * 60 * 60 * 1000,                   // 1 天
  })
}
```

仅 Chrome,且需要 PWA 已装 + 用户使用频繁(浏览器决定是否触发)。

### 11. Cache API 用法

```ts
const cache = await caches.open('v1-assets')
await cache.addAll(['/', '/app.js', '/style.css'])

const res = await cache.match('/app.js')                // 取
await cache.put('/api/me', new Response(JSON.stringify(data)))   // 存
await cache.delete('/old')

const keys = await caches.keys()                        // 所有 cache name
for (const key of keys) {
  if (key !== 'v1-assets') await caches.delete(key)     // 清旧版本
}
```

详见 [src/cache-strategies.ts](src/cache-strategies.ts)。

### 12. IndexedDB(SW 里存复杂数据)

SW 不能用 localStorage / sessionStorage(同步 API)→ 只能 IndexedDB。

简化:用 `idb-keyval`(2KB,Promise API):
```ts
import { set, get, del } from 'idb-keyval'
await set('user', { id: 1, name: 'A' })
const user = await get('user')
```

复杂用 `idb`(Workbox 内部用的):
```ts
import { openDB } from 'idb'
const db = await openDB('app', 1, {
  upgrade(db) {
    db.createObjectStore('posts', { keyPath: 'id' })
  },
})
await db.put('posts', { id: '1', title: 'hello' })
```

### 13. 关键安全点

```
[ ] SW scope ≤ 注册页面 path(不能注册 /foo/sw.js 控制 /)
[ ] sw.js 必须从同源加载
[ ] sw.js 不能放 CDN 跨域(浏览器拒绝)
[ ] HTTP 头部 Service-Worker-Allowed 可放大 scope
[ ] sw.js 本身不要被 cache 太久(updateViaCache: 'none')
[ ] importScripts() 在 SW 顶层,加载第三方 script 要 SRI
[ ] SW 内 fetch 默认无 cookie?(no!和页面共享 origin cookie)
```

### 14. 紧急下线(Kill Switch)

最坏情况:SW 卡死 / 缓存了错误版本 / 公司收到投诉。

```js
// /sw.js 内容覆盖为「自杀脚本」
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
    const clients = await self.clients.matchAll()
    clients.forEach(c => c.postMessage({ type: 'RELOAD' }))
    await self.registration.unregister()
  })())
})
```

页面侧:
```ts
navigator.serviceWorker.addEventListener('message', (e) => {
  if (e.data.type === 'RELOAD') location.reload()
})
```

详见 [src/kill-switch.ts](src/kill-switch.ts)。

### 15. 版本更新策略

| 策略 | 用户体验 | 适合 |
|---|---|---|
| **下次启动生效**(默认) | 用户重启 app 才有新版 | 大部分 |
| **skipWaiting + claim** | 立刻生效(可能页面状态丢) | 紧急修复 |
| **提示用户更新**(推荐) | 弹个 toast「点这里加载新版」 | 主流 |
| **倒计时强制**(慎用) | N 天后强制刷新 | 安全相关 |

提示用户的实现:
```ts
const reg = await navigator.serviceWorker.register('/sw.js')

reg.addEventListener('updatefound', () => {
  const newSW = reg.installing
  if (!newSW) return
  newSW.addEventListener('statechange', () => {
    if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
      // 有新版,且已经有老 SW 控制 → 提示更新
      showUpdateToast(() => {
        newSW.postMessage({ type: 'SKIP_WAITING' })
      })
    }
  })
})

// sw.js
self.addEventListener('message', (e) => {
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting()
})

// controllerchange 时重载
let refreshing = false
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return
  refreshing = true
  location.reload()
})
```

### 16. 框架集成

**Vite**:
```bash
npm i -D vite-plugin-pwa
```
```ts
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'
export default { plugins: [
  VitePWA({
    registerType: 'autoUpdate',
    manifest: { name: 'App', icons: [...] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
  })
]}
```

**Next.js**:
```bash
npm i next-pwa     # 旧,但稳
# 或 @ducanh2912/next-pwa(maintained 分支)
```
```ts
// next.config.mjs
import withPWA from 'next-pwa'
export default withPWA({ dest: 'public' })({ /* next config */ })
```

**Create React App**:CRA 已不推荐,迁移到 Vite。

### 17. iOS 特殊处理

```
- 无 beforeinstallprompt → 提示用户「点分享 → 添加到主屏幕」
- splash screen 必须 apple-touch-startup-image meta 标签
- icon 要 apple-touch-icon
- viewport-fit=cover + safe-area-inset-* 处理刘海
- 100MB 缓存上限 → 不要 precache 大文件
- Web Push 仅 16.4+ 且必须 install 到桌面
- WebSocket 在 background 会被 close
- BackgroundSync / PeriodicSync 不支持
```

HTML head 兜底:
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="App">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="apple-touch-startup-image" href="/splash.png">
```

### 18. 调试

```
Chrome DevTools → Application →
  - Manifest:校验 / installability
  - Service Workers:状态 / unregister / 强制更新
  - Cache Storage:看 cache 内容
  - IndexedDB:看数据
  - Storage:配额 / 清空
  - 模拟 offline / push event

chrome://serviceworker-internals/
chrome://inspect/#service-workers
```

PWA Lighthouse 跑:`chrome lighthouse --view --preset=desktop https://your-site`

### 19. 性能 / 配额

```ts
const { usage, quota } = await navigator.storage.estimate()
console.log(`Using ${usage}/${quota}`)

await navigator.storage.persist()                       // 申请持久存储
const persisted = await navigator.storage.persisted()
```

配额:
- 大部分浏览器:60% 可用磁盘
- iOS:50MB(7 天不用清掉)/ 持久存储更宽

### 20. PWA 不适合的场景

- 高频低延迟交互(游戏 / 视频通话)→ 用 native
- 需要复杂硬件 API(蓝牙 / NFC / 传感器,虽然部分 web 有)
- App Store / Play Store 主要分发(可 TWA 包装)
- iOS 重度依赖功能(push 早期 / 后台任务)

### 21. PWA vs 原生 vs Hybrid

| | PWA | React Native | Capacitor / Cordova | Native |
|---|---|---|---|---|
| 分发 | URL / Store(TWA) | App Store | Both | App Store |
| 离线 | ✅ | ✅ | ✅ | ✅ |
| 推送(iOS) | 16.4+ 限 | ✅ | ✅ | ✅ |
| 硬件 API | 部分 | 大部分 | 全 | 全 |
| 性能 | 中 | 高 | 中 | 最高 |
| 维护 | 1 套 | 1 套 | 1 套 + 2 配置 | 2-3 套 |
| 更新 | 即时 | 部分需 store | 部分需 store | 全需 store |

### 22. 上线 checklist

```
[ ] manifest 在 Lighthouse PWA 全绿
[ ] icons 包含 maskable + 192/512
[ ] start_url 有 source=pwa 跟踪
[ ] SW updateViaCache: 'none'
[ ] sw.js 不带 hash
[ ] 缓存有版本号(v1-assets / v2-assets),activate 清旧
[ ] precache list 不超 5MB(iOS 限制)
[ ] kill switch 准备好(出事 30 分钟内能下线 SW)
[ ] 更新提示 UI(不是悄悄换)
[ ] 离线 fallback 页面
[ ] navigator.onLine 监听网络状态
[ ] CSP 允许 push 用的 origin
[ ] Web Push 后端 worker + VAPID 已生效
[ ] iOS 兼容头都加了
[ ] 监控 SW error / push delivery 率
```

---

## src/ 索引

| 文件 | 主题 |
|---|---|
| [src/sw-lifecycle.ts](src/sw-lifecycle.ts) | SW 注册 + 更新检测 + skipWaiting 流程 |
| [src/cache-strategies.ts](src/cache-strategies.ts) | 5 种缓存策略手写实现 |
| [src/workbox-config.js](src/workbox-config.js) | Workbox 完整配置(生产可用) |
| [src/install-prompt.ts](src/install-prompt.ts) | Install 提示 + iOS 兜底 + 检测 standalone |
| [src/push-notifications.ts](src/push-notifications.ts) | Web Push 全流程(client + SW + server) |
| [src/kill-switch.ts](src/kill-switch.ts) | 紧急下线 SW |
| [public/manifest.webmanifest](public/manifest.webmanifest) | 完整 manifest 示例 |
| [examples/offline-strategy.md](examples/offline-strategy.md) | 离线优先架构决策 |
| [examples/pwa-checklist.md](examples/pwa-checklist.md) | PWA 上线 checklist |

---

## 资源

- [web.dev/learn/pwa](https://web.dev/learn/pwa/)
- [Workbox docs](https://developer.chrome.com/docs/workbox)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [PWA Builder](https://www.pwabuilder.com/)(微软出的,生成 icon + 各平台 wrapper)
- [Maskable.app](https://maskable.app/)(测 maskable icon)
- [VAPID generator](https://vapidkeys.com/)
- [WhatPWACanDo Today](https://whatpwacando.today/)
