// 100 行实现一个生产可用的 HTTP client
// 设计思想:洋葱模型(类似 koa middleware / axios interceptor)

// ====================================================
// 类型
// ====================================================
export type Next = (req: Request) => Promise<Response>
export type Middleware = (req: Request, next: Next) => Promise<Response>

export interface ClientOptions {
  baseURL?: string
  middlewares?: Middleware[]
}

// ====================================================
// 创建 client
// ====================================================
export function createClient(opts: ClientOptions = {}) {
  const middlewares = opts.middlewares ?? []

  async function request(input: string, init: RequestInit = {}) {
    const url = opts.baseURL ? new URL(input, opts.baseURL).toString() : input
    const req = new Request(url, init)

    // 反向组合洋葱模型
    let chain: Next = (r) => fetch(r)
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const next = chain
      const mw = middlewares[i]
      chain = (r) => mw(r, next)
    }

    return chain(req)
  }

  // 便捷方法
  return {
    request,
    get: <T>(url: string, init?: RequestInit) =>
      request(url, { ...init, method: 'GET' }).then(parseJSON<T>),
    post: <T>(url: string, body: unknown, init?: RequestInit) =>
      request(url, {
        ...init,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        body: JSON.stringify(body),
      }).then(parseJSON<T>),
    delete: <T>(url: string, init?: RequestInit) =>
      request(url, { ...init, method: 'DELETE' }).then(parseJSON<T>),
  }
}

async function parseJSON<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new HttpError(res.status, text)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`)
  }
}

// ====================================================
// 内置中间件
// ====================================================

// 1. 鉴权
export const auth = (getToken: () => string | null): Middleware =>
  async (req, next) => {
    const token = getToken()
    if (token) req.headers.set('Authorization', `Bearer ${token}`)
    return next(req)
  }

// 2. 日志
export const log: Middleware = async (req, next) => {
  const start = performance.now()
  const res = await next(req)
  const dur = Math.round(performance.now() - start)
  console.log(`[${req.method}] ${req.url} → ${res.status} (${dur}ms)`)
  return res
}

// 3. 超时
export const timeout = (ms: number): Middleware =>
  async (req, next) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)

    // 合并已有 signal 和新的 signal
    const composedReq = new Request(req, { signal: ctrl.signal })

    try {
      return await next(composedReq)
    } finally {
      clearTimeout(t)
    }
  }

// 4. 重试(只对幂等请求 + 网络错误 / 5xx)
export const retry = (retries: number): Middleware =>
  async (req, next) => {
    if (req.method !== 'GET' && !req.headers.has('Idempotency-Key')) {
      return next(req)
    }

    let last: unknown
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await next(req.clone())
        if (res.status >= 500 || res.status === 408) {
          throw new HttpError(res.status, '')
        }
        return res
      } catch (err) {
        last = err
        if (i < retries) {
          const delay = 300 * 2 ** i + Math.random() * 200
          await new Promise(r => setTimeout(r, delay))
        }
      }
    }
    throw last
  }

// 5. 401 自动刷新 token
export const refreshOn401 = (
  refresh: () => Promise<string>,
  setToken: (t: string) => void,
): Middleware => {
  let refreshing: Promise<string> | null = null

  return async (req, next) => {
    let res = await next(req.clone())
    if (res.status !== 401) return res

    // 并发请求只触发一次刷新
    refreshing = refreshing ?? refresh()
    try {
      const newToken = await refreshing
      setToken(newToken)
      req.headers.set('Authorization', `Bearer ${newToken}`)
      res = await next(req)
    } finally {
      refreshing = null
    }
    return res
  }
}

// ====================================================
// 用法
// ====================================================
/*
const token = localStorage.getItem('token')

const api = createClient({
  baseURL: 'https://api.example.com',
  middlewares: [
    log,
    timeout(10_000),
    auth(() => localStorage.getItem('token')),
    refreshOn401(
      async () => (await fetch('/refresh')).text(),
      (t) => localStorage.setItem('token', t),
    ),
    retry(2),
  ],
})

const user = await api.get<User>('/users/me')
*/

// ====================================================
// 与 axios 相比的优势
// ====================================================
//
//   - 完全基于 Web Fetch 标准,Worker / Edge / Cloudflare Worker 都能跑
//   - 中间件就是函数,可单测、可组合,不像 axios.interceptors.use(fn) 那么散
//   - 没有 30KB 依赖,核心 100 行
//   - 类型一流(支持 generic + 标准 Request/Response)
//
// 如果还想加:
//   - 缓存:用 caches API 或自己包一层 Map
//   - 并发限制:p-limit + 队列
//   - Mock:测试时塞一个 mock middleware 替换 fetch
