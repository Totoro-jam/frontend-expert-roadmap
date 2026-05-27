// 何时该 memo / useMemo / useCallback,何时是过度优化
// 真相:90% 的 memo 调用是没意义甚至有害的

import { memo, useMemo, useCallback, useState } from 'react'

// ====================================================
// 场景 A:useMemo 是浪费的(计算便宜 → memo 本身的开销更大)
// ====================================================
function BadMemo({ a, b }) {
  // ❌ 加法本身就 1 纳秒,memo 的依赖比较 + 闭包创建都比它贵
  const sum = useMemo(() => a + b, [a, b])
  return <div>{sum}</div>
}

function Better({ a, b }) {
  // ✅ 直接算
  return <div>{a + b}</div>
}

// ====================================================
// 场景 B:useMemo 真的需要 —— 昂贵计算
// ====================================================
function BigList({ items, search }) {
  // 1000 个 item 的过滤 + 排序,确实贵
  const result = useMemo(() => {
    return items
      .filter(i => i.name.includes(search))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items, search])

  return <ul>{result.map(i => <li key={i.id}>{i.name}</li>)}</ul>
}

// ====================================================
// 场景 C:引用稳定性(传给 memo 子 / Effect 依赖)
// ====================================================
const Child = memo(function Child({ onClick }) {
  console.log('Child render')
  return <button onClick={onClick}>Click</button>
})

function BadParent() {
  const [n, setN] = useState(0)
  // ❌ 每次 BadParent 渲染,onClick 都是新函数 → Child 的 memo 失效
  return <Child onClick={() => console.log('clicked')} />
}

function GoodParent() {
  const [n, setN] = useState(0)
  // ✅ 引用稳定,Child 不重渲染
  const handleClick = useCallback(() => console.log('clicked'), [])
  return <Child onClick={handleClick} />
}

// ====================================================
// 场景 D:Context value 必须 memo,否则下游全部重渲染
// ====================================================
const UserContext = React.createContext(null)

function BadProvider({ children }) {
  const [user, setUser] = useState({ name: 'A' })
  // ❌ 每次渲染都创建新对象 → 所有 useContext(UserContext) 的组件全部重渲染
  return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>
}

function GoodProvider({ children }) {
  const [user, setUser] = useState({ name: 'A' })
  const value = useMemo(() => ({ user, setUser }), [user])
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

// ====================================================
// 关于 React.memo
// ====================================================
//
// 1. 默认浅比较 props,所有 prop 引用相同才跳过
// 2. function props 必须 useCallback,object props 必须 useMemo,否则 memo 失效
// 3. children 是 prop,JSX 每次都是新对象 → memo 子带 children 时往往无效
//
// 折中:把会变的 state 下推到只用它的小子树,而不是把整棵树 memo

// ====================================================
// 真实优化优先级
// ====================================================
//
// 1. 别在 render 中创建新 array/object 当 prop(无 memo 时不影响,有 memo 时影响)
// 2. 长列表用虚拟滚动(react-window / @tanstack/react-virtual)
// 3. 把会变的 state 下推到使用它的小组件
// 4. Profiler 找到的瓶颈才加 memo,不要预防性 memo
// 5. React Compiler(2025 RC 中)能自动 memo,以后这些手工活会消失

export { BigList, GoodParent, BadParent, GoodProvider, BadProvider }
