// React 18 Streaming SSR + Suspense + selective hydration
// 让快内容立刻显示,慢内容流式补,bundle 不阻塞

import express from 'express'
import { renderToPipeableStream } from 'react-dom/server'
import { Suspense } from 'react'

// =====================================================
// 1. 流式 SSR 服务器
// =====================================================
const app = express()

app.get('*', (req, res) => {
  let didError = false

  const { pipe, abort } = renderToPipeableStream(<App url={req.url} />, {
    // 客户端入口(可多个,Next 用一个 entry)
    bootstrapScripts: ['/app.js'],

    // bootstrapModules 用 ESM 也行
    // bootstrapModules: ['/app.mjs'],

    // 注入序列化数据(window.__INITIAL__ = {...})
    bootstrapScriptContent: `window.__SSR__=true`,

    // ===== shell 完成回调:HTML 头 + <body><div id=root> 部分已经渲完
    // 在这之前还在等顶层 Suspense fallback,suspense 边界没卡住的部分
    onShellReady() {
      // shell 就绪 → 立刻发头
      res.statusCode = didError ? 500 : 200
      res.setHeader('content-type', 'text/html')
      pipe(res)
    },

    // ===== 整棵树完成(所有 Suspense 都渲完)
    onAllReady() {
      // 大部分情况下我们已经在 onShellReady 时 pipe 了
      // 这里适合做日志 / 关闭 DB connection
    },

    // ===== 出错(在 shell 就出错时上 500)
    onShellError(err) {
      console.error('[ssr] shell error', err)
      res.statusCode = 500
      res.setHeader('content-type', 'text/html')
      res.send(`<!doctype html><p>Internal error. Please refresh.</p>`)
    },

    // ===== 流过程出错(已经 pipe 出去,只能记日志)
    onError(err) {
      didError = true
      console.error('[ssr] error', err)
    },
  })

  // 超时保护:6s 没渲完直接 abort
  setTimeout(() => abort(), 6000)
})

// =====================================================
// 2. 组件:用 Suspense 切分边界
// =====================================================
function App({ url }: { url: string }) {
  return (
    <html>
      <head>
        <title>Streaming Demo</title>
      </head>
      <body>
        <div id="root">
          <Header />                                  {/* 立刻在 shell 里渲 */}

          <Suspense fallback={<Skeleton label="正在加载主内容" />}>
            <MainContent url={url} />                 {/* 慢:等 API */}
          </Suspense>

          <Suspense fallback={<Skeleton label="加载推荐" />}>
            <Recommendations />                       {/* 更慢 */}
          </Suspense>

          <Footer />
        </div>
      </body>
    </html>
  )
}

// =====================================================
// 3. 异步组件(数据)
// =====================================================
async function MainContent({ url }: { url: string }) {
  // React 19+ async component 支持,18 用 use(promise)
  const data = await fetchData(url)
  return <article>{data.html}</article>
}

async function fetchData(url: string) {
  // 真实场景:DB / API
  await new Promise(r => setTimeout(r, 800))
  return { html: 'real content for ' + url }
}

// =====================================================
// 4. 客户端 hydrate(自动 streaming-aware)
// =====================================================
/*
import { hydrateRoot } from 'react-dom/client'
import { startTransition } from 'react'

startTransition(() => {
  hydrateRoot(document, <App url={location.pathname} />)
})
*/

// React 自动:
//   - 边收 HTML 边构建本地 fiber 树
//   - selective hydration:用户先点的部分先 hydrate
//   - 慢的 Suspense 区域单独 hydrate,不阻塞已就绪的

// =====================================================
// 5. 浏览器收到的实际字节
// =====================================================
//
//   [t=0]   GET /
//   [t=50]  TCP/TLS 握手完
//   [t=200] 服务器开始 pipe → 浏览器收到:
//
//           <!doctype html>
//           <html><head>...</head><body><div id=root>
//             <header>...</header>
//             <template id="B:0"><div>正在加载主内容</div></template>
//             <template id="B:1"><div>加载推荐</div></template>
//             <footer>...</footer>
//           </div><script src=/app.js></script>
//
//   [t=200] 浏览器开始渲染骨架 → FCP!
//
//   [t=800] 服务器 fetchData 完,流出真内容:
//
//           <div hidden id="S:0"><article>真内容</article></div>
//           <script>$RC("B:0","S:0")</script>     ← 浏览器执行,替换骨架
//
//   [t=1500] 推荐也完了,同样的替换
//
//   →→ FCP ≈ 200ms,完整内容 ≈ 1500ms,但用户体验「秒开」

// =====================================================
// 6. 何时不该用 Streaming
// =====================================================
//
// - 几乎所有内容都是同步的:Streaming 开销大于收益
// - 服务端 cache 命中率高(整页缓存):静态文件更快
// - 数据量极小:同步 SSR 更简单
//
// 何时该:
//
// - 页面里有「关键 + 次要」分区,次要等 API
// - 第三方 SDK 集成(那些慢 API 不想阻塞首屏)
// - dashboard / feed / 商品页有评论 / 推荐

// =====================================================
// 7. 框架内置(避免手写)
// =====================================================
//
// - Next.js App Router:loading.tsx / Suspense 自动 streaming
// - Remix:已支持 (deferred loader)
// - Nuxt 3:useFetch + <Suspense>
// - SvelteKit:streamed { promise } in loader

// =====================================================
// 8. 性能监控
// =====================================================
//
// 关注指标:
//   - TTFB(服务端开始 pipe 多久)
//   - FCP(shell 到达浏览器多久)
//   - 每个 Suspense 边界 reveal 时间
//   - Total render time
//
// Next.js 内置 metrics export:
//   export function reportWebVitals(metric) {
//     if (metric.name === 'TTFB') ...
//   }

declare function Header(): JSX.Element
declare function Footer(): JSX.Element
declare function Recommendations(): Promise<JSX.Element>
declare function Skeleton({ label }: { label: string }): JSX.Element

export {}
