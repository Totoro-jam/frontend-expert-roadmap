// CSRF 防御:Double-submit token + SameSite cookie + Origin 校验
// 适用 SPA / 传统服务端模板 / 跨子域 SSO

import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'

// =====================================================
// 1. CSRF 原理回顾
// =====================================================
//
// 你登 bank.com,cookie:session=abc
// 你访问 evil.com,evil 页面有:
//   <form action="https://bank.com/transfer" method="POST">
//     <input name="to" value="evil_account" />
//     <input name="amount" value="999" />
//   </form>
//   <script>document.forms[0].submit()</script>
//
// 浏览器发请求,自动带 bank.com 的 cookie → 转账成功
//
// 防御核心:让攻击者「即使能让浏览器发请求,也无法构造合法请求」

// =====================================================
// 2. 第一道防线:SameSite cookie
// =====================================================
//
// Set-Cookie: session=abc; SameSite=Lax; HttpOnly; Secure
//
// Lax:跨站 navigation GET 还带 cookie,跨站 POST / iframe / image 不带
// Strict:任何跨站都不带(包括点链接来的)
// None:照常带(必须配 Secure)
//
// 默认值变化:
//   Chrome 80+(2020):未声明的 cookie 默认 Lax
//   但仍要显式写,Firefox / Safari 兼容性
//
// 2026 状态:
//   Safari 已禁第三方 cookie
//   Chrome 计划全面禁第三方 cookie
//   → SameSite=None 场景越来越少(跨站登录用 Federated Credential / SSO 重定向)

// =====================================================
// 3. 第二道防线:Origin / Referer 校验
// =====================================================
const ALLOWED_ORIGINS = new Set([
  'https://app.example.com',
  'https://www.example.com',
])

export function originGuard(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()

  const origin = req.headers.origin
  const referer = req.headers.referer

  const source = origin ?? (referer && new URL(referer).origin)
  if (!source || !ALLOWED_ORIGINS.has(source)) {
    return res.status(403).json({ error: 'CSRF: bad origin' })
  }
  next()
}

// 注意:这只在浏览器场景有效(浏览器会自动带 Origin / Referer)
// CLI / 手写 client 可以伪造,所以不能当唯一防线

// =====================================================
// 4. 第三道防线:Double-submit token(SPA 推荐)
// =====================================================
//
// 服务端:GET /api/csrf 生成 token,放入 cookie(非 HttpOnly)+ response body
// 客户端:POST 时把 token 放到 header(X-CSRF-Token)
// 服务端:校验 cookie 中的 token === header 中的 token
//
// 原理:攻击者跨域无法读 cookie(浏览器同源策略保护),也无法在 header 里塞值

const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'x-csrf-token'

function generateToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function csrfIssue(req: Request, res: Response, next: NextFunction) {
  // 每次请求(或首次)生成新 token
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateToken()
    res.cookie(CSRF_COOKIE, token, {
      sameSite: 'lax',
      secure: true,
      httpOnly: false,                                // ← JS 必须能读
      path: '/',
    })
  }
  next()
}

export function csrfCheck(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()

  const cookieToken = req.cookies?.[CSRF_COOKIE]
  const headerToken = req.header(CSRF_HEADER)

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF: bad token' })
  }
  next()
}

// =====================================================
// 5. 客户端读 cookie + 加 header(fetch 封装)
// =====================================================
//
// function getCsrfToken() {
//   const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)
//   return match ? decodeURIComponent(match[1]) : ''
// }
//
// export async function api(input: RequestInfo, init?: RequestInit) {
//   const res = await fetch(input, {
//     credentials: 'include',
//     headers: {
//       'Content-Type': 'application/json',
//       'X-CSRF-Token': getCsrfToken(),
//       ...init?.headers,
//     },
//     ...init,
//   })
//   if (res.status === 403) {
//     // token 过期 / 不一致 → 重新拉一次 token 再重试
//   }
//   return res
// }
//
// // Axios 内置 xsrf 支持
// axios.defaults.xsrfCookieName = 'XSRF-TOKEN'
// axios.defaults.xsrfHeaderName = 'X-CSRF-Token'
// axios.defaults.withCredentials = true

// =====================================================
// 6. 第四道防线:对关键操作再加二次验证
// =====================================================
//
// 转账 / 改密 / 删账号 等高危操作:
// - 重新输入密码
// - SMS / TOTP 二次确认
// - WebAuthn / Passkey
//
// 这种「step-up auth」是 OWASP 推荐:CSRF token 是必备,但不够

// =====================================================
// 7. CSRF in API-only(JWT in localStorage)
// =====================================================
//
// 如果不用 cookie 而是把 JWT 放 localStorage 然后:
//   Authorization: Bearer <jwt>
// → 攻击者跨站发请求时,fetch 默认不带 Authorization header
// → 实际不存在 CSRF(但 XSS 风险高,token 能被偷)
//
// 折衷:
// - JWT 放 HttpOnly cookie + 上面的 double-submit token
//   (兼得 XSS 防护 + CSRF 防护)

// =====================================================
// 8. 同站子域 CSRF(常被忽略)
// =====================================================
//
// 如果 *.example.com 共享 session(.example.com 域 cookie):
// - 攻击者控制 user-content.example.com(UGC 子域)
// - 仍然能发请求带 cookie
//
// 修:
// - 重要 cookie 限定到具体子域(app.example.com,不要 .example.com)
// - UGC 用完全分离的域名(usercontent-cdn.com)
// - Site Isolation(浏览器默认开)+ COOP / COEP

// =====================================================
// 9. CORS + Credentials(必须谨慎)
// =====================================================
//
// 后端配:
//   Access-Control-Allow-Origin: https://app.example.com   ← 精确
//   Access-Control-Allow-Credentials: true
//
// ❌ 反射 Origin 不校验:
//   res.header('Access-Control-Allow-Origin', req.header('Origin'))   // 危险!
//
// ❌ Access-Control-Allow-Origin: * + Credentials: true 浏览器会拒,但有些后端配错绕过:
//   if (origin) res.header('Access-Control-Allow-Origin', origin) ← 等同 *
//
// ✅ 严格白名单校验:
//   if (ALLOWED_ORIGINS.has(origin)) res.header('Access-Control-Allow-Origin', origin)

// =====================================================
// 10. WebSocket 也会 CSRF(常被忽略)
// =====================================================
//
// new WebSocket('wss://example.com/ws') 跨站打开 → 带 cookie!
// 攻击者可以从 evil.com 打开 ws 然后命令(如果 WS 协议依赖 cookie 鉴权)
//
// 修:
// - WS 升级时校验 Origin header
// - 用 token 而非 cookie 鉴权(WS URL 带 ?token=...)
// - 把关键操作放在 HTTPS POST,不放 WS

// =====================================================
// 11. CSRF 测试(让 QA / pentest 验)
// =====================================================
//
// HTML 在另一个域:
//   <form id=f action="https://victim/api/transfer" method=post>
//     <input name=to value=evil>
//     <input name=amount value=99999>
//   </form>
//   <script>f.submit()</script>
//
// JSON CSRF(POST + JSON content-type 是 preflight 请求,需要 CORS):
//   攻击者把 form encoded 当 JSON 发(老 API 兼容):
//   <form action="..." enctype="text/plain">
//     <input name='{"to":"evil","amount":99999,"x":"' value='"}' />
//   </form>
//   → POST body 看起来像 JSON
//   → 老后端 JSON.parse 成功
//   → 如果只检查 Content-Type 没校验 token,中招
//
// 防:
// - API 必须验 Content-Type=application/json
// - 加 CSRF token
// - SameSite cookie

// =====================================================
// 12. 完整 Express 例子
// =====================================================
//
// import express from 'express'
// import cookieParser from 'cookie-parser'
// import { originGuard, csrfIssue, csrfCheck } from './csrf-protection'
//
// const app = express()
// app.use(cookieParser())
// app.use(express.json())
// app.use(csrfIssue)
// app.use(originGuard)
// app.use(csrfCheck)
//
// app.post('/api/transfer', (req, res) => {
//   // 已经过 3 层防御
//   ...
// })

export {}
