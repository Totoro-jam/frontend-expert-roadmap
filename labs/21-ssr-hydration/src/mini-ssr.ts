// 90 行手写一个 React SSR 服务器
// 真懂 renderToString → 才能解释为啥 Next.js 那么复杂

import express from 'express'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { App } from './App'

// =====================================================
// 1. 基础 SSR(同步 renderToString)
// =====================================================
const app = express()
app.use(express.static('dist/client'))           // 客户端 bundle

app.get('*', async (req, res) => {
  try {
    // 1. 数据获取(SSR 关键:数据要在 render 之前拿到)
    const data = await fetchInitialData(req.path)

    // 2. 渲染 HTML
    const appHtml = renderToString(
      <StaticRouter location={req.url}>
        <App initialData={data} />
      </StaticRouter>,
    )

    // 3. 把 state 序列化进 HTML(避免客户端重复请求)
    const stateScript = `<script>window.__INITIAL_DATA__ = ${
      JSON.stringify(data).replace(/</g, '\\u003c')           // XSS 防护!
    }</script>`

    // 4. 拼模板
    res.send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${data.title ?? 'App'}</title>
  <meta name="description" content="${escapeHtml(data.description ?? '')}" />
  <link rel="stylesheet" href="/assets/index.css" />
</head>
<body>
  <div id="root">${appHtml}</div>
  ${stateScript}
  <script type="module" src="/assets/index.js"></script>
</body>
</html>`)
  } catch (e) {
    console.error(e)
    res.status(500).send('Internal Server Error')
  }
})

app.listen(3000)

// =====================================================
// 2. 客户端 hydrate
// =====================================================
/*
// entry-client.tsx
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

hydrateRoot(
  document.getElementById('root')!,
  <BrowserRouter>
    <App initialData={(window as any).__INITIAL_DATA__} />
  </BrowserRouter>,
)
*/

// =====================================================
// 3. XSS 防护(关键!)
// =====================================================
function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// JSON.stringify 后还要替换 < / > / & 为 unicode escape
// 否则 user 输入 </script><script>恶意代码</script> 会注入
function safeJson(data: any): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/ /g, '\\u2028')
    .replace(/ /g, '\\u2029')
}

// =====================================================
// 4. 数据获取(简化版,无 Suspense)
// =====================================================
async function fetchInitialData(path: string) {
  // 路由匹配 → 调对应 API
  if (path.startsWith('/products')) {
    const list = await fetch('http://api.internal/products').then(r => r.json())
    return { type: 'products', list, title: '产品' }
  }
  return { type: 'home', title: '首页' }
}

// =====================================================
// 5. 真实 SSR 还要处理的:
// =====================================================
//
// 1. 错误边界:服务端 catch + 渲染 500 页 + 上报
// 2. 超时:renderToString 超过 X ms 直接 fallback 到 CSR(避免拖垮服务器)
// 3. 缓存:LRU 按 URL 缓存渲染结果(配 CDN)
// 4. ETag / Last-Modified:让 CDN 304
// 5. 流式:对慢路由用 renderToPipeableStream(见 streaming-ssr.ts)
// 6. 头部注入:Helmet / 自定义 head manager 收集 title / meta
// 7. CSS-in-JS:Styled-Components 用 ServerStyleSheet,Emotion 用 createCache
// 8. cookies / auth:服务端读 req.cookies,传 user 给组件
// 9. CSR 降级:?_csr=1 时直接发 SPA 模板,跳过 SSR(运维 escape hatch)
// 10. ISR:文件系统缓存 + revalidate timer(Next.js 做了,框架级)

// =====================================================
// 6. 性能数字(对比 CSR / SSR / SSG)
// =====================================================
//
// 移动 3G + 中端机:
//
// CSR:
//   TTFB 200ms + JS 下载 1500ms + parse 300ms + render 200ms + API 300ms + render 100ms
//   FCP ≈ 2600ms,LCP ≈ 2700ms
//
// SSR(同步):
//   TTFB 500ms (服务器 fetch + render) + parse HTML 50ms
//   FCP ≈ 550ms,LCP ≈ 600ms
//   TTI ≈ FCP + JS 下载 1500ms + hydrate 800ms = 2900ms  ← hydration tax!
//
// Streaming SSR + Suspense:
//   FCP 200ms(shell 立刻发)
//   后续内容流式补
//
// SSG:
//   TTFB 50ms(CDN)
//   FCP 100ms
//   仍有 hydration tax
//
// RSC + Streaming:
//   FCP 200ms,且大部分 JS 不发到客户端,TTI 也快

export {}
