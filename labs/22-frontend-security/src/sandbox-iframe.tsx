// 嵌入第三方内容/SDK 的隔离模式
// iframe sandbox / Worker / 子域 / Web Components 各自适用场景

import { useEffect, useRef } from 'react'

// =====================================================
// 1. iframe sandbox 标志详解
// =====================================================
//
// <iframe sandbox="..." />
//
// 不设 sandbox     = 完全信任(默认行为)
// sandbox=""        = 最严格(无 JS / 无 form / 无 navigation / 视为独立 origin)
//
// 逐项放开:
//   allow-scripts           允许 JS 执行
//   allow-same-origin       视为同 origin(能访问 localStorage / cookie 等)
//   allow-forms             允许 form 提交
//   allow-popups            允许 window.open
//   allow-popups-to-escape-sandbox  弹窗不继承 sandbox
//   allow-top-navigation    允许改顶级窗口 URL
//   allow-top-navigation-by-user-activation  仅用户手势可以改
//   allow-modals            允许 alert/confirm/prompt
//   allow-downloads         允许下载文件
//   allow-orientation-lock  允许锁屏方向
//   allow-pointer-lock      允许鼠标锁定
//   allow-presentation      允许 Presentation API
//   allow-storage-access-by-user-activation  允许请求 storage access
//
// ⚠️ 关键陷阱:
//   sandbox="allow-scripts allow-same-origin" = 解除沙箱!
//   (脚本能跑 + 同源 → 它能改父 iframe 的 sandbox 属性 → 完全解放)
//
// → 两个里只给一个:
//   - 信任度高:allow-same-origin(脚本不能跑)
//   - 信任度低:allow-scripts(独立 origin,改不了父)

// =====================================================
// 2. React 组件:安全嵌入第三方 widget
// =====================================================
interface SandboxedWidgetProps {
  url: string
  height?: number
  permissions?: string[]
  onMessage?: (data: any) => void
}

export function SandboxedWidget({
  url,
  height = 400,
  permissions = ['allow-scripts'],         // 默认不给 same-origin
  onMessage,
}: SandboxedWidgetProps) {
  const ref = useRef<HTMLIFrameElement>(null)
  const origin = new URL(url).origin

  useEffect(() => {
    if (!onMessage) return
    const handler = (e: MessageEvent) => {
      if (e.origin !== origin) return              // ← 校验来源
      if (e.source !== ref.current?.contentWindow) return
      onMessage(e.data)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [origin, onMessage])

  return (
    <iframe
      ref={ref}
      src={url}
      sandbox={permissions.join(' ')}
      referrerPolicy="no-referrer"
      loading="lazy"
      style={{ width: '100%', height, border: 0 }}
      // 允许哪些 powerful API(camera/mic/geo)
      allow="camera 'none'; microphone 'none'; geolocation 'none'"
      // 限制 navigation
      // 现代浏览器还有:
      //   credentialless        ← 强制 anonymous(不带 cookie)
      //   csp="default-src 'self'"  ← 给 iframe 加 CSP(Chrome 实验)
    />
  )
}

// =====================================================
// 3. PostMessage 双向通讯(安全版)
// =====================================================
type Msg = { type: string; payload: unknown; id?: string }

function safePostMessage(target: Window, msg: Msg, targetOrigin: string) {
  if (targetOrigin === '*') throw new Error('Refuse to postMessage with *')
  target.postMessage(msg, targetOrigin)
}

// 接收端
function listenForMessages(allowedOrigin: string, handlers: Record<string, (p: unknown) => void>) {
  window.addEventListener('message', (e) => {
    if (e.origin !== allowedOrigin) return
    if (typeof e.data !== 'object' || !e.data || typeof e.data.type !== 'string') return
    const handler = handlers[e.data.type]
    if (handler) handler(e.data.payload)
  })
}

// RPC 模式(带 id)
class FrameRpc {
  private pending = new Map<string, (v: unknown) => void>()
  constructor(private frame: Window, private origin: string) {
    window.addEventListener('message', (e) => {
      if (e.origin !== this.origin) return
      if (e.data?.type === 'rpc-response' && e.data.id) {
        this.pending.get(e.data.id)?.(e.data.payload)
        this.pending.delete(e.data.id)
      }
    })
  }
  call(method: string, params: unknown): Promise<unknown> {
    const id = crypto.randomUUID()
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      safePostMessage(this.frame, { type: 'rpc-call', payload: { method, params }, id }, this.origin)
    })
  }
}

// =====================================================
// 4. 子域名隔离(最实用的隔离)
// =====================================================
//
// 把第三方内容放在独立子域:
//   user-content.example.com    (用户上传)
//   payments.example.com         (支付 iframe)
//   embed.example.com            (第三方 widget host)
//
// 收益:
// - 浏览器自动隔离 cookie / storage(只要不共享 .example.com 域 cookie)
// - 即使内容里有 XSS,也不会污染主站
// - 配合 COOP / COEP 进一步限制
//
// 例:GitHub 用 raw.githubusercontent.com 防止 user content XSS 影响主站

// =====================================================
// 5. Web Worker / Worklet 沙箱
// =====================================================
//
// 跑第三方计算逻辑(图像处理、数学算法、AI 推理):
//
//   const worker = new Worker(new URL('./untrusted.js', import.meta.url), {
//     type: 'module',
//   })
//
//   worker.postMessage({ type: 'process', data })
//   worker.onmessage = (e) => { /* 用结果 */ }
//
// Worker 没 DOM 访问 → 即使第三方代码恶意,也只能动 Worker 内部
// 注意:Worker 仍可 fetch → 必须配 CSP connect-src 限制目标域

// =====================================================
// 6. ShadowDOM + Web Components(隔离样式 + 部分 JS)
// =====================================================
//
// class MyWidget extends HTMLElement {
//   constructor() {
//     super()
//     const shadow = this.attachShadow({ mode: 'closed' })  // closed = 外部 querySelector 看不到
//     shadow.innerHTML = `<style>...</style><div>...</div>`
//   }
// }
// customElements.define('my-widget', MyWidget)
//
// 隔离强度:
// - 样式:完全隔离
// - DOM:closed mode 父无法 query
// - JS:同 window,无沙箱(不防恶意脚本)
//
// → 适合「样式 / 结构隔离」,不防恶意 JS

// =====================================================
// 7. 完整模式对比
// =====================================================
//
//                  iframe sandbox    Worker     ShadowDOM    子域 iframe
//                  ───────────────   ───────    ─────────    ──────────
// 可执行第三方 JS   ✓                ✓          (同 window) ✓
// DOM 隔离          ✓                N/A        部分          ✓
// 样式隔离          ✓                N/A        ✓            ✓
// 防 XSS 升级       ✓ (不给 same-origin) ✓     ✗            ✓
// 防偷主站 cookie   ✓ (no allow-same-origin) ✓ ✗            ✓
// 通信成本          postMessage      postMessage 直接调       postMessage
// 视觉嵌入          ✓                ✗          ✓            ✓
//
// 最强组合:
//   payments.example.com 子域 + iframe sandbox + CSP + COOP

// =====================================================
// 8. 加载第三方分析 / 客服 / 广告
// =====================================================
//
// 风险等级 vs 措施:
//
// 低(GA / Sentry):
//   - SRI + nonce
//   - 不放在登录后页面(选页加载)
//
// 中(Intercom / Drift 客服):
//   - 推 iframe 嵌入
//   - 关键操作不在该页
//
// 高(开放第三方 widget 市场):
//   - 强制 iframe sandbox + CSP
//   - 独立子域
//   - 通信 RPC 化(白名单方法)
//
// 极高(用户上传 HTML / 模板):
//   - 必须独立 origin
//   - DOMPurify + sanitize-html 双过
//   - 渲染前再过一遍 CSP

// =====================================================
// 9. Sandboxed iframe + srcdoc(动态 HTML)
// =====================================================
//
// 不暴露完整 URL,直接 inline:
// <iframe srcdoc="<html>...</html>" sandbox="allow-scripts" />
//
// 注意:srcdoc 内容算 about:srcdoc origin,但仍受 sandbox 控制

// =====================================================
// 10. credentialless iframe(Chrome 110+)
// =====================================================
//
// <iframe credentialless src="..." />
//
// 强制 anonymous:
//   - 不带 cookie / auth
//   - 不共享 storage
//   - 配合 COEP 解锁 SharedArrayBuffer
//
// 适合嵌入 untrusted 但又需要 same-origin 行为的场景

export {}
