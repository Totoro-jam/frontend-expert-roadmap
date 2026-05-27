// 手写 EventEmitter,Node EventEmitter / mitt / EventBus 都是这个原型
// 注意:用 Set 而不是数组,off 时 O(1)

export class EventEmitter {
  #handlers = new Map()  // event -> Set<handler>

  on(event, handler) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set())
    this.#handlers.get(event).add(handler)
    return () => this.off(event, handler)  // 返回 unsubscribe,Hooks 友好
  }

  off(event, handler) {
    this.#handlers.get(event)?.delete(handler)
  }

  once(event, handler) {
    const wrapped = (...args) => {
      handler(...args)
      this.off(event, wrapped)
    }
    return this.on(event, wrapped)
  }

  emit(event, ...args) {
    // 重要:copy 一份再 iterate,避免 handler 自己 off 时漏掉其他
    const handlers = this.#handlers.get(event)
    if (!handlers) return
    for (const h of [...handlers]) {
      try { h(...args) }
      catch (err) {
        // 一个 handler 抛错不影响其他
        queueMicrotask(() => { throw err })
      }
    }
  }

  clear(event) {
    if (event) this.#handlers.delete(event)
    else this.#handlers.clear()
  }
}
