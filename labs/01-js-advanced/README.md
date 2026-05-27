# 01 · JavaScript 进阶

> 目标:面试和写代码时,任何关于 JS 语义、闭包、原型、异步的灵魂拷问都能秒答。

---

## Roadmap

```
1. 执行模型      → 词法环境 / 闭包 / TDZ / 提升
2. this 三重门   → 调用 / 显式绑定 / 箭头函数
3. 原型与继承    → 原型链 / class / 私有字段
4. 迭代协议      → for...of / Generator / async iterator
5. 异步模型      → 微任务 / 宏任务 / Promise A+ 细节
6. Proxy/Reflect → 元编程 / Vue 响应式底层
7. 模块系统      → ESM vs CommonJS / 静态分析 / 循环引用
8. 内存与 GC     → 标记清除 / 弱引用 / 内存泄漏诊断
9. 数字与字符串  → IEEE 754 陷阱 / 字符串编码 / UTF-16/Unicode
10. 工程现实    → 现代项目里这些知识真正用在哪
```

---

## 1. 执行模型

### 词法环境(Lexical Environment)

```js
function outer() {
  const x = 1
  function inner() {
    console.log(x)  // 通过作用域链找 x
  }
  return inner
}
const fn = outer()
fn()  // 1 —— x 被闭包持有,outer 早就 return 了
```

**闭包不是魔法**:`inner` 持有对 `outer` 的 LexicalEnvironment 的引用,GC 不能回收 `x`。

### TDZ(Temporal Dead Zone)

```js
console.log(x)  // ReferenceError
let x = 1
```

`var` 会被提升并初始化为 `undefined`;`let/const` 提升了但不初始化,**进入作用域到声明这段时间访问就是 TDZ**。

### 经典闭包陷阱

```js
// ❌ 都打 3
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)
}

// ✅ 0 1 2,因为 let 在每次循环新建词法环境
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)
}
```

---

## 2. this 三重门

```
this 取值规则,按优先级从高到低:
  1. new 调用          → this = 新创建的对象
  2. .call/.apply/.bind → this = 显式传入的对象
  3. obj.method()      → this = obj
  4. 直接调用 fn()      → this = undefined(严格)/ global(非严格)
  5. 箭头函数          → 没有自己的 this,沿用词法 this
```

**箭头函数的细节:** 它的 `this` 在**定义时**确定,不是调用时。一旦定义死了就没法用 `.call` 改。

```js
const obj = {
  x: 1,
  arrow: () => this.x,        // this 在 module 顶层确定,不是 obj
  method() { return this.x }, // this = 调用者
}
obj.arrow()   // undefined(严格模式)
obj.method()  // 1
```

---

## 3. 原型与继承

```
       Object.prototype
              ↑ __proto__
       Animal.prototype
              ↑ __proto__
       Dog.prototype
              ↑ __proto__
        dog 实例
```

`class` 是语法糖:

```js
class Animal {
  #age = 0           // 私有字段(真 ES 标准)
  static count = 0   // 静态字段
  static {           // 静态块(类初始化时跑一次)
    Animal.count = 100
  }
}
```

**关键点:`#field` 是真私有**,无法通过 `obj['#age']` 访问,Proxy 也拦不到。Vue 3 响应式早期版本就栽过这个坑。

---

## 4. 迭代协议

```js
const iterable = {
  [Symbol.iterator]() {
    let i = 0
    return {
      next() {
        return i < 3 ? { value: i++, done: false } : { done: true }
      }
    }
  }
}
for (const v of iterable) console.log(v)  // 0 1 2
```

### Generator —— 可暂停的函数

```js
function* range(start, end) {
  for (let i = start; i < end; i++) yield i
}
[...range(0, 3)]  // [0, 1, 2]

// 双向通信:.next(value) 把 value 发回给 yield 表达式
function* echo() {
  const x = yield 'first'
  console.log('got', x)
}
const g = echo()
g.next()           // { value: 'first', done: false }
g.next('hello')    // 打印 'got hello'
```

### Async Iterator —— Generator 的异步版

```js
async function* fetchPages() {
  let url = '/api/page/1'
  while (url) {
    const res = await fetch(url).then(r => r.json())
    yield res.data
    url = res.nextUrl
  }
}

for await (const page of fetchPages()) {
  console.log(page)
}
```

**真实用法:** Node stream / Web Streams 都是 async iterable;React Server Components 流式渲染也用这个。

---

## 5. 异步模型

### Event Loop 一图流

```
┌─────────────────────┐
│   Call Stack(主线程) │  ← 同步代码在这跑
└──────────┬──────────┘
           ↓ 空了
┌─────────────────────┐
│   Microtask Queue    │  ← Promise.then / queueMicrotask
└──────────┬──────────┘
           ↓ 清空(全部跑完)
┌─────────────────────┐
│   Macrotask Queue    │  ← setTimeout / I/O / UI 事件
└──────────┬──────────┘
           ↓ 一次跑一个
┌─────────────────────┐
│   Render             │  ← 浏览器渲染(可能)
└─────────────────────┘
```

**关键:每跑完一个宏任务就把所有微任务清空,再考虑渲染。**

经典题:

```js
console.log('1')
setTimeout(() => console.log('2'), 0)
Promise.resolve().then(() => console.log('3'))
console.log('4')
// 1 4 3 2
```

### Promise A+ 细节

- `Promise.resolve(thenable)` 会"吸收"另一个 promise(链平铺)
- `.then(onFulfilled, onRejected)` 必须异步调用(进微任务)
- 一个 promise 只能 resolve/reject 一次,后续 ignore

### Promise 高级技巧

```js
// 并发限制(没有原生 API,但常用)
async function pLimit(tasks, limit) {
  const results = []
  const executing = new Set()
  for (const task of tasks) {
    const p = task().finally(() => executing.delete(p))
    results.push(p)
    executing.add(p)
    if (executing.size >= limit) await Promise.race(executing)
  }
  return Promise.all(results)
}

// Promise.allSettled vs all vs race vs any
Promise.all([...])         // 任一失败即失败
Promise.allSettled([...])  // 都跑完,得到 [{status, value/reason}]
Promise.race([...])        // 第一个 settle(成功或失败)
Promise.any([...])         // 第一个成功;全失败给 AggregateError
```

### 取消异步:AbortController

```js
const ctrl = new AbortController()
fetch('/api', { signal: ctrl.signal })
setTimeout(() => ctrl.abort(), 5000)  // 5 秒后取消

// 你的异步函数也能响应取消
async function task(signal) {
  for (let i = 0; i < 100; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    await doWork()
  }
}
```

---

## 6. Proxy / Reflect —— 元编程

```js
const target = { a: 1 }
const proxy = new Proxy(target, {
  get(t, key, receiver) {
    console.log('reading', key)
    return Reflect.get(t, key, receiver)
  },
  set(t, key, value, receiver) {
    console.log('writing', key, '=', value)
    return Reflect.set(t, key, value, receiver)
  }
})

proxy.a       // reading a
proxy.a = 2   // writing a = 2
```

**Vue 3 的响应式就是这么写的**(简化版):

```js
function reactive(obj) {
  return new Proxy(obj, {
    get(t, k, r) { track(t, k); return Reflect.get(t, k, r) },
    set(t, k, v, r) { Reflect.set(t, k, v, r); trigger(t, k); return true },
  })
}
```

**Proxy 的 13 个 trap**:get/set/has/deleteProperty/ownKeys/getPrototypeOf/setPrototypeOf/isExtensible/preventExtensions/getOwnPropertyDescriptor/defineProperty/apply/construct。

**Proxy 的限制**:
- 拦不到 `#privateField`
- 拦不到原始值
- 重新赋值整个对象会失效(`obj = newObj` 时 proxy 不再是它)

---

## 7. 模块系统

| | ESM | CommonJS |
|---|---|---|
| 语法 | `import / export` | `require / module.exports` |
| 加载时机 | 解析阶段静态分析,异步加载 | 运行时同步 |
| Top-level await | ✅ | ❌ |
| Tree shaking | ✅(因为静态) | ❌ |
| `__dirname` | 用 `import.meta.url` | 直接用 |
| 循环引用 | export live bindings,通常 OK | 一方拿到半成品 |

**坑:**
- ESM 里 `import` 是 live binding(变量本身,不是值快照)
- CJS 里 `require` 拿的是值快照
- 这导致 ESM 互导循环时不容易塌(都看的是同一个 binding)

---

## 8. 内存与 GC

V8 用**分代 GC + 标记清除**:
- 新生代(Scavenge):新分配的对象,大部分活不过几次 GC
- 老生代(Mark-Sweep + Mark-Compact):活下来的进老生代

**常见内存泄漏:**
1. 全局变量(`window.x = bigData`)
2. 闭包持有大对象
3. 没清的定时器 / 事件监听
4. 脱离 DOM 但 JS 还持有引用

**调试:Chrome DevTools → Memory → Heap snapshot,做三次拍照对比(3-snapshot technique)。**

### WeakRef / WeakMap / WeakSet

```js
const cache = new WeakMap()
function getMeta(obj) {
  if (!cache.has(obj)) cache.set(obj, computeMeta(obj))
  return cache.get(obj)
}
// obj 没有其他引用时,WeakMap 不阻止 GC
```

---

## 9. 数字与字符串陷阱

### 浮点

```js
0.1 + 0.2 === 0.3       // false(0.30000000000000004)
0.1 + 0.2 === 0.3       // 因为 IEEE 754 二进制不能精确表示 0.1
Number.EPSILON          // 比较浮点的最小阈值
```

业务里涉及金额一律用整数(分)或 decimal 库(decimal.js / bignumber.js)。

### BigInt

```js
const big = 9007199254740993n
big + 1n  // 9007199254740994n
big + 1   // TypeError: 不能混 BigInt 和 Number
```

### UTF-16 / Unicode 大坑

```js
'😀'.length        // 2 —— JS 字符串是 UTF-16,emoji 占 2 code unit
[...'😀'].length   // 1 —— spread / for...of 按 code point 拆
```

**所以**:
- 想拿"用户视角的字符数":`[...str].length` 或 `Array.from(str).length`
- `str.slice(0, 1)` 会切碎 emoji

---

## 10. 工程现实

| 场景 | 用到什么知识 |
|---|---|
| 写 React/Vue 组件 | 闭包(useState 的本质)、this 规则、Proxy(Vue 响应式) |
| 写状态管理 | 闭包封装 store、Proxy 跟踪、迭代器 subscribe |
| 写工具函数 | 防抖节流(闭包 + 定时器)、深拷贝(WeakMap 防循环) |
| 排查性能 | 微任务/宏任务时序、Long Task、GC pause |
| 排查内存泄漏 | 引用持有、WeakRef、Heap snapshot |
| 调用第三方 SDK | this 绑定(`.bind(sdk)`)、模块循环引用 |
| Server 端 / Bun / Deno | ESM vs CJS、top-level await |

---

## 推荐练习(在本 lab 里写)

1. `src/closure-counter.js` —— 用闭包实现一个 counter
2. `src/proxy-reactive.js` —— 50 行实现 Vue reactive
3. `src/p-limit.js` —— Promise 并发限制
4. `src/abortable-fetch.js` —— 带超时+取消的 fetch
5. `src/lru-cache.js` —— LRU cache(Map 的有序性 + WeakMap)
6. `src/event-emitter.js` —— 手写 EventEmitter,支持 once/off

每个写完用 testing-lab 学的方法测一遍。

## 推荐阅读

- 《You Don't Know JS》系列 — Kyle Simpson(经典)
- ECMA-262 规范(查实现细节时去翻)
- v8.dev blog(了解 V8 内部)
