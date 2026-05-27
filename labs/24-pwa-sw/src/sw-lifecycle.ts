// Service Worker 注册 + 生命周期 + 更新流程
// 这是 PWA 最常出错的地方:用户卡老版本 / 更新不生效 / 闪屏

// =====================================================
// 1. 注册(主页面侧)
// =====================================================

export interface RegisterOptions {
  scope?: string
  /** 提示用户「新版本可用」的回调 */
  onNeedRefresh?: (acceptUpdate: () => void) => void
  /** SW 已安装且首次激活 */
  onOfflineReady?: () => void
  /** 注册失败 */
  onError?: (err: Error) => void
}

export async function registerServiceWorker(url = '/sw.js', opts: RegisterOptions = {}) {
  if (typeof window === 'undefined') return                       // SSR safe
  if (!('serviceWorker' in navigator)) return

  try {
    const reg = await navigator.serviceWorker.register(url, {
      scope: opts.scope ?? '/',
      // ⚠️ 关键:防止 sw.js 被 HTTP 缓存导致更新不生效
      updateViaCache: 'none',
    })

    // 已有 SW 控制 + 没在等新版 = 首次启用,离线就绪
    if (reg.active && !navigator.serviceWorker.controller) {
      opts.onOfflineReady?.()
    }

    // 监听新版本下载
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing
      if (!newSW) return

      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // 已经有老 SW 在控制 → 新版等待激活 → 提示用户
            opts.onNeedRefresh?.(() => {
              newSW.postMessage({ type: 'SKIP_WAITING' })
            })
          } else {
            // 首次安装,无老版本
            opts.onOfflineReady?.()
          }
        }
      })
    })

    // controllerchange = 新 SW 接管 → 重载页面
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    // 定期主动检测新版(visibilitychange + 24h interval)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
    setInterval(() => reg.update().catch(() => {}), 24 * 60 * 60 * 1000)

    return reg
  } catch (err) {
    opts.onError?.(err as Error)
    throw err
  }
}

// =====================================================
// 2. SW 内 message handler(配合 skipWaiting)
// =====================================================
//
// sw.js 顶部:
//
//   self.addEventListener('message', (e) => {
//     if (e.data?.type === 'SKIP_WAITING') {
//       self.skipWaiting()
//     }
//   })

// =====================================================
// 3. 完整生命周期事件(SW 内,仅注释参考)
// =====================================================
//
// self.addEventListener('install', (event) => {
//   // 阶段:刚下载,正在装载
//   // 操作:precache 静态资源
//   event.waitUntil(
//     caches.open('v1-precache').then(c => c.addAll(PRECACHE_URLS))
//   )
//   // 不调 skipWaiting() → 默认等所有旧页面关闭
// })
//
// self.addEventListener('activate', (event) => {
//   // 阶段:已激活,正在替换老 SW
//   // 操作:清旧 cache,数据迁移
//   event.waitUntil((async () => {
//     const keys = await caches.keys()
//     await Promise.all(
//       keys.filter(k => k !== 'v1-precache' && k !== 'v1-runtime')
//           .map(k => caches.delete(k))
//     )
//     await self.clients.claim()        // 立即控制现有页面(可选)
//   })())
// })
//
// self.addEventListener('fetch', (event) => {
//   // 拦截所有 fetch(包括 navigation / images / xhr / fetch())
//   event.respondWith(handleRequest(event.request))
// })
//
// self.addEventListener('message', (event) => {
//   // 来自页面的消息
// })
//
// self.addEventListener('push', (event) => {
//   // 推送(详见 push-notifications.ts)
// })
//
// self.addEventListener('notificationclick', (event) => {
//   event.notification.close()
//   event.waitUntil(clients.openWindow('/notif-target'))
// })
//
// self.addEventListener('sync', (event) => {
//   // BackgroundSync
//   if (event.tag === 'my-tag') event.waitUntil(retry())
// })
//
// self.addEventListener('periodicsync', (event) => {
//   if (event.tag === 'news-fetch') event.waitUntil(fetchNews())
// })

// =====================================================
// 4. React Hook 包装
// =====================================================
//
// import { useEffect, useState } from 'react'
//
// export function useServiceWorker(url = '/sw.js') {
//   const [needRefresh, setNeedRefresh] = useState(false)
//   const [offlineReady, setOfflineReady] = useState(false)
//   const [acceptUpdate, setAcceptUpdate] = useState<() => void>(() => () => {})
//
//   useEffect(() => {
//     registerServiceWorker(url, {
//       onNeedRefresh: (accept) => {
//         setAcceptUpdate(() => accept)
//         setNeedRefresh(true)
//       },
//       onOfflineReady: () => setOfflineReady(true),
//     })
//   }, [url])
//
//   return { needRefresh, offlineReady, update: acceptUpdate }
// }

// =====================================================
// 5. 检测 SW 状态 / 调试
// =====================================================

export async function getSwStatus() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  return {
    scope: reg.scope,
    installing: reg.installing?.state ?? null,                    // installing / installed
    waiting: reg.waiting?.state ?? null,                          // installed
    active: reg.active?.state ?? null,                            // activated
    updateViaCache: reg.updateViaCache,
    hasController: !!navigator.serviceWorker.controller,
  }
}

// =====================================================
// 6. 解除注册(切环境 / 退出 PWA 模式)
// =====================================================

export async function unregisterAll(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map(r => r.unregister()))
  const keys = await caches.keys()
  await Promise.all(keys.map(k => caches.delete(k)))
}

// =====================================================
// 7. 常见生命周期坑
// =====================================================
//
// 1. updateViaCache: 'imports' (默认) 让 sw.js 也走 24h HTTP cache → 更新不生效
//    → 必须 updateViaCache: 'none'(或 server 给 sw.js 设 Cache-Control: no-cache)
//
// 2. 老 SW 一直 control 页面,新 SW 永远 waiting
//    → 用户必须关掉所有 tab 才生效
//    → 解决:onNeedRefresh 提示 + postMessage SKIP_WAITING + controllerchange 重载
//
// 3. skipWaiting + clients.claim 立即换版 → 页面正在用旧 API contract 突然换 → 崩
//    → 谨慎,通常只在「无破坏性」更新用
//
// 4. SW scope 默认 = sw.js 所在路径
//    /assets/sw.js 只能控制 /assets/* 路径
//    → 把 sw.js 放根目录
//    → 或加响应头 Service-Worker-Allowed: /
//
// 5. SW 在 HTTPS 才生效(localhost 例外)
//    → 本地 dev 用 vite + http://localhost 没问题
//    → 线上必须 HTTPS
//
// 6. iframe 内的页面会被父页面的 SW 控制吗?
//    取决于 iframe 是否同源 + scope 是否覆盖
//
// 7. 跨域 sw.js 直接被浏览器拒绝(连 import 都拒)
//    → 第三方 SW(分析 / 客服)不可行,必须自己 host

// =====================================================
// 8. PWA 安装 / standalone 检测
// =====================================================

export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false
  // Chrome / Edge / Android
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  // iOS Safari
  if ('standalone' in window.navigator && (window.navigator as any).standalone) return true
  return false
}

export {}
