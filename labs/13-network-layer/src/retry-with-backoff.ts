// 网络重试的「正确姿势」
// 反面教材太多了:无脑 retry / 不区分错误类型 / 没 jitter / POST 重复扣款

// ====================================================
// 1. 通用 retry
// ====================================================
export interface RetryOptions {
  retries?: number                              // 默认 3
  baseDelay?: number                            // 默认 300ms
  maxDelay?: number                             // 默认 30s
  factor?: number                               // 退避因子,默认 2(指数)
  jitter?: 'none' | 'full' | 'equal' | 'decorrelated'
  shouldRetry?: (err: unknown, attempt: number) => boolean
  onRetry?: (err: unknown, attempt: number, delay: number) => void
  signal?: AbortSignal
}

export async function retry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    baseDelay = 300,
    maxDelay = 30_000,
    factor = 2,
    jitter = 'full',
    shouldRetry = defaultShouldRetry,
    onRetry,
    signal,
  } = opts

  let lastErr: unknown
  let prevDelay = baseDelay

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    try {
      return await fn(signal)
    } catch (err) {
      lastErr = err

      if (attempt === retries || !shouldRetry(err, attempt)) {
        throw err
      }

      const delay = computeDelay(attempt, baseDelay, maxDelay, factor, jitter, prevDelay)
      prevDelay = delay
      onRetry?.(err, attempt + 1, delay)
      await sleep(delay, signal)
    }
  }

  throw lastErr
}

function computeDelay(
  attempt: number,
  base: number,
  max: number,
  factor: number,
  jitter: NonNullable<RetryOptions['jitter']>,
  prevDelay: number,
): number {
  const exp = Math.min(base * factor ** attempt, max)

  // AWS 推荐的 4 种 jitter 算法
  // https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
  switch (jitter) {
    case 'none':
      return exp
    case 'full':
      // 区间 [0, exp]
      return Math.random() * exp
    case 'equal':
      // 区间 [exp/2, exp]
      return exp / 2 + Math.random() * (exp / 2)
    case 'decorrelated':
      // 上次的 1x ~ 3x 之间
      return Math.min(max, base + Math.random() * (prevDelay * 3 - base))
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort)
  })
}

// ====================================================
// 2. 默认重试策略(只重试「可恢复」错误)
// ====================================================
function defaultShouldRetry(err: unknown): boolean {
  // 网络错误(浏览器 fetch 抛 TypeError)
  if (err instanceof TypeError) return true

  // 主动取消不重试
  if ((err as any)?.name === 'AbortError') return false

  // HTTP 错误
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as any).status as number
    // 5xx(服务器临时挂)+ 408(超时)+ 429(限流,看 Retry-After)
    return status >= 500 || status === 408 || status === 429
  }

  return false
}

// ====================================================
// 3. 处理 429 Too Many Requests(看 Retry-After header)
// ====================================================
export async function fetchWithRetry(input: RequestInfo, init?: RequestInit) {
  return retry(async () => {
    const res = await fetch(input, init)
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      const delay = retryAfter
        ? isNaN(+retryAfter) ? new Date(retryAfter).getTime() - Date.now() : +retryAfter * 1000
        : 1000
      await new Promise(r => setTimeout(r, delay))
      const err: any = new Error('Rate limited')
      err.status = 429
      throw err
    }
    if (res.status >= 500) {
      const err: any = new Error(`HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return res
  })
}

// ====================================================
// 4. POST 安全重试:Idempotency-Key
// ====================================================
export async function safePost<T>(url: string, body: unknown): Promise<T> {
  const idempotencyKey = crypto.randomUUID()

  return retry(async (signal) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,           // 服务端约定:同 key 24h 内只执行一次
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status}`)
      err.status = res.status
      throw err
    }

    return res.json()
  })
}

// ====================================================
// 5. 全局并发上限 + 队列(避免雪崩)
// ====================================================
export function pLimit(concurrency: number) {
  const queue: (() => void)[] = []
  let running = 0

  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (running >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    running++
    try {
      return await fn()
    } finally {
      running--
      queue.shift()?.()
    }
  }
}

// 用法:全局限制 10 并发
// const limit = pLimit(10)
// const results = await Promise.all(urls.map(url => limit(() => fetch(url))))

// ====================================================
// 用法示例
// ====================================================
/*
const data = await retry(
  async (signal) => {
    const r = await fetch('/api/data', { signal })
    if (!r.ok) {
      const err: any = new Error(`HTTP ${r.status}`)
      err.status = r.status
      throw err
    }
    return r.json()
  },
  {
    retries: 5,
    jitter: 'decorrelated',                        // AWS 推荐:最适合避免「thundering herd」
    onRetry: (err, attempt, delay) =>
      console.log(`Retry #${attempt} in ${delay}ms`, err),
  },
)
*/

// ====================================================
// 关键经验
// ====================================================
//
// 1. 「重试就是 GET」是默认假设;POST 必须有幂等性才能重试
// 2. Jitter 必须加!否则失败的 1000 个请求会在同一秒重新涌入,直接打垮服务
// 3. 设最大次数 + 总超时,不要无限重试
// 4. 4xx(除 408 / 429)不要重试 —— 业务错,重试只会再错
// 5. 重试前看 `Retry-After`(429 / 503 都可能返回)
// 6. 客户端并发数限制(pLimit)同等重要,防止「自己 DDoS 自己」
