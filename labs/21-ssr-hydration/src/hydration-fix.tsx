// 5 种 hydration mismatch 的根因 + 修法

import { useEffect, useState, useSyncExternalStore } from 'react'

// =====================================================
// 1. Date / Math.random:服务端 ≠ 客户端
// =====================================================

// ❌ 错
function BadTime() {
  return <span>{new Date().toLocaleTimeString()}</span>
  // SSR 渲染时间 ≠ hydrate 时间 → mismatch warning
}

// ✅ 客户端 only
function GoodTime() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    setTime(new Date().toLocaleTimeString())
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])
  // SSR 渲染 null,客户端 hydrate 后 effect 才填充
  return <span>{time ?? ' '}</span>
}

// ✅ 或:suppressHydrationWarning(只一行不同 OK)
function OkTime() {
  return (
    <time suppressHydrationWarning>
      {new Date().toLocaleTimeString()}
    </time>
  )
}

// =====================================================
// 2. window / localStorage:服务端没有
// =====================================================

// ❌ 错(SSR 直接 ReferenceError)
function BadTheme() {
  const theme = localStorage.getItem('theme') ?? 'light'
  return <div data-theme={theme}>...</div>
}

// ✅ 用 useSyncExternalStore(React 18+,SSR 友好)
function GoodTheme() {
  const theme = useSyncExternalStore(
    // subscribe(server 不调用)
    (cb) => {
      window.addEventListener('storage', cb)
      return () => window.removeEventListener('storage', cb)
    },
    // getClientSnapshot
    () => localStorage.getItem('theme') ?? 'light',
    // getServerSnapshot:必须给,SSR 用这个
    () => 'light',                                       // 服务器猜默认
  )
  return <div data-theme={theme}>...</div>
}

// ✅ 或:inline script 提前设(防 FOUC)— 见 19-design-systems-lab/theme-provider
// 服务端不渲染 data-theme,客户端 hydrate 前 inline script 已经设了 html.dataset.theme

// =====================================================
// 3. 浏览器扩展插入 DOM(Grammarly / LastPass)
// =====================================================
//
// 现象:<body class="..."> 多出来 data-grammarly="false" 之类
// React 报 mismatch
//
// 修:
//   - 给 <body> 加 suppressHydrationWarning
//   - 或 Next.js 用 <html suppressHydrationWarning>

// =====================================================
// 4. 时区
// =====================================================

// ❌ 服务器 UTC,客户端 GMT+8 → 显示不同
function BadDate({ ts }: { ts: number }) {
  return <span>{new Date(ts).toLocaleString()}</span>
}

// ✅ 服务端用 UTC ISO,客户端 effect 转本地
function GoodDate({ ts }: { ts: number }) {
  const [local, setLocal] = useState<string | null>(null)
  useEffect(() => setLocal(new Date(ts).toLocaleString()), [ts])
  return <time dateTime={new Date(ts).toISOString()}>
    {local ?? new Date(ts).toISOString()}      {/* 服务端: ISO 字符串 */}
  </time>
}

// ✅✅ 或服务端读 Accept-Language + cookie 拿用户 timezone,做服务端转换
// (Next.js cookies()/headers() 可拿)

// =====================================================
// 5. 第三方异步插入(广告 / 客服)
// =====================================================

// ❌ 用 dangerouslySetInnerHTML 注入第三方 → 服务端没渲染,客户端突然有内容
// → 改成第三方 SDK 异步加载,React 不渲染:
function AdSlot() {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.ads.example/widget.js'
    script.async = true
    document.body.appendChild(script)
    return () => { script.remove() }
  }, [])
  return <div id="ad-slot" suppressHydrationWarning />
}

// =====================================================
// 6. ClientOnly 组件(通用法门)
// =====================================================

import type { ReactNode } from 'react'

export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? <>{children}</> : <>{fallback}</>
}

// 用法:
// <ClientOnly fallback={<Sk />}><HeavyChart /></ClientOnly>

// =====================================================
// 7. 调试技巧
// =====================================================
//
// 1. dev 模式 React 会 console.error 详细 mismatch:
//    "Text content does not match server-rendered HTML"
//    "Expected server HTML to contain a matching <div> in <body>"
//    → 看 stack 找到组件
//
// 2. React DevTools "Highlight updates on hydration"
//
// 3. SSR 输出 view-source 看:实际服务器输出了啥
//
// 4. 检查:
//    - 服务端 console.log 时机
//    - effect 是否被错放成 SSR 时跑(useLayoutEffect 服务端会 warning)

// =====================================================
// 8. React 19 改进
// =====================================================
//
// React 19 hydration error 更友好:
//   - 不再 force 整个根 fallback 到 CSR
//   - 局部 retry,只那个边界 client only
//   - 错误信息直接指到具体节点
//
// 但还是要修源头,不要靠容错。

export {}
