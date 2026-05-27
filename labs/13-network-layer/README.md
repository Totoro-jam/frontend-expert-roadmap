# 13 · Network Layer Lab

> 「请求」不是 `fetch(url)`,而是 client + interceptor + retry + timeout + 错误规范 + 协议升级 + 流式 + 实时通讯 的全套基础设施。

---

## 学这个能干什么

- 设计一个能用 3 年的 API client 模块(类型安全 + 易扩展)
- 灵活组合:鉴权 / 日志 / 重试 / 缓存 / 取消
- 选对协议:HTTP / WebSocket / SSE / HTTP3 / WebRTC / GraphQL Subscriptions
- 写出真正的流式 UI(逐字打字、文件流下载、AI 对话)
- 不被「超时 / 重试 / 幂等性」三个坑反复折磨

---

## Roadmap

### 1. fetch vs axios vs ky

| | fetch | axios | ky |
|---|---|---|---|
| 标准 API | ✅ | ❌ | 基于 fetch |
| 自动 JSON parse | ❌ 需 .json() | ✅ | ✅ |
| 错误处理 | 4xx/5xx 不会 throw | 会 throw | 会 throw |
| 拦截器 | ❌ | ✅ | ✅ |
| 取消 | AbortController | AbortController | AbortController |
| 重试 | ❌ | 需插件 | 内置 |
| 流式 | ✅ ReadableStream | 用 stream | ✅ |
| Bundle | 0(原生) | ~33KB | ~5KB |

**结论**:新项目用 ky(esm-only,小,基于 fetch);老项目继续 axios;特殊场景(SSR / Edge / RSC)用原生 fetch。

### 2. fetch 8 个坑

```js
// ❌ 1. 4xx/5xx 不 throw,要手动判 res.ok
const res = await fetch(url)
if (!res.ok) throw new Error(`HTTP ${res.status}`)

// ❌ 2. body 是流,只能消费一次
const data = await res.json()
const text = await res.text()   // ✗ TypeError: body already consumed
// 解决:用 res.clone()

// ❌ 3. 没有超时(浏览器默认 ~300s)
const ctrl = new AbortController()
setTimeout(() => ctrl.abort(), 5000)
fetch(url, { signal: ctrl.signal })

// ❌ 4. 默认不带 cookie
fetch(url, { credentials: 'include' })   // 跨域需 server 配 CORS allow-credentials

// ❌ 5. 重定向不可见
fetch(url, { redirect: 'manual' })

// ❌ 6. URL 拼参数手写痛苦
const u = new URL('/api/search', location.origin)
u.searchParams.set('q', query)
u.searchParams.set('page', String(page))
fetch(u)

// ❌ 7. POST JSON 要手动设 header
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

// ❌ 8. FormData 别手动加 Content-Type,浏览器要算 boundary
const fd = new FormData()
fd.append('file', file)
fetch(url, { method: 'POST', body: fd })   // ✅ 不要加 Content-Type
```

### 3. 拦截器模式(自己造一个 mini-client)

```ts
type Interceptor = (req: Request, next: (r: Request) => Promise<Response>) => Promise<Response>

function createClient(...interceptors: Interceptor[]) {
  return async (input: RequestInfo, init?: RequestInit) => {
    const req = new Request(input, init)

    let chain: (r: Request) => Promise<Response> = (r) => fetch(r)

    // 反向组合(像 koa middleware)
    for (let i = interceptors.length - 1; i >= 0; i--) {
      const inner = chain
      const layer = interceptors[i]
      chain = (r) => layer(r, inner)
    }

    return chain(req)
  }
}

// 用法
const api = createClient(
  authInterceptor,
  retryInterceptor,
  logInterceptor,
)
```

详见 [src/mini-client.ts](src/mini-client.ts)

### 4. 重试 + 退避

```ts
async function retry<T>(fn: () => Promise<T>, opts: {
  retries: number
  baseDelay?: number
  shouldRetry?: (err: any) => boolean
}): Promise<T> {
  let last: unknown
  for (let i = 0; i <= opts.retries; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (!opts.shouldRetry?.(err) ?? true) throw err

      const jitter = Math.random() * 200
      const delay = (opts.baseDelay ?? 300) * 2 ** i + jitter
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw last
}
```

**重要原则**:
- 只对**幂等请求(GET / PUT / DELETE)+ 503/502/408/network**重试
- **POST 不能盲目重试**(用户可能被收两次钱)
- 用「指数退避 + jitter」避免雪崩
- 设最大次数(通常 3 次)+ 总超时上限

### 5. 幂等性 Key(让 POST 也安全重试)

```ts
fetch('/api/payments', {
  method: 'POST',
  headers: {
    'Idempotency-Key': crypto.randomUUID(),   // 客户端生成 UUID
  },
  body: JSON.stringify({ amount: 100 }),
})
```

服务端约定:同一个 Idempotency-Key 24h 内多次请求只生效一次。

Stripe / GitHub / 大量 REST API 都用这套(Stripe 直接支持 `Idempotency-Key` header)。

### 6. WebSocket vs SSE vs Long Polling

| | WebSocket | SSE | Long Polling |
|---|---|---|---|
| 双向 | ✅ | ❌ 单向 | 模拟 |
| 协议 | ws/wss | http | http |
| 自动重连 | 自己实现 | ✅ 内置 | 自己 |
| 走 HTTP/2/3 | ❌(WebTransport 替代) | ✅ | ✅ |
| 浏览器原生 | ✅ | ✅ | n/a |
| 代理 / CDN 友好 | ⚠️ 需特殊配置 | ✅ | ✅ |

**场景**:
- 聊天 / 在线游戏 / 编辑器协同 → WebSocket
- 通知 / 股票 / AI 流式回复 → SSE(简单 + 自动重连)
- 兼容性 / 防火墙严格 → Long Polling 兜底

### 7. SSE 实战(AI 流式回复)

```ts
const evt = new EventSource('/api/chat?prompt=hello')

evt.onmessage = (e) => {
  const data = JSON.parse(e.data)
  appendToUI(data.text)
}

evt.onerror = () => {
  // 浏览器会自动 3s 后重连
}

// 主动关闭
evt.close()
```

⚠️ EventSource 不支持 POST。如果要发送 prompt,要么:
1. 把 prompt 放 URL(短)
2. 先 POST 拿 sessionId,再 EventSource GET (sessionId)
3. 用 fetch + ReadableStream 自己 parse SSE 格式(灵活但要手写重连)

### 8. Streaming fetch(更通用的流式)

```ts
const res = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'Hi' }),
})

const reader = res.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { value, done } = await reader.read()
  if (done) break
  appendToUI(decoder.decode(value, { stream: true }))
}
```

适合:
- AI 大模型逐字回复
- 大文件下载进度
- 实时日志推送

### 9. WebSocket 实战要点

```ts
class ReconnectingWS {
  private ws?: WebSocket
  private retries = 0
  private url: string

  constructor(url: string) {
    this.url = url
    this.connect()
  }

  private connect() {
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => { this.retries = 0 }
    this.ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** this.retries, 30_000)
      setTimeout(() => this.connect(), delay)
      this.retries++
    }
    this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data))
  }

  send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      // 队列起来等连上再发
    }
  }

  onMessage = (_msg: unknown) => {}
}
```

详见 [src/reconnecting-ws.ts](src/reconnecting-ws.ts)

### 10. HTTP/2 / HTTP/3 对前端的影响

| 特性 | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| 多路复用 | ❌(只能 6 并发 / domain) | ✅ | ✅ |
| Header 压缩 | ❌ | HPACK | QPACK |
| 队头阻塞 | 严重 | TCP 层仍有 | ✅ 解决 |
| 主动推送 | ❌ | ✅(2024 已废弃) | ❌ |
| 0-RTT | ❌ | ❌ | ✅ |
| 协议层 | TCP | TCP | QUIC/UDP |

**前端实操变化**:
- HTTP/2 后**域名分片反优化**(以前为绕 6 并发限制)
- 雪碧图、CSS Sprites 也不再必要
- 真实优势:服务端推送(已废弃)→ Early Hints (`103 Early Hints`)
- HTTP/3 在移动 / 弱网体验飞跃(0-RTT 快握手)

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [mini-client.ts](src/mini-client.ts) | 拦截器架构(类 axios)的最小实现 |
| [reconnecting-ws.ts](src/reconnecting-ws.ts) | WebSocket 自动重连 + 心跳 + queue |
| [sse-chat.ts](src/sse-chat.ts) | SSE 流式 AI 对话 |
| [retry-with-backoff.ts](src/retry-with-backoff.ts) | 指数退避 + jitter + 幂等性 |

---

## 资源

- [Fetch Living Standard](https://fetch.spec.whatwg.org/)
- [HTTP/3 explained](https://http3-explained.haxx.se/) — Daniel Stenberg(curl 作者)
- [WebSocket vs SSE](https://ably.com/blog/websockets-vs-sse)
- [Stripe Idempotency](https://stripe.com/docs/api/idempotent_requests)
- [MDN: ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
