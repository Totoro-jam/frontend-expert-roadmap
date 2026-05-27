// SSE 流式 AI 对话(逐字渲染)
// 两种实现:1) EventSource(简单)2) fetch + ReadableStream(灵活,可 POST)

// ====================================================
// 方案 1:EventSource(只支持 GET,适合 prompt 短)
// ====================================================
export function chatWithEventSource(prompt: string, onChunk: (text: string) => void) {
  const url = `/api/chat?prompt=${encodeURIComponent(prompt)}`
  const evt = new EventSource(url)

  evt.onmessage = (e) => {
    if (e.data === '[DONE]') {
      evt.close()
      return
    }
    try {
      const { delta } = JSON.parse(e.data)
      onChunk(delta)
    } catch {
      // ignore parse error
    }
  }

  evt.onerror = () => {
    // EventSource 浏览器内置重连(默认 3s)
    // 若不需要重连:evt.close()
  }

  return () => evt.close()
}

// ====================================================
// 方案 2:fetch + ReadableStream(支持 POST + 自定义 header)
// ====================================================
export async function chatWithFetch(
  prompt: string,
  onChunk: (text: string) => void,
  opts: { signal?: AbortSignal; authToken?: string } = {},
) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...(opts.authToken && { Authorization: `Bearer ${opts.authToken}` }),
    },
    body: JSON.stringify({ prompt }),
    signal: opts.signal,
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!res.body) throw new Error('No body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE 格式以 \n\n 分隔
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''                  // 最后一段可能是半个 event

    for (const event of events) {
      const lines = event.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        try {
          const { delta } = JSON.parse(data)
          onChunk(delta)
        } catch {
          // ignore
        }
      }
    }
  }
}

// ====================================================
// React Hook 封装
// ====================================================
/*
import { useState, useCallback } from 'react'

export function useChatStream() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  const send = useCallback(async (prompt: string) => {
    ctrlRef.current?.abort()                     // 取消上一次
    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    setText('')
    setError(null)
    setLoading(true)

    try {
      await chatWithFetch(prompt, (delta) => {
        setText(t => t + delta)
      }, { signal: ctrl.signal })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err as Error)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const stop = useCallback(() => {
    ctrlRef.current?.abort()
  }, [])

  return { text, loading, error, send, stop }
}
*/

// ====================================================
// 服务端约定(参考 OpenAI / Anthropic 风格)
// ====================================================
//
// Content-Type: text/event-stream
//
// data: {"delta":"Hello"}\n\n
// data: {"delta":", "}\n\n
// data: {"delta":"world"}\n\n
// data: [DONE]\n\n
//
// 注意:
//   - 每条 event 必须以 \n\n 结尾(SSE 规范)
//   - 服务器开启 Nginx 时必须配 `X-Accel-Buffering: no`,否则被缓存阻塞
//   - 代理 / CDN 路径上避免开启 buffering / gzip
//
// 经验:
//   - 真实 AI 项目,用 vercel/ai 或 ai-sdk 屏蔽这些细节
//   - 协议升级路径:HTTP/2 上的 SSE 不再受 6 连接限制
