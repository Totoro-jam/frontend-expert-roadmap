// 闭包计数器 —— 理解闭包最经典的例子
// 外部函数返回内部函数，内部函数"记住"了外部的变量

export function createCounter(initial = 0) {
  let count = initial

  return {
    increment() { return ++count },
    decrement() { return --count },
    reset() { count = initial; return count },
    getCount() { return count },
  }
}

// 进阶：带步长和边界
export function createAdvancedCounter({ initial = 0, step = 1, min = -Infinity, max = Infinity } = {}) {
  let count = initial

  return {
    increment() {
      count = Math.min(count + step, max)
      return count
    },
    decrement() {
      count = Math.max(count - step, min)
      return count
    },
    reset() { count = initial; return count },
    getCount() { return count },
  }
}

// 用法
// const counter = createCounter(0)
// counter.increment() // 1
// counter.increment() // 2
// counter.decrement() // 1
// counter.reset()     // 0
//
// const bounded = createAdvancedCounter({ initial: 0, step: 5, min: 0, max: 20 })
// bounded.increment() // 5
// bounded.increment() // 10
// bounded.increment() // 15
// bounded.increment() // 20
// bounded.increment() // 20 (不超过 max)
