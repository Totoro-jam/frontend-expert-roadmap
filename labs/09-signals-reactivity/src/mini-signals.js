// 50 行实现 signal / computed / effect —— Preact Signals / Solid 的核心
// 读懂这个,Vue 3、Solid、Angular Signals、Svelte 5 都通

let currentEffect = null
const effectStack = []   // 支持嵌套 effect

function pushEffect(e) { effectStack.push(currentEffect); currentEffect = e }
function popEffect()   { currentEffect = effectStack.pop() }

// ====================================================
// signal:可变状态
// ====================================================
export function signal(value) {
  const subscribers = new Set()

  return {
    get value() {
      if (currentEffect) {
        subscribers.add(currentEffect)
        currentEffect.deps.add(subscribers)   // 记录反向引用,cleanup 时解绑
      }
      return value
    },
    set value(next) {
      if (Object.is(next, value)) return     // 相同值不触发
      value = next
      // 复制一份再迭代:effect 自己可能 set 其他 signal 触发同步的链式更新
      for (const e of [...subscribers]) e.run()
    },
  }
}

// ====================================================
// effect:订阅 signal,值变化时重跑
// ====================================================
export function effect(fn) {
  const e = {
    deps: new Set(),       // 此 effect 订阅了哪些 signal 的 subscribers 集合
    run() {
      // 清空旧依赖(下次 fn 会重新收集),否则 effect 内条件分支会留死依赖
      for (const dep of e.deps) dep.delete(e)
      e.deps.clear()
      pushEffect(e)
      try { fn() }
      finally { popEffect() }
    },
    stop() {
      for (const dep of e.deps) dep.delete(e)
      e.deps.clear()
    },
  }
  e.run()
  return () => e.stop()
}

// ====================================================
// computed:派生(惰性 + 缓存)
// ====================================================
export function computed(fn) {
  let cached
  let dirty = true
  const c = signal(undefined)

  // 用一个 effect 在依赖变化时把 c 标脏
  effect(() => {
    fn()         // 注:这里跑一次是为了收集依赖,真实库会更聪明
    dirty = true
    c.value = Symbol()    // 触发下游订阅者
  })

  return {
    get value() {
      void c.value         // 订阅 c,让下游 effect 跟着我变
      if (dirty) {
        cached = fn()
        dirty = false
      }
      return cached
    },
  }
}

// ====================================================
// 用法演示
// ====================================================
/*
  const count = signal(0)
  const double = computed(() => count.value * 2)

  const dispose = effect(() => {
    console.log('count', count.value, 'double', double.value)
  })
  // 立即打印:count 0 double 0

  count.value = 1
  // 打印:count 1 double 2

  count.value = 1   // 同值不触发

  dispose()    // 解绑
  count.value = 5   // 不打印
*/

// ====================================================
// 与生产实现的差距(本实现 vs Preact Signals)
// ====================================================
//
// 1. computed 实现简化了。生产版用「版本号」避免不必要的 re-eval
// 2. 没有 batch:连续多次 set 会触发多次 effect。生产 batch:
//      batch(() => { a.value = 1; b.value = 2 })  // 只触发一次 effect
// 3. 没有 untracked / peek:effect 内想读 signal 但不订阅
// 4. 没有错误边界
// 5. 没有 SSR / hydration 适配
//
// Preact Signals 全部加起来也才 ~500 行,推荐看源码
