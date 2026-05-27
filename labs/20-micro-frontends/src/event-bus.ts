// 类型安全的微前端事件总线
// 用 BroadcastChannel(跨 tab + 跨 iframe + 跨 MFE 都通)+ 类型约束

// =====================================================
// 1. 共享事件类型定义(放在 shared npm 包里)
// =====================================================
export interface EventMap {
  'user:login': { userId: string; token: string }
  'user:logout': void
  'theme:change': { theme: 'light' | 'dark' }
  'locale:change': { locale: 'zh-CN' | 'en-US' }
  'cart:add': { sku: string; qty: number }
  'router:navigate': { path: string; from: string }
}

type EventName = keyof EventMap

type Handler<E extends EventName> = (data: EventMap[E]) => void

// =====================================================
// 2. EventBus 实现:本地 EventTarget + BroadcastChannel
// =====================================================
class TypedBus {
  private local = new EventTarget()
  private bc: BroadcastChannel | null = null
  private namespace: string

  constructor(namespace = 'mfe') {
    this.namespace = namespace
    try {
      this.bc = new BroadcastChannel(`${namespace}-events`)
      this.bc.onmessage = (e) => {
        // 跨 tab/MFE 来的消息,触发本地 listener(但不再 emit 出去,防循环)
        const { event, data } = e.data
        this.localEmit(event, data)
      }
    } catch {
      // 老浏览器不支持 BroadcastChannel,退化只本地
    }
  }

  emit<E extends EventName>(event: E, data: EventMap[E]) {
    this.localEmit(event, data)
    this.bc?.postMessage({ event, data })
  }

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    const wrap = (e: Event) => handler((e as CustomEvent).detail)
    this.local.addEventListener(event, wrap)
    return () => this.local.removeEventListener(event, wrap)
  }

  once<E extends EventName>(event: E, handler: Handler<E>): () => void {
    const off = this.on(event, (data) => {
      off()
      handler(data)
    })
    return off
  }

  /** Promise 版:等下一次 */
  waitFor<E extends EventName>(event: E, timeoutMs = 30_000): Promise<EventMap[E]> {
    return new Promise((resolve, reject) => {
      const off = this.once(event, (data) => {
        clearTimeout(timer)
        resolve(data)
      })
      const timer = setTimeout(() => {
        off()
        reject(new Error(`waitFor(${event}) timeout`))
      }, timeoutMs)
    })
  }

  destroy() {
    this.bc?.close()
    this.bc = null
  }

  private localEmit<E extends EventName>(event: E, data: EventMap[E]) {
    this.local.dispatchEvent(new CustomEvent(event, { detail: data }))
  }
}

// =====================================================
// 3. 单例(每个 MFE 注入同一个 namespace)
// =====================================================
let _bus: TypedBus | null = null

export function getBus(): TypedBus {
  if (!_bus) _bus = new TypedBus('shell-v1')
  return _bus
}

// =====================================================
// 4. 用法
// =====================================================
/*
// MFE A:发事件
const bus = getBus()
bus.emit('user:login', { userId: 'u123', token: '...' })

// MFE B:订阅
const off = bus.on('user:login', ({ userId }) => {
  console.log('User logged in:', userId)
  // 更新本地 store
})
// 卸载时
off()

// 等待事件
const { theme } = await bus.waitFor('theme:change')

// 类型检查
bus.emit('user:login', { wrong: true })  // ❌ TS 错
bus.on('unknown:event', ...)              // ❌ TS 错
*/

// =====================================================
// 5. React Hook 封装
// =====================================================
import { useEffect, useState } from 'react'

export function useEvent<E extends EventName>(
  event: E,
  handler: Handler<E>,
  deps: any[] = [],
) {
  useEffect(() => {
    const off = getBus().on(event, handler)
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** 同步全局状态到本地 React state */
export function useGlobalState<E extends EventName, T = EventMap[E]>(
  event: E,
  initial: T,
): T {
  const [state, setState] = useState<T>(initial)
  useEvent(event, (data) => setState(data as T))
  return state
}

// =====================================================
// 6. 为什么不直接用 window.dispatchEvent?
// =====================================================
//
// 1. window event 没类型(EventMap 是自定义的)
// 2. qiankun 沙箱里 window 是 Proxy,跨子应用未必同一个
// 3. BroadcastChannel 跨 tab / 跨 iframe / 跨 MFE 天然通
// 4. EventTarget 不依赖 DOM,Node SSR 也能用(polyfill 简单)
//
// 真实项目的 EventBus 还会加:
//   - 消息去重(messageId + 5 秒窗口)
//   - 持久化(crash 后回放 last N 个事件)
//   - 调试面板(devtools 显示所有事件流)
//   - 权限(某些事件只允许特定 MFE 发)
