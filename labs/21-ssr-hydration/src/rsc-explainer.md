# React Server Components 工作原理深度解读

> RSC 不是「服务端渲染组件」(那是 SSR)。
> RSC 是「组件在服务端跑完，把渲染结果序列化成一种特殊格式传到客户端，客户端 React 直接「挂载」这个结果」。
> 关键点:**Server Component 的代码永远不会发到浏览器**。

---

## 1. RSC vs SSR vs CSR — 终极对比

```
                  CSR              SSR              RSC
                  ──────           ──────           ──────
代码在哪跑?       client           server + client  server (RSC) + client (CC)
HTML 何时生成?    runtime          server build/req server build/req
JS bundle?       all              all (重复 render) only Client Components
组件能 fetch DB?  no               yes (loader)     yes (直接 await)
Hydration?       no               yes (整树)        部分 (只 CC)
状态?            可                可                只 CC 可用 useState
```

**核心洞察**:
- SSR 在服务端跑组件 → 生成 HTML → 客户端再跑一次同样的组件 → 挂事件(hydration)。组件代码必须客户端有一份。
- RSC 在服务端跑组件 → 生成「序列化的 React 树」(不是 HTML) → 客户端 React 解析这个树。Server Component 的代码客户端不需要。

---

## 2. Server Component / Client Component 的边界

```tsx
// app/page.tsx — Server Component (默认)
import { db } from '@/lib/db'
import Counter from './Counter'

export default async function Page() {
  const posts = await db.posts.findAll()      // ✅ 服务端直接访问 DB

  return (
    <div>
      <h1>Blog</h1>
      {posts.map(p => <article key={p.id}>{p.title}</article>)}
      <Counter />                              {/* ✅ 嵌入 client component */}
    </div>
  )
}
```

```tsx
// app/Counter.tsx — Client Component
'use client'                                    // ← 必须在文件顶部

import { useState } from 'react'

export default function Counter() {
  const [n, setN] = useState(0)                // ✅ 可用 hooks
  return <button onClick={() => setN(n + 1)}>{n}</button>
}
```

**规则**:
- `'use client'` 是「**边界**」:这个文件 + 它 import 的所有东西 → 都进客户端 bundle
- Server Component 可以 import Client Component(常见)
- Client Component **不能** import Server Component(它在 bundle 里,无法 await DB)
- 但可以把 Server Component 当 `children` 传给 Client Component:

```tsx
// ✅ OK
'use client'
export function Card({ children }) { return <div>{children}</div> }

// 在 Server Component 里:
<Card><ServerData /></Card>                    // 父 Card 是 client,但 children 是 server
```

---

## 3. Server Component 能/不能做啥

| 能 | 不能 |
|---|---|
| async/await | useState / useEffect / 任何 hook |
| 直接 fetch / DB 查询 | 事件处理(onClick 等) |
| 读环境变量(server) | 浏览器 API(window/document) |
| 用任何 npm 库(包括 Node-only) | 类组件 |
| 渲染 client component | useContext (除非这个 context 在 Client side) |
| 接收 props(必须可序列化) | 接收函数 props 或 Date / Map / Set |

**Props 序列化限制**:
```tsx
// Server Component → Client Component 传 props 时:
<ClientComp
  text="hello"             // ✅
  num={42}                 // ✅
  arr={[1,2,3]}            // ✅
  obj={{ a: 1 }}           // ✅
  date={new Date()}        // ⚠️  会变成 string,client 重新 new Date(str)
  fn={() => {}}            // ❌ 不能传函数(除非是 Server Action)
  jsx={<Server />}         // ✅ 但 jsx 必须本身可序列化
/>
```

---

## 4. Wire Format(序列化格式)

**RSC 在网络上传输的不是 HTML,是一种 streaming 格式**:

```
1:I["./Counter-abc123.js",["Counter"],"default"]
2:["$","div",null,{"children":[
  ["$","h1",null,{"children":"Blog"}],
  ["$","article",null,{"children":"First post"}],
  ["$","article",null,{"children":"Second post"}],
  ["$","$L1",null,{}]
]}]
```

读法:
- `I[...]` = import 指令(声明某个 Client Component 在哪个 chunk)
- `["$", "div", null, {...}]` = React.createElement("div", ...)
- `"$L1"` = 引用上面 import 的 Counter

**为啥不直接发 HTML?**
- HTML 是死的,无法和已有 client state 合并
- 这种格式可以**流式**: server 一边渲染一边发,client 一边收一边构建 fiber 树
- client 重渲(比如点了 link 进新页)→ 服务端发新的 wire 数据 → client 复用 client component 的 state(因为它没销毁)

---

## 5. 完整流程(浏览器视角)

```
[t=0]    GET /blog
[t=50]   服务器:
           1. 跑 Page() (async)
           2. await db.posts.findAll() (200ms)
           3. 渲染出 React tree
           4. encode 成 RSC wire format
           5. 同时也 renderToPipeableStream 一份 HTML (for FCP & SEO)

[t=250]  浏览器收到第一份字节:
           <html>
             <body>
               <div id="root">
                 <!-- 真实 HTML,浏览器立刻渲染 -->
                 <h1>Blog</h1>
                 <article>First post</article>
                 ...
                 <button>0</button>   <!-- Counter 的初始 HTML -->
               </div>

               <!-- RSC payload 嵌在末尾 -->
               <script>self.__next_f.push([1,"1:I[\\"./Counter-...\\"]..."])</script>
               <script>self.__next_f.push([1,"2:[\\"$\\",...]"])</script>

               <!-- bootstrap -->
               <script src="/_next/static/chunks/main.js"></script>
             </body>
           </html>

[t=300]  浏览器渲染初始 HTML → FCP

[t=400]  main.js 下完,React hydrate:
           - 解析 RSC payload 重建 fiber 树
           - 找到 Counter 的位置
           - 加载 Counter-abc123.js
           - hydrate Counter (attach onClick)
           - 其余的 article 等 → 没 'use client',永远不 hydrate(0 cost!)

[t=500]  TTI:Counter 已经可点
```

---

## 6. RSC 重新拉取(client navigation)

```tsx
// 用户点了 <Link href="/blog/post-1">
```

```
[client]  Link 拦截,调 router.push('/blog/post-1')
   ↓
[fetch]   GET /blog/post-1.rsc?...  (只要 RSC payload,不要完整 HTML)
   ↓
[server]  跑 PostPage() → 序列化
   ↓
[client]  收到新的 wire format
          复用页面中已有的 client component 状态
          渲染新内容,平滑切换
```

**好处**:
- 不刷整页 → SPA 体验
- 不带 hydrate 成本 → 比传统 SPA 路由更省 JS
- Counter 这种 client comp 的 state **不丢**(只要它没被换出 DOM)

---

## 7. Server Actions(双向通信)

```tsx
// app/post/[id]/page.tsx — Server Component
async function deletePost(id: string) {
  'use server'                                  // ← 这个函数变成 RPC

  await db.posts.delete(id)
  revalidatePath('/blog')
}

export default function Post({ params }) {
  return (
    <form action={async () => {
      'use server'
      await deletePost(params.id)
    }}>
      <button>删除</button>
    </form>
  )
}
```

**或者从 client 调用**:
```tsx
// app/Like.tsx
'use client'
import { likePost } from './actions'             // 这个函数标了 'use server'

export function Like({ id }) {
  return <button onClick={() => likePost(id)}>♥</button>
}
```

```tsx
// actions.ts
'use server'

export async function likePost(id: string) {
  // 服务端跑
  await db.likes.insert(id)
  revalidateTag(`post:${id}`)
}
```

**机制**:
- 编译时给 server action 生成一个唯一 ID
- client 调用时,其实是 `fetch('/api/_rsc-action', { body: [actionId, args] })`
- 框架处理:执行函数 + revalidate + 返回新 RSC payload

**安全注意**:
- Server Action 是公开 endpoint(虽然 URL 是 obfuscated)
- 必须在函数里做权限校验,**不能假设只有自己 UI 才能调**
- 接收的 input 是用户控制的 → 校验 / sanitize / 防 SSRF

---

## 8. Suspense + RSC

```tsx
// app/page.tsx
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <Header />                                 {/* 同步 server comp,立刻渲 */}

      <Suspense fallback={<Spinner />}>
        <SlowData />                             {/* async server comp,会等 */}
      </Suspense>

      <Suspense fallback={<Skeleton />}>
        <Recommendations />                      {/* 更慢 */}
      </Suspense>
    </div>
  )
}

async function SlowData() {
  const d = await db.query()                    // 1s
  return <div>{d.value}</div>
}
```

**流式行为**:
- 服务端: Header 立刻渲完,Suspense 边界先发 fallback
- 数据来了之后,服务端再发后续 RSC payload chunk
- 浏览器: 立刻看到 Header + 两个 Spinner → 1s 后第一个 Spinner 变成真内容 → 又过一会儿第二个

---

## 9. 数据获取的两种风格

### Fetch in Server Component(推荐)
```tsx
async function Page() {
  const posts = await fetch('https://api/posts').then(r => r.json())
  return <Posts data={posts} />
}
```
- React 18+ `fetch()` **自动 dedupe**(同一渲染树里相同 URL 只请求一次)
- Next.js 扩展了 fetch:`fetch(url, { next: { revalidate: 60, tags: ['posts'] }})`

### use(promise)(Client Component)
```tsx
'use client'
import { use } from 'react'

function Posts({ promise }: { promise: Promise<Post[]> }) {
  const posts = use(promise)                    // ✅ 像 await,但在 hook 里
  return <ul>{posts.map(...)}</ul>
}

// 父组件传入 promise(可以是 server 启动的):
<Suspense fallback={<Sk />}>
  <Posts promise={getPosts()} />
</Suspense>
```

---

## 10. 实际 bundle 影响

```
传统 Next.js Pages:
  - 整个组件树 + 所有 lib 都进 bundle
  - 例:markdown 渲染库 80KB + 图表库 200KB = 280KB

Next.js App Router (RSC):
  - markdown / 图表渲染在 Server,客户端 0KB
  - Client Components 只有交互部分:Like 按钮(0.5KB) + Counter(0.5KB)
  - 实际节省: 250KB+
```

---

## 11. 调试技巧

### 1. 用 React DevTools 看组件标记
- Server Component 名字旁有 `(Server)`
- Client Component 名字旁有 `(Client)` 或纯名字

### 2. 查看 RSC payload
- Chrome Network → Fetch/XHR → 找 `?_rsc=...` 请求
- Response 就是 wire format

### 3. 编译时 'use client' 边界可视化
```bash
# Next.js 内置
next build  # 输出每个 route 的 First Load JS / Client Components / Server Components
```

### 4. 找出意外的 'use client' 传染
- 一个常见 bug: 在 server comp 顶层 import 了带 `'use client'` 的工具库
- 整棵子树都进了 bundle
- 排查:看 build report 的 client component 列表,找意外项

---

## 12. 常见误区

### ❌ 在 Server Component 里写 onClick
```tsx
function ServerComp() {
  return <button onClick={() => alert('!')}>click</button>   // 编译错误
}
```
原因:onClick 是函数,**不能序列化** → 必须 `'use client'`。

### ❌ 在 Server Component 里用 useState
```tsx
import { useState } from 'react'
function ServerComp() {
  const [n] = useState(0)                       // 错:Server 没有 state
}
```

### ❌ 把 Client Component 的输出当数据用
```tsx
'use client'
function ClientComp() { return <p>hi</p> }

// 在 server comp:
const html = renderToString(<ClientComp />)      // ❌ 没意义,RSC 不这么干
```

### ⚠️ Date / Map / Set 跨边界
```tsx
// server
<ClientComp date={new Date()} map={new Map()} />
// ↑ Date 变 string,Map 变 object,client 拿到的不是原类型
```
修:在 client 内部重新构造,或 server 传 ISO string + client 重 new。

### ⚠️ Server Action 安全
```tsx
'use server'
export async function deleteUser(id: string) {
  await db.users.delete(id)                     // ❌ 没校验权限!
}
```
任何能访问该 URL 的人都能调用。必须:
```tsx
'use server'
import { auth } from '@/lib/auth'

export async function deleteUser(id: string) {
  const user = await auth.currentUser()
  if (!user?.isAdmin) throw new Error('unauthorized')
  await db.users.delete(id)
}
```

---

## 13. 框架支持情况

| 框架 | RSC 支持 | 说明 |
|---|---|---|
| **Next.js App Router** | ✅ 一等公民 | 生产级,生态最强 |
| **Waku** | ✅ minimal | RSC 标准实现的「参考」框架 |
| **Remix v3** | 🟡 部分 | 朝 RSC 方向演进 |
| **Redwood** | 🟡 早期 | 在做 |
| **TanStack Start** | 🟡 计划中 | |
| **其他**(Nuxt/SvelteKit/SolidStart) | ❌ | 各家有自己的 server function 概念,但不是 RSC |

---

## 14. 何时该用 / 不该用 RSC

### 该用
- 数据驱动页面(blog / e-commerce / dashboard)
- 大量服务端依赖(MD parser / DB / 重 lib)
- SEO 关键
- 希望 bundle 极小

### 不该
- 纯 SPA 体验(画板 / IDE / 游戏)
- 全部高度交互,几乎没静态内容
- 团队对 Next.js 边界规则不熟,会写出意外 client 传染
- 服务端成本敏感(每次访问都跑 = 高 CPU)

---

## 资源

- [React Docs: Server Components](https://react.dev/reference/rsc/server-components)
- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Dan Abramov: The Two Reacts](https://overreacted.io/the-two-reacts/)
- [Plasmic: How RSC Works](https://www.plasmic.app/blog/how-react-server-components-work)
- [RSC RFC](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md)
