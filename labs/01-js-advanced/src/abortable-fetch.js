// 带超时 + 手动取消的 fetch
// 核心知识点：AbortController / AbortSignal / Promise.race

export function abortableFetch(url, { timeout = 5000, ...options } = {}) {
  const controller = new AbortController()

  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const promise = fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId))

  return {
    promise,
    abort: () => controller.abort(),
  }
}

// 进阶：支持重试
export function fetchWithRetry(url, { timeout = 5000, retries = 3, delay = 1000, ...options } = {}) {
  let attempt = 0
  const controller = new AbortController()

  const execute = async () => {
    while (attempt < retries) {
      attempt++
      try {
        const inner = new AbortController()
        const timeoutId = setTimeout(() => inner.abort(), timeout)

        controller.signal.addEventListener('abort', () => inner.abort())

        const response = await fetch(url, { ...options, signal: inner.signal })
        clearTimeout(timeoutId)

        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response
      } catch (err) {
        if (controller.signal.aborted) throw new Error('Manually aborted')
        if (attempt >= retries) throw err
        await new Promise(r => setTimeout(r, delay * attempt))
      }
    }
  }

  return {
    promise: execute(),
    abort: () => controller.abort(),
  }
}

// 用法
// ===== 基础版 =====
// const { promise, abort } = abortableFetch('/api/data', { timeout: 3000 })
//
// // 超时会自动 abort
// promise.then(res => res.json()).catch(err => console.log('failed:', err.message))
//
// // 也可以手动取消
// document.getElementById('cancel').onclick = () => abort()
//
// ===== 重试版 =====
// const { promise, abort } = fetchWithRetry('/api/unstable', {
//   timeout: 2000,
//   retries: 3,
//   delay: 1000,
// })
