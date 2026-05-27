// Branded Types(品牌类型) / Nominal Typing
// 解决 TS 默认「结构类型」带来的问题:userId 和 orderId 都是 string 互相赋值不报错

declare const __brand: unique symbol
type Brand<T, B extends string> = T & { readonly [__brand]: B }

// ---- 用法 ----
type UserId = Brand<string, 'UserId'>
type OrderId = Brand<string, 'OrderId'>
type Email = Brand<string, 'Email'>
type PositiveInt = Brand<number, 'PositiveInt'>

// 构造函数(单一入口,保证「品牌」是经过校验得到的)
const UserId = (s: string): UserId => s as UserId

const Email = (s: string): Email => {
  if (!s.includes('@')) throw new Error('not an email')
  return s as Email
}

const PositiveInt = (n: number): PositiveInt => {
  if (!Number.isInteger(n) || n <= 0) throw new Error('not positive int')
  return n as PositiveInt
}

// ---- 业务函数只接受 brand 后的类型 ----
function sendInvite(uid: UserId, email: Email) {
  console.log(`invite ${uid} -> ${email}`)
}

// 使用:
const u = UserId('u_123')
const e = Email('a@b.com')
sendInvite(u, e)         // ✅

// sendInvite('u_123', 'a@b.com')   ❌ 不能直接传 string
// sendInvite(e, u)                  ❌ 顺序错了也会被检测出来

// ---- NonEmptyArray:更轻量的 brand ----
type NonEmptyArray<T> = readonly [T, ...T[]]

function head<T>(arr: NonEmptyArray<T>): T {
  return arr[0]   // 安全!不需要 ?:
}

// head([])             ❌ 编译报错
head([1, 2, 3])         // ✅

// ---- 实战场景 ----
// 1. ID 类型(UserId / OrderId / ProductId 各不通用)
// 2. 已验证的 Email / Phone / URL
// 3. 已 escape 的 HTML(防 XSS)
// 4. 已脱敏的 PII(防日志泄漏)
// 5. Currency:USD / CNY / EUR 不能相加

// 运行时零开销 —— 编译后只是 string/number
// 这种「编译期才存在」的类型,正是 TS 比 JS 强 100 倍的地方

export { UserId, Email, PositiveInt, sendInvite, head }
export type { Brand, NonEmptyArray }
