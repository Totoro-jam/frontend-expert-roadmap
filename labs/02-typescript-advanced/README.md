# 02 · TypeScript Advanced Lab

> 把 TS 从「JS + 类型注释」用成「类型层面的小型函数式语言」。
> 真正的前端专家会读 `node_modules/@types` 里的源码,看懂 React/Vue 的 type definition,能给老库补 d.ts。

---

## 学这个的人之后能做什么

- 看懂 `Pick<T, K extends keyof T>` `ReturnType<T>` `Parameters<T>` 是怎么用 `infer` 写的
- 给业务 hook / store / form 库写真正有用的泛型,不是 `<T = any>` 凑数
- 用 discriminated union + 穷尽检查写出无法误用的 API
- 读懂 `zod` / `trpc` / `effect-ts` / `react-query` 的类型体操,而不是被劝退
- 在 monorepo 里管 `paths`、`composite project`、`declarationMap`
- `satisfies` `const` 断言 `as const` 这几个新工具的真实差异

---

## Roadmap(10 节)

### 1. 类型 ≠ 注解,是「集合」

   * 类型 = 一组值的集合(`string` = 所有字符串值的集合,`'a' | 'b'` 是它的子集)
   * 子类型 = 子集 → `'a' | 'b'` 可赋值给 `string`,反之不行
   * `never` = 空集,`unknown` = 全集,`any` = 关掉类型检查的「逃生舱」
   * **重点结论**:为什么 `never[]` 可以赋值给任意数组(空集是任何集合的子集)

### 2. 泛型 = 类型层面的函数

   ```ts
   type Pick<T, K extends keyof T> = { [P in K]: T[P] }
   //         ^输入1   ^输入2(约束)   ^循环   ^索引访问
   ```

   * `extends` 在泛型约束里 = `<:`(子类型关系),在条件类型里 = `?:`(三元判断)— 同一个关键字两种含义,经常被搞混
   * **协变 vs 逆变**:函数参数是逆变的(`(a: Dog) => void` ←是→ `(a: Animal) => void` 的子类型)
   * `strictFunctionTypes` 打开后这条规则才生效,默认 tsconfig 是开的

### 3. 条件类型 + `infer`

   ```ts
   type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never
   ```

   * `infer R` = 「我不关心这个位置是啥,起个名字叫 R,后面用」
   * 分布式条件类型:`T extends U ? X : Y` 当 T 是 union 时会自动分发
   * 关掉分发的写法:`[T] extends [U]`(包一层 tuple)
   * 实战:实现 `Awaited<T>` `Promisify<T>` `DeepReadonly<T>`

### 4. 映射类型 + 索引签名

   ```ts
   type Partial<T> = { [K in keyof T]?: T[K] }
   type Required<T> = { [K in keyof T]-?: T[K] }   // -? 去掉可选
   type Readonly<T> = { readonly [K in keyof T]: T[K] }
   type Mutable<T> = { -readonly [K in keyof T]: T[K] }   // -readonly
   ```

   * Key remapping(4.1+):`{ [K in keyof T as `get${Capitalize<K>}`]: () => T[K] }`
   * 用这个能从 `{ name: string }` 生成 `{ getName: () => string }`,实现自动 getter 生成

### 5. 模板字面量类型(Template Literal Types)

   * `type Hello<T extends string> = `Hello, ${T}`` — 字符串拼接发生在类型层
   * `Uppercase` / `Lowercase` / `Capitalize` / `Uncapitalize` 4 个内置 intrinsic
   * 真实用途:react-router 的 `path` 类型推断、`tailwind-merge` 的类名解析、TanStack Router 的全静态路由
   * 反例:别用它做正则验证,会让 TS 编译变巨慢

### 6. Discriminated Unions(辨别联合) — 必学

   ```ts
   type Action =
     | { type: 'add'; payload: number }
     | { type: 'remove'; id: string }
     | { type: 'reset' }

   function reducer(action: Action) {
     switch (action.type) {
       case 'add': return action.payload    // 自动收窄
       case 'remove': return action.id      // 自动收窄
       case 'reset': return 0
       default: const _: never = action     // 穷尽检查,新增 type 时编译报错
     }
   }
   ```

   * Redux / XState / 后端 API 返回 `{ status: 'ok' | 'error' }` 都靠这个
   * 缺这个工具的代码会到处写 `if ('payload' in action)`,丑且不安全

### 7. `as const` / `satisfies` / `const T`

   三个看起来像、实际差异很大的工具:

   * `as const` — 把字面量类型「冻」住(`'a'` 不是 `string`,数组不是 `string[]`)
   * `satisfies`(4.9+)— 检查变量是否符合某类型,但**保留**它的具体推断结果(神器!替代 `const x: T = ...` 模式)
   * `const T extends ...`(5.0+)— 泛型参数自带 `as const`,Library 作者的礼物

   **实战**:写一个 `defineRoutes()`,用户传字面量,你能推出每条路由的精确 path 和 params

### 8. 声明合并 + 模块扩展(Declaration Merging / Module Augmentation)

   * 同名 `interface` 自动合并 — 很多面试题
   * 给 `Window` `Express.Request` `Vue` `axios` 加自定义字段的标准做法:

     ```ts
     // env.d.ts
     declare global { interface Window { __INIT_STATE__: unknown } }
     declare module 'vue' {
       interface ComponentCustomProperties { $api: ApiClient }
     }
     export {}   // 必须有,否则不被识别为 module
     ```
   * `import.meta.env` 在 Vite 里就是用这个加自定义环境变量类型

### 9. Branded Types / Opaque Types(品牌类型)

   解决 `userId: string` 和 `orderId: string` 互相赋值的问题:

   ```ts
   type Brand<T, B> = T & { __brand: B }
   type UserId = Brand<string, 'UserId'>
   type OrderId = Brand<string, 'OrderId'>

   declare const u: UserId
   declare const o: OrderId
   const x: UserId = o   // 编译报错
   ```

   * 真实项目里 ID、URL、Email、Hex Color 都该 brand
   * 比 `class UserId { constructor(public value: string) {} }` 轻量(零运行时开销)

### 10. 工程现实

   * `tsconfig` 关键开关:`strict` 全开 / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax`
   * Project References:大 repo 拆 `composite: true` 加速增量构建
   * `tsc --noEmit` vs `vite build` — 类型检查和编译是两件事,Vite/esbuild **不做类型检查**,你需要 `vue-tsc --noEmit` / `tsc --noEmit` 配合 CI
   * `.d.ts` 维护:库作者必读 [DefinitelyTyped 贡献指南](https://github.com/DefinitelyTyped/DefinitelyTyped)
   * 性能:`extends` 嵌套层级深 → TS 服务卡。用 `tsc --extendedDiagnostics` 看热点

---

## src/ 示例代码

| 文件 | 主题 |
|---|---|
| [type-utils.ts](src/type-utils.ts) | 自己实现 `Pick` `Omit` `ReturnType` `Awaited` `DeepReadonly` |
| [discriminated-union.ts](src/discriminated-union.ts) | Action / Result / RemoteData 三个经典模式 |
| [satisfies-vs-as-const.ts](src/satisfies-vs-as-const.ts) | 三种字面量约束的对比 |
| [branded-types.ts](src/branded-types.ts) | UserId / OrderId / Email / NonEmptyArray |
| [template-literal-router.ts](src/template-literal-router.ts) | mini 版 type-safe router |

---

## 经典书 / 资源

- 📖 [Type-Level TypeScript](https://type-level-typescript.com/) — 把 TS 当函数式语言学
- 📖 [TypeScript Handbook(官方)](https://www.typescriptlang.org/docs/handbook/intro.html)
- 📖 [type-challenges](https://github.com/type-challenges/type-challenges) — 600+ 道类型体操题
- 📖 Matt Pocock 的免费课程 [Total TypeScript Beginners](https://www.totaltypescript.com/tutorials)
- 🔍 看 `node_modules/@types/react/index.d.ts` 是最好的进阶教材
