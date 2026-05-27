// Kill Switch:紧急下线 Service Worker
//
// 用途:线上 SW 缓存错误版本 / 死循环 / 安全事件
// 目标:让所有用户的下次访问都自动「清空 + 卸载 + reload」
//
// 实现:把 sw.js 内容替换为「自毁脚本」
// 然后强制 CDN 刷新 sw.js + 等 24h(或主动 update)

// =====================================================
// 1. 自毁 sw.js(直接替换部署)
// =====================================================
//
// 把整个 sw.js 文件覆盖为下面内容,然后部署 + 清 CDN:

/* ---------------- sw.js (kill) ---------------- */
/*
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. 清所有 cache
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map(k => caches.delete(k)))

    // 2. 通知所有页面 reload(让用户看到「干净」版本)
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    allClients.forEach((client) => {
      client.postMessage({ type: 'SW_KILLED' })
    })

    // 3. 注销自己(下次访问就不再有 SW)
    await self.registration.unregister()
  })())
})

self.addEventListener('fetch', () => {
  // 直接走网络,不拦截
})
*/

// =====================================================
// 2. 页面侧:接收 kill 消息后重载
// =====================================================
//
// 必须把这段代码放进每个页面(或主 entry),否则 SW 自杀后页面不会主动 reload
//
// 这段代码即使在「死掉的 SW」控制的页面里也能跑(浏览器仍然送 message)

export function listenForSwKill() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_KILLED') {
      // 给用户一个明确的提示再 reload(避免无限刷新感)
      console.log('[PWA] Service worker has been reset. Reloading...')
      window.location.reload()
    }
  })
}

// =====================================================
// 3. 主动清空(用户在设置页点「重置」)
// =====================================================
//
// 不通过部署:让用户点一下立即清

export async function resetAllPwaState(): Promise<void> {
  // 1. 注销所有 SW
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map(r => r.unregister()))
  }

  // 2. 清 Cache Storage
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
  }

  // 3. 清 IndexedDB(只清自己的 DB,不要清全部,容易误伤)
  try {
    const dbs = await (indexedDB as any).databases?.() ?? []
    await Promise.all(
      dbs
        .filter((d: any) => d.name && !d.name.startsWith('_'))
        .map((d: any) => deleteDb(d.name)),
    )
  } catch {
    // 不支持 indexedDB.databases() 的浏览器 → 跳过
  }

  // 4. 清 localStorage / sessionStorage(可选,有用户数据请谨慎)
  // localStorage.clear()
  // sessionStorage.clear()

  // 5. reload
  window.location.reload()
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

// =====================================================
// 4. 远程开关(后端控制是否启用 SW)
// =====================================================
//
// 给 SW 加一个「远程死亡开关」,无需重新部署就能下线:
//
// sw.js 顶部:
//
// const KILL_SWITCH_URL = '/sw-kill-switch.json'   // 后端可以即时改这个文件
// const KILL_CHECK_INTERVAL = 60 * 60 * 1000        // 1 小时
//
// async function checkKillSwitch() {
//   try {
//     const res = await fetch(KILL_SWITCH_URL, { cache: 'no-cache' })
//     if (!res.ok) return
//     const { killed } = await res.json()
//     if (killed) {
//       const cacheKeys = await caches.keys()
//       await Promise.all(cacheKeys.map(k => caches.delete(k)))
//       const clients = await self.clients.matchAll()
//       clients.forEach(c => c.postMessage({ type: 'SW_KILLED' }))
//       await self.registration.unregister()
//     }
//   } catch {}
// }
//
// self.addEventListener('install', () => checkKillSwitch())
// self.addEventListener('activate', () => checkKillSwitch())
// // 定期检查(用 alarm-like 模式,但 SW 不会一直跑)
// // 实际上每次 fetch 也可以触发,加个 throttle:
//
// let lastCheck = 0
// self.addEventListener('fetch', (e) => {
//   if (Date.now() - lastCheck > KILL_CHECK_INTERVAL) {
//     lastCheck = Date.now()
//     checkKillSwitch()
//   }
// })

// =====================================================
// 5. 错误监控触发(SW 自己监测异常 → 自杀)
// =====================================================
//
// sw.js 顶部:
//
// let errorCount = 0
// self.addEventListener('error', (e) => {
//   errorCount++
//   if (errorCount > 5) {
//     // 自残:大量错误,主动 unregister
//     self.registration.unregister()
//   }
// })

// =====================================================
// 6. 用户教学(出事时给客服的话术)
// =====================================================
//
// 用户报「打不开 / 看到老版本」:
//
// 客服回:
//   1. 在地址栏访问  https://your-site/reset
//   2. 看到「重置完成」字样
//   3. 关掉浏览器,重开
//
// 后端实现 /reset 路由,返回一个 HTML:

export const RESET_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Reset PWA</title>
<style>
  body { font-family: system-ui; padding: 2rem; max-width: 500px; margin: 2rem auto; }
  button { padding: 1rem 2rem; font-size: 1rem; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  .status { margin-top: 1rem; padding: 1rem; background: #f0f0f0; border-radius: 4px; }
</style>
</head>
<body>
<h1>Reset PWA state</h1>
<p>Click below to clear all caches and service workers for this site.</p>
<button id="reset">Reset</button>
<div class="status" id="status" hidden></div>
<script>
const btn = document.getElementById('reset')
const status = document.getElementById('status')

btn.addEventListener('click', async () => {
  btn.disabled = true
  status.hidden = false
  status.textContent = 'Clearing caches...'

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) await r.unregister()
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    status.textContent = 'Done. Close and reopen your browser, then visit the site again.'
  } catch (err) {
    status.textContent = 'Error: ' + err.message
  }
})
</script>
</body>
</html>`

// =====================================================
// 7. 检查清单(kill switch 上线前)
// =====================================================
//
// [ ] sw.js 已替换为 kill 内容(本地验证 install/activate 都执行)
// [ ] CDN sw.js 已 purge(确认返回 no-cache)
// [ ] /reset 页面已发布
// [ ] 监控 SW 注册数减少(应该 1-2 天内归零)
// [ ] 通过 Sentry 看错误率回落
// [ ] 写 postmortem
//
// 长期:
// [ ] 加远程开关到所有未来的 sw.js
// [ ] 关键路径加 Sentry boundary,errors 触发 unregister
// [ ] 浏览器 console 有「reset PWA」按钮(只 dev / staging)
