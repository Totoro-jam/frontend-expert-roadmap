// 自己实现 TS 内置的几个常用工具类型,理解了这些就能读懂 90% 的库类型体操

// ---- 1. Pick / Omit ----
type MyPick<T, K extends keyof T> = { [P in K]: T[P] }
type MyOmit<T, K extends keyof any> = { [P in keyof T as P extends K ? never : P]: T[P] }
//                                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^
// 利用 key remapping + never 来排除某些键(never 在映射类型 key 位置会被丢弃)

// ---- 2. ReturnType / Parameters(infer 入门) ----
type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never
type MyParameters<T> = T extends (...args: infer P) => any ? P : never

// ---- 3. Awaited(递归 infer,解 Promise<Promise<...>>) ----
type MyAwaited<T> = T extends Promise<infer U> ? MyAwaited<U> : T

// ---- 4. DeepReadonly(递归映射) ----
type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

// ---- 测试 ----
type _t1 = MyPick<{ a: 1; b: 2; c: 3 }, 'a' | 'b'>           // { a: 1; b: 2 }
type _t2 = MyOmit<{ a: 1; b: 2; c: 3 }, 'a'>                  // { b: 2; c: 3 }
type _t3 = MyReturnType<() => number>                          // number
type _t4 = MyParameters<(a: string, b: boolean) => void>       // [string, boolean]
type _t5 = MyAwaited<Promise<Promise<Promise<string>>>>        // string
type _t6 = DeepReadonly<{ a: { b: { c: number } } }>           // 全部 readonly

// ---- 5. 进阶:Union → Intersection ----
// 利用函数参数的逆变把 union 转 intersection
type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never

type _t7 = UnionToIntersection<{ a: 1 } | { b: 2 }>   // { a: 1 } & { b: 2 }

export type { MyPick, MyOmit, MyReturnType, MyParameters, MyAwaited, DeepReadonly, UnionToIntersection }
