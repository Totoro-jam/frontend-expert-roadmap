# 前端上线前安全 checklist

> 上线前过一遍。
> 每条都要回答「是 / 否 / 不适用」,不许「应该是」。

---

## 1. 传输与身份

```
[ ] 全站 HTTPS,HTTP 301 重定向
[ ] HSTS 启用(Strict-Transport-Security: max-age=31536000; includeSubDomains; preload)
[ ] HSTS preload 提交(https://hstspreload.org/)
[ ] 证书 ≥ TLS 1.2(禁 SSLv3 / TLS 1.0)
[ ] 证书自动续期(Let's Encrypt / 商业证书都要 monitor)
[ ] 没有 mixed content(curl --silent --location | grep "http://")
```

## 2. Cookie / Session

```
[ ] 会话 cookie 有 HttpOnly + Secure + SameSite
[ ] 会话 cookie 用 __Host- 前缀(SPA 单域)
[ ] Cookie Domain 精确(不滥用 .example.com)
[ ] Max-Age 合理(会话不要永久)
[ ] 登录后重新生成 session ID
[ ] 退出时清 cookie + 后端使 session 失效
[ ] 不存 JWT 在 localStorage(除非接受 XSS 风险)
```

## 3. XSS

```
[ ] React/Vue/Svelte 框架默认 escape,没在生产用 dangerouslySetInnerHTML / v-html / @html(除非过 DOMPurify)
[ ] 富文本输入过 DOMPurify(配 ALLOWED_TAGS / ATTR / URI_REGEXP)
[ ] href / src 校验协议(禁 javascript:、data:)
[ ] target=_blank 配 rel="noopener noreferrer"
[ ] 用户上传 SVG 只用 <img> 嵌入,或 sanitize 后 inline
[ ] 上线 CSP:script-src nonce + strict-dynamic(无 unsafe-inline)
[ ] (可选)启用 Trusted Types:require-trusted-types-for 'script'
[ ] eslint-plugin-react/jsx-no-script-url、no-danger 开启
```

## 4. CSRF

```
[ ] 重要 mutation 接口校验 Origin 白名单
[ ] 重要 mutation 接口需要 CSRF token(double-submit 或 server-issued)
[ ] 会话 cookie SameSite=Lax 或 Strict
[ ] 不用 JSON CSRF 漏洞(API 要求 Content-Type: application/json)
[ ] 高危操作有二次确认(密码 / SMS / WebAuthn)
```

## 5. CORS

```
[ ] Access-Control-Allow-Origin 不是 *(when credentials)
[ ] 没有反射 Origin 头(if (origin) res.set(...) 是反模式)
[ ] preflight 缓存合理(Max-Age 不要太长)
[ ] Allow-Headers / Methods 只列必要
```

## 6. CSP

```
[ ] Content-Security-Policy 头部存在
[ ] script-src 无 unsafe-inline / unsafe-eval
[ ] object-src 'none'
[ ] base-uri 'self'
[ ] frame-ancestors 'none'(或 'self' / 信任域)
[ ] report-uri / report-to 配置,有人看
[ ] csp-evaluator.withgoogle.com 评级 ≥ B
```

## 7. 其他安全头

```
[ ] X-Frame-Options: DENY(老浏览器兼容)
[ ] X-Content-Type-Options: nosniff
[ ] Referrer-Policy: strict-origin-when-cross-origin(或更严)
[ ] Permissions-Policy: 关闭未用的 camera / mic / geo / 等
[ ] Cross-Origin-Opener-Policy: same-origin
[ ] Cross-Origin-Embedder-Policy: require-corp(如需要 SAB)
[ ] Cross-Origin-Resource-Policy: same-origin / same-site
[ ] X-XSS-Protection: 0(关掉,有副作用,CSP 替代)
```

## 8. SRI 与第三方

```
[ ] CDN 加载的 script / stylesheet 有 integrity + crossorigin
[ ] 第三方 CDN URL 带版本号(不是 latest)
[ ] 关键 npm 包能本地化就本地化(自托管 + SRI)
[ ] 第三方 SDK 评估:能 iframe 沙箱化吗?能放子域吗?
[ ] 加载第三方:用 async + defer,不阻塞主流程
```

## 9. URL / 重定向 / 输入

```
[ ] Open redirect 已防御(白名单 URL)
[ ] /redirect?url= 类参数有签名 / 内部 token
[ ] 文件上传:校验类型 / 大小 / MIME 真伪 / 病毒扫描
[ ] 文件名清洗(不让用户控制存储路径,避免 path traversal)
[ ] 文件上传后放在独立域 / CDN,加 Content-Disposition: attachment 防 HTML 渲染
```

## 10. PostMessage / Iframe

```
[ ] window.addEventListener('message') 校验 event.origin
[ ] 校验 event.data 形状(不直接 eval)
[ ] postMessage 不用 '*'
[ ] iframe 用 sandbox + 不同时给 allow-scripts allow-same-origin
[ ] 第三方 iframe 用 referrerpolicy="no-referrer"
```

## 11. Service Worker

```
[ ] SW 注册 updateViaCache: 'none'
[ ] sw.js 路径 = /sw.js(在根)
[ ] SW scope 明确,不是 '/'
[ ] SW 有紧急下线开关(unregister + clear caches)
[ ] SW 不缓存敏感 response(Authorization / Cookie 内容)
[ ] SW 文件名不带 hash(不然客户端永远不更新)
```

## 12. 凭证 / 秘钥

```
[ ] 没有 API key / token 写死在前端代码
[ ] git history 检查没有提交过 .env / *.pem(BFG / git-filter-repo 清理)
[ ] 公开 key(Stripe publishable, Google Maps)限 referer / origin
[ ] CI / CD secret 用平台 secret 管理,不打进 bundle
[ ] secret scanner 在 pre-commit hook(gitleaks / detect-secrets)
[ ] GitHub Repo 开启 secret scanning + push protection
```

## 13. 依赖供应链

```
[ ] package-lock.json / pnpm-lock.yaml 提交到 git
[ ] CI 用 npm ci / pnpm install --frozen-lockfile(严格 lock)
[ ] npm audit / pnpm audit / yarn audit 在 CI(高危当 fail)
[ ] Dependabot / Renovate 开启
[ ] 关键依赖锁精确版(不要 ^ / ~)
[ ] 私包用 scope(@company/foo)+ .npmrc 锁 registry
[ ] CI 用 --ignore-scripts(或 allow-list install scripts)
[ ] 大依赖审计:bundle 内意外的 lib(用 bundle analyzer 看)
```

## 14. 鉴权 / 授权

```
[ ] 不用前端做权限决定(只做 UI 显隐),所有授权后端校验
[ ] 接口能否被未登录 / 低权限调用过(用 anon 重跑一遍核心 flow)
[ ] 鉴权 token 短 TTL + refresh token(refresh 一次性 / 旋转)
[ ] 登录失败有 rate limit + lockout
[ ] 注册 / 改密 / 重置密码有验证码 / SMS / 邮件确认
[ ] 高危操作 step-up auth
```

## 15. 错误处理

```
[ ] 错误页不暴露 stack trace / 框架版本
[ ] 后端 500 返回 errorId,详情记到日志
[ ] 客户端错误上报 Sentry / Datadog,但 PII filter
[ ] 不要把 console.error(error) 留在生产
```

## 16. 日志 / 监控

```
[ ] 不记 password / token / 信用卡 完整号
[ ] 记关键事件:登录、改密、转账、删账号(审计)
[ ] CSP violation 上报有人看
[ ] 异常 spike(404 飙升、登录失败飙升) 有告警
[ ] 安全事件演练(凭证泄露怎么 revoke 全链路 token?)
```

## 17. 移动 / WebView

```
[ ] WebView 不开 allowFileAccess / allowUniversalAccessFromFileURLs(Android 老坑)
[ ] iOS WKWebView 不暴露 native bridge 给未受信任的页面
[ ] App Schema 跳转(myapp://) 校验来源
[ ] Universal Links / App Links 配 .well-known
```

## 18. 隐私

```
[ ] Cookie 同意横幅(GDPR / CCPA)
[ ] 分析 / 追踪 SDK 有 opt-out
[ ] 用户数据存储有保留期(GDPR right to be forgotten)
[ ] 第三方资源(Google Fonts / etc)评估隐私影响
[ ] 默认不收集敏感数据(出生日期 / 地理位置等非必需就不要)
```

## 19. SEO 副作用

```
[ ] robots.txt 不暴露内部路径(/admin / /internal)
[ ] sitemap.xml 不暴露未发布草稿
[ ] 测试环境 noindex,nofollow,且 robots.txt 屏蔽
[ ] 错误页 / 404 不被索引
```

## 20. 部署 / 基础设施

```
[ ] CDN 边缘配安全头(不只是源站配,CDN 可能剥掉)
[ ] WAF 启用(Cloudflare / AWS WAF)
[ ] DDoS 防护(同上)
[ ] 部署有 rollback 机制(< 5 分钟回滚)
[ ] 紧急下线开关(maintenance mode page)
[ ] DNS CAA 记录限制颁发 CA
[ ] DNSSEC(高安全级别)
```

## 21. 团队流程

```
[ ] PR 模板有 security 检查项
[ ] 引入新依赖需 review
[ ] 引入第三方 script 需 architect 批准
[ ] secret 泄露 incident response 文档存在,且每年演练
[ ] 安全 bounty / 漏洞披露邮箱(security@example.com)
[ ] security.txt 在 /.well-known/security.txt
```

## 22. 一键自动化检查

```bash
# 安全头扫描
curl -s https://securityheaders.com/?q=your-site.com&hide=on&followRedirects=on

# CSP 评估
open "https://csp-evaluator.withgoogle.com/?csp=$(curl -sI https://your-site | grep -i csp | head -1)"

# Mozilla Observatory
open "https://observatory.mozilla.org/analyze/your-site.com"

# SSL Labs
open "https://www.ssllabs.com/ssltest/analyze.html?d=your-site.com"

# OWASP ZAP 主动扫
docker run -t ghcr.io/zaproxy/zaproxy zap-baseline.py -t https://your-site.com

# 依赖审计
pnpm audit --audit-level=high
npx better-npm-audit audit
```

## 23. 上线后定期

```
[ ] 每月跑一次完整 checklist
[ ] 每季度 pentest(内部或外部)
[ ] 每半年 secret rotation
[ ] 每年 incident response 演练
[ ] 持续监控 CVE 数据库(关注用到的依赖)
```

---

## 红线(任何一条不过 → 不上线)

1. 没 HTTPS
2. session cookie 没 HttpOnly + Secure
3. 没 CSP(哪怕宽松版)
4. dangerouslySetInnerHTML 渲染未 sanitize 的用户输入
5. CORS 反射 Origin + Credentials
6. 没 CSRF 防御的 state-changing API
7. API key 在前端
8. 没 npm ci / lockfile 锁依赖
9. 没 secret scanning(每次 push)
10. 没 rollback 机制
