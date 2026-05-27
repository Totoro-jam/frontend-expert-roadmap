// Discriminated Union(辨别联合) —— TS 里最强的「让错误代码无法编译」模式

// ---- 模式 1:Action(Redux/XState) ----
type Action =
  | { type: 'add'; payload: number }
  | { type: 'remove'; id: string }
  | { type: 'reset' }

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case 'add': return state + action.payload      // payload 自动收窄
    case 'remove': return state                    // 用 action.id
    case 'reset': return 0
    default: {
      // 穷尽检查:新增 Action 类型而忘了处理,这行会编译报错
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

// ---- 模式 2:Result<T, E>(Rust 风格,代替 try/catch) ----
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

async function fetchUser(id: string): Promise<Result<{ name: string }>> {
  try {
    const res = await fetch(`/api/users/${id}`)
    if (!res.ok) return { ok: false, error: new Error(`HTTP ${res.status}`) }
    return { ok: true, value: await res.json() }
  } catch (e) {
    return { ok: false, error: e as Error }
  }
}

// 调用方被强制处理两种情况
async function demo() {
  const r = await fetchUser('1')
  if (r.ok) console.log(r.value.name)   // value 收窄
  else console.error(r.error.message)   // error 收窄
}

// ---- 模式 3:RemoteData(网络请求 4 态,代替 isLoading 满天飞) ----
type RemoteData<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E }

function render<T>(rd: RemoteData<T>) {
  switch (rd.status) {
    case 'idle': return '点击加载'
    case 'loading': return '加载中...'
    case 'success': return rd.data
    case 'error': return `失败:${rd.error.message}`
  }
}

// 真实项目里 React Query / Apollo / SWR 都是这个模式,只是字段名不同
// 自己写状态机时强烈推荐这样建模,比 isLoading + isError + data 4 个 bool 强 10 倍

export { reducer, fetchUser, demo, render }
export type { Action, Result, RemoteData }
