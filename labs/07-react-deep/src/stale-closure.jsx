// useEffect 闭包陷阱 4 个经典案例 + 修复
// 这是 React 写 3 年还在踩坑的人最多的一类 bug

import { useState, useEffect, useRef, useCallback } from 'react'

// ====================================================
// 案例 1:setInterval + 空依赖 → 永远是初始 count
// ====================================================
function Bug1() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      // ❌ count 永远是 0,因为这个闭包是 mount 时创建的
      console.log(count)
    }, 1000)
    return () => clearInterval(t)
  }, [])   // 空依赖 = 永远不重建

  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}

// ✅ 修复 1a:用 functional setState 读最新值
function Fixed1a() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setCount(c => {
        console.log(c)   // 总是最新
        return c
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}

// ✅ 修复 1b:把依赖写对(但会反复 setInterval/clearInterval)
function Fixed1b() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const t = setInterval(() => console.log(count), 1000)
    return () => clearInterval(t)
  }, [count])   // 每次 count 变 → 重建 interval(可以接受)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}

// ✅ 修复 1c:用 ref 存最新值(Dan 推荐的 useEffectEvent 模式的雏形)
function Fixed1c() {
  const [count, setCount] = useState(0)
  const countRef = useRef(count)
  useEffect(() => { countRef.current = count })

  useEffect(() => {
    const t = setInterval(() => console.log(countRef.current), 1000)
    return () => clearInterval(t)
  }, [])
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}

// ====================================================
// 案例 2:事件 handler 闭包了旧 prop
// ====================================================
function Bug2({ onSubmit }) {
  useEffect(() => {
    const handler = () => onSubmit()    // 闭包了首次的 onSubmit
    window.addEventListener('keypress', handler)
    return () => window.removeEventListener('keypress', handler)
  }, [])   // ❌ 没把 onSubmit 写进依赖

  return null
}

// ✅ 修复:依赖加上 onSubmit,父组件用 useCallback 稳定引用
function Fixed2({ onSubmit }) {
  useEffect(() => {
    const handler = () => onSubmit()
    window.addEventListener('keypress', handler)
    return () => window.removeEventListener('keypress', handler)
  }, [onSubmit])   // ✅
  return null
}

// 父组件:
function Parent() {
  const [n, setN] = useState(0)
  const handleSubmit = useCallback(() => {
    console.log('submitted with n =', n)
  }, [n])   // n 变才换函数引用,Fixed2 才会重建监听器
  return <Fixed2 onSubmit={handleSubmit} />
}

// ====================================================
// 案例 3:异步请求里读了旧 state
// ====================================================
function Bug3() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`/api/list?page=${page}`)
      .then(r => r.json())
      .then(d => {
        // ❌ 用户已经切到 page 5,但 page 2 的响应慢到了 → setData 用旧数据覆盖了新的
        setData(d)
      })
  }, [page])
  // ...
}

// ✅ 修复:cleanup 里取消请求(AbortController)
function Fixed3() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/list?page=${page}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(setData)
      .catch(e => { if (e.name !== 'AbortError') throw e })
    return () => ctrl.abort()
  }, [page])
}

// 更好:用 TanStack Query / SWR,自带「保留最新」语义,不用自己管

// ====================================================
// 案例 4:Strict Mode 跑两次副作用
// ====================================================
function Bug4() {
  useEffect(() => {
    // ❌ 这里发了一个埋点 → Strict Mode 下发了两次
    analytics.track('page_viewed')
  }, [])
}

// ✅ 修复:让副作用可重复
function Fixed4() {
  useEffect(() => {
    // 用 ref 标记 + 后端去重(以 sessionId + eventName 为 key)
    // 或者,设计上接受「Effect 可能跑多次」的现实(订阅 + cleanup 配对的就不怕)
  }, [])
}

// 关键认知:Strict Mode 在 dev 故意跑两次,是逼你写「幂等」副作用
// production 不会跑两次,但开发期暴露的问题在 prod 同样会出现(组件卸载重挂载场景)

export { Bug1, Fixed1a, Fixed1b, Fixed1c, Bug2, Fixed2, Parent, Bug3, Fixed3 }
