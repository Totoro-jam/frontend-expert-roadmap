// TanStack Query 完整 CRUD + 乐观更新示例
// 涵盖:列表查询、详情查询、新增 / 更新 / 删除、optimistic update、错误回滚

import { useState } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

// ====================================================
// QueryClient(全局唯一)
// ====================================================
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,            // 30s 内复用缓存,不重新发请求
      gcTime: 5 * 60_000,           // 5min 不用就清理(原 cacheTime)
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// ====================================================
// API 层(模拟,真实场景用 ky / axios / fetch)
// ====================================================
interface Todo {
  id: string
  text: string
  done: boolean
}

const api = {
  list: async (): Promise<Todo[]> => {
    const r = await fetch('/api/todos')
    if (!r.ok) throw new Error('Failed to fetch')
    return r.json()
  },
  get: async (id: string): Promise<Todo> => {
    const r = await fetch(`/api/todos/${id}`)
    if (!r.ok) throw new Error('Failed to fetch')
    return r.json()
  },
  create: async (input: { text: string }): Promise<Todo> => {
    const r = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!r.ok) throw new Error('Failed to create')
    return r.json()
  },
  update: async (id: string, patch: Partial<Todo>): Promise<Todo> => {
    const r = await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) throw new Error('Failed to update')
    return r.json()
  },
  delete: async (id: string): Promise<void> => {
    const r = await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Failed to delete')
  },
}

// ====================================================
// queryKey 工厂(强烈推荐,避免拼错 + 集中管理)
// ====================================================
const todoKeys = {
  all: ['todos'] as const,
  list: () => [...todoKeys.all, 'list'] as const,
  detail: (id: string) => [...todoKeys.all, 'detail', id] as const,
}

// ====================================================
// 1. 列表 query
// ====================================================
function TodoList() {
  const { data, isLoading, error } = useQuery({
    queryKey: todoKeys.list(),
    queryFn: api.list,
  })

  if (isLoading) return <div>Loading…</div>
  if (error) return <div>Error: {(error as Error).message}</div>

  return (
    <ul>
      {data!.map(todo => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  )
}

// ====================================================
// 2. 切换完成状态:乐观更新
// ====================================================
function TodoItem({ todo }: { todo: Todo }) {
  const qc = useQueryClient()

  const toggle = useMutation({
    mutationFn: () => api.update(todo.id, { done: !todo.done }),

    onMutate: async () => {
      // 取消正在进行的列表请求,避免覆盖本地乐观值
      await qc.cancelQueries({ queryKey: todoKeys.list() })

      const prev = qc.getQueryData<Todo[]>(todoKeys.list())

      qc.setQueryData<Todo[]>(todoKeys.list(), old =>
        old?.map(t => (t.id === todo.id ? { ...t, done: !t.done } : t)),
      )

      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      // 回滚到操作前的状态
      if (ctx?.prev) qc.setQueryData(todoKeys.list(), ctx.prev)
    },

    onSettled: () => {
      // 成功 / 失败都用 server 真实数据兜底
      qc.invalidateQueries({ queryKey: todoKeys.list() })
    },
  })

  return (
    <li>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => toggle.mutate()}
        disabled={toggle.isPending}
      />
      <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>
        {todo.text}
      </span>
    </li>
  )
}

// ====================================================
// 3. 新增:乐观插入(临时 id,server 返回后替换)
// ====================================================
function AddTodo() {
  const qc = useQueryClient()
  const [text, setText] = useState('')

  const create = useMutation({
    mutationFn: api.create,

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: todoKeys.list() })
      const prev = qc.getQueryData<Todo[]>(todoKeys.list())

      const tempId = `temp-${Date.now()}`
      const optimistic: Todo = { id: tempId, text: input.text, done: false }

      qc.setQueryData<Todo[]>(todoKeys.list(), old => [...(old ?? []), optimistic])

      return { prev, tempId }
    },

    onSuccess: (server, _input, ctx) => {
      // 用 server 返回的真实 id 替换临时 id
      qc.setQueryData<Todo[]>(todoKeys.list(), old =>
        old?.map(t => (t.id === ctx!.tempId ? server : t)),
      )
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(todoKeys.list(), ctx.prev)
    },
  })

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        if (!text.trim()) return
        create.mutate({ text })
        setText('')
      }}
    >
      <input value={text} onChange={e => setText(e.target.value)} />
      <button disabled={create.isPending}>Add</button>
    </form>
  )
}

// ====================================================
// 4. 删除:乐观移除
// ====================================================
function DeleteButton({ id }: { id: string }) {
  const qc = useQueryClient()

  const del = useMutation({
    mutationFn: () => api.delete(id),

    onMutate: async () => {
      await qc.cancelQueries({ queryKey: todoKeys.list() })
      const prev = qc.getQueryData<Todo[]>(todoKeys.list())
      qc.setQueryData<Todo[]>(todoKeys.list(), old => old?.filter(t => t.id !== id))
      return { prev }
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(todoKeys.list(), ctx.prev)
    },

    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.list() }),
  })

  return <button onClick={() => del.mutate()}>Delete</button>
}

// ====================================================
// 5. 入口
// ====================================================
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <h1>Todos</h1>
      <AddTodo />
      <TodoList />
    </QueryClientProvider>
  )
}

// ====================================================
// 关键经验
// ====================================================
//
// 1. queryKey 用工厂函数集中管理,避免拼写错误
// 2. 写操作三步走:cancelQueries → setQueryData → 返回 prev 给 onError 回滚
// 3. onSettled 兜底 invalidate,让 server 真实数据覆盖乐观值
// 4. 创建场景用「临时 id」占位,onSuccess 拿到真实 id 替换
// 5. UI 不需要 isLoading / isError 状态,组件用 isPending / error 即可
