// LRU = Least Recently Used,容量满了淘汰"最久没被用过的"
// 利用 Map 的"插入顺序保留"特性 —— Map 在 JS 里是有序的!

export class LRU {
  constructor(capacity) {
    this.capacity = capacity
    this.map = new Map()
  }

  get(key) {
    if (!this.map.has(key)) return undefined
    // 命中:删了再 set,把它移到"最新"位置
    const value = this.map.get(key)
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.capacity) {
      // 淘汰最旧:第一个 key
      const oldestKey = this.map.keys().next().value
      this.map.delete(oldestKey)
    }
    this.map.set(key, value)
  }

  has(key) { return this.map.has(key) }
  get size() { return this.map.size }
}

// 经典面试题:LeetCode 146
// 真实工程:React 的 useMemo 内部、TanStack Query 缓存层、Lodash memoize 等等都用过 LRU 思想
