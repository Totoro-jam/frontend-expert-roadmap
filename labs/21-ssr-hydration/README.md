# 21 · SSR / Hydration / Islands / RSC Lab

> SPA 「白屏 2 秒」时代过去了,2024+ 选 SSR/SSG/ISR/RSC 是必修。
> 但 hydration 是大坑,Islands 和 RSC 是新解。
> 这里把所有渲染范式扒一遍。

---

## 学这个能干什么

- 真懂 CSR / SSR / SSG / ISR / RSC / Islands / Streaming SSR 的内在差异
- 解 hydration mismatch / hydration 慢 / hydration 把 JS bundle 撑爆
- 用 Next.js / Nuxt / Astro / SvelteKit / Remix / SolidStart / Qwik 各自适合的场景
- 写自己的 mini-SSR 知道原理(renderToString / renderToPipeableStream)
- React Server Components 真正在做什么(不是「服务端组件」那么简单)
- Partial / Resumable hydration 是怎么把 JS 量砍到 1/10 的

---

## Roadmap

### 1. 七大渲染范式

| 范式 | 啥意思 | 首屏 | TTI | SEO | 服务器 | 代表 |
|---|---|---|---|---|---|---|
| **CSR** | 浏览器跑全部 | 慢 | 中 | 差 | 0 | 经典 SPA |
| **SSR** | 服务端跑一遍,HTML 输出,客户端再 hydrate | 快 | 慢 | 优 | 高 | Next Pages, Nuxt 2 |
| **SSG** | build 时跑出 HTML | 最快 | 中 | 优 | 0 | Gatsby, 11ty, Astro |
| **ISR** | SSG + 定时 revalidate | 最快 | 中 | 优 | 中 | Next, Nuxt |
| **Streaming SSR** | 边渲边发,Suspense 边界各自 hydrate | 极快 FCP | 中 | 优 | 高 | Next App Router |
| **Islands** | 静态 HTML,只 hydrate 几个交互"岛屿" | 最快 | 极快 | 优 | 低 | Astro, Marko, Fresh |
| **RSC** | Server Components 不发 JS,Client Components 才发 | 最快 | 极快 | 优 | 高 | Next App Router, Waku |
| **Resumable** | 完全不 hydrate,从 SSR 状态接着跑 | 极快 | 0(!) | 优 | 高 | Qwik |

### 2. CSR 的问题(为啥要 SSR)

```
浏览器 GET /
  ↓
返回空 HTML + <script src="bundle.js">
  ↓
下载 500KB JS(3G:1.5s)
  ↓
parse + compile(中端机:300ms)
  ↓
执行 React render(200ms)
  ↓
fetch API(网络:300ms)
  ↓
render with data(100ms)
  ↓
看到第一帧 ~2.5s
```

**SSR 让首屏 0.5s**:服务器先跑完渲染,HTML 里已经有内容。

### 3. SSR 工作流程

```
                 [浏览器]                     [服务器]
                    │                            │
   GET /            ├───────────────────────────>│
                    │                            │
                    │              renderToString(<App />)
                    │                  fetch data
                    │                  build full HTML
                    │                            │
                    │<───────────────────────────┤
   Paint HTML       │  HTML + serialized state    │
   (Time to FCP)    │                            │
                    │                            │
   Load JS bundle   │  (parallel)                │
                    │                            │
   hydrate(<App/>)  │                            │
   ↓ TTI            │                            │
   Bind events       │                            │
```

### 4. Hydration 是什么 + 为啥慢

```ts
// 服务器
const html = renderToString(<App />)
res.send(`<!doctype html><div id="root">${html}</div><script src="/app.js">`)

// 客户端
hydrateRoot(document.getElementById('root'), <App />)
```

`hydrate` 不是重新渲染,是「**把已有 DOM 和 React VirtualDOM 对齐,挂事件**」。

**问题**:
- React 必须把整个组件树跑一遍才知道挂哪些事件 → CPU 密集
- 不能流式:JS bundle 必须全下完才能开始
- bundle 大 → JS 解析慢 → TTI 仍然差
- 不能用 `useState` 之外的初值 → mismatch warning

### 5. Hydration mismatch:最常见 5 个 bug

| 原因 | 修法 |
|---|---|
| `Date.now()` / `Math.random()` | 改成 `useEffect` 或 `useSyncExternalStore` |
| `window.x` / `localStorage` | `if (typeof window === 'undefined')` 或 `useLayoutEffect` |
| 浏览器扩展插入 DOM | 加 `suppressHydrationWarning` |
| 时区不同 | 服务端用 UTC,客户端 effect 内转本地 |
| 第三方脚本异步插入 | 用 `<script async>` 而不是 inline render |

```tsx
// ✅ 标准模式
function ClientOnly({ children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return children
}
```

### 6. Streaming SSR(React 18+)

```ts
import { renderToPipeableStream } from 'react-dom/server'

const { pipe } = renderToPipeableStream(<App />, {
  bootstrapScripts: ['/app.js'],
  onShellReady() {
    res.setHeader('content-type', 'text/html')
    pipe(res)                    // ← 立刻开始流,头部就发了
  },
  onError(err) { console.error(err) },
})
```

Suspense 边界自动分块:
```tsx
<>
  <Header />                                    {/* 立刻发 */}
  <Suspense fallback={<Sk/>}>
    <SlowSection />                              {/* 等数据,先发 fallback,数据来了再发真内容 */}
  </Suspense>
</>
```

浏览器收到:
```html
<header>...</header>
<div data-sk>骨架</div>                          ← 立刻显示
... 然后流过来 ...
<script>$RC('sk', 'real')</script>               ← 真内容到了,替换
<div hidden id="real">真内容</div>
```

**好处**:慢 API 不阻塞快内容,FCP 飞快。

### 7. Islands(Astro / Fresh / Marko)

```astro
---
import Counter from '../components/Counter.tsx'
const products = await db.fetchProducts()
---
<html>
<body>
  <h1>Shop</h1>
  {products.map(p => <p>{p.name}</p>)}      <!-- 静态 HTML,0 JS -->

  <Counter client:load />                    <!-- 只有这个 hydrate -->
  <Reviews client:visible />                 <!-- 滚到视野才 hydrate -->
  <Cart client:idle />                       <!-- 浏览器闲时 hydrate -->
</body>
</html>
```

**bundle 减少 90%**:页面 0 JS,只下载岛屿组件代码。

**Astro 是 2024 最热门内容站方案**(blog / docs / marketing site)。

### 8. React Server Components(RSC)

```tsx
// app/page.tsx — 默认 Server Component(不发 JS!)
async function Page() {
  const posts = await db.fetchPosts()      // 直接服务端访问 DB
  return (
    <div>
      <h1>Blog</h1>
      {posts.map(p => <Post key={p.id} post={p} />)}
      <Like postId={posts[0].id} />        {/* 这个是 client component */}
    </div>
  )
}

// app/Like.tsx
'use client'                                {/* 这个文件及其 import 链才发到客户端 */}
import { useState } from 'react'
function Like({ postId }) {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n+1)}>{n} ♥</button>
}
```

**与传统 SSR 区别**:
- 传统 SSR:整棵树服务端跑一遍 + 客户端再跑一遍(2x)
- RSC:Server Components 永不到客户端,Client Components 客户端跑

**bundle 减小**:Markdown 解析、图表库等只在服务端跑,客户端 0 KB。

**接力机制**(serialization):
```
Server → wire format(JSON-ish)→ Client renderer
```
不是 HTML,是「序列化的 React 树」,可以重用 client component 实例。

详见 [src/rsc-explainer.md](src/rsc-explainer.md)。

### 9. Resumability(Qwik)

```tsx
// Qwik 不 hydrate,而是「resume」
export default component$(() => {
  const count = useSignal(0)                    // 状态序列化进 HTML
  return <button onClick$={() => count.value++}>{count.value}</button>
})
```

HTML 里包含序列化的事件 listener + state pointer。
点击时:
1. 浏览器 fetch 该 handler 的 chunk
2. 反序列化 state
3. 直接执行

**优势**:启动 0 JS,真正只为用户交互下载。
**劣势**:生态小,debug 难,不是所有库都 resumability-friendly。

### 10. 框架矩阵

| 框架 | 范式 | 数据获取 | 部署 | 适合 |
|---|---|---|---|---|
| **Next.js (App)** | RSC + SSR + ISR | Server Components / fetch | Vercel / Node | 大中型 React 项目 |
| **Next.js (Pages)** | SSR / SSG / ISR | getServerSideProps / getStaticProps | 同上 | 老项目 |
| **Nuxt 3** | SSR / SSG / Islands | useFetch / useAsyncData | 任意 Node | 中型 Vue |
| **Remix** | SSR + nested routes | loader / action | 任意 | Web fundamentals 派 |
| **SvelteKit** | SSR / SSG / SPA | load function | 任意 | 中小 Svelte |
| **SolidStart** | SSR | resource / action | 任意 | Solid 爱好者 |
| **Astro** | Islands / SSG | front-matter / RSC | 静态 / SSR | 内容站 / 博客 / docs |
| **Qwik (City)** | Resumable | routeLoader$ / server$ | 任意 | 性能极致项目 |
| **Fresh (Deno)** | Islands | handlers | Deno Deploy | Deno 派 |
| **Marko** | Islands (eBay) | (业务用) | Node | 老牌内容站 |

### 11. 部署形态

```
┌───────────────────────────────────────────────────┐
│  Edge Functions (Vercel/CF Workers/Netlify)       │  最快 LCP,有限计算
│  └ Next.js Edge runtime / Qwik / Astro            │
├───────────────────────────────────────────────────┤
│  Node Server (Fly.io/Render/Railway/Lambda)       │  完整 Node API
│  └ Next.js Node / Remix / Nuxt / SvelteKit Node   │
├───────────────────────────────────────────────────┤
│  Static (S3/CF Pages/Vercel/Netlify)              │  零成本
│  └ Astro / SSG / Next.js export                   │
└───────────────────────────────────────────────────┘
```

**ISR**:静态文件 + 后台定时 revalidate(Next.js / Nuxt 都支持)。

### 12. SEO 注意

- SSR/SSG → 爬虫看到内容,完美
- CSR → Googlebot 跑 JS(慢且不稳),其他爬虫不跑
- 必备:`<title>` / `meta description` / Open Graph / Twitter Card / canonical / sitemap.xml / robots.txt / structured data (JSON-LD)
- 验证:Google Search Console / `curl -A Googlebot` 看响应

### 13. SEO + i18n

- 路径策略:`/en/about`, `/zh/about`(推荐)/ `?lang=en` / `Accept-Language` 重定向
- `hreflang` 链接告诉 Google 多语言版本
- 不同语言有不同 sitemap

---

## src/ 索引

| 文件 | 主题 |
|---|---|
| [src/mini-ssr.ts](src/mini-ssr.ts) | 90 行手写 SSR server,搞懂 renderToString |
| [src/streaming-ssr.ts](src/streaming-ssr.ts) | React 18 renderToPipeableStream 完整 demo |
| [src/hydration-fix.tsx](src/hydration-fix.tsx) | 5 种 hydration mismatch 修法 |
| [src/rsc-explainer.md](src/rsc-explainer.md) | RSC 工作原理深度解读 |
| [src/next-app-patterns.tsx](src/next-app-patterns.tsx) | Next App Router 实战模式 |
| [examples/seo-checklist.md](examples/seo-checklist.md) | SEO 落地清单 |

---

## 资源

- [React Server Components RFC](https://github.com/reactjs/rfcs/pull/188)
- [Patterns for Building JavaScript Websites in 2022 (Jason Miller)](https://jasonformat.com/application-holotypes/)
- [Hydration is Pure Overhead](https://www.builder.io/blog/hydration-is-pure-overhead) — Qwik 团队
- [Astro Islands](https://docs.astro.build/en/concepts/islands/)
- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Remix Philosophy](https://remix.run/docs/en/main/discussion/data-flow)
- [Qwik Docs](https://qwik.dev/)
- [HTTP 103 Early Hints](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/103)
