# 11 · Data Fetching Lab

> 「数据请求」是前端代码 50% 的复杂度来源。
> 写好它,业务代码会减半;写错它,你会有 cache 不一致 / race condition / 内存泄漏 / 多余请求满天飞。

---

## 学这个能干什么

- 不再手写 `useEffect + fetch + isLoading + isError + setData`
- 用 TanStack Query / SWR / Apollo 实现:缓存、去重、自动重试、stale-while-revalidate、optimistic update
- 理解 Server State 跟 UI State 的本质差异
- 设计真正的 offline-first 应用(IndexedDB + queue + sync)
- 用 GraphQL / tRPC 拿到端到端类型安全

---

## Roadmap

### 1. 为什么不能再用 `useEffect + fetch`

```jsx
function UserList() {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])
}
```

这段代码漏了 8 件事:
1. 组件卸载后还 setState(memory leak / warning)
2. 不可取消:同一个组件多次挂载 → race condition
3. 数据不缓存:别处也要 users 时再发一次
4. 不会重新获取:tab 切换回来数据可能已过期
5. 没有去重:同时 3 个组件渲染 = 3 次请求
6. 没有重试:网络抖动直接挂掉
7. 没有 optimistic update:用户点赞要等 round trip 才看到
8. 没有错误边界 / loading 边界统一管理

每一个都需要你手写。TanStack Query 一行解决。

### 2. TanStack Query —— 现代 React 标配

```tsx
import { useQuery } from '@tanstack/react-query'

function UserList() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],                        // 缓存 key
    queryFn: () => fetch('/api/users').then(r => r.json()),
    staleTime: 60_000,                          // 60s 内不重新获取
    gcTime: 5 * 60_000,                         // 5min 不用就 GC
    retry: 3,
    refetchOnWindowFocus: true,                 // 切回 tab 自动刷新
  })

  if (isLoading) return <Spinner />
  if (error) return <Error err={error} />
  return <ul>{data.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}
```

**核心概念**:
- **stale-while-revalidate**:返回旧数据(瞬时)+ 后台获取新数据(用户感觉零延迟)
- **queryKey**:同 key 的请求自动去重 + 共享缓存
- **invalidate**:`queryClient.invalidateQueries({ queryKey: ['users'] })` 让缓存失效,会自动重新获取
- **Optimistic update**:写操作前先改 UI,失败再回滚

### 3. Mutation + Optimistic Update

```tsx
const mutation = useMutation({
  mutationFn: (newTodo) => fetch('/api/todos', { method: 'POST', body: JSON.stringify(newTodo) }),

  // 先改本地缓存(瞬时反馈)
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] })
    const prev = queryClient.getQueryData(['todos'])
    queryClient.setQueryData(['todos'], (old) => [...old, newTodo])
    return { prev }
  },

  // 失败时回滚
  onError: (err, newTodo, ctx) => {
    queryClient.setQueryData(['todos'], ctx.prev)
  },

  // 不管成败,最终用 server 数据
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
})

mutation.mutate({ id: tempId, text: 'New' })
```

### 4. SWR —— Vercel 出品的轻量替代

```tsx
import useSWR from 'swr'

const { data, error, mutate } = useSWR('/api/users', fetcher)
```

* 比 TanStack Query 简洁,功能略少
* Next.js 项目里 RSC 之外的客户端拉数据常用
* 概念相同:stale-while-revalidate(SWR 名字就来自这个)

### 5. Apollo / urql —— GraphQL

```tsx
const { data } = useQuery(gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      name
      email
      posts { id title }
    }
  }
`, { variables: { id: '1' } })
```

* 标准化缓存(Normalized Cache):同一个 entity 在不同 query 出现自动合并
* 适合「关联数据复杂、字段需要按页面定制」的场景
* 痛点:Schema 维护成本、N+1 查询、客户端 bundle 大

### 6. tRPC —— 端到端类型安全(无 GraphQL)

```ts
// 后端定义
export const appRouter = router({
  user: router({
    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => db.user.findUnique({ where: { id: input.id } })),
  }),
})

// 前端调用,完整 TS 类型推断
const { data: user } = trpc.user.get.useQuery({ id: '1' })
// user 类型自动推断为 User
```

* 内部用 TanStack Query
* 没有 codegen,没有 schema 文件
* 只适合「同一仓库前后端」(monorepo)的场景
* 对独立后端不适用 → 选 OpenAPI codegen 或 GraphQL

### 7. 缓存策略 5 种(熟悉自 HTTP)

| 策略 | 含义 | 用法 |
|---|---|---|
| Cache First | 缓存有就用,没才请求 | 静态资源、用户头像 |
| Network First | 优先请求,失败回缓存 | 实时数据 |
| Stale While Revalidate | 返回旧的 + 后台更新 | 大多数业务列表 |
| Network Only | 不缓存 | 写操作、敏感数据 |
| Cache Only | 只读缓存 | 离线模式 |

TanStack Query 默认是 SWR 策略。

### 8. Race Condition 防护

```jsx
// ❌ 用户快速切换 user A → B,A 的响应可能晚于 B
useEffect(() => {
  fetch(`/api/users/${id}`).then(r => r.json()).then(setUser)
}, [id])

// ✅ 方法 1:cleanup + flag
useEffect(() => {
  let stale = false
  fetch(`/api/users/${id}`).then(r => r.json()).then(d => { if (!stale) setUser(d) })
  return () => { stale = true }
}, [id])

// ✅ 方法 2:AbortController
useEffect(() => {
  const ctrl = new AbortController()
  fetch(`/api/users/${id}`, { signal: ctrl.signal })...
  return () => ctrl.abort()
}, [id])

// ✅ 方法 3(最佳):TanStack Query,内部已处理
const { data } = useQuery({ queryKey: ['user', id], queryFn: () => fetch(...) })
```

### 9. 分页 / 无限滚动 / 实时

```tsx
// 经典分页
const { data } = useQuery({
  queryKey: ['list', page],
  queryFn: () => api.list(page),
  placeholderData: keepPreviousData,   // 翻页时不显示空白
})

// 无限滚动
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => api.feed({ cursor: pageParam }),
  getNextPageParam: (last) => last.nextCursor,
})

// 实时(WebSocket)
useEffect(() => {
  ws.on('message', (msg) => {
    queryClient.setQueryData(['messages'], (old) => [...old, msg])
  })
}, [])
```

### 10. Offline-First 架构

```
[UI 操作]
   ↓ 写本地 IndexedDB(立即,乐观更新)
   ↓ push 到 outbox 队列
[网络空闲时]
   ↓ 依次 sync 到 server
[server 响应]
   ↓ 写回本地,resolve conflict
```

工具:
- [Dexie.js](https://dexie.org/) — IndexedDB 友好封装
- [TanStack Query 的 persist 插件](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient)
- [Replicache](https://replicache.dev/) — 完整 sync 框架
- [PowerSync](https://www.powersync.com/) — Postgres 同步到客户端

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [tanstack-todo.tsx](src/tanstack-todo.tsx) | 完整 CRUD + 乐观更新 |
| [race-condition-demo.tsx](src/race-condition-demo.tsx) | 3 种竞态修复对比 |
| [offline-queue.ts](src/offline-queue.ts) | IndexedDB outbox 简化实现 |

---

## 资源

- 📖 [TanStack Query 官方文档](https://tanstack.com/query/latest) — 教学质量极高
- 📖 [Tao of React Query](https://tkdodo.eu/blog) — 作者 TkDodo 的博客系列
- 📖 [SWR docs](https://swr.vercel.app/)
- 📖 [tRPC docs](https://trpc.io/)
- 📖 [Local-First Software](https://www.inkandswitch.com/local-first/) — Offline-first 思想圣经
