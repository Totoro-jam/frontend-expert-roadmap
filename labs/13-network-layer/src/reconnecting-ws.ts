// 生产级 WebSocket 封装:自动重连 + 心跳 + 消息队列 + 类型安全

type Listener<T> = (msg: T) => void

export interface Options {
  url: string
  protocols?: string | string[]
  heartbeatInterval?: number         // 默认 30s 发一次 ping
  maxRetries?: number                // 默认 Infinity
  baseReconnectDelay?: number        // 默认 1000ms
  maxReconnectDelay?: number         // 默认 30s
  shouldReconnect?: (event: CloseEvent) => boolean
}

const DEFAULT_OPTS = {
  heartbeatInterval: 30_000,
  maxRetries: Infinity,
  baseReconnectDelay: 1000,
  maxReconnectDelay: 30_000,
  shouldReconnect: (e: CloseEvent) => e.code !== 1000,   // 1000 = 正常关闭,不重连
}

export class ReconnectingWebSocket<TIn = any, TOut = any> {
  private ws?: WebSocket
  private opts: Required<Options>
  private retries = 0
  private heartbeatTimer?: number
  private reconnectTimer?: number
  private queue: TOut[] = []
  private listeners: Set<Listener<TIn>> = new Set()
  private closed = false

  constructor(opts: Options) {
    this.opts = { ...DEFAULT_OPTS, ...opts } as Required<Options>
    this.connect()
  }

  private connect() {
    if (this.closed) return

    this.ws = new WebSocket(this.opts.url, this.opts.protocols)

    this.ws.onopen = () => {
      this.retries = 0
      // 发送积压消息
      while (this.queue.length) {
        this.ws!.send(JSON.stringify(this.queue.shift()))
      }
      this.startHeartbeat()
    }

    this.ws.onmessage = (e) => {
      // 心跳响应丢弃
      if (e.data === 'pong') return
      try {
        const msg = JSON.parse(e.data)
        this.listeners.forEach(l => l(msg))
      } catch (err) {
        console.warn('Invalid message:', e.data)
      }
    }

    this.ws.onclose = (e) => {
      this.stopHeartbeat()
      if (!this.closed && this.opts.shouldReconnect(e) && this.retries < this.opts.maxRetries) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // 等 close 事件处理重连
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(
      this.opts.baseReconnectDelay * 2 ** this.retries + Math.random() * 200,
      this.opts.maxReconnectDelay,
    )
    this.retries++
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
  }

  private startHeartbeat() {
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping')
      }
    }, this.opts.heartbeatInterval)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
  }

  send(msg: TOut) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      // 连接未就绪 → 入队等 onopen 时发送
      this.queue.push(msg)
    }
  }

  subscribe(listener: Listener<TIn>) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close() {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.stopHeartbeat()
    this.ws?.close(1000, 'client-close')
  }

  get readyState() {
    return this.ws?.readyState
  }
}

// ====================================================
// 用法示例
// ====================================================
/*
type ServerMsg = { type: 'chat'; text: string } | { type: 'notification'; title: string }
type ClientMsg = { type: 'send'; text: string }

const ws = new ReconnectingWebSocket<ServerMsg, ClientMsg>({
  url: 'wss://chat.example.com/socket',
  protocols: ['chat-v1'],
})

const unsubscribe = ws.subscribe(msg => {
  if (msg.type === 'chat') console.log(msg.text)
})

ws.send({ type: 'send', text: 'Hello!' })

// 卸载时
unsubscribe()
ws.close()
*/

// ====================================================
// 生产环境再考虑:
// ====================================================
//   - tab 不可见时停止心跳(document.visibilitychange + window.online)
//   - 区分 server-initiated close vs network close,前者不重连
//   - SharedWorker 跨 tab 共享一个连接(节省 server fd)
//   - 加密 / 鉴权:连接 URL 带 token,或 onopen 后第一帧发认证
//   - 现成方案:socket.io / phoenix-channels / Centrifugo
