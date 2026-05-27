// 异步竞态(race condition)三种修复方案对比
// 场景:用户在 user list 里快速点击 A → B → C,期望最终显示 C 的详情
// 如果 A 的响应最慢,可能覆盖 C 的数据(典型 race bug)

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface User { id: string; name: string }

// ====================================================
// ❌ 反例:经典竞态 bug
// ====================================================
export function Buggy({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    setUser(null)
    fetch(`/api/users/${id}`)
      .then(r => r.json())
      .then(setUser)   // ← id 已经变了,但旧请求仍然写入 state
  }, [id])

  return <div>{user?.name ?? 'Loading…'}</div>
}

// 触发场景:用户快速点 A → B
//   - A 请求发出
//   - id 变成 B,B 请求发出
//   - B 先返回,UI 显示 B(✅ 正确)
//   - A 后返回,UI 被覆盖成 A(❌ bug)

// ====================================================
// ✅ 方案 1:cleanup + flag(最简单)
// ====================================================
export function FixedWithFlag({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let cancelled = false
    setUser(null)

    fetch(`/api/users/${id}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setUser(data)   // 旧 effect 的 flag 已是 true,直接丢弃
      })

    return () => {
      cancelled = true
    }
  }, [id])

  return <div>{user?.name ?? 'Loading…'}</div>
}

// 优点:实现简单,任何 promise 都适用
// 缺点:请求还在跑,浪费带宽 / 服务端资源

// ====================================================
// ✅ 方案 2:AbortController(真正取消请求)
// ====================================================
export function FixedWithAbort({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setUser(null)
    setError(null)

    fetch(`/api/users/${id}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(setUser)
      .catch(err => {
        if (err.name === 'AbortError') return   // 主动取消,不算错误
        setError(err)
      })

    return () => ctrl.abort()
  }, [id])

  if (error) return <div>Error: {error.message}</div>
  return <div>{user?.name ?? 'Loading…'}</div>
}

// 优点:浏览器层面真正中断 HTTP 请求,节省带宽
// 缺点:需要你自己处理 AbortError,不是所有 lib 都支持 signal

// ====================================================
// ✅ 方案 3:TanStack Query(推荐,内部已处理)
// ====================================================
export function FixedWithQuery({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: async ({ signal }) => {
      // ↑ 注意:Query 自动传入 signal,key 变化时会 abort 上一个请求
      const r = await fetch(`/api/users/${id}`, { signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<User>
    },
  })

  if (isLoading) return <div>Loading…</div>
  if (error) return <div>Error: {(error as Error).message}</div>
  return <div>{data!.name}</div>
}

// 优点:
//   - 自动 abort + 自动缓存(快速来回切回不重新请求)
//   - placeholderData / keepPreviousData 让翻页不闪烁
//   - 内部用「最后一次请求 wins」策略,彻底杜绝竞态

// ====================================================
// 进阶:debounce(搜索场景的常见配方)
// ====================================================
export function SearchBox() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  // 300ms 内不再输入,才更新 debouncedQ → 才触发请求
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: ({ signal }) =>
      fetch(`/api/search?q=${debouncedQ}`, { signal }).then(r => r.json()),
    enabled: debouncedQ.length >= 2,   // 至少 2 个字符才搜
  })

  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} />
      <ul>{data?.map((r: any) => <li key={r.id}>{r.title}</li>)}</ul>
    </>
  )
}

// ====================================================
// 总结决策树
// ====================================================
//
// 你在写...
//   - 用 TanStack Query / SWR 拉数据? → ✅ 直接用,内置处理
//   - 自己写 useEffect + fetch?
//     - 想真正取消请求 / 节省带宽 → AbortController
//     - 只想丢弃旧响应 → cleanup flag
//   - 搜索 / 联想 / 滑块联动? → debounce + AbortController 组合
//
// 核心原则:任何「id 一变就重发」的 effect,默认要考虑竞态
