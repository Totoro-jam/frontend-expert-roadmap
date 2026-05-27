# 09 · Signals & Reactivity Lab

> 2023-2025 前端的最大趋势:**Signals 复兴**。
> SolidJS、Preact Signals、Angular 17 Signals、Svelte 5 Runes、Vue 3 都基于同一个模型:**细粒度响应式**。
> React Forget(2025 RC)的目标也是「让组件感觉像 Signals」。

---

## 学这个能干什么

- 解释「为什么 React 的 re-render-by-default 模型有性能瓶颈,Signals 怎么解决」
- 读懂 Preact Signals / SolidJS / Vue 3 / Svelte 5 / Angular Signals 的源码(它们本质相同)
- 设计自己的小型反应式系统
- 在 React 里用 `@preact/signals-react` 获得 fine-grained 更新

---

## Roadmap

### 1. 三大反应式范式

```
┌─────────────────────────────────────────────────────────┐
│  范式 A: Push-based (VDOM diff)         e.g. React        │
│   state 变 → 顶层重渲染 → diff vdom → 提交差异              │
│   优点:心智简单(纯函数)                                   │
│   缺点:每次 update 都遍历整棵子树,memo 是补丁              │
├─────────────────────────────────────────────────────────┤
│  范式 B: Pull-based (Signals)           e.g. Solid/Preact │
│   state 变 → 通知订阅它的「effect」直接更新对应 DOM           │
│   组件函数只跑 1 次(创建期),之后只有 effect 跑             │
│   优点:更新是 O(变化数),不是 O(组件树)                    │
│   缺点:心智模型不一样(组件不是纯函数)                      │
├─────────────────────────────────────────────────────────┤
│  范式 C: Compiled reactivity            e.g. Svelte/Vue   │
│   编译期静态分析依赖,生成精准更新代码                       │
│   优点:运行时零开销                                        │
│   缺点:依赖编译器(不是纯 JS)                              │
└─────────────────────────────────────────────────────────┘
```

### 2. 核心三件套

任何 signals 库都有这三个原语:

```js
const count = signal(0)              // 1. signal:可变的反应式状态
const double = computed(() => count.value * 2)  // 2. computed:派生
effect(() => console.log(count.value))          // 3. effect:副作用
```

50 行就能实现。看 [src/mini-signals.js](src/mini-signals.js)。

### 3. SolidJS —— Signals 的「最纯净」实现

```jsx
import { createSignal, createEffect, createMemo } from 'solid-js'

function Counter() {
  const [count, setCount] = createSignal(0)
  const double = createMemo(() => count() * 2)

  createEffect(() => console.log('count', count()))

  // 注意:JSX 看起来像 React,但 Counter() 只跑一次!
  return (
    <div>
      <p>{count()} → {double()}</p>
      {/* count 变只更新这个文本节点,不重渲染整个 div */}
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  )
}
```

关键:**组件函数只在挂载时跑一次**,setCount 只更新它依赖的 DOM 文本节点。

### 4. Preact Signals —— 跨框架方案

```jsx
import { signal, computed, effect } from '@preact/signals-react'

const count = signal(0)
const double = computed(() => count.value * 2)

function Counter() {
  // count.value 在 JSX 里自动建立依赖
  return <div>{count} → {double}</div>   // 注意!不写 .value 也行(Preact 优化)
}
```

* `@preact/signals-react` 在 React 里用 Signals,绕过 vdom diff
* `@preact/signals-react-runtime` 通过 Babel 插件,把 JSX 里的 signal 引用直接订阅 DOM

### 5. Vue 3 Reactivity 系统(Pull-based,但用 Proxy)

```js
import { ref, computed, watchEffect } from 'vue'

const count = ref(0)
const double = computed(() => count.value * 2)
watchEffect(() => console.log(count.value))
```

* 跟 Signals 本质相同,接口换了名字
* `ref` ≈ `signal`,`computed` ≈ `computed`,`watchEffect` ≈ `effect`
* 区别:Vue 用 Proxy 让对象「自动 reactive」,Signals 一般只追单值

### 6. Svelte 5 Runes —— 编译期 + Signals 杂交

```svelte
<script>
  let count = $state(0)              // ← rune,告诉编译器这是 signal
  let double = $derived(count * 2)
  $effect(() => console.log(count))
</script>

<button onclick={() => count++}>{count} → {double}</button>
```

* Svelte 5 抛弃了 v4 的「赋值即响应」(对编译有黑魔法),改用显式 runes
* 写起来更像普通 JS,但编译产物精准更新

### 7. Angular Signals(17+)

```ts
import { signal, computed, effect } from '@angular/core'

count = signal(0)
double = computed(() => this.count() * 2)

constructor() {
  effect(() => console.log(this.count()))
}
```

* Angular 也加入了 signals,逐步取代 Zone.js
* `OnPush` 配合 signals = 跳过 Zone.js 的全局变更检测

### 8. React 19 / React Compiler:终于自动 memo

```jsx
// React 19 + Compiler(以前)
const Child = memo(({ user }) => <p>{user.name}</p>)
const sorted = useMemo(() => list.sort(), [list])

// React 19 + Compiler(以后)
function Child({ user }) { return <p>{user.name}</p> }   // ← 自动 memo
const sorted = list.sort()                                // ← 自动 useMemo
```

* React Compiler(2025 RC)= 在编译期自动加 memo
* 哲学:仍然「push-based + vdom」,但减少手工 memo 痛苦
* **Signals 派 vs Compiler 派,两条路线 5 年内会继续平行**

### 9. 性能基准 —— 不是「Signals 一定快」

* 真实瓶颈大多在网络 / SQL / 大列表 → 框架 overhead 占比小
* Signals 在「**频繁、小范围更新**」(实时数据、游戏、协同编辑)场景明显占优
* React + 虚拟滚动 + memo 用对了也能跑 60fps

### 10. 设计自己的反应式 store

```js
// 100 行的反应式 store(类似 Zustand 内部)
function createStore(initial) {
  let state = initial
  const listeners = new Set()

  return {
    get: () => state,
    set: (next) => {
      state = typeof next === 'function' ? next(state) : next
      listeners.forEach(l => l(state))
    },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) }
  }
}
```

* 加 selector + shallowEqual → 已经接近 Zustand
* 加依赖追踪 → 已经接近 Jotai
* 加 reducer 概念 → 已经接近 Redux

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [mini-signals.js](src/mini-signals.js) | 50 行实现 signal / computed / effect |
| [reactive-store.js](src/reactive-store.js) | 100 行实现 Zustand-like store |
| [signals-vs-rerender.md](src/signals-vs-rerender.md) | 渲染模型对比 |

---

## 资源

- 📖 [Ryan Carniato: Building a Reactive Library from Scratch](https://dev.to/ryansolid/building-a-reactive-library-from-scratch-1i0p) — Solid 作者的经典文
- 📖 [Preact Signals 源码](https://github.com/preactjs/signals/blob/main/packages/core/src/index.ts) — 不到 500 行
- 📖 [SolidJS docs](https://www.solidjs.com/)
- 📖 [Svelte 5 Runes](https://svelte.dev/docs/svelte/$state)
- 📖 [Angular Signals RFC](https://github.com/angular/angular/discussions/49685)
- 🎥 [Rich Harris: Rethinking Reactivity](https://www.youtube.com/watch?v=AdNJ3fydeao) — Svelte 作者
