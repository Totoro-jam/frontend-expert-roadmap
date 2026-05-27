// Offline-First 离线队列(IndexedDB outbox 简化实现)
// 思路:UI 操作先入本地 → 后台同步 → 失败重试 / 冲突解决

// 真实项目用 Dexie.js / idb 包装 IndexedDB,这里手写一遍方便理解原理

// ====================================================
// IndexedDB 极简封装
// ====================================================
function openDB(name = 'app', version = 1): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('entities')) {
        db.createObjectStore('entities', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ====================================================
// Outbox 任务结构
// ====================================================
interface OutboxItem {
  id?: number
  type: 'create' | 'update' | 'delete'
  entity: string                 // 例如 'todo'
  payload: any
  createdAt: number
  retries: number
  lastError?: string
}

// ====================================================
// 入队(UI 调用)
// ====================================================
export async function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt' | 'retries'>) {
  return tx('outbox', 'readwrite', s =>
    s.add({ ...item, createdAt: Date.now(), retries: 0 }),
  )
}

// 同时立刻写入本地实体缓存(乐观更新)
export async function applyLocal(entity: string, data: { id: string; [k: string]: any }) {
  return tx('entities', 'readwrite', s => s.put({ ...data, _entity: entity }))
}

// ====================================================
// 同步循环(网络可用时执行)
// ====================================================
const MAX_RETRY = 5

export async function syncOutbox() {
  if (!navigator.onLine) return

  const items = await tx<OutboxItem[]>('outbox', 'readonly', s =>
    (s.getAll() as unknown) as IDBRequest<OutboxItem[]>,
  )

  for (const item of items) {
    try {
      await sendToServer(item)
      // 成功 → 从队列移除
      await tx('outbox', 'readwrite', s => s.delete(item.id!))
    } catch (err) {
      if (item.retries >= MAX_RETRY) {
        // 达到上限 → 进入「死信」状态,等用户手动处理
        console.error('Outbox item dead:', item, err)
        await tx('outbox', 'readwrite', s =>
          s.put({ ...item, lastError: (err as Error).message, retries: item.retries + 1 }),
        )
        continue
      }

      // 指数退避后重试
      const delay = Math.min(1000 * 2 ** item.retries, 30_000)
      await tx('outbox', 'readwrite', s =>
        s.put({ ...item, retries: item.retries + 1, lastError: (err as Error).message }),
      )
      await sleep(delay)
    }
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function sendToServer(item: OutboxItem): Promise<void> {
  const map = {
    create: { method: 'POST', url: `/api/${item.entity}` },
    update: { method: 'PATCH', url: `/api/${item.entity}/${item.payload.id}` },
    delete: { method: 'DELETE', url: `/api/${item.entity}/${item.payload.id}` },
  } as const

  const cfg = map[item.type]
  const r = await fetch(cfg.url, {
    method: cfg.method,
    headers: { 'Content-Type': 'application/json' },
    body: item.type !== 'delete' ? JSON.stringify(item.payload) : undefined,
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

// ====================================================
// 触发同步的时机
// ====================================================
export function setupSync() {
  // 1. 应用启动
  syncOutbox()

  // 2. 网络恢复
  window.addEventListener('online', () => syncOutbox())

  // 3. 定时心跳(防止某些情况下 online 事件不触发)
  setInterval(() => syncOutbox(), 30_000)

  // 4. 用户每次 mutation 后(可由 UI 层主动 call)
}

// ====================================================
// 上层 API(给业务用)
// ====================================================
export async function createTodo(input: { id: string; text: string }) {
  // 1. 乐观写本地
  await applyLocal('todo', { ...input, done: false, _pending: true })
  // 2. 入队等待同步
  await enqueue({ type: 'create', entity: 'todo', payload: input })
  // 3. 立刻尝试一次
  syncOutbox()
}

export async function updateTodo(id: string, patch: { text?: string; done?: boolean }) {
  const cur = await tx<any>('entities', 'readonly', s => s.get(id))
  await applyLocal('todo', { ...cur, ...patch, _pending: true })
  await enqueue({ type: 'update', entity: 'todo', payload: { id, ...patch } })
  syncOutbox()
}

export async function deleteTodo(id: string) {
  await tx('entities', 'readwrite', s => s.delete(id))
  await enqueue({ type: 'delete', entity: 'todo', payload: { id } })
  syncOutbox()
}

// ====================================================
// 局限性 & 生产建议
// ====================================================
//
// 这个实现演示了核心思想,真实项目还要考虑:
//
// 1. 冲突解决:
//    - LWW(last-write-wins)→ 简单但可能丢用户数据
//    - CRDT(Yjs / Automerge)→ 严格不冲突,适合协作场景
//    - Operational Transform → 类似 Google Docs
//
// 2. ID 同步:
//    - 客户端用 UUID,server 无需重新分配
//    - 或客户端用临时 id,server 返回真实 id,本地替换(需 mapping 表)
//
// 3. 推荐方案:
//    - 数据简单 → TanStack Query persist + onlineManager
//    - 同步复杂 → Replicache / PowerSync / ElectricSQL
//    - 协同场景 → Yjs + WebSocket / WebRTC
//
// 4. Service Worker 也能拦截 fetch,把请求转入 outbox(对业务 0 改动)
//    详见 Background Sync API:https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
