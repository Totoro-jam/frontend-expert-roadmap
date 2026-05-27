// 300 行实现一个 React-like:VDOM + reconcile + hooks
// 读懂这个,React 内部就不再神秘

// ====================================================
// 1. createElement — JSX 编译后调用的就是它
// ====================================================
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.flat().map(c =>
        typeof c === 'object' ? c : createTextElement(c)
      ),
    },
  }
}

function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: { nodeValue: text, children: [] },
  }
}

// ====================================================
// 2. render — 创建真实 DOM 并挂载
// 简化版:递归同步渲染。真实 React 是基于 fiber 的可中断渲染
// ====================================================
function render(element, container) {
  const dom = element.type === 'TEXT_ELEMENT'
    ? document.createTextNode('')
    : document.createElement(element.type)

  // props → DOM 属性
  Object.keys(element.props)
    .filter(k => k !== 'children')
    .forEach(k => {
      if (k.startsWith('on')) {
        dom.addEventListener(k.slice(2).toLowerCase(), element.props[k])
      } else {
        dom[k] = element.props[k]
      }
    })

  element.props.children.forEach(child => render(child, dom))
  container.appendChild(dom)
}

// ====================================================
// 3. Hooks — 用「调用顺序」关联状态
// ====================================================
let currentComponent = null
let hookIndex = 0

function useState(initial) {
  const c = currentComponent
  const i = hookIndex++
  c.hooks[i] ??= { value: typeof initial === 'function' ? initial() : initial }
  const hook = c.hooks[i]
  const setState = (next) => {
    hook.value = typeof next === 'function' ? next(hook.value) : next
    scheduleUpdate(c)   // 触发重渲染
  }
  return [hook.value, setState]
}

function useEffect(fn, deps) {
  const c = currentComponent
  const i = hookIndex++
  const prev = c.hooks[i]
  const changed = !prev || !deps || deps.some((d, j) => d !== prev.deps[j])
  if (changed) {
    prev?.cleanup?.()
    queueMicrotask(() => {
      const cleanup = fn()
      c.hooks[i] = { deps, cleanup }
    })
  }
}

function useMemo(fn, deps) {
  const c = currentComponent
  const i = hookIndex++
  const prev = c.hooks[i]
  if (!prev || deps.some((d, j) => d !== prev.deps[j])) {
    c.hooks[i] = { value: fn(), deps }
  }
  return c.hooks[i].value
}

function useCallback(fn, deps) {
  return useMemo(() => fn, deps)
}

function useRef(initial) {
  return useMemo(() => ({ current: initial }), [])
}

// ====================================================
// 4. 组件渲染 + 重新调度(简化:重渲染整棵子树)
// ====================================================
function renderComponent(componentFn, props, container) {
  const instance = {
    fn: componentFn,
    props,
    container,
    hooks: [],
  }
  scheduleUpdate(instance)
  return instance
}

function scheduleUpdate(instance) {
  // 真实 React:加入 fiber 调度队列,可中断、可优先级化
  // 这里:同步重渲染
  currentComponent = instance
  hookIndex = 0
  const element = instance.fn(instance.props)
  instance.container.innerHTML = ''   // ❌ 真 React 用 diff,这里偷懒
  render(element, instance.container)
  currentComponent = null
}

// ====================================================
// 5. 用法演示
// ====================================================
/*
  function Counter() {
    const [count, setCount] = useState(0)

    useEffect(() => {
      console.log('count is', count)
      return () => console.log('cleanup', count)
    }, [count])

    return createElement('div', null,
      createElement('h1', null, `Count: ${count}`),
      createElement('button', { onClick: () => setCount(c => c + 1) }, '+1')
    )
  }

  renderComponent(Counter, {}, document.getElementById('root'))
*/

// ====================================================
// 关键差距(本实现 vs 真实 React)
// ====================================================
//
// 1. 没有 reconciliation:每次重渲染都全量重建 DOM,不 diff
//    → 真 React 用 fiber 链表 + key 对比,只更新差异
//
// 2. 没有时间切片:同步渲染,长任务卡死主线程
//    → React 18 的 concurrent renderer 可暂停、可恢复
//
// 3. 没有 Suspense:同步取数据会报错
//    → React 用 throw promise 实现 Suspense 边界
//
// 4. 事件系统简陋:直接绑 DOM
//    → React 用合成事件,顶层委托 + 跨浏览器统一
//
// 5. 没有 Server Components / Hydration

export { createElement, render, useState, useEffect, useMemo, useCallback, useRef, renderComponent }
