// 生产级 CSP 构造器 + nonce 注入 + 渐进上线策略

import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'

// =====================================================
// 1. CSP 指令(按必备 → 进阶 排)
// =====================================================
//
// default-src           ← 兜底(所有未指定的 fetch 都看它)
// script-src            ← <script> / inline JS / eval
// script-src-elem       ← 只对 <script src=>(更精确)
// script-src-attr       ← 内联事件(onclick="...")
// style-src             ← <style> / <link rel=stylesheet> / inline style
// style-src-elem
// style-src-attr        ← style="..."
// img-src               ← <img> <picture> background-image
// font-src
// connect-src           ← fetch / XHR / WebSocket / EventSource
// media-src             ← <audio> <video>
// object-src            ← <object> <embed>(建议 'none')
// frame-src             ← <iframe>
// frame-ancestors       ← 谁能把我嵌入 iframe(防 clickjacking)
// form-action           ← <form action=>
// base-uri              ← <base>(防 base 注入)
// manifest-src          ← PWA manifest
// worker-src            ← Web Worker / Service Worker
// child-src             ← worker + frame(旧)
// report-uri / report-to ← 违规上报
//
// 特殊值:
//   'self'                同源
//   'none'                完全禁
//   'unsafe-inline'       允许 inline(尽量不用)
//   'unsafe-eval'         允许 eval(尽量不用)
//   'nonce-XXX'           允许带该 nonce 的 inline
//   'sha256-XXX'          允许内容 hash 匹配的 inline
//   'strict-dynamic'      信任 nonce/hash 加载的脚本动态加载的子脚本
//   https:                所有 https
//   *.example.com         子域名 wildcard

// =====================================================
// 2. 构造器(类型安全)
// =====================================================
type CspValue = "'self'" | "'none'" | "'unsafe-inline'" | "'unsafe-eval'" | "'strict-dynamic'" | string

interface CspDirectives {
  defaultSrc?: CspValue[]
  scriptSrc?: CspValue[]
  scriptSrcElem?: CspValue[]
  scriptSrcAttr?: CspValue[]
  styleSrc?: CspValue[]
  styleSrcElem?: CspValue[]
  styleSrcAttr?: CspValue[]
  imgSrc?: CspValue[]
  fontSrc?: CspValue[]
  connectSrc?: CspValue[]
  mediaSrc?: CspValue[]
  objectSrc?: CspValue[]
  frameSrc?: CspValue[]
  frameAncestors?: CspValue[]
  formAction?: CspValue[]
  baseUri?: CspValue[]
  manifestSrc?: CspValue[]
  workerSrc?: CspValue[]
  reportUri?: string
  reportTo?: string
  upgradeInsecureRequests?: boolean
  blockAllMixedContent?: boolean
  requireTrustedTypesFor?: "'script'"[]
  trustedTypes?: string[]
}

export function buildCsp(d: CspDirectives): string {
  const camelToKebab = (k: string) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
  const parts: string[] = []

  for (const [k, v] of Object.entries(d)) {
    if (v === true) parts.push(camelToKebab(k))
    else if (Array.isArray(v)) parts.push(`${camelToKebab(k)} ${v.join(' ')}`)
    else if (typeof v === 'string') parts.push(`${camelToKebab(k)} ${v}`)
  }
  return parts.join('; ')
}

// =====================================================
// 3. 推荐 baseline(SPA 应用)
// =====================================================
export function baselineCsp(nonce: string, opts: { reportUri?: string; api?: string }): string {
  return buildCsp({
    defaultSrc: ["'self'"],
    scriptSrc: [`'nonce-${nonce}'`, "'strict-dynamic'", 'https:'],   // nonce + strict-dynamic 现代推荐组合
    styleSrc: ["'self'", "'unsafe-inline'"],                           // CSS-in-JS 必须 unsafe-inline
    styleSrcElem: ["'self'", "'unsafe-inline'", 'https:'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    fontSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", opts.api ?? '', 'wss:'].filter(Boolean) as string[],
    mediaSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    frameSrc: ["'self'"],
    frameAncestors: ["'none'"],                                        // 防 clickjacking
    formAction: ["'self'"],
    baseUri: ["'self'"],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'", 'blob:'],                                    // SW + Worker
    upgradeInsecureRequests: true,
    reportUri: opts.reportUri,
  })
}

// =====================================================
// 4. Express middleware:每次请求生成 nonce
// =====================================================
export function cspMiddleware(opts: { reportUri?: string; api?: string; reportOnly?: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const nonce = crypto.randomBytes(16).toString('base64')
    res.locals.nonce = nonce                                           // 模板里用 <%= nonce %>

    const policy = baselineCsp(nonce, opts)
    res.setHeader(
      opts.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      policy,
    )
    next()
  }
}

// =====================================================
// 5. 模板里使用 nonce
// =====================================================
//
// <!-- inline script 必须带 nonce -->
// <script nonce="${nonce}">
//   window.__INITIAL__ = ${JSON.stringify(state)};
// </script>
//
// <!-- 外部 script 不需要 nonce,但 src 必须满足 script-src 的 origin -->
// <script src="/app.js"></script>
//
// React / Vue / Svelte 框架要在 entry 注入 nonce(各家有 ssr nonce 选项)

// =====================================================
// 6. Next.js App Router 使用 CSP
// =====================================================
//
// // middleware.ts
// import { NextResponse, type NextRequest } from 'next/server'
//
// export function middleware(req: NextRequest) {
//   const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
//   const cspHeader = `
//     default-src 'self';
//     script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
//     style-src 'self' 'unsafe-inline';
//     img-src 'self' blob: data:;
//     font-src 'self';
//     connect-src 'self';
//     object-src 'none';
//     base-uri 'self';
//     form-action 'self';
//     frame-ancestors 'none';
//     upgrade-insecure-requests;
//   `.replace(/\s{2,}/g, ' ').trim()
//
//   const res = NextResponse.next({ request: { headers: new Headers(req.headers) } })
//   res.headers.set('x-nonce', nonce)
//   res.headers.set('Content-Security-Policy', cspHeader)
//   return res
// }
//
// // 在 Server Component 里读 nonce:
// import { headers } from 'next/headers'
// const nonce = headers().get('x-nonce') ?? ''
// return <Script nonce={nonce} ... />

// =====================================================
// 7. 上线策略:三阶段
// =====================================================
//
// 阶段 1 — 仅监控
// Content-Security-Policy-Report-Only: <policy>; report-to=csp
// 收集 30 天违规上报,看真实业务用了什么
//
// 阶段 2 — 灰度强制
// 10% 用户改成 Content-Security-Policy 强制
// 监控错误率 / 业务转化下降
//
// 阶段 3 — 全量
// 100% 强制,Report-Only 改成监控 strict 版本

// =====================================================
// 8. 接收 report 的 endpoint
// =====================================================
//
// CSP 违规上报格式(report-uri 是 application/csp-report,report-to 是 application/reports+json)
//
// app.post('/csp-report', express.json({ type: ['application/csp-report', 'application/reports+json'] }),
//   (req, res) => {
//     const r = req.body['csp-report'] ?? req.body[0]?.body ?? req.body
//     logger.warn('csp_violation', {
//       blockedUri: r['blocked-uri'] ?? r.blockedURL,
//       directive: r['effective-directive'] ?? r.effectiveDirective,
//       documentUri: r['document-uri'] ?? r.documentURL,
//       sample: r['script-sample'] ?? r.sample,
//     })
//     res.status(204).end()
//   })

// =====================================================
// 9. 常见违规(以及如何 fix,不是 unsafe-inline 一了百了)
// =====================================================
//
// 1. Google Analytics inline script
//    ❌ unsafe-inline → 全开
//    ✅ 用 GA 的外部 loader + nonce 加到 <script nonce=>
//
// 2. CSS-in-JS(Emotion / Styled-Components)注入 <style>
//    ✅ style-src 'unsafe-inline' (style 的 unsafe-inline 风险远低于 script)
//    ✅ 或 styled-components ServerStyleSheet 把 hash 加到 style-src
//
// 3. eval(用于动态执行)
//    ✅ 改成 Function 构造 或 完全不用
//    ❌ unsafe-eval(Vue 模板编译有时需要,改用 runtime + compiler 分离的预编译)
//
// 4. 用户传 inline event(<button onclick="...">)
//    ✅ 改 addEventListener
//
// 5. 第三方 widget 需要更多 origin
//    ✅ script-src 加 origin 白名单
//    ✅ 评估能否本地化(更安全 + 受 SRI 控制)
//
// 6. blob: URL(Web Workers / 动态资源)
//    ✅ worker-src 'self' blob:
//
// 7. dynamic import 的 chunk
//    ✅ strict-dynamic 自动信任 nonce 脚本动态加载的子脚本

// =====================================================
// 10. 测试工具
// =====================================================
//
// - https://csp-evaluator.withgoogle.com    Google 官方在线 evaluator
// - https://observatory.mozilla.org/         Mozilla 的整体 web security 体检
// - https://securityheaders.com/             一键检测所有 header

// =====================================================
// 11. 完整示例(Express)
// =====================================================
//
// import express from 'express'
// import { cspMiddleware } from './csp-builder'
//
// const app = express()
//
// app.use(cspMiddleware({
//   reportUri: '/csp-report',
//   api: 'https://api.example.com',
//   reportOnly: process.env.NODE_ENV !== 'production',
// }))
//
// app.get('/', (req, res) => {
//   const nonce = res.locals.nonce
//   res.send(`<!doctype html>
//   <html>
//   <head><title>App</title></head>
//   <body>
//     <div id=root></div>
//     <script nonce="${nonce}">window.__INITIAL__=${JSON.stringify({})};</script>
//     <script nonce="${nonce}" src="/app.js"></script>
//   </body>
//   </html>`)
// })

export {}
