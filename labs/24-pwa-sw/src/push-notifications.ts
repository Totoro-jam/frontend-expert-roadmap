// Web Push 全流程(client + SW + server)
// 浏览器:Chrome / Firefox / Edge / Safari 16.4+(安装到桌面后)

// =====================================================
// 1. 整体架构
// =====================================================
//
// 浏览器                     你的后端                    Push Service
//                                                       (FCM/Mozilla/Apple)
// 1. requestPermission()
// 2. subscribe(VAPID public)
// 3. 拿到 PushSubscription
//                      ────→ POST /subscribe
//                            存 endpoint + keys
//
// 业务触发:                4. 用 web-push 库:
//                            { endpoint, keys, payload }
//                            用 VAPID private 签名
//                            POST endpoint
//                                                  ────→ deliver
// 5. 浏览器收 push 事件
//    SW 显示 notification
//
// 6. 用户点 notification
//    SW notificationclick

// =====================================================
// 2. 申请权限(client)
// =====================================================
//
// ⚠️ 不要进站就弹!用户立刻拒绝 = 永久 deny,救不回来
// 正确时机:用户「主动操作」(点关注 / 订阅 / 设置开关)

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  const result = await Notification.requestPermission()
  return result
}

// =====================================================
// 3. 订阅 push(client)
// =====================================================

export async function subscribeUserToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const reg = await navigator.serviceWorker.ready

  // 已订阅?直接返回
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,                          // 必须 true(必须显示 notification)
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
    return sub
  } catch (err) {
    console.error('Push subscribe failed', err)
    return null
  }
}

// VAPID 公钥转 Uint8Array(浏览器要求)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// =====================================================
// 4. 把 subscription 发到后端
// =====================================================

export async function sendSubscriptionToServer(sub: PushSubscription) {
  const payload = sub.toJSON()                        // { endpoint, expirationTime, keys: {p256dh, auth} }
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// =====================================================
// 5. 取消订阅
// =====================================================

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await sub.unsubscribe()
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
}

// =====================================================
// 6. 完整开通流程(给业务用)
// =====================================================

export async function enablePushNotifications(vapidPublicKey: string) {
  // 1. 权限
  const perm = await requestNotificationPermission()
  if (perm !== 'granted') {
    return { ok: false, reason: 'permission-denied' as const }
  }

  // 2. 订阅
  const sub = await subscribeUserToPush(vapidPublicKey)
  if (!sub) return { ok: false, reason: 'subscribe-failed' as const }

  // 3. 上报后端
  try {
    await sendSubscriptionToServer(sub)
    return { ok: true, subscription: sub }
  } catch (err) {
    await sub.unsubscribe()
    return { ok: false, reason: 'server-error' as const, error: err }
  }
}

// =====================================================
// 7. SW 内 push 事件 handler
// =====================================================
//
// // sw.js 内
//
// self.addEventListener('push', (event) => {
//   const data = (() => {
//     try { return event.data?.json() ?? {} }
//     catch { return { title: 'Notification', body: event.data?.text() ?? '' } }
//   })()
//
//   const title = data.title ?? 'New notification'
//   const options = {
//     body: data.body ?? '',
//     icon: data.icon ?? '/icon-192.png',
//     badge: data.badge ?? '/badge-72.png',
//     image: data.image,                            // 大图(Android)
//     tag: data.tag,                                // 同 tag 替换,不堆积
//     renotify: data.renotify,                      // 同 tag 也再次震动
//     requireInteraction: data.requireInteraction,  // 不自动消失
//     silent: data.silent,
//     vibrate: data.vibrate ?? [200, 100, 200],
//     data: { url: data.url ?? '/', ...data.data },
//     actions: data.actions,                        // [{ action, title, icon }]
//   }
//
//   event.waitUntil(self.registration.showNotification(title, options))
// })
//
// self.addEventListener('notificationclick', (event) => {
//   event.notification.close()
//
//   const action = event.action                    // 用户点了哪个 action 按钮
//   const url = event.notification.data?.url ?? '/'
//
//   event.waitUntil((async () => {
//     // 找已打开的同 origin 窗口
//     const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
//     for (const client of clients) {
//       const clientUrl = new URL(client.url)
//       if (clientUrl.origin === self.location.origin) {
//         await client.focus()
//         client.postMessage({ type: 'NOTIFICATION_CLICK', action, url })
//         return
//       }
//     }
//     await self.clients.openWindow(url)
//   })())
// })
//
// self.addEventListener('notificationclose', (event) => {
//   // 用户关掉 notification(不是点击)
//   // 可以发分析事件
// })
//
// self.addEventListener('pushsubscriptionchange', async (event) => {
//   // subscription 失效(浏览器换 endpoint)→ 重新订阅
//   event.waitUntil((async () => {
//     const oldSub = event.oldSubscription
//     const newSub = await self.registration.pushManager.subscribe({
//       userVisibleOnly: true,
//       applicationServerKey: oldSub?.options?.applicationServerKey,
//     })
//     await fetch('/api/push/resubscribe', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         oldEndpoint: oldSub?.endpoint,
//         newSubscription: newSub.toJSON(),
//       }),
//     })
//   })())
// })

// =====================================================
// 8. 后端 push 发送(Node.js 示例)
// =====================================================
//
// npm i web-push
//
// import webpush from 'web-push'
//
// webpush.setVapidDetails(
//   'mailto:you@example.com',
//   process.env.VAPID_PUBLIC!,
//   process.env.VAPID_PRIVATE!,
// )
//
// async function sendPush(subscription: PushSubscriptionJSON, payload: any) {
//   try {
//     await webpush.sendNotification(subscription as any, JSON.stringify(payload), {
//       TTL: 24 * 60 * 60,                                 // push service 保留秒数
//       urgency: 'normal',                                 // 'very-low'|'low'|'normal'|'high'
//       topic: payload.tag,                                // 同 topic 后到的会替换前面的
//     })
//   } catch (err: any) {
//     if (err.statusCode === 410 || err.statusCode === 404) {
//       // subscription expired,从 DB 删
//       await db.subscriptions.delete({ endpoint: subscription.endpoint })
//     } else {
//       throw err
//     }
//   }
// }
//
// // 批量发送
// async function broadcast(payload: any) {
//   const subs = await db.subscriptions.findAll()
//   await Promise.allSettled(subs.map(s => sendPush(s, payload)))
// }

// =====================================================
// 9. VAPID 密钥生成
// =====================================================
//
// npx web-push generate-vapid-keys
//
// 输出:
//   Public Key:  BIuTbHX2vNNXY... (87 chars, base64url)
//   Private Key: 7nL3IqsP4ZF8... (43 chars, base64url)
//
// 公钥放前端代码,私钥放后端环境变量,绝不进 git

// =====================================================
// 10. iOS 16.4+ 特殊要求
// =====================================================
//
// - 必须先「添加到主屏幕」(install to Home Screen)
// - 从 Home Screen 启动后才能请求 Notification 权限
// - 不能在 Safari 浏览器标签里申请
// - 需要在 manifest.webmanifest 中正确设置
// - 不能用 silent push
// - actions 不支持
//
// 用户路径教育:必须告诉 iOS 用户先「装」

export function isPushAvailableOnDevice(): boolean {
  if (!('serviceWorker' in navigator)) return false
  if (!('PushManager' in window)) return false
  if (!('Notification' in window)) return false

  // iOS Safari:必须 standalone
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (isIos) {
    const standalone = (navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    if (!standalone) return false
  }

  return true
}

// =====================================================
// 11. 错误状态枚举
// =====================================================

export type PushErrorCode =
  | 'unsupported'                                                  // 浏览器不支持
  | 'permission-denied'                                            // 用户拒绝
  | 'permission-default'                                           // 用户没决定
  | 'subscribe-failed'                                             // pushManager.subscribe 失败
  | 'ios-not-installed'                                            // iOS 未装到桌面
  | 'server-error'                                                 // 上报后端失败
  | 'expired'                                                      // subscription 过期

// =====================================================
// 12. 真实坑速查
// =====================================================
//
// 1. requestPermission 一定是 user gesture 触发(click handler),否则 silently reject
// 2. permission denied 后无法在站内恢复 → 教用户「浏览器设置 → 网站权限 → 改」
// 3. Chrome 自动 quiet UI:被 deny 太多次的站点 → 申请变小图标(不弹大框)
// 4. userVisibleOnly: true 是强制的 → 不可能做 silent push 给浏览器
// 5. subscription endpoint 可能变(浏览器升级 / 用户清数据)→ 必须处理 pushsubscriptionchange
// 6. payload 加密:Web Push 协议自动加密(用 keys)→ payload <= 4KB
// 7. 大量发送时考虑 push service 的 rate limit(FCM 每秒 N 条)
// 8. notification.actions 只有前 2 个会显示(剩下的丢)
// 9. 同 tag 替换:同 tag 后到的 notification 替换前一个(不堆积)
// 10. 不要发垃圾:浏览器有 abuse 检测,被举报会减少送达率
//
// 体验:
// - 给用户精细控制(频率 / 类型 / 时段)
// - 提供「测试 push」按钮(用户开通后立即收一条验证)
// - 后端记录送达 / 点击率,优化文案
