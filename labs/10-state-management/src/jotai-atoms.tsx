// Jotai:原子化状态(Recoil 思想 + 更简单 API)
// 适合大量松散的、独立的全局状态

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage, atomFamily, splitAtom } from 'jotai/utils'

// ====================================================
// 1. 基础 atom
// ====================================================
const countAtom = atom(0)

function Counter() {
  const [count, setCount] = useAtom(countAtom)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}

// ====================================================
// 2. Derived atom(自动依赖追踪)
// ====================================================
const doubleAtom = atom(get => get(countAtom) * 2)

function Double() {
  const d = useAtomValue(doubleAtom)   // 只 count 变才 re-render
  return <span>{d}</span>
}

// ====================================================
// 3. Write-only atom(action)
// ====================================================
const incAtom = atom(
  null,                                     // 不可读
  (get, set) => set(countAtom, get(countAtom) + 1)
)

function IncButton() {
  const inc = useSetAtom(incAtom)
  return <button onClick={inc}>+</button>
}

// ====================================================
// 4. Async atom(配合 Suspense)
// ====================================================
const userAtom = atom(async (get) => {
  const id = get(countAtom)
  const res = await fetch(`/api/users/${id}`)
  return res.json()
})

function User() {
  // 配合 <Suspense fallback={...}> 使用
  const user = useAtomValue(userAtom)
  return <p>{user.name}</p>
}

// ====================================================
// 5. atomWithStorage:localStorage 自动同步
// ====================================================
const themeAtom = atomWithStorage('theme', 'light')

// ====================================================
// 6. atomFamily:每个 id 一个独立 atom
// ====================================================
const todoAtom = atomFamily((id: string) =>
  atom({ id, text: '', done: false })
)

function TodoItem({ id }: { id: string }) {
  const [todo, setTodo] = useAtom(todoAtom(id))
  return <input value={todo.text} onChange={e => setTodo({ ...todo, text: e.target.value })} />
}

// ====================================================
// 7. splitAtom:把数组拆成多个 atom
// ====================================================
const todosAtom = atom<{ id: string; text: string }[]>([])
const todoAtomsAtom = splitAtom(todosAtom)

function TodoList() {
  const [todoAtoms, dispatch] = useAtom(todoAtomsAtom)
  return (
    <>
      {todoAtoms.map((a, i) => <TodoRow key={i} atom={a} />)}
      <button onClick={() => dispatch({ type: 'insert', value: { id: 'x', text: '' } })}>Add</button>
    </>
  )
}

function TodoRow({ atom: a }: { atom: any }) {
  const [todo, setTodo] = useAtom(a)
  return <span>{todo.text}</span>
}

// ====================================================
// 何时选 Jotai vs Zustand?
// ====================================================
//
// Jotai 优势:
//   - 「细粒度」:只有用到这个 atom 的组件 re-render
//   - 派生依赖自动追踪(像 signals)
//   - 异步 + Suspense 原生支持
//   - atomFamily / atomWithStorage / loadable 等丰富工具
//
// Zustand 优势:
//   - 一个 store 一目了然(适合「业务模块」)
//   - 不依赖 Provider
//   - 心智简单
//
// 经验:
//   - 状态彼此「相关」(一个业务模块的属性)→ Zustand
//   - 状态彼此「独立」(用户配置、UI 偏好、各种小开关)→ Jotai
//   - 两个混用也完全可以(Jotai 处理零散,Zustand 处理业务核心)

export { Counter, Double, IncButton, User, TodoList }
