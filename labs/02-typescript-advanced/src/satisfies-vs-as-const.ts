// 三个 TS 新工具的对比:`as const` / `satisfies` / `const T`
// 一句话区分:
//   - as const:把字面量「锁死」(失去拓展性)
//   - satisfies(4.9):验证「符合」某个类型,但保留具体推断
//   - const T 泛型(5.0):泛型参数自带 as const

// ---- 场景:定义一组路由配置 ----
type Route = { path: string; auth?: boolean }

// ❌ 方式 1:直接写
const routes1 = {
  home: { path: '/' },
  user: { path: '/users/:id', auth: true },
}
// routes1.home.path 类型是 string,丢失了 '/' 字面量

// ❌ 方式 2:加注解
const routes2: Record<string, Route> = {
  home: { path: '/' },
  user: { path: '/users/:id', auth: true },
}
// 类型对了,但 routes2.home 类型是 Route,path 仍是 string,而且 key 是 string 不是字面量

// ❌ 方式 3:只用 as const
const routes3 = {
  home: { path: '/' },
  user: { path: '/users/:id', auth: true },
} as const
// path 是字面量 '/',但**编译器不会检查**它符合 Route 形状,写错也不报错

// ✅ 方式 4:satisfies + 可选 as const
const routes4 = {
  home: { path: '/' },
  user: { path: '/users/:id', auth: true },
  // bad: { foo: 1 },   ← 这里会编译报错,satisfies 帮你校验
} satisfies Record<string, Route>
// routes4.home.path 仍是 string,因为没 as const

const routes5 = {
  home: { path: '/' },
  user: { path: '/users/:id', auth: true },
} as const satisfies Record<string, Route>
// 完美:既校验形状,又保留字面量类型 → '/' 和 '/users/:id' 都是字面量

type HomePath = (typeof routes5)['home']['path']   // '/'

// ---- const 泛型(TS 5.0+) ----
// 让 library 用户不用自己写 as const

function defineRoutes<const T extends Record<string, Route>>(routes: T): T {
  return routes
}

const r = defineRoutes({
  home: { path: '/' },
  user: { path: '/users/:id' },
})
type _p = (typeof r)['home']['path']   // '/' (字面量,因为 const T)

// 真实项目:Hono / TanStack Router / tRPC 全都用 const 泛型来推 path 参数

export { routes4, routes5, r, defineRoutes }
