# 真实业务的 State 分类练习

给一个典型的电商页面,把所有 state 分类到正确的位置:

```
[商品详情页]
  - 商品数据(name / price / images / stock)
  - 当前选中的 SKU(规格)
  - 数量
  - 是否「加入收藏」
  - 用户登录状态
  - 当前购物车数量
  - 是否打开「规格选择」弹窗
  - 滚动到顶部按钮的显示状态
  - 推荐商品列表
  - 评论列表(分页)
  - 搜索关键词
  - 主题(dark/light)
  - 语言偏好
```

## 答案分类

### Server State(放 TanStack Query / SWR)

- ✅ 商品数据
- ✅ 推荐商品列表
- ✅ 评论列表(配合 `useInfiniteQuery` 做分页)
- ✅ 当前购物车数量(其实是 server 数据,即使本地也缓存)

### URL State(放 URL,用 useSearchParams)

- ✅ 当前选中的 SKU(`?sku=red-XL`)→ 用户可以分享链接
- ✅ 数量(`?qty=2`)→ 同上
- ✅ 搜索关键词(`?q=iphone`)
- ✅ 评论列表当前页(`?page=3`)

### UI State(组件本地 useState)

- ✅ 是否打开「规格选择」弹窗
- ✅ 滚动到顶部按钮显示

### Global UI State(Zustand / Jotai)

- ✅ 主题(dark/light)→ 全局,持久化
- ✅ 语言偏好 → 全局,持久化
- ✅ 用户登录状态 → 全局,Context 也可以

### Form State(React Hook Form / VeeValidate)

- ✅ 评论输入框、地址表单(暂未列出)

### 「假全局」陷阱:

- ❌ 不要把「是否收藏」放全局,它跟当前商品强绑定 → 用 Server State + optimistic update

---

## 这样分类的好处

1. **Server state 自动缓存 / 重新获取**:TanStack Query 帮你管 stale-while-revalidate
2. **URL state 可分享、可后退**:用户点 SKU 后能复制链接发给朋友
3. **UI state 局部**:不需要的组件不订阅,bundle 也不变大
4. **持久化偏好**:主题、语言这种 atomWithStorage 一行搞定

---

## 反例:常见错误

```jsx
// ❌ 把 server state 放 redux,自己管所有 loading / error / cache
const products = useSelector(s => s.products)
useEffect(() => {
  dispatch(fetchProducts())
}, [])

// ✅
const { data: products } = useQuery({
  queryKey: ['products'],
  queryFn: fetchProducts,
})
```

```jsx
// ❌ 当前 tab 放全局 store(刷新就丢)
const tab = useStore(s => s.activeTab)

// ✅ 放 URL,刷新保留
const [params, setParams] = useSearchParams()
const tab = params.get('tab') ?? 'overview'
```

```jsx
// ❌ Modal 是否打开放全局
const isModalOpen = useStore(s => s.isModalOpen)

// ✅ 谁打开就谁管(useState)
const [open, setOpen] = useState(false)
```

---

## 一句话原则

> **State 越靠近使用它的组件越好;Server state 不归 store 管。**
