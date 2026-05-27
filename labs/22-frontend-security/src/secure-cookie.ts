// Cookie 安全标志详解 + Express / Fastify / Koa 实战

// =====================================================
// 1. Cookie 完整属性
// =====================================================
//
// Set-Cookie: name=value;
//   Domain=.example.com         ← 哪些域可见(不写=只当前 host,精确)
//   Path=/api                    ← 哪些 path 可见
//   Expires=Wed, 21 Oct 2026 ... ← 绝对过期
//   Max-Age=86400                 ← 相对过期(秒,优先于 Expires)
//   Secure                        ← 只 HTTPS 发
//   HttpOnly                      ← JS 看不到(document.cookie 拿不到)
//   SameSite=Lax | Strict | None  ← 跨站行为
//   Priority=Low | Medium | High  ← 浏览器清理优先级(非标但 Chrome 支持)
//   Partitioned                   ← CHIPS:按顶级站隔离(防跨站追踪)
//   __Secure-                     ← name 前缀:浏览器强制 Secure
//   __Host-                       ← 强制 Secure + Path=/ + 无 Domain(最严)

// =====================================================
// 2. 标志组合速查
// =====================================================
//
// 会话 ID(session):
//   HttpOnly + Secure + SameSite=Lax + __Host- 前缀
//
// CSRF token(JS 要读):
//   Secure + SameSite=Lax + (不要 HttpOnly)
//
// 偏好 / theme(纯客户端):
//   不需要 HttpOnly,SameSite=Lax 即可
//
// 跨站 SSO(必须跨站带):
//   HttpOnly + Secure + SameSite=None + 严格审核
//
// 第三方分析(被广告 / iframe 嵌入):
//   Secure + SameSite=None + Partitioned(CHIPS)

// =====================================================
// 3. Express 例
// =====================================================
import type { Response } from 'express'

export function setSessionCookie(res: Response, sessionId: string) {
  res.cookie('__Host-session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',                     // __Host- 强制 path=/
    // domain: '...',               // __Host- 强制无 domain
    maxAge: 24 * 60 * 60 * 1000,    // 1 day
  })
}

export function clearSession(res: Response) {
  res.clearCookie('__Host-session', { path: '/' })
}

// =====================================================
// 4. __Secure- 和 __Host- 前缀
// =====================================================
//
// __Secure-foo:浏览器拒绝设置除非带 Secure
// __Host-foo:浏览器拒绝设置除非:
//   - Secure
//   - Path=/
//   - 没有 Domain 属性(只当前 host)
//
// → 强制约束开发者别写错
// → 攻击者就算能注入 Set-Cookie,也无法把不安全的 cookie 顶掉 __Host- cookie

// =====================================================
// 5. JWT 的存储:cookie vs localStorage
// =====================================================
//
//                       Cookie (HttpOnly)    localStorage
//                       ──────────────────   ──────────────
// XSS 偷                 不能(JS 读不到)    能
// CSRF                   有(需 CSRF token)  无
// 跨域共享                可(Domain)         不可
// 容量                    4KB                  ~10MB
// 自动带请求               是                  否(要手动 header)
// 移动 webview            是                  是
//
// 结论:
//   普通 session/JWT → HttpOnly cookie + SameSite + CSRF token(双护)
//   API-only 无 cookie 体系 → localStorage(但 XSS 0 容忍)

// =====================================================
// 6. CHIPS(Cookies Having Independent Partitioned State)
// =====================================================
//
// 2024+ Chrome 默认禁第三方 cookie。
// 但有些合法用途(如客服 widget 跨站记 session)需要 cookie。
// → CHIPS 让第三方 cookie 按 top-level 站隔离:
//
// Set-Cookie: __Host-csid=xxx; Path=/; Secure; HttpOnly; SameSite=None; Partitioned
//
// 顶级站 A.com 嵌 widget → widget 的 cookie 只对 A.com 上下文有效
// 顶级站 B.com 嵌同样 widget → 是独立的 cookie 空间
// → 防跨站追踪,但允许合法用法

// =====================================================
// 7. Cookie attack vectors(常见)
// =====================================================
//
// 1. Cookie 覆盖(没 __Host-):
//    子域 a.example.com 设 Domain=.example.com 的 cookie
//    覆盖了 main.example.com 同名 cookie
//
// 2. Cookie tossing:
//    多 cookie 同名,优先级取决于 Path / Domain 长度
//    攻击者注入更精确 Path 的 cookie 顶掉 session
//
// 3. Cookie 注入(老 IE bug,现代少见):
//    用户控制的字段被反射到 Set-Cookie 头
//
// 4. cookie fixation:
//    攻击者设个 sid,诱导用户用这个 sid 登录,然后他用同样的 sid 接管
//    防:登录后必须生成新 sid

// =====================================================
// 8. 多端共享 cookie(子域 SSO)
// =====================================================
//
// auth.example.com 设:
//   Set-Cookie: session=xxx; Domain=.example.com; ...
//
// 然后 app.example.com, billing.example.com 都能读
//
// 风险:任何 *.example.com 被攻陷 → cookie 泄露
// 缓解:
//   - 各子站独立 session(只在 auth.example.com 设 short-lived ticket)
//   - 子站凭 ticket 换自己的 sid

// =====================================================
// 9. 第三方 cookie 替代方案(2026 现状)
// =====================================================
//
// 浏览器禁第三方 cookie 后,以下替代:
//
// 1. CHIPS(同上)
// 2. First-Party Sets:声明几个 domain 算同站(Chrome 提案)
// 3. Storage Access API:JS 显式请求第三方 cookie 权限(需要用户手势)
// 4. Federated Credential Management(FedCM):浏览器原生 SSO UX
// 5. Topics API:浏览器侧广告兴趣分类(代替 cookie 追踪)

// =====================================================
// 10. cookie 清单(给安全 review)
// =====================================================
//
// curl -I https://your-site.com | grep -i set-cookie
//
// 检查每条:
//   [ ] 有 Secure(HTTPS)
//   [ ] session/敏感的有 HttpOnly
//   [ ] 有 SameSite
//   [ ] 必要时用 __Host- 前缀
//   [ ] Domain 精确(不要 .example.com 除非真的跨子域)
//   [ ] Max-Age / Expires 合理(session 不要永久)
//   [ ] 名字不泄露技术栈(PHPSESSID / ASP.NET_SessionId → 改成中性名)

// =====================================================
// 11. 跨框架
// =====================================================
//
// Express:res.cookie(name, val, options)
// Koa:ctx.cookies.set(name, val, options)
// Fastify:reply.setCookie(name, val, options)(@fastify/cookie)
// Next.js Server Action:
//   import { cookies } from 'next/headers'
//   cookies().set({ name, value, httpOnly, secure, sameSite, path, maxAge })

export {}
