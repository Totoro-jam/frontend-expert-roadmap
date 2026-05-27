// Composable 标准模板:useMouse
// 良好 Composable 的 5 条规则,见底部

import { ref, onMounted, onUnmounted, type Ref } from 'vue'

interface UseMouseOptions {
  /** 是否监听 touch 事件(移动端) */
  touch?: boolean
  /** 节流毫秒数;0 = 不节流 */
  throttle?: number
}

interface UseMouseReturn {
  x: Ref<number>
  y: Ref<number>
  isInside: Ref<boolean>
  stop: () => void
}

export function useMouse(options: UseMouseOptions = {}): UseMouseReturn {
  const { touch = true, throttle = 0 } = options

  const x = ref(0)
  const y = ref(0)
  const isInside = ref(false)

  let last = 0

  const update = (ev: MouseEvent | TouchEvent) => {
    const now = Date.now()
    if (throttle && now - last < throttle) return
    last = now

    if ('touches' in ev) {
      const t = ev.touches[0]
      if (!t) return
      x.value = t.clientX
      y.value = t.clientY
    } else {
      x.value = ev.clientX
      y.value = ev.clientY
    }
  }

  const enter = () => (isInside.value = true)
  const leave = () => (isInside.value = false)

  let cleanup: (() => void) | null = null

  const start = () => {
    window.addEventListener('mousemove', update)
    document.addEventListener('mouseenter', enter)
    document.addEventListener('mouseleave', leave)
    if (touch) {
      window.addEventListener('touchmove', update, { passive: true })
    }
    cleanup = () => {
      window.removeEventListener('mousemove', update)
      document.removeEventListener('mouseenter', enter)
      document.removeEventListener('mouseleave', leave)
      if (touch) window.removeEventListener('touchmove', update)
    }
  }

  const stop = () => {
    cleanup?.()
    cleanup = null
  }

  // 关键:onMounted/onUnmounted 必须在 setup 同步调用上下文里执行
  // 所以 Composable 必须在 <script setup> 顶层调用
  onMounted(start)
  onUnmounted(stop)

  return { x, y, isInside, stop }
}

// ====================================================
// 良好 Composable 的 5 条规则
// ====================================================
//
// 1. 用 `use` 前缀命名(useFoo / useBar),与组件区分
//
// 2. 返回值:全 ref 化(可解构而不丢响应),或 readonly 对象
//
// 3. 副作用要自清理:在 onUnmounted 解绑监听器,fetch 用 AbortController
//
// 4. 接受 options 而不是位置参数(以后扩展不破坏 API)
//
// 5. 暴露 stop() 让调用方可手动停(写大型 App 时很重要)
//
// 反例:
//   ❌ 在 Composable 里调用其他 Composable 之外的钩子(必须 setup 同步)
//   ❌ 返回 reactive 对象(用户解构就丢响应)
//   ❌ 用全局变量存状态(应该每次调用都创建新实例,除非显式 shared)
//
// 对比 React Hook:
//   - Vue 没有「调用顺序」依赖,所以可以放条件里
//   - 但 onMounted 等生命周期 hook 必须在 setup 顶层同步调用
//   - Vue Composable 内部的 ref/reactive 「不需要依赖数组」就能自动追踪
