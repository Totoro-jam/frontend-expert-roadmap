// 50 行实现一个 Vue 3 风格的响应式系统
// 帮助理解 Proxy + 依赖收集 + 触发更新的本质

let activeEffect = null
const targetMap = new WeakMap()  // target -> Map<key, Set<effect>>

function track(target, key) {
  if (!activeEffect) return
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, depsMap = new Map())
  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, dep = new Set())
  dep.add(activeEffect)
}

function trigger(target, key) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return
  const dep = depsMap.get(key)
  if (dep) dep.forEach(effect => effect())
}

export function reactive(obj) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      track(target, key)
      const value = Reflect.get(target, key, receiver)
      // 嵌套对象也变成响应式(惰性)
      return typeof value === 'object' && value !== null ? reactive(value) : value
    },
    set(target, key, value, receiver) {
      const oldValue = target[key]
      const result = Reflect.set(target, key, value, receiver)
      if (oldValue !== value) trigger(target, key)
      return result
    },
  })
}

export function effect(fn) {
  activeEffect = fn
  fn()  // 跑一次,期间任何 reactive get 都会被收集为依赖
  activeEffect = null
}

// 用法演示
// const state = reactive({ count: 0, user: { name: 'A' } })
// effect(() => console.log('count is', state.count))   // 立即打印 0
// state.count++                                          // 自动打印 1
// state.user.name = 'B'                                  // 自动打印(嵌套也响应)
