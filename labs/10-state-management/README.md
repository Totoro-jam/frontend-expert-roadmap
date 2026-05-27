# 10 · State Management Lab

> 「全局状态」是最大的复杂度来源。专家不是「知道更多 store 库」,而是知道**哪些 state 根本不该是全局**。

---

## 学这个能干什么

- 在新项目里选 store 不靠流行度,靠真实评估(React Query 拿掉一半「全局」state)
- 区分 4 种 state 类型,各自有自己的家
- 看懂 Redux Toolkit / Zustand / Jotai / Pinia / XState 的设计差异
- 用 XState 给复杂业务建模,告别「布尔风暴」(isLoading + isError + isSuccess)

---

## State 的 4 种类型(基础认知)

| 类型 | 例子 | 应该放哪 |
|---|---|---|
| **Server state** | 用户列表、订单 | TanStack Query / SWR / Apollo |
| **Form state** | 表单字段、错误 | React Hook Form / VeeValidate / Formik(局部) |
| **URL state** | 当前路由、查询参数 | URL 本身(useSearchParams / `<Link>`) |
| **UI state** | 是否打开 modal、tab 选中 | useState / Zustand / Pinia(局部或全局) |

90% 的「全局 store 太复杂」问题源于把 **Server state 当 UI state 管**。

---

## 7 种方案对比

### 1. useState / useReducer(组件本地)

```jsx
const [count, setCount] = useState(0)
const [state, dispatch] = useReducer(reducer, initial)
```

* 90% 场景的正确选择
* 不要为了「将来要全局」而提前 hoist 到全局

### 2. Context(中等范围共享)

```jsx
<UserContext.Provider value={user}>
```

* 适合「**主题、auth、locale**」这种全局只读 / 不常变
* **不适合** 频繁变化的 state(订阅它的所有组件都重渲染)
* 解决重渲染:拆 context 或 use-context-selector

### 3. Redux Toolkit(企业级)

```ts
const userSlice = createSlice({
  name: 'user',
  initialState: { name: '', age: 0 },
  reducers: {
    setName: (state, action) => { state.name = action.payload },   // Immer 内嵌
  },
})

dispatch(userSlice.actions.setName('A'))
const name = useSelector(state => state.user.name)
```

* DevTools 是杀手锏:time-travel、action history、import/export
* RTK Query 内置,做服务端状态也行
* 痛点:模板代码多,小项目过度

### 4. Zustand(简洁现代)

```js
const useStore = create((set, get) => ({
  count: 0,
  inc: () => set({ count: get().count + 1 }),
}))

const count = useStore(state => state.count)
```

* 心智极简,3 分钟上手
* 支持中间件:persist、devtools、immer
* 现代 React 项目首选

### 5. Jotai / Recoil(原子化)

```js
const countAtom = atom(0)
const doubleAtom = atom(get => get(countAtom) * 2)

const [count, setCount] = useAtom(countAtom)
const double = useAtomValue(doubleAtom)
```

* 把全局状态拆成无数个小 atom,自动依赖追踪
* 思想接近 Signals
* 适合「大量松散全局状态」(配置、用户偏好、多个独立特性)

### 6. Pinia(Vue 生态标准)

```ts
export const useUserStore = defineStore('user', () => {
  const name = ref('')
  const greet = () => `Hello ${name.value}`
  return { name, greet }
})
```

* 取代 Vuex,Composition API 风格
* TS 类型推断完美

### 7. XState(状态机)

```ts
const machine = createMachine({
  id: 'fetch',
  initial: 'idle',
  states: {
    idle:    { on: { FETCH: 'loading' } },
    loading: { on: { SUCCESS: 'success', ERROR: 'error' } },
    success: { type: 'final' },
    error:   { on: { RETRY: 'loading' } },
  }
})
```

* 复杂流程(支付、面试 wizard、多步表单)的最优解
* 可视化预览(`xstate-viz`)
* 强制把不可能状态从设计上排除(loading + success 不可能同时)

---

## 三大原则

### 原则 1:Server state 不要塞 store

```jsx
// ❌ 老派
const dispatch = useDispatch()
useEffect(() => {
  dispatch(fetchUsers())   // 自己管 loading / error / cache / stale
}, [])

// ✅ TanStack Query
const { data, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
})
```

`useQuery` 一行替代 Redux + 4 个 action + 1 个 reducer + cache 逻辑。

详见 [11-data-fetching-lab](../11-data-fetching-lab/)

### 原则 2:UI state 优先「最近共同祖先」

```jsx
// ❌ Modal 是否打开放全局
// ✅ 放在 <App> 或更近的父组件,用 useState 就够了
```

只有「跨路由 / 跨多个不相关组件」时才上全局。

### 原则 3:URL 是天然的全局 state

```jsx
// ❌ 把当前 tab 放 store
const tab = useStore(s => s.currentTab)

// ✅ 放 URL ?tab=profile
const [params] = useSearchParams()
const tab = params.get('tab')
```

好处:刷新保留、可分享、浏览器后退正常工作。

---

## 不可变更新(Immer 是救星)

```js
// ❌ 痛苦的深层不可变
{ ...state, user: { ...state.user, address: { ...state.user.address, city: 'NY' } } }

// ✅ Immer
import { produce } from 'immer'
produce(state, draft => {
  draft.user.address.city = 'NY'   // 看似直接改,实际生成新对象
})
```

Redux Toolkit、Zustand 的 immer middleware、Recoil 都内置 Immer。

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [zustand-counter.tsx](src/zustand-counter.tsx) | Zustand 最小示例 + middleware |
| [jotai-atoms.tsx](src/jotai-atoms.tsx) | Jotai 原子化对比 |
| [xstate-fetch.ts](src/xstate-fetch.ts) | XState 状态机替代布尔风暴 |
| [state-classification.md](src/state-classification.md) | 给真实业务做 state 分类 |

---

## 资源

- 📖 [TanStack Query 哲学](https://tanstack.com/query/latest/docs/framework/react/overview)
- 📖 [Kent C. Dodds: State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- 📖 [Stately.ai](https://stately.ai) — XState 可视化
- 📖 [Zustand vs Redux 对比](https://github.com/pmndrs/zustand#comparison)
- 📖 [Daishi Kato 博客](https://blog.axlight.com/) — Zustand/Jotai/Valtio 作者
