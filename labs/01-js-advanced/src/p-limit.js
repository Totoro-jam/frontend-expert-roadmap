// 并发限制 —— 最常被问的异步面试题
// 给一组 task,同时最多跑 N 个,全部完成后 resolve

export function pLimit(limit) {
  const queue = []
  let active = 0

  const next = () => {
    if (active >= limit || queue.length === 0) return
    active++
    const { task, resolve, reject } = queue.shift()
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active--
        next()
      })
  }

  return function run(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject })
      next()
    })
  }
}

// 用法
// const limit = pLimit(2)
// const urls = [...]
// const results = await Promise.all(urls.map(u => limit(() => fetch(u))))
//
// 等价:p-limit / p-queue npm 库的核心实现
