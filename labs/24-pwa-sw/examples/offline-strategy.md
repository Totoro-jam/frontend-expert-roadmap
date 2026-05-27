# 离线优先架构决策

> 不是所有 app 都要离线。但「要离线」 ≠ 「全部能用」。
> 决定哪些功能离线、哪些不能,远比写 SW 难。

---

## 1. 先问自己:为什么要离线?

```
✅ 真需求:
- 用户在地铁 / 飞机 / 信号差的地方用
- 移动场景(医生查病例、司机签单、销售展示产品)
- 网速慢但需要立即响应(印度 / 非洲市场)
- 偶尔断网但操作不能停(笔记、todo)
- 减小 LCP / 提升二次访问速度

❌ 假需求:
- 「显得专业」(没用户实际离线)
- 大屏 SaaS(用户都在办公室 wifi)
- 完全实时的服务(对战游戏 / 直播)
- 强一致性数据(银行交易余额)
```

如果你的用户 99% 时间都在线,SW 只是「缓存优化」 → 用 cache first 加速即可,别折腾完整离线 UX。

---

## 2. 离线分级

| 级别 | 行为 | 适合 |
|---|---|---|
| **L0:无离线** | 离线 = 错误页 | 大部分企业内网 SaaS |
| **L1:壳子可看** | UI 加载 + 提示离线,数据不可用 | 媒体网站 / 电商首屏 |
| **L2:缓存数据可读** | 之前看过的内容可读,不能交互 | 新闻、博客、文档 |
| **L3:可写入(乐观 UI)** | 离线写,联网后同步 | 笔记、todo、表单 |
| **L4:全离线** | 所有数据本地,联网只为同步 | 离线编辑器、记账 |

每个 feature 单独决定级别,不要一刀切。

---

## 3. 数据架构选型

### Read-heavy(读多写少:博客 / 新闻 / 文档)

```
策略:Stale-While-Revalidate(SWR)
存储:Cache API(URL 索引)
同步:每次开页 background revalidate
冲突:无(单向 server → client)
```

### Read-write but client-only(本地优先:个人记账)

```
策略:全本地,可选云同步
存储:IndexedDB(结构化)
同步:rolling timestamp 或 CRDT(Yjs / Automerge)
冲突:CRDT 自动 merge,或 last-write-wins
```

### Real-time collaborative(协作:Notion / Figma)

```
策略:本地 + WebSocket + CRDT
存储:IndexedDB + 内存模型
同步:基于 op log / CRDT
冲突:CRDT 数学保证收敛
关键:Yjs / Automerge / Liveblocks
```

### Form-heavy(销售签单 / 库存盘点)

```
策略:本地 outbox + BackgroundSync
存储:IndexedDB(form_id → payload)
同步:sync 事件批量上传
冲突:服务端做幂等(去重 key)
```

---

## 4. 离线状态 UX 模式

### 4.1 状态指示器

```
顶部 / 角落 一个小指示:
  ● 在线(绿)
  ⊘ 离线(红)
  ⟳ 同步中(转圈)
  ⚠️ 同步失败(黄,可点)

用 navigator.onLine + 主动 ping 后端(navigator.onLine 不可靠)
```

代码:
```ts
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
```

⚠️ navigator.onLine = true 只表示「有网络接口」,不代表「能访问 server」。可靠做法:
```ts
async function isOnline(): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const res = await fetch('/api/ping', { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}
```

### 4.2 乐观 UI(Optimistic UI)

用户写 → 立即更新 UI(假装成功)→ 后台同步
失败 → 标红 + 提供「重试」

```
[ ] 创建笔记 "Hello" ← 用户输入
[✓] 创建笔记 "Hello" ← 立即显示(本地保存)
[⟳] 创建笔记 "Hello" ← 后台同步
[✓] 创建笔记 "Hello" ← 同步成功(去掉标记)
```

失败态:
```
[!] 创建笔记 "Hello" ← 红色感叹号 + 「重试」 / 「丢弃」
```

### 4.3 冲突解决 UX

用户在多设备 / 多 tab 编辑同一文档:

| 策略 | 适合 |
|---|---|
| Last-Write-Wins | 简单场景(todo) |
| Manual merge | 重要内容(Google Docs 风格) |
| CRDT 自动 merge | 协作 app(Notion) |
| Branch UI | Git-like(代码 / 设计稿) |

不要 silent overwrite。要么自动 merge,要么让用户选。

---

## 5. 何时 IndexedDB vs Cache API vs localStorage

| | localStorage | Cache API | IndexedDB |
|---|---|---|---|
| 类型 | string only | Request/Response | 结构化对象 |
| 索引 | by key | by URL | by key + 任意字段 |
| 容量 | 5-10MB | 配额内 | 配额内(GB+) |
| 同步? | 同步(慢,阻塞) | 异步 | 异步 |
| 事务? | 无 | 无 | 有 |
| SW 可用? | ❌ | ✅ | ✅ |
| 复杂查询? | ❌ | ❌ | ✅(IDBIndex) |
| 适合 | 简单 prefs | HTTP response 缓存 | 业务数据 |

**经验**:
- 用户配置 / token → localStorage(简单)
- 静态资源 / API GET 缓存 → Cache API
- 业务数据(列表、笔记、订单) → IndexedDB
- 大文件(图片、视频) → Cache API 或 OPFS(Origin Private File System)

---

## 6. 同步策略详解

### 6.1 推 vs 拉

```
拉(pull):
  client 每 N 秒请求 server "有新的吗?"
  缺点:延迟、流量浪费
  适合:简单场景

推(push):
  WebSocket / SSE / Web Push
  server 主动告诉 client "有更新了"
  缺点:连接维护成本
  适合:实时

混合:
  push 通知有更新 → client pull 拉取详情
  Google Drive / Notion 都是这模式
```

### 6.2 增量 vs 全量

```
全量:每次同步拉所有数据
  ❌ 流量爆炸
  ✅ 简单,不会漏

增量:基于 timestamp 或 version 拉新数据
  ✅ 高效
  ❌ 复杂(删除、冲突)

经验:
  - 同步 timestamp:GET /sync?since=2026-05-26T10:00:00Z
  - server 返回 < 1000 条新 + 删除 ID 列表
  - 太久没同步(> 7 天)直接全量重置
```

### 6.3 删除处理

```
软删除(soft delete):
  数据加 deleted_at 字段
  client 拉到后本地也标记
  N 天后清理

硬删除 + tombstone:
  delete 操作存到 outbox 表
  同步时通知 server
  其他设备同步时拉到 tombstone

简单:
  全量重拉(适合小数据集)
```

---

## 7. 不应该离线的功能

```
❌ 支付 / 转账(强一致性,绝不离线)
❌ 鉴权(login 必须网络)
❌ 实时聊天(离线发送可,但 UX 必须明确)
❌ 余额 / 库存 / 价格(可能变化)
❌ 验证码 / 一次性码
❌ 协作编辑(无 CRDT 时不能离线写)
```

UI 必须明确告诉用户:「此功能需要联网」 + 灰掉按钮。

---

## 8. 真实案例参考

### Twitter / X
- L1 壳子离线
- 最近 timeline 可读
- 不能发推(乐观 UI 排队?争议中)

### Notion
- L4 完整离线
- 本地 SQLite-like 存储
- 同步基于 op log
- 冲突 last-write-wins(细粒度)

### Google Docs
- L3 离线读写
- 重启浏览器都能继续编辑
- 联网后用 OT(operational transform)merge

### Linear
- L2-L3
- 本地 GraphQL 缓存
- 实时同步,offline 写排队

### Gmail
- 最近 90 天邮件 + 草稿可读写
- 离线发送 → 联网后送出

### Figma
- L4 完整 CRDT
- WebSocket + Rust WASM 内核

---

## 9. 测试离线

```
Chrome DevTools → Network → Offline
Chrome DevTools → Application → Service Workers → Offline checkbox

更严格:
  - throttling Slow 3G
  - 模拟切换 online/offline(在不同 tab)
  - kill SW + 看页面还能不能用
  - 手机飞行模式真机测
```

### 自动化测试

```ts
// Playwright
await context.setOffline(true)
await page.click('text=Save')
await page.waitForSelector('text=Queued for sync')
await context.setOffline(false)
await page.waitForSelector('text=Synced', { timeout: 5000 })
```

---

## 10. 监控离线状态

要知道用户实际离线多久 / 多频繁:

```ts
// 上报到分析
window.addEventListener('offline', () => {
  analytics.track('offline_start')
  offlineStart = Date.now()
})

window.addEventListener('online', () => {
  const duration = Date.now() - offlineStart
  analytics.track('offline_end', { duration_ms: duration })
})
```

数据告诉你:
- 多少 % 用户经历离线?
- 平均离线多久?
- 离线发生在什么页面?
- 离线后用户 churn 吗?

→ 这些数据决定要不要继续投入离线功能。

---

## 11. 退路:server-rendered fallback

如果 SW 出错 / 用户清缓存 / 第一次访问:

**必须**有 server-rendered HTML 兜底。

```
SW 死了不能让网站打不开:
  → /sw.js 失败不影响主页面加载
  → 首屏 SSR HTML 必须能 standalone 工作
  → 渐进增强:有 SW 更好,没 SW 也能跑
```

这是「PWA 失败 → 退化为普通网站」的底线。

---

## 12. 关键决策树

```
要做离线吗?
├── 否 → 用 cache first 优化二次访问就行
└── 是
    ├── 只读吗?
    │   ├── 是 → SWR + Cache API + Lighthouse offline 测过即可
    │   └── 否(读写)
    │       ├── 单设备 → outbox + BackgroundSync
    │       └── 多设备协作
    │           ├── 简单 → server 做 idempotency + LWW
    │           └── 复杂 → 上 CRDT(Yjs / Automerge)
    └── 全离线编辑器
        └── IndexedDB / OPFS + sync 是 nice-to-have
```

---

## 13. 实施 checklist

```
[ ] 确定每个 feature 离线级别(L0-L4)
[ ] UI 有离线状态指示
[ ] 关键 mutation 用 BackgroundSync / outbox
[ ] 冲突 UX 设计好(不要 silent overwrite)
[ ] 离线 fallback 页面
[ ] 错误状态明确(失败而不是 silent)
[ ] 同步进度反馈
[ ] 真机测过(不是只 DevTools 模拟)
[ ] 监控离线发生率 / 同步成功率
[ ] SW 失败时网站仍可工作(渐进增强)
```
