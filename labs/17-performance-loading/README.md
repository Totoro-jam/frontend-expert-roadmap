# 17 · Performance · Loading Lab

> 首屏加载是「3 秒内必须打开」的硬指标。
> Bundle 大小、关键路径、图片字体、CDN、SSR、Service Worker 全都决定它。

(配套 [16-performance-runtime-lab/](../16-performance-runtime-lab/) 处理「运行时性能」。)

---

## 学这个能干什么

- 拆出真正的 Critical Path,把 LCP 砍到 1.5s 以下
- bundle 从 500KB → 150KB:tree shaking + code splitting + 重依赖替换
- 图片:WebP / AVIF / responsive / lazy / blur placeholder 全套
- 字体:FOIT/FOUT 不再出现,font-display 用对
- 利用 prefetch / preload / preconnect / dns-prefetch 提前一步
- Service Worker 离线缓存 + 网络优化策略

---

## Roadmap

### 1. Loading Web Vitals

- **LCP** (Largest Contentful Paint):最大内容渲染 < 2.5s
- **FCP** (First Contentful Paint):首字节渲染 < 1.8s
- **TTFB** (Time to First Byte):服务器响应 < 0.8s
- **TBT** (Total Blocking Time):见 [runtime lab](../16-performance-runtime-lab/)

### 2. Critical Rendering Path

```
HTML 解析
  ├── 遇 <link rel="stylesheet"> → 等 CSS 才能 layout(render-blocking)
  ├── 遇 <script src> → 同步等待执行(render-blocking)
  ├── 遇 <script async> → 异步,下载完立即执行(可能打断 HTML 解析)
  └── 遇 <script defer> → 异步下载,DOM 完成后按顺序执行(最安全)
```

**优化原则**:
- CSS 越早越小越好
- JS 用 `defer`(默认值不对!)
- 关键 CSS 内联 `<style>`,其余 `<link>` async-style

```html
<!-- ✅ 现代套路 -->
<head>
  <style>/* critical CSS,< 14KB */</style>
  <link rel="preload" href="/main.css" as="style"
        onload="this.onload=null;this.rel='stylesheet'">

  <link rel="preconnect" href="https://api.example.com">
  <link rel="dns-prefetch" href="//cdn.example.com">

  <link rel="modulepreload" href="/app.js">
  <script type="module" src="/app.js"></script>
</head>
```

### 3. Resource Hints

| 标签 | 作用 | 优先级 |
|---|---|---|
| `dns-prefetch` | DNS 预解析 | 最低 |
| `preconnect` | DNS + TCP + TLS | 中 |
| `preload` | 立即下载(本页要用) | 最高 |
| `prefetch` | 闲时下载(下一页用) | 低 |
| `modulepreload` | ESM module 预加载 + 解析 | 高 |
| `prerender` | 整页面预渲染(谨慎) | — |

⚠️ **滥用 preload 会拖慢 LCP**:每个 preload 抢带宽,LCP 资源反而排队后面。原则:< 5 个,且必须是 critical 资源。

### 4. Bundle 减肥

#### 4.1 看体积
```sh
npx vite build && npx rollup-plugin-visualizer dist/
# 或
npx source-map-explorer 'build/static/js/*.js'
# 或
npx bundle-buddy stats.json
```

#### 4.2 找元凶
1. `bundlephobia.com` 查每个依赖体积
2. 检查 moment.js → 换 `date-fns` / `dayjs`(2KB)
3. lodash → `lodash-es` + tree shaking,或单函数 import
4. 图标库:Material UI / antd icons 全引 = 数百 KB → 按需引入

#### 4.3 替换重依赖

| 替代 | 推荐 | 体积节省 |
|---|---|---|
| moment | dayjs / date-fns | 70 KB → 6 KB |
| lodash | lodash-es / radash | 70 KB → 1-5 KB |
| Day.js / date-fns | 自己写 if 需要 5 个函数 | 6 KB → 0.5 KB |
| jQuery | 现代原生 | 90 KB → 0 |
| axios | ky / 原生 fetch | 33 KB → 5 KB / 0 |
| Chart.js | uPlot / Plotly slim | 250 KB → 40 KB |

### 5. Code Splitting

```ts
// 1. 路由级
const Settings = lazy(() => import('./pages/Settings'))

// 2. 弹窗级(用户点了再加载)
const onClickHelp = () => {
  import('./HelpModal').then(({ HelpModal }) => {
    // 渲染
  })
}

// 3. 第三方库级(只在用到的页面加载)
const onExport = async () => {
  const { saveAs } = await import('file-saver')
  saveAs(blob, 'file.csv')
}

// 4. 预测性加载:hover 链接时加载该路由
function Link({ to, children }) {
  return (
    <a href={to} onMouseEnter={() => preloadRoute(to)}>
      {children}
    </a>
  )
}
```

### 6. 图片优化(LCP 的头号杀手)

```html
<!-- ✅ 现代图片标签 -->
<picture>
  <source type="image/avif" srcset="/hero.avif">
  <source type="image/webp" srcset="/hero.webp">
  <img
    src="/hero.jpg"
    width="800" height="400"     <!-- 必须!避免 CLS -->
    alt="Hero"
    loading="lazy"                 <!-- 屏外延迟加载 -->
    decoding="async"
    fetchpriority="high"          <!-- LCP 图加这个 -->
  >
</picture>

<!-- ✅ responsive -->
<img
  srcset="/hero-400.webp 400w,
          /hero-800.webp 800w,
          /hero-1600.webp 1600w"
  sizes="(max-width: 600px) 100vw, 50vw"
  src="/hero-800.webp"
  alt="Hero"
>
```

**关键点**:
- AVIF > WebP > JPEG(体积 / 质量)
- LCP 图必须 `fetchpriority="high"`,不能 `loading="lazy"`
- 写 `width / height` 防 CLS
- 占位:LQIP(Low Quality Image Placeholder)/ BlurHash / dominant color

工具:`squoosh.app` / `sharp` / Next.js Image 组件 / Cloudinary / Imgix

### 7. 字体优化

```css
@font-face {
  font-family: 'Inter';
  src: url('/Inter.woff2') format('woff2');
  font-display: swap;             /* 立即用 fallback,字体好了再切 */
  unicode-range: U+0000-00FF;     /* 只载基础拉丁 → 体积砍 80% */
  font-weight: 100 900;            /* variable font,一份文件全权重 */
}
```

**font-display 取值**:
- `block`:3s 内不显示文字 → FOIT(不推荐)
- `swap`:立即 fallback,后切真字体 → FOUT(默认推荐)
- `fallback`:100ms block,3s 内可换;否则用 fallback
- `optional`:100ms 没好就用 fallback,本次不切

```html
<link rel="preload" href="/Inter.woff2" as="font" type="font/woff2" crossorigin>
```

Variable font(2024+):一个文件覆盖所有 weight / italic / width → 比传统 5 文件小。

### 8. CDN & HTTP

#### Cache-Control(immutable 杀器)
```
Cache-Control: public, max-age=31536000, immutable
```
配合文件名 hash,浏览器一年不再请求。

#### HTTP/2 / HTTP/3
- 多路复用 → 不用合并文件 / 不用 sprites
- HTTP/3(QUIC)→ 0-RTT,首屏更快(弱网尤其明显)

#### Brotli > gzip
```
Content-Encoding: br
```
比 gzip 小 15-20%。Nginx / CDN 都支持。

#### Early Hints (`103 Early Hints`)
```
HTTP/1.1 103 Early Hints
Link: </style.css>; rel=preload; as=style

HTTP/1.1 200 OK
...
```
服务器还在算 HTML 时,先告诉浏览器「赶紧下这俩资源」。Cloudflare / Fastly 支持。

### 9. Service Worker:第二次访问即时

```js
// sw.js(简化)
const CACHE = 'app-v1'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/main.css', '/main.js'])))
})

self.addEventListener('fetch', e => {
  // 文档:network first,缓存兜底
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/')),
    )
    return
  }
  // 静态资源:cache first(version 在文件名 hash 里)
  e.respondWith(caches.match(e.request).then(r => r ?? fetch(e.request)))
})
```

工具:[Workbox](https://developer.chrome.com/docs/workbox)(Google,5 种内置策略)

### 10. SSR / SSG / ISR / RSC(LCP 神器)

| | LCP | 交互延迟 | server 成本 |
|---|---|---|---|
| CSR(纯 SPA) | 慢(等 JS) | 中 | 低 |
| SSR(传统) | 快 | 慢(hydration) | 高 |
| SSG(静态) | 最快 | 中 | 0 |
| ISR(Next.js) | 快 | 中 | 中(按需) |
| RSC + Streaming | 最快 | 快 | 中 |

详见 [21-ssr-hydration-lab/](../21-ssr-hydration-lab/)。

### 11. Lighthouse / PSI / WebPageTest

```sh
# CLI
npx lighthouse https://example.com --view --preset=desktop

# CI 集成
- uses: treosh/lighthouse-ci-action@v10
  with:
    urls: |
      https://example.com
      https://example.com/about
    budgetPath: ./budget.json
    uploadArtifacts: true
```

budget.json:
```json
[{
  "path": "/*",
  "timings": [{ "metric": "interactive", "budget": 3000 }],
  "resourceSizes": [
    { "resourceType": "script", "budget": 150 },
    { "resourceType": "total", "budget": 500 }
  ]
}]
```

PR 自动 fail 如果超 budget。

### 12. 性能预算清单

| 资源 | 移动 3G 预算 | 桌面预算 |
|---|---|---|
| 总下载 | < 500 KB | < 1.5 MB |
| JS | < 170 KB | < 500 KB |
| CSS | < 50 KB | < 100 KB |
| 图片(首屏) | < 200 KB | < 500 KB |
| 字体 | < 100 KB | < 200 KB |
| LCP | < 2.5s | < 1.5s |
| INP | < 200ms | < 200ms |
| CLS | < 0.1 | < 0.1 |

---

## src/ & demos/

| 文件 | 主题 |
|---|---|
| [demos/lazy-images.html](demos/lazy-images.html) | 5 种图片加载策略对比 |
| [demos/resource-hints.html](demos/resource-hints.html) | preload/prefetch/preconnect 演示 |
| [src/sw-strategies.js](src/sw-strategies.js) | 5 种 Service Worker 缓存策略 |
| [src/perf-budget.json](src/perf-budget.json) | Lighthouse CI 预算模板 |
| [src/bundle-analysis-guide.md](src/bundle-analysis-guide.md) | 如何看 bundle 分析报告 |

---

## 资源

- [web.dev/fast](https://web.dev/fast/)
- [Critical CSS extractor](https://github.com/addyosmani/critical)
- [Squoosh](https://squoosh.app/) — 图片压缩(GUI + CLI)
- [Workbox](https://developer.chrome.com/docs/workbox)
- [WebPageTest](https://www.webpagetest.org/) — 比 Lighthouse 更精确
- [Calibre](https://calibreapp.com/) — 商业 RUM + Lighthouse 监控
