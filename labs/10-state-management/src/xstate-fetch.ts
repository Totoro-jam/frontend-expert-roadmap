// XState:用状态机替代「布尔风暴」
// 把异步流程画成图,不可能的状态从设计上排除

import { createMachine, assign, fromPromise } from 'xstate'

// ====================================================
// 反例:布尔风暴(常见 bug 来源)
// ====================================================
//
// const [isLoading, setLoading] = useState(false)
// const [isSuccess, setSuccess] = useState(false)
// const [isError, setError] = useState(false)
// const [data, setData] = useState(null)
//
// 问题:
//   - 4 个 bool = 16 种组合,但「合法」只有 4 种
//   - 容易出现 isLoading=true && isSuccess=true 这种「中间态 bug」
//   - 复杂流程(重试、超时、取消)代码爆炸

// ====================================================
// 用状态机重新建模
// ====================================================

interface Context {
  data: any
  error: Error | null
  retries: number
}

type Events =
  | { type: 'FETCH' }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

export const fetchMachine = createMachine({
  id: 'fetch',
  initial: 'idle',
  types: {} as { context: Context; events: Events },
  context: { data: null, error: null, retries: 0 },

  states: {
    idle: {
      on: { FETCH: 'loading' },
    },

    loading: {
      invoke: {
        id: 'fetchData',
        src: fromPromise(async ({ input }) => {
          const res = await fetch('/api/data', { signal: input.signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        }),
        input: ({ event }) => ({ signal: (event as any).signal }),
        onDone: {
          target: 'success',
          actions: assign({ data: ({ event }) => event.output }),
        },
        onError: {
          target: 'failure',
          actions: assign({ error: ({ event }) => event.error as Error }),
        },
      },
      on: { CANCEL: 'idle' },
    },

    success: {
      type: 'final',
    },

    failure: {
      on: {
        RETRY: {
          target: 'loading',
          actions: assign({ retries: ({ context }) => context.retries + 1 }),
          guard: ({ context }) => context.retries < 3,
        },
      },
    },
  },
})

// ====================================================
// React 用法
// ====================================================
/*
import { useMachine } from '@xstate/react'

function MyComponent() {
  const [state, send] = useMachine(fetchMachine)

  // 状态判断:互斥,不会出现「同时 loading 又 success」
  if (state.matches('idle'))    return <button onClick={() => send({ type: 'FETCH' })}>Load</button>
  if (state.matches('loading')) return <Spinner />
  if (state.matches('success')) return <Result data={state.context.data} />
  if (state.matches('failure')) {
    return (
      <div>
        Error: {state.context.error?.message}
        {state.context.retries < 3 && <button onClick={() => send({ type: 'RETRY' })}>Retry</button>}
      </div>
    )
  }
}
*/

// ====================================================
// XState 适用场景
// ====================================================
//
// ✅ 多步流程:支付、入职、面试、表单 wizard
// ✅ 复杂的「网络请求 + 重试 + 取消 + 超时」
// ✅ 实时连接:WebSocket connecting/connected/disconnected/reconnecting
// ✅ 游戏 / 动画状态(idle/walking/jumping/falling)
// ✅ 任何「画在白板上能画出状态图」的需求
//
// ❌ 简单的 boolean 开关(toggle modal)用 useState 就够
// ❌ 普通的数据流(post → server)用 React Query 更简单
//
// 工具:
//   - Stately.ai(可视化编辑器,导入/导出 JSON)
//   - 配合 React/Vue/Svelte/Solid 都有 adapter
//
// 心智成本不低,但一旦掌握,复杂业务再不会写出「中间态 bug」
