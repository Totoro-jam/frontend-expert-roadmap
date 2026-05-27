# SEO 落地清单

> SEO ≠ 关键词堆砌。
> SEO = 让搜索引擎和社交平台「看懂」你的页面 + 让用户在结果里「想点」你。
> 技术层面 100 分,内容 0 分 → 还是没排名。但技术层面不及格 → 内容再好也排不上。

---

## 0. 优先级(按 ROI 排序)

| 项 | 重要性 | 工作量 |
|---|---|---|
| HTML 内容可爬(SSR/SSG) | ★★★★★ | 看技术栈 |
| `<title>` + `<meta description>` | ★★★★★ | 低 |
| 移动友好 + Core Web Vitals | ★★★★★ | 中 |
| 结构化数据 JSON-LD | ★★★★ | 低 |
| Open Graph / Twitter Card | ★★★★ | 低 |
| sitemap.xml + robots.txt | ★★★★ | 低 |
| canonical | ★★★★ | 低 |
| 内部链接 / 锚文本 | ★★★ | 中 |
| 多语言 hreflang | ★★★(国际化才需要) | 中 |
| 图片 alt + 文件名 | ★★★ | 低 |
| 301 重定向(旧 URL) | ★★★ | 低 |

---

## 1. 内容必须能被爬

**核心问题**:Googlebot 跑 JS 吗?
- 答:**会跑**,但慢、不稳、有 budget。
- 其他爬虫(BingBot / 国内搜索 / Twitter / Facebook / WeChat)**大部分不跑 JS**。

**结论**:
- 纯 CSR 是 SEO 死刑
- 必须 SSR / SSG / RSC / Prerender(预渲染 / Rendertron)

### 验证
```bash
# 看页面给 Googlebot 的实际内容
curl -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  https://your-site.com/page

# 在 Google Search Console → URL Inspection → "Test Live URL"
```

---

## 2. `<title>` 和 `<meta description>`

```html
<head>
  <title>商品名 - 类目 - 品牌</title>            <!-- ≤ 60 字符 -->
  <meta name="description" content="..." />     <!-- ≤ 160 字符,有 CTA -->
</head>
```

### 写法
- title 模板: `{主关键词} - {次关键词} - {品牌}`
- 每页**独一无二**(不要复用首页 title)
- description 给用户读,不为搜索引擎写
- 别填充关键词("最好 最便宜 最快" 这种 → 反作用)

### Next.js
```tsx
// metadata 静态
export const metadata = {
  title: { template: '%s | My Site', default: 'My Site' },
  description: '...',
}

// 或动态
export async function generateMetadata({ params }) {
  const post = await fetchPost(params.slug)
  return { title: post.title, description: post.excerpt }
}
```

---

## 3. Core Web Vitals(2026 仍是排名因子)

| 指标 | 好 | 需改进 | 差 |
|---|---|---|---|
| **LCP**(最大内容渲染) | < 2.5s | 2.5-4s | > 4s |
| **INP**(交互到下一帧) | < 200ms | 200-500ms | > 500ms |
| **CLS**(累积布局偏移) | < 0.1 | 0.1-0.25 | > 0.25 |

### LCP 优化
- 服务端 / 静态渲染主图
- `<img priority fetchpriority="high">`
- preload 关键 LCP 资源
- Edge / CDN 减 TTFB

### INP 优化
- 重 JS 拆 chunk + lazy
- 长任务拆 `requestIdleCallback` / `scheduler.yield()`
- 别在事件里同步跑大计算 — 推 Web Worker
- React 用 useTransition / startTransition 让 input 优先

### CLS 优化
- 所有 `<img>` 必填 width/height(或 aspect-ratio)
- 字体 `font-display: optional` 或 swap + size-adjust
- 别在已有内容上方插 banner / cookie 提示
- Skeleton 占位预留高度

### 监控
```js
// web-vitals 库直接上报
import { onLCP, onINP, onCLS } from 'web-vitals'
onLCP(m => navigator.sendBeacon('/vitals', JSON.stringify(m)))
onINP(m => navigator.sendBeacon('/vitals', JSON.stringify(m)))
onCLS(m => navigator.sendBeacon('/vitals', JSON.stringify(m)))
```

---

## 4. 结构化数据(Schema.org JSON-LD)

让搜索结果显示「富片段」(评分星、价格、面包屑、活动时间...)。

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "iPhone 17 Pro",
  "image": "https://...png",
  "description": "...",
  "brand": { "@type": "Brand", "name": "Apple" },
  "offers": {
    "@type": "Offer",
    "url": "https://...",
    "priceCurrency": "USD",
    "price": "999",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "reviewCount": "12340"
  }
}
</script>
```

### 常用类型
- `Article` / `BlogPosting` — 博客文章
- `Product` + `Offer` — 商品
- `Recipe` — 菜谱
- `BreadcrumbList` — 面包屑
- `FAQPage` — FAQ
- `Organization` / `LocalBusiness` — 主页
- `VideoObject` — 视频
- `Event` — 活动
- `Course` — 课程

### 验证
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema.org Validator](https://validator.schema.org/)

---

## 5. Open Graph + Twitter Card

```html
<head>
  <!-- Open Graph(Facebook / WeChat / 大部分 IM 用) -->
  <meta property="og:title" content="..." />
  <meta property="og:description" content="..." />
  <meta property="og:image" content="https://.../og.jpg" />   <!-- 1200×630 -->
  <meta property="og:url" content="https://..." />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="My Site" />
  <meta property="og:locale" content="zh_CN" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="..." />
  <meta name="twitter:description" content="..." />
  <meta name="twitter:image" content="https://..." />
  <meta name="twitter:site" content="@yoursite" />
</head>
```

### 动态 OG 图(2026 标配)
- Next.js: `opengraph-image.tsx` / `opengraph-image.png`
- Vercel OG / @vercel/og: 用 React 生成动态 PNG
- Cloudflare Workers: satori + workers
- 给每篇文章生成独特 OG 图 → 社交媒体分享点击率 + 50%

### 验证
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [Twitter Card Validator](https://cards-dev.twitter.com/validator)
- WeChat 用「URL 探针」

---

## 6. sitemap.xml + robots.txt

### robots.txt
```
# /robots.txt
User-agent: *
Allow: /

Disallow: /admin/
Disallow: /api/
Disallow: /*?session=             # 屏蔽带 session 的 URL

Sitemap: https://example.com/sitemap.xml
```

### sitemap.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-05-26</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/blog/post-1</loc>
    <lastmod>2026-05-20</lastmod>
  </url>
</urlset>
```

### Next.js 自动生成
```tsx
// app/sitemap.ts
import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await db.posts.findAll()
  return [
    { url: 'https://example.com', lastModified: new Date(), priority: 1 },
    ...posts.map(p => ({
      url: `https://example.com/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
```

### 大站(10w+ URL)
- 拆成多个 sitemap + sitemap index
- 每个 sitemap ≤ 50,000 URLs 且 ≤ 50MB
```xml
<sitemapindex>
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-products.xml</loc></sitemap>
</sitemapindex>
```

---

## 7. Canonical(规范链接)

避免「重复内容」惩罚。

```html
<link rel="canonical" href="https://example.com/blog/post-1" />
```

### 何时必须
- 同一内容多 URL(?utm_source=... / 大小写 / trailing slash)
- 移动 m. 站和 desktop
- AMP 页指回原文
- 多语言指向语言版本(也可以)

### 陷阱
- 别 self-canonical 到一个 404 / 重定向 URL
- 别全站都指向首页(常见自动化错误)
- 跨域 canonical 在 Google 可工作,Bing 不一定

---

## 8. URL 设计

```
✅ /blog/how-to-deploy-nextjs
❌ /blog?id=123
❌ /BLOG/HowToDeployNextjs                       (混合大小写)
❌ /blog/how%20to%20deploy                        (空格 url-encode)
```

- 短、可读、用 `-`(不是 `_`)
- 不带 session id / tracking 参数(用 fragment 或 POST 替代)
- 大小写一致
- trailing slash 选一个并坚持(全站统一)

### 301 重定向(改 URL 时)
```js
// next.config.js
async redirects() {
  return [
    { source: '/old-blog/:slug', destination: '/blog/:slug', permanent: true },
  ]
}
```

---

## 9. 国际化(hreflang)

```html
<head>
  <link rel="alternate" hreflang="en" href="https://example.com/en/about" />
  <link rel="alternate" hreflang="zh-CN" href="https://example.com/zh/about" />
  <link rel="alternate" hreflang="zh-TW" href="https://example.com/zh-tw/about" />
  <link rel="alternate" hreflang="x-default" href="https://example.com/en/about" />
</head>
```

### URL 策略选择
| 策略 | 例子 | 优 | 劣 |
|---|---|---|---|
| 子路径(推荐) | `/en/about` `/zh/about` | 简单, 一个域名权重集中 | URL 变长 |
| 子域名 | `en.example.com` | 各国独立 | 域名权重分散 |
| 国家域名 | `example.de` | 信任度高 | 多域成本 |
| 查询参数 | `?lang=en` | 简单 | SEO 差(Google 看不出来) |

### 不要做
- 用 JS 重定向语言(爬虫不跑 JS 时看到错版本)
- 用 Accept-Language 直接重定向(部分爬虫被卡住)
- 建议:用户偏好用 cookie 记,首屏给 hreflang 让搜索引擎选

---

## 10. 图片

```html
<img
  src="hero.webp"
  width="1200"
  height="600"
  alt="iPhone 17 Pro 渐变深空灰背景图"      <!-- 描述性,非「图片」 -->
  loading="lazy"                              <!-- 非首屏 -->
  fetchpriority="high"                        <!-- 首屏 LCP 用 -->
  decoding="async"
/>
```

### 文件名
- ❌ `IMG_1234.jpg`
- ✅ `iphone-17-pro-space-gray.jpg`

### 格式
- AVIF > WebP > JPG/PNG
- 用 `<picture>` 多源:
```html
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img src="hero.jpg" alt="..." />
</picture>
```

### Open Graph 图
- 文件名 `og-{page-slug}.jpg`
- 1200×630
- 文件 ≤ 1MB(WeChat 限制更严,≤ 500KB)

---

## 11. 内部链接 + 锚文本

- 文章互链(相关推荐 / "另见")
- 锚文本要描述目标内容,不要 "点这里"
  - ❌ `<a href="...">点这里</a> 学 React`
  - ✅ `<a href="...">React 入门指南</a>`
- 面包屑(Breadcrumb)既给用户用,也帮 Google 理解层级
- 主导航不要超过 7 项(认知负担)
- 注意 nofollow:外链信任不希望传递时加 `rel="nofollow"`,赞助加 `rel="sponsored"`,UGC 加 `rel="ugc"`

---

## 12. 性能 / 移动友好

### 必查
- Lighthouse 移动版 > 90
- viewport meta:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ```
- 字体大小 ≥ 14px (移动)
- 可点击区域 ≥ 48×48px
- 不用 popup 挡视野

---

## 13. 安全 / 信任

| 信号 | 影响 |
|---|---|
| HTTPS(全站) | 必须 |
| 有效 SSL 证书 | 必须 |
| 无 Mixed Content | 影响信任 |
| Content Security Policy | 有助于 |
| 无恶意软件 | 必须(否则被 Google 标记) |
| 反钓鱼/反诈检查通过 | 必须 |

---

## 14. 国内 SEO 额外注意

### 百度
- 没有 sitemap 提交 → 自动提交 + 主动推送 API
- 域名最好 ICP 备案(没备案爬虫率低)
- 移动适配独立 m. 站,在百度站长平台关联
- 熊掌号(已下线,迁百家号)
- 别用 JS 渲染(百度跑 JS 能力比 Google 弱很多)

### 微信
- 文章分享要用 og:image,且服务器返 200 且 ≤ 5MB
- 公众号 H5 必须域名加白名单
- 注意 UA 是 `MicroMessenger`

### 360 / 搜狗
- 类似百度,提交 sitemap 后等

---

## 15. 监控 / 工具

| 工具 | 用途 |
|---|---|
| [Google Search Console](https://search.google.com/search-console) | 索引状况 / impressions / clicks |
| [Bing Webmaster Tools](https://www.bing.com/webmasters) | Bing 索引 |
| [百度搜索资源平台](https://ziyuan.baidu.com/) | 百度索引 / 抓取 |
| [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) | 性能持续监控 |
| [Screaming Frog](https://www.screamingfrog.co.uk/seo-spider/) | 全站爬,找 404 / 缺 meta / 重复 |
| [Ahrefs / SEMrush](https://ahrefs.com) | 关键词排名 / 反向链接 |
| [PageSpeed Insights](https://pagespeed.web.dev) | Core Web Vitals 实测 |
| [Schema Markup Validator](https://validator.schema.org) | JSON-LD 验证 |

---

## 16. 上线前 SEO 自检 checklist

```
[ ] 每个页面有唯一 <title>(≤ 60 字符)
[ ] 每个页面有唯一 <meta description>(≤ 160 字符)
[ ] <html lang="..."> 设置正确
[ ] viewport meta 存在
[ ] canonical 设置(每页)
[ ] Open Graph 完整(og:title/description/image/url/type)
[ ] Twitter Card 完整
[ ] JSON-LD 结构化数据(至少首页 + 文章/商品页)
[ ] sitemap.xml 可访问且最新
[ ] robots.txt 可访问,sitemap 指向
[ ] 全站 HTTPS,无 mixed content
[ ] 移动友好(Lighthouse 移动模式 > 90)
[ ] LCP < 2.5s, CLS < 0.1, INP < 200ms
[ ] 图片有 alt,有 width/height
[ ] 主要页面 SSR 或 SSG(curl 测验)
[ ] 301 重定向旧 URL(如果改过)
[ ] hreflang 多语言关联(国际化时)
[ ] Google Search Console + Bing Webmaster Tools 添加
[ ] (国内)百度站长平台提交,ICP 备案
[ ] 404 页有合理引导(不跳首页;返回 404 状态码)
[ ] 内链 / 面包屑
[ ] 无 noindex 误打(检查 meta robots)
```

---

## 17. 反向 checklist:这些会拖死 SEO

```
[ ] 用 <meta name="robots" content="noindex"> 但忘了删除
[ ] 整站 React 渲染但没 SSR
[ ] 用 # 路由(/#/about)→ # 后内容不在 URL,不被索引
[ ] 重要内容塞在 click-to-expand 但 server 不渲染
[ ] CLS > 0.25(banner / cookie 弹窗 / 字体替换)
[ ] 大量 404 没 301 处理
[ ] 一个内容 N 个 URL(参数 / 大小写 / 协议)无 canonical
[ ] sitemap 里全是 404 / 301
[ ] robots.txt 误屏蔽(Disallow: / 上线了忘删)
[ ] 服务端给爬虫和用户返不同内容(cloaking → 黑帽 → 直接被降权)
[ ] 全站抄袭 / 翻译别人内容 → AI 滥用警告
```

---

## 18. AI / LLM-Friendly 优化(2025+ 新方向)

LLM(ChatGPT / Perplexity / 国内大模型)成新流量入口:

- `llms.txt` 草案:在根目录放概要,告诉 AI 你的站如何被引用
  ```
  # My Site

  > 一个 XX 工具

  ## Docs
  - [Quickstart](/docs/quickstart): 5 分钟上手
  - [API](/docs/api): 完整 API 参考
  ```
- `noai` / `noimageai` meta(如果不想被训练)
- Markdown 版本: 给每个 page 也提供 .md 版本(`/blog/post-1.md`)
- 结构化数据更重要(AI 抓取依赖)
- 引用源(其他权威站提到你)

---

## 资源

- [Google Search Central Docs](https://developers.google.com/search/docs)
- [Schema.org](https://schema.org/)
- [Web.dev SEO](https://web.dev/learn/seo)
- [Moz Beginner's Guide](https://moz.com/beginners-guide-to-seo)
- [Ahrefs Blog](https://ahrefs.com/blog/)
- [百度搜索资源平台 - 优化白皮书](https://ziyuan.baidu.com/college/whitepaperlist)
