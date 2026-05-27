# 07 · React Deep Lab

> 写了三年 React 还不知道 fiber、reconciler、commit/render phase 区别的人不在少数。
> 真正的专家能讲清 useEffect 依赖、闭包陷阱、并发渲染、useMemo 是不是优化、Suspense + Server Components 的本质。

---

## 学这个能干什么

- 在面试里解释 `useState` 为啥不立即更新、React 为啥要 immutable update
- 调试「无限循环」、「stale closure」、「Effect 跑两次(Strict Mode)」
- 决定何时该用 useMemo / useCallback、何时是过度优化
- 懂 RSC(React Server Component)和 Client Component 的边界规则
- 看懂 Zustand / Jotai / React Query 的 hooks 内部
- 写性能正确的列表组件(避免重渲染 1000 个 row)

---

## Roadmap

### 1. JSX → React Element → Fiber → DOM

```jsx
<button onClick={x}>OK</button>
// ↓ Babel/SWC
React.createElement('button', { onClick: x }, 'OK')
// ↓ React 调用,返回 ReactElement(POJO)
{ type: 'button', props: { onClick: x, children: 'OK' }, ... }
// ↓ 调和阶段
Fiber 节点(双缓冲树:current + workInProgress)
// ↓ commit 阶段
真实 DOM 操作
```

* Fiber 是 React 16+ 的内部数据结构,链表 + 可中断
* 渲染分两阶段:**render phase**(可中断、可重做、纯函数)+ **commit phase**(同步、有副作用)
* useEffect 在 commit 后异步执行,useLayoutEffect 同步(下次 paint 前)

### 2. Hooks 的真相 —— 链表

```js
// 简化模型
let hookIndex = 0
const hooks = []

function useState(initial) {
  const i = hookIndex++
  hooks[i] ??= initial
  const setState = (v) => { hooks[i] = v; rerender() }
  return [hooks[i], setState]
}
```

* Hook 靠**调用顺序**关联,所以**不能在条件 / 循环里调用**
* 自定义 hook 本质 = 一段「带 hook 调用」的函数,React 不区分内置和自定义
* 看 [01-js-advanced-lab](../01-js-advanced-lab/) 里的 closure 一节,理解 stale closure 的根源

### 3. State / Props / Re-render 模型

* setState 不立即更新,是「请求一次 re-render」
* 同一个事件里的多次 setState 自动 batch(React 18 全自动,包括 setTimeout/Promise 里)
* state updater 函数避免读到旧值:`setCount(c => c + 1)`
* 父 re-render → 所有子默认 re-render(除非 memo)

**Re-render 的精确条件**:
1. 自己 state 变化
2. 父组件 re-render(props 即使相同也重新比较)
3. 订阅的 context 变化
4. 上面包了 `memo` 会浅比较 props

### 4. useEffect 五大坑

1. **依赖数组写不全** → stale closure
   - 用 `eslint-plugin-react-hooks` 自动检测
2. **依赖写太多** → 频繁触发
   - 解决:`useCallback` 包函数、`useMemo` 包对象、或重构成 reducer
3. **Strict Mode 跑两次** → 副作用要可重复
   - 比如订阅必须返回 cleanup,定时器必须 clear
4. **闭包捕获了旧 state** → 用 ref 或者 functional updater
5. **同步阻塞渲染** → useLayoutEffect 误用

### 5. useMemo / useCallback —— 不是免费优化

```jsx
// ❌ 大多数 useMemo 是 cargo culting
const sum = useMemo(() => a + b, [a, b])    // 计算太便宜,memo 本身的开销更大

// ✅ 真正该 memo 的:
// 1. 计算昂贵(大数组排序、复杂 reduce)
// 2. 引用要稳定(传给 memo 子组件 / useEffect 依赖)
// 3. context value(避免下游全部重渲染)
```

**经验**:先不加,Profiler 看到再加。

### 6. Context —— 性能陷阱

```jsx
// ❌ 频繁变化的 value 放 context
<MyContext.Provider value={{ user, count }}>

// 任何一个 setState → 所有用 useContext(MyContext) 的组件重渲染
```

解决方案:
- 拆 context:user 一个、count 一个
- 用 [use-context-selector](https://github.com/dai-shi/use-context-selector)(模拟 selector)
- 用 Zustand / Jotai / Redux 这种「订阅模型」

### 7. Concurrent React(18+)

* `useTransition` —— 标记「不紧急」的 state update,可被打断
* `useDeferredValue` —— 给一个值「延后」一个版本(类似 debounce 但更智能)
* `Suspense` —— 声明式 loading 边界
* `startTransition` —— 包裹「会导致大量计算」的更新(过滤大列表)

```jsx
const [isPending, startTransition] = useTransition()
const [filter, setFilter] = useState('')

function onChange(e) {
  setFilter(e.target.value)   // 紧急,立即更新输入框
  startTransition(() => {
    setFilteredList(heavyFilter(list, e.target.value))  // 非紧急,可被打断
  })
}
```

### 8. Server Components(React 19+)

```tsx
// 'use client' 不写 = Server Component(默认!)
async function UserProfile({ id }: { id: string }) {
  const user = await db.user.findUnique({ where: { id } })  // 直接查库!
  return <div>{user.name}</div>
}
```

* Server Component:在服务端执行,不打包到 JS bundle
* **不能用 hooks / 浏览器 API / 事件**(因为没有客户端运行时)
* 通过 props 把数据传给 Client Component(必须可序列化)
* 边界规则:Server 可以引入 Client,Client 不能直接引入 Server(但可以接收 RSC children)

### 9. 性能调优清单

1. 用 React DevTools Profiler 找慢的组件
2. `memo` + `useMemo` + `useCallback` 三件套(精准使用)
3. List virtualization:`react-window` / `@tanstack/react-virtual` —— 大列表必备
4. Code splitting:`React.lazy` + `Suspense`
5. Hydration 优化:`useId` 保证 SSR/CSR id 一致
6. 避免在 render 中创建对象/函数(无 memo 时,作为 prop 会触发子组件重渲染)
7. `key` 用稳定 id,不用 index(尤其增删时)

### 10. 现代 React 必学库

| 类别 | 库 |
|---|---|
| 状态(简单) | useState / useReducer |
| 状态(全局) | Zustand / Jotai / Redux Toolkit |
| 异步状态 | TanStack Query / SWR |
| 表单 | React Hook Form |
| 路由 | React Router / TanStack Router(类型安全) |
| 动画 | Framer Motion / React Spring |
| UI 库 | Radix / shadcn-ui / Headless UI / Ark UI |

详见 [10-state-management-lab](../10-state-management-lab/) [11-data-fetching-lab](../11-data-fetching-lab/) [12-forms-lab](../12-forms-lab/) [23-animation-lab](../23-animation-lab/)

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [mini-react.js](src/mini-react.js) | 300 行实现 React 核心(VDOM + fiber + hooks) |
| [stale-closure.jsx](src/stale-closure.jsx) | useEffect 闭包陷阱 4 个案例 + 修复 |
| [why-memo.jsx](src/why-memo.jsx) | 何时该 memo / 何时是过度优化 |

---

## 资源

- 📖 [React 官方文档](https://react.dev) —— 重写后非常好
- 📖 [overreacted.io](https://overreacted.io) —— Dan Abramov 的博客,本质性讲解
- 📖 [Why Did You Render](https://github.com/welldone-software/why-did-you-render) —— 找出冗余渲染
- 📖 [React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture)
- 🎥 Mark Erikson 的 React/Redux talks
- 📖 [React 源码解读](https://react.iamkasong.com/) —— 中文 fiber 详解
