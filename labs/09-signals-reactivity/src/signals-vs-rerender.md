# Signals vs Re-render-by-default —— 真实差异

## 例子:一个计数器,父组件还有 100 个无关子组件

### React 模型

```jsx
function App() {
  const [count, setCount] = useState(0)
  return (
    <>
      <p>{count}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      {/* 这 100 个组件每次 count 变都会 re-render(虽然 vdom diff 后大多无变化) */}
      {Array.from({ length: 100 }).map((_, i) => <Item key={i} />)}
    </>
  )
}
```

**setCount 触发**:
1. App 重新执行(整个函数体)
2. JSX 全部重新创建(101 个 VNode)
3. Reconciler 对比新旧 vdom
4. Item 被发现「props 没变 + 没 memo」→ 还是会重新执行 Item()
5. Item 内 vdom 比较没差异 → 不操作 DOM

**真实开销**:101 次组件函数执行 + vdom 创建 + diff
**优化**:Item 加 `memo`,或上面的 count 提取到子组件里

### Solid 模型

```jsx
function App() {
  const [count, setCount] = createSignal(0)
  return (
    <>
      <p>{count()}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      {Array.from({ length: 100 }).map((_, i) => <Item key={i} />)}
    </>
  )
}
```

**setCount 触发**:
1. count 通知它的订阅者 = 只有 `<p>` 里那个文本节点
2. 直接更新 textNode.nodeValue
3. App 不重新执行,Item 也不重新执行

**真实开销**:1 次文本更新。**0 次组件函数执行**。

### 关键认知

* React 的 vdom diff 单次成本不高(微秒级),但**所有组件都执行**(用户写的代码 + JSX 调用 + hook 链表 + reconciler) → 累积起来在大应用是几十毫秒
* Signals 的更新成本**只跟变化数有关**,跟组件树大小无关
* React.memo 是「补丁」:把 push-based 模型切成树状的「订阅边界」,但需要程序员手工标
* React Compiler(2025)= 自动加 memo,缓解但不根治

## 那为什么大家还用 React?

1. **生态最大**(库、招聘、教程都最多)
2. **心智模型简单**:组件 = 纯函数,state 变 → re-render,容易推理
3. **Server Components / Streaming SSR / Suspense** 这套是 Meta 推动的,Solid/Svelte 在追
4. **大公司的「换框架成本」 >> 框架性能差异**

## 在 React 里用 Signals?

```jsx
import { signal } from '@preact/signals-react'

const count = signal(0)

function App() {
  // count.value 在 JSX 里自动建立 signal 订阅
  // 即使 App 是非 memo,count.value 变只更新对应 DOM 节点
  return <div>{count} <button onClick={() => count.value++}>+</button></div>
}
```

* 在 React 18+ 配合 `@preact/signals-react` 可以拿到 fine-grained 更新
* 但!不被官方支持,Hooks 生态(useEffect 等)还是 push-based
* 实际项目还是「signals 用在性能热点」(实时数据、画板、游戏)

## 怎么选?

| 场景 | 推荐 |
|---|---|
| 大型企业应用 | React(招人 + 生态) |
| 性能敏感的实时应用(协同、游戏、监控) | SolidJS / Svelte 5 |
| 已有 Vue 3 项目 | 继续 Vue,reactivity 不弱 |
| 写组件库 | Solid 或 Web Components |
| 学习反应式原理 | 从 Preact Signals 源码入手(500 行) |
