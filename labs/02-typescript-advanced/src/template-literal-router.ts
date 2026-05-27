// 模板字面量类型实战:50 行实现 type-safe router
// 给定 path = '/users/:id/posts/:postId',能推出 params 是 { id: string; postId: string }

// ---- 从 path 提取参数名 ----
type ExtractParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<Rest>]: string }
    : Path extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : {}

// ---- 测试 ----
type T1 = ExtractParams<'/users/:id'>                       // { id: string }
type T2 = ExtractParams<'/users/:id/posts/:postId'>          // { id: string; postId: string }
type T3 = ExtractParams<'/static'>                           // {}

// ---- 用在 API 上 ----
function navigate<P extends string>(
  path: P,
  params: ExtractParams<P>
) {
  let url: string = path
  for (const k in params) url = url.replace(`:${k}`, (params as any)[k])
  return url
}

// ✅ 编译期校验
navigate('/users/:id', { id: '1' })
navigate('/users/:id/posts/:postId', { id: '1', postId: '99' })

// ❌ 漏 param、多 param、拼错 param 都会编译报错
// navigate('/users/:id', {})
// navigate('/users/:id', { wrong: '1' })

// ---- 这就是 react-router v6 类型版本 / TanStack Router 的核心思想 ----
// 真实库还做了更多:可选参数 :id? / 通配符 * / 查询参数 ?foo=bar 等
// 模板字面量类型让全静态、零运行时校验、IDE 完美补全的 API 成为可能

export { navigate }
export type { ExtractParams }
