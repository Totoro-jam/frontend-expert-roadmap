// Next.js App Router 实战模式
// 把 RSC + Suspense + Server Actions + 路由特性串起来

// =====================================================
// 1. 文件结构(App Router 约定)
// =====================================================
//
// app/
// ├── layout.tsx              ← 根 layout(必须)
// ├── page.tsx                ← /
// ├── loading.tsx             ← 整 segment 的 Suspense fallback
// ├── error.tsx               ← error boundary(必须是 'use client')
// ├── not-found.tsx           ← 404
// ├── global-error.tsx        ← 替换根 layout 的错误兜底
// ├── template.tsx            ← 类似 layout 但每次 navigation 重新 mount
// │
// ├── blog/
// │   ├── layout.tsx          ← /blog 及其子路由共享
// │   ├── page.tsx            ← /blog
// │   ├── loading.tsx         ← /blog 加载 fallback
// │   ├── [slug]/
// │   │   ├── page.tsx        ← /blog/[slug]
// │   │   └── opengraph-image.tsx   ← 动态 OG 图(server 生成)
// │   └── (group)/            ← (xxx) 不影响 URL,仅组织代码
// │
// ├── @modal/                 ← parallel route slot
// │   └── (.)photos/[id]/     ← intercepting route(modal pattern)
// │       └── page.tsx
// │
// ├── api/
// │   └── webhook/route.ts    ← API Route(替代 pages/api)
// │
// ├── _components/            ← _ 前缀:私有,不当路由
// │
// └── actions.ts              ← server actions 集中放

// =====================================================
// 2. Root Layout
// =====================================================
import type { Metadata } from 'next'

// 静态 metadata
export const metadata: Metadata = {
  title: { default: 'My App', template: '%s | My App' },
  description: '...',
  openGraph: { type: 'website', siteName: 'My App' },
}

// 动态(基于 params)
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await fetchPost(params.slug)
  return { title: post.title, description: post.excerpt }
}

export default function RootLayout({
  children,
  modal,                                          // ← 接收 parallel route slot
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>   {/* 主题切换 */}
      <body>
        <ThemeProvider>{children}{modal}</ThemeProvider>
      </body>
    </html>
  )
}

// =====================================================
// 3. loading.tsx — segment 级 Suspense
// =====================================================
// app/blog/loading.tsx
export default function Loading() {
  // 用户进入 /blog 时,在 page.tsx async 数据没返回前
  // 浏览器立刻显示这个(skeleton/spinner)
  return <PostsSkeleton />
}

// 等价于在 layout 外面包了 <Suspense fallback={<Loading />}>

// =====================================================
// 4. error.tsx — 必须 'use client'
// =====================================================
// app/blog/error.tsx
'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,                                          // ← 调用它会重新渲染 segment
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 上报
    captureError(error)
  }, [error])

  return (
    <div role="alert">
      <h2>出错了</h2>
      <p>{error.message}</p>
      <button onClick={reset}>重试</button>
    </div>
  )
}

// =====================================================
// 5. not-found.tsx
// =====================================================
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'

export default async function Post({ params }) {
  const post = await db.posts.findOne({ slug: params.slug })
  if (!post) notFound()                            // ← 抛 NEXT_NOT_FOUND
  return <Article post={post} />
}

// app/blog/[slug]/not-found.tsx
export default function NotFound() {
  return <div>这篇文章不存在</div>
}

// =====================================================
// 6. Server Actions(form / mutation)
// =====================================================
// app/actions.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
})

export async function createPost(prevState: any, formData: FormData) {
  // 1. 鉴权
  const user = await auth.currentUser()
  if (!user) return { error: 'unauthorized' }

  // 2. 校验
  const parsed = CreatePostSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
  })
  if (!parsed.success) return { error: parsed.error.flatten() }

  // 3. 写库
  const post = await db.posts.create({ ...parsed.data, authorId: user.id })

  // 4. 失效缓存
  revalidatePath('/blog')
  revalidateTag(`user:${user.id}`)

  // 5. 跳转(server action 内部用 redirect)
  redirect(`/blog/${post.slug}`)
}

// app/blog/new/page.tsx
'use client'

import { useActionState } from 'react'              // React 19
import { createPost } from '@/app/actions'

export default function NewPostForm() {
  const [state, action, pending] = useActionState(createPost, null)

  return (
    <form action={action}>                          {/* 直接传 server action */}
      <input name="title" required />
      <textarea name="body" required />
      {state?.error && <p role="alert">{JSON.stringify(state.error)}</p>}
      <button disabled={pending}>{pending ? '提交中...' : '发布'}</button>
    </form>
  )
}

// =====================================================
// 7. Optimistic UI
// =====================================================
'use client'
import { useOptimistic } from 'react'              // React 19

function LikeButton({ post, likes }: { post: Post; likes: number }) {
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    likes,
    (current, increment: number) => current + increment,
  )

  return (
    <form action={async () => {
      addOptimisticLike(1)                          // 立刻 +1
      await likePostAction(post.id)                 // 实际调用
    }}>
      <button>♥ {optimisticLikes}</button>
    </form>
  )
}

// =====================================================
// 8. Data fetching with caching
// =====================================================
async function getPosts() {
  // 默认 force-cache(类似 SSG)
  // const res = await fetch('https://api/posts')

  // ISR:每 60s 重新生成
  // const res = await fetch('https://api/posts', { next: { revalidate: 60 } })

  // 永远新鲜(类似 SSR)
  // const res = await fetch('https://api/posts', { cache: 'no-store' })

  // 标签化缓存,可以精确失效
  const res = await fetch('https://api/posts', {
    next: { revalidate: 3600, tags: ['posts'] },
  })

  return res.json()
}

// 在 mutation 后:
// revalidateTag('posts')  ← 让标 'posts' 的所有 fetch 失效

// =====================================================
// 9. Streaming with Suspense
// =====================================================
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <Header />                                    {/* 快,立刻显示 */}

      {/* 这块包了 Suspense → 边界内 await 不会阻塞 Header */}
      <Suspense fallback={<PostsSkeleton />}>
        <Posts />
      </Suspense>

      <Suspense fallback={<TrendingSkeleton />}>
        <Trending />
      </Suspense>
    </div>
  )
}

async function Posts() {
  const posts = await db.posts.findAll()           // 500ms
  return posts.map(p => <Card key={p.id} post={p} />)
}

async function Trending() {
  const trending = await fetch('https://slow.api/trending')  // 2s
  return <Trending />
}

// 用户体感:Header 立刻看到 → Posts 0.5s 后到 → Trending 2s 后到
// 没有任何「白屏 2 秒」

// =====================================================
// 10. Parallel Routes(同时渲染多个 slot)
// =====================================================
// app/dashboard/layout.tsx
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode
  analytics: React.ReactNode
  team: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-3">
      <div>{children}</div>
      <div>{analytics}</div>                        {/* app/dashboard/@analytics/page.tsx */}
      <div>{team}</div>                             {/* app/dashboard/@team/page.tsx */}
    </div>
  )
}
// 三个 slot 独立 loading / error,且可独立 navigation

// =====================================================
// 11. Intercepting Routes(Modal Pattern)
// =====================================================
// 用户列表 /photos 上点 photo → 弹 modal 显示 /photos/[id]
// 但直接访问 /photos/[id] 又能显示完整页(分享时)
//
// app/
// ├── @modal/
// │   ├── (.)photos/[id]/page.tsx   ← (.) = 拦截同级
// │   │   → 在 modal slot 渲染
// │   └── default.tsx               ← slot 默认占位
// │
// ├── photos/
// │   ├── page.tsx                  ← /photos
// │   └── [id]/page.tsx             ← /photos/[id](完整页)
//
// 约定: (.) = 同级, (..) = 上一级, (...) = root

// =====================================================
// 12. Route Handlers(替代 API Routes)
// =====================================================
// app/api/webhook/route.ts
export async function POST(req: Request) {
  const body = await req.json()
  // ... process webhook
  return Response.json({ ok: true })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  return Response.json({ id })
}

// 文件级 cache config
export const dynamic = 'force-dynamic'             // 每次都跑
export const revalidate = 60                        // ISR-style
export const runtime = 'edge'                       // 跑在 edge runtime

// =====================================================
// 13. Middleware(路由前置处理)
// =====================================================
// middleware.ts(项目根)
import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // 国际化
  const locale = req.headers.get('accept-language')?.split(',')[0] ?? 'en'

  // 鉴权
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const token = req.cookies.get('token')
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  // A/B test
  const variant = Math.random() > 0.5 ? 'A' : 'B'
  const res = NextResponse.next()
  res.cookies.set('variant', variant)
  return res
}

export const config = {
  matcher: ['/admin/:path*', '/((?!api|_next|static).*)'],
}

// =====================================================
// 14. Image / Font / Script
// =====================================================
import Image from 'next/image'
import { Inter } from 'next/font/google'
import Script from 'next/script'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',                                  // 默认 swap,无 FOIT
})

;<Image
  src="/hero.png"
  alt="..."
  width={1200}
  height={600}
  priority                                          // ← preload + fetchpriority=high
  placeholder="blur"
  blurDataURL="data:image/png;base64,..."
/>

;<Script
  src="https://www.googletagmanager.com/gtag/js?id=GA_ID"
  strategy="afterInteractive"                       // beforeInteractive / lazyOnload / worker
/>

// =====================================================
// 15. Configuration
// =====================================================
// next.config.js
const config = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb', allowedOrigins: ['my.cdn'] },
    ppr: true,                                       // Partial Prerendering(混合 SSG + 动态 streaming)
    reactCompiler: true,                             // React Compiler(自动 memo)
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ hostname: 'images.unsplash.com' }],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
}

// =====================================================
// 16. 性能优化 checklist
// =====================================================
//
// 1. 尽量用 Server Component(默认),只有需要交互才 'use client'
// 2. 'use client' 边界放尽可能深(叶子节点),减少 bundle
// 3. 慢数据用 Suspense 包,别阻塞快内容
// 4. dynamic import 重组件 + ssr:false 给纯 client widget
// 5. 用 next/image,priority for LCP
// 6. 用 next/font,避免 CLS
// 7. ISR 用 revalidate,别用 force-dynamic 当默认
// 8. Server Action 加权限校验和 Zod 校验
// 9. 用 generateStaticParams 让动态路由也能 SSG
// 10. 大 client lib 用动态 import + Suspense

// =====================================================
// 17. 常见坑
// =====================================================
//
// 1. 把 'use client' 写在共享 utils.ts 顶部 → 所有 import 都被拖进 bundle
// 2. Server Component 误用 hooks(useState/useEffect)→ 编译错误
// 3. 给 Client Component 传函数 prop(Date/Map/Set/Symbol)→ 序列化失败
// 4. Server Action 不做权限检查 → 任何人能调
// 5. 用 cookies()/headers() 后忘了它会让 page 变 dynamic(无法 SSG)
// 6. fetch 默认 cache → 实时数据不刷新 → 用 cache:'no-store' 或 revalidate
// 7. revalidatePath 路径不带 /(.*) 时只刷一个,不刷子路由
// 8. middleware 跑在 edge runtime,不能用 Node-only API
// 9. Error boundary 在 'use client',但它能 catch server component 抛的错(序列化)
// 10. PPR 还在实验,生产慎用

// =====================================================
// 18. 框架基本类型注解
// =====================================================
type Post = { id: string; slug: string; title: string; excerpt: string; body: string }
declare const fetchPost: (slug: string) => Promise<Post>
declare const captureError: (e: Error) => void
declare const auth: { currentUser: () => Promise<{ id: string; isAdmin?: boolean } | null> }
declare const db: any
declare const likePostAction: (id: string) => Promise<void>
declare const PostsSkeleton: () => JSX.Element
declare const Header: () => JSX.Element
declare const Card: (p: any) => JSX.Element
declare const ThemeProvider: (p: any) => JSX.Element
declare const Article: (p: any) => JSX.Element
declare const TrendingSkeleton: () => JSX.Element

export {}
