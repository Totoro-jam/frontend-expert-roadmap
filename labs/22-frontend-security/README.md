# 22 · Frontend Security Lab

> 前端的边界 = 用户输入 + 第三方代码 + 浏览器 API。
> 三个面任何一个失守,业务都可能崩。
> 这里把 OWASP 前端相关 + Web 平台安全机制扒一遍。

---

## 学这个能干什么

- 听到「XSS / CSRF / Clickjacking / Mixed Content」立刻知道根因 + 修法
- 写 CSP 不会写出全站碎成渣的版本(也不会写 `unsafe-inline` 一了百了)
- 知道 SameSite / HttpOnly / Secure 三个 cookie 标志各自防什么
- 看到 third-party 脚本接入要求,能评估真实风险
- 上线前能跑一遍安全 checklist 不漏
- 应对真实事件(凭证泄露 / dependency confusion / 供应链)

---

## Roadmap

### 1. OWASP 前端相关 Top 10

| 攻击 | 描述 | 修法核心 |
|---|---|---|
| **XSS** | 注入脚本到 DOM | escape / Trusted Types / CSP |
| **CSRF** | 借用用户身份发请求 | SameSite cookie / CSRF token / Origin 校验 |
| **Clickjacking** | 用 iframe 套住你的站,骗用户点击 | X-Frame-Options / CSP frame-ancestors |
| **Mixed Content** | HTTPS 页面加载 HTTP 资源 | 升级全 HTTPS / upgrade-insecure-requests |
| **Insecure CORS** | 配错 Access-Control-Allow-Origin: * + credentials | 精确白名单 |
| **Open Redirect** | `/redirect?url=evil.com` 借你的域名钓鱼 | 白名单 URL |
| **Subdomain Takeover** | DNS 指向已弃用的 SaaS | 监控 + 及时清理 DNS |
| **Dependency Confusion / 投毒** | npm 私包名被公包抢注 | scope + .npmrc registry |
| **Supply Chain(脚本 / SDK)** | 第三方代码偷信息 | SRI / sandbox iframe / 内嵌沙盒 |
| **凭证泄露** | API key 写在前端 / 提交到 git | secret scanning / env vars / proxy |

### 2. XSS:三种类型

```
                  存储型(Stored)      反射型(Reflected)         DOM 型(DOM-based)
                  ────────────         ─────────────────         ─────────────────
触发              访问页面就中          点击恶意链接              客户端解析 URL/输入
存储              数据库 / CMS         URL 参数                  全在前端,后端不知
危害              ★★★★★(每个访客)   ★★★(被钓鱼时)            ★★★★(隐蔽)
例子              评论里写 <script>    搜索回显 ?q=<script>      `location.hash` 拼到 innerHTML
```

详见 [src/xss-defense.tsx](src/xss-defense.tsx)。

### 3. XSS 修法层级

```
1. 内容上不信任(默认 escape)         ← React / Vue / Svelte 默认就帮你做
2. 用户能输入富文本 → DOMPurify       ← sanitize 之后才能 innerHTML
3. URL 类输入校验 javascript: 协议    ← <a href={url}> 是个坑
4. Trusted Types(Chrome)            ← 把 setHTML 类 sink 全锁住
5. CSP 防御纵深(strict-dynamic)    ← 即使有漏洞也不执行
6. Sandbox(iframe sandbox / Web Worker) ← 把第三方代码隔离
```

### 4. CSP(Content Security Policy)

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-RANDOM_PER_REQUEST' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
  report-uri /csp-report;
```

**关键概念**:
- `'nonce-xxx'` 每次请求生成,只允许带该 nonce 的 inline script 执行
- `'strict-dynamic'` 信任 nonce 加载的脚本动态加载的子脚本
- `'unsafe-inline'` 是逃生口,**绝对不要在 script-src 用**
- `report-uri` / `report-to` 收集违规上报(灰度阶段必备)

详见 [src/csp-builder.ts](src/csp-builder.ts) 和 [demos/csp-test.html](demos/csp-test.html)。

### 5. Trusted Types(Chrome + 现代浏览器)

```http
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types default;
```

```js
// 没有 Trusted Types 时:
el.innerHTML = userInput          // 危险但允许

// 启用后:
el.innerHTML = userInput          // ❌ TypeError: TrustedHTML required

// 必须显式过一遍 policy:
const policy = trustedTypes.createPolicy('default', {
  createHTML: (s) => DOMPurify.sanitize(s),
})
el.innerHTML = policy.createHTML(userInput)
```

**收益**:让所有「字符串→DOM」的口子都被显式标注 → 漏洞集中可审计。

### 6. CSRF:三层防御

```
1. SameSite=Lax(浏览器默认):跨站 POST 不带 cookie
2. SameSite=Strict:跨站 GET 也不带(适合内部系统)
3. SameSite=None; Secure:必须显式,且必走 HTTPS(跨站 SSO 场景)

+ Double-submit token:
  - 服务端发 cookie XSRF-TOKEN
  - 表单提交时同时放 form / header
  - 服务端校验两者相等
  - 攻击者读不到 cookie 跨域 → 无法伪造 header

+ Origin / Referer 校验(后端):
  - 拒绝 Origin 不在白名单的 mutation
```

详见 [src/csrf-protection.ts](src/csrf-protection.ts)。

### 7. Cookie 三个安全标志

```http
Set-Cookie: sid=xxx;
  HttpOnly;        ← JS 读不到,挡 XSS 偷 session
  Secure;          ← 只在 HTTPS 发送
  SameSite=Lax;    ← 跨站不带(挡 CSRF)
  Path=/;
  Max-Age=86400;
```

**会话 cookie 三件套必带**。任何「需要保密」的 cookie 都应该 HttpOnly+Secure+SameSite。

### 8. CORS:能做和不能做

```
CORS 不是「鉴权」机制,是「让浏览器允许跨域请求并读 response」。

✅ 防:JS 读到他站 response
❌ 不防:用户主动点的 form post / img src(那是 CSRF 的事)
```

```http
# 简单请求(GET / 简单 POST)
Access-Control-Allow-Origin: https://app.example.com   ← 必须精确,不要 *
Access-Control-Allow-Credentials: true                  ← 允许带 cookie 时

# Preflight(复杂请求 OPTIONS 探路)
Access-Control-Allow-Methods: GET, POST, PUT
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

**常见错配**:
- `Access-Control-Allow-Origin: *` + `Allow-Credentials: true` → 浏览器拒绝(冲突),但有人手写代码反射 Origin 头跳过该限制 → 任意域都能带 cookie 访问
- 反射 Origin 没白名单 → 同上

### 9. Clickjacking

```http
# 防被嵌套
X-Frame-Options: DENY               # 旧的,广泛兼容
# 或
Content-Security-Policy: frame-ancestors 'self' https://trusted.example.com;
```

JS-only fallback(防御弱,只是兜底):
```js
if (top !== self) top.location = self.location
```

### 10. Subresource Integrity(SRI)

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  crossorigin="anonymous"
></script>
```

- CDN 被劫持时浏览器拒绝执行
- npm publish 后生成 hash 嵌 HTML(自动化:Webpack `webpack-subresource-integrity` 插件)
- **关键**:版本不可变(CDN 路径带版本号),不然每次更新都要换 hash

### 11. Mixed Content

```http
# 一刀切升级所有 http:// 资源为 https://
Content-Security-Policy: upgrade-insecure-requests;

# 强制阻断
Content-Security-Policy: block-all-mixed-content;
```

### 12. Open Redirect

```js
// ❌ 危险
app.get('/redirect', (req, res) => res.redirect(req.query.url))

// ✅ 白名单
const ALLOWED = ['/dashboard', '/settings', /^\/order\/[a-z0-9]+$/]
if (!ALLOWED.some(p => typeof p === 'string' ? p === url : p.test(url))) {
  return res.status(400).end()
}
res.redirect(url)
```

### 13. Iframe Sandbox

```html
<!-- 嵌第三方内容时,默认无 JS / 无 form / 无 同源 -->
<iframe
  src="https://untrusted.example.com"
  sandbox="allow-scripts allow-same-origin"          <!-- 按需放行 -->
  referrerpolicy="no-referrer"
  loading="lazy"
></iframe>
```

**注意**:`allow-scripts allow-same-origin` 一起给 = 解除沙箱(可以脚本 + 同源 → 改父页)。给客户端 SDK 嵌入慎重。

### 14. window.opener 攻击

```html
<!-- 点击新窗口,如果用 target=_blank,opener 默认能访问父页 → 钓鱼 -->
<a href="https://external.com" target="_blank" rel="noopener noreferrer">外链</a>
```

**现代浏览器默认 rel="noopener"**(2021+),但兼容老站还是显式写。

### 15. localStorage / sessionStorage 别存敏感

```js
localStorage.setItem('token', jwt)             // ❌ JS 能读 → XSS 偷光
```

**正确**:JWT 放 HttpOnly cookie,server-rendered 模板用 nonce,前端只需要拿 csrfToken 这种弱密信息。

如果非要 localStorage(SPA + 跨域):用短 TTL + refresh + 监控被偷调用模式。

### 16. PostMessage

```js
// 监听
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://trusted.example.com') return    // ✅ 必校验 origin
  if (typeof e.data !== 'object' || !e.data.type) return    // ✅ 校验数据形状
  handle(e.data)
})

// 发送
otherWindow.postMessage({ type: 'sync', payload: ... }, 'https://trusted.example.com')
// ❌ 别用 '*' 当 target → 接收者切换 origin 你的数据就泄了
```

### 17. 现代权限 API

```js
// 不要默认请求,等用户点了再请
if (Notification.permission === 'default') {
  // 等用户点了"开启通知"按钮再调
  // Notification.requestPermission()
}

// 摄像头 / 麦克风
navigator.mediaDevices.getUserMedia({ video: true })   // 必须用户手势触发
```

### 18. Service Worker 安全

- SW 可以拦截 fetch + 改 response → 一个被攻破的 SW = 完全沦陷
- SW 注册必须 same-origin + HTTPS
- 自更新策略:`updateViaCache: 'none'`,以防 CDN 缓存恶意 sw.js
- 卸载逻辑(如果出了问题怎么紧急回滚?):
  ```js
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
  caches.keys().then(ks => ks.forEach(k => caches.delete(k)))
  ```
- 文件名 `/sw.js` 放根目录,scope = `/`(默认)

### 19. 供应链安全

```
攻击面:
1. npm 包被劫持(maintainer 账号被盗,push 恶意版本)
2. dependency confusion(把私包名注册到公 registry,优先级被打过去)
3. typo squatting(react-dom-server vs react-dom/server)
4. install scripts 偷敏感(.npmrc / SSH key / env)

防御:
- package-lock.json + 提交到 git
- npm ci 而非 npm install(严格依赖锁)
- npm audit 在 CI
- Snyk / Dependabot / Renovate 自动 PR
- npm install --ignore-scripts(默认拒绝 postinstall)
- 私包用 @company/name 形式,.npmrc 锁 registry
- 重要 SDK 锁版本到精确版,不要 ^ / ~
- 第三方脚本能本地化就本地化(npm 包代替 CDN)
```

### 20. 密钥泄露

```
❌ 在前端代码里:
   const API_KEY = 'sk_live_xxxxx'             // 任何人 view-source 都看到

✅ 正确:
   - 公钥(Stripe publishable key / Google Maps API key) → 可以放
   - 但限制 referer / origin 白名单
   - 私钥必须放后端 → 前端走自己后端代理

被泄露怎么办:
- 立即 revoke
- 看历史日志评估影响
- 补充防御(rate limit / 异常检测)
- git 仓库历史也要清(BFG / git-filter-repo)
```

### 21. 内容嵌入第三方 SDK

```
风险评估问题:
- 它能读 localStorage / cookie 吗?(同 origin 嵌入 → 能)
- 它能改 DOM 吗?(能)
- 它能发请求(带 cookie)吗?(能,如果你站登录了)
- 它能改 URL / 重定向吗?(能)
- 它有 SRI 吗?
- 它的发布机制可信吗?

降低方式:
- iframe + sandbox
- subdomain 隔离(payments.example.com)+ 设 CSP
- 关键功能用 server side webhook,不放前端 JS
- 拉本地化版本(锁版本 + SRI)
```

### 22. 错误信息也是攻击面

```js
// ❌ 把内部错误直接吐给用户
catch (e) { return res.json({ error: e.stack }) }   // 暴露文件路径 / 框架版本

// ✅ 用户友好 + 服务端记日志 + ID 关联
const errorId = crypto.randomUUID()
console.error(errorId, e)
return res.status(500).json({ message: 'Internal error', errorId })
```

### 23. Permissions Policy(原 Feature Policy)

```http
Permissions-Policy: camera=(), microphone=(), geolocation=(self), interest-cohort=()
```

让你 / 子 iframe 不能用某些强能力(就算被 XSS 也不能调用)。

### 24. COOP / COEP / CORP

```http
Cross-Origin-Opener-Policy: same-origin       # 切断 window.opener
Cross-Origin-Embedder-Policy: require-corp    # 子资源必须 opt-in 才能嵌
Cross-Origin-Resource-Policy: same-origin     # 防别站把你当资源用

# 三连开启可以用 SharedArrayBuffer / 高精度计时器(Spectre 缓解)
```

---

## src/ 索引

| 文件 | 主题 |
|---|---|
| [src/xss-defense.tsx](src/xss-defense.tsx) | 三种 XSS + React/Vue 修法 + DOMPurify + Trusted Types |
| [src/csp-builder.ts](src/csp-builder.ts) | 生产级 CSP 构造器 + nonce |
| [src/csrf-protection.ts](src/csrf-protection.ts) | Double-submit token + SameSite cookie |
| [src/secure-cookie.ts](src/secure-cookie.ts) | Cookie 标志详解 + Express 例子 |
| [src/sri-build-plugin.js](src/sri-build-plugin.js) | Webpack/Vite 自动生成 SRI |
| [src/sandbox-iframe.tsx](src/sandbox-iframe.tsx) | 嵌入第三方 SDK 的隔离模式 |
| [demos/csp-test.html](demos/csp-test.html) | CSP 命中 / 违规可视化 |
| [examples/security-checklist.md](examples/security-checklist.md) | 上线前安全 checklist |
| [examples/incident-response.md](examples/incident-response.md) | 真实事件应急手册 |

---

## 资源

- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [Web Security Academy(PortSwigger)](https://portswigger.net/web-security)
- [Trusted Types](https://web.dev/trusted-types/)
- [HackerOne disclosed reports(读真实案例!)](https://hackerone.com/hacktivity)
- [Google Bughunters University](https://bughunters.google.com/learn)
