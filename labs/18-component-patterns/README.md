# 18 · Component Patterns Lab

> 组件 API 设计是前端工程师的核心手艺之一。
> 好 API:用一次就上手,扩展不破坏向后兼容,误用难。
> 烂 API:props 爆炸,改一个 bug 牵 5 个文件,文档比代码长。

---

## 学这个能干什么

- 看懂 Radix / Headless UI / shadcn / Reach 等顶级库为啥这么设计
- 自己写组件库时,知道**何时用哪种 pattern**:Compound / Render Props / Slots / Headless / Controlled / Asymmetric / Polymorphic
- React + Vue + Svelte 三套生态的 pattern 映射
- 处理「受控/非受控」共存、`asChild` 多态、ref 转发、portal、focus 管理、accessibility 等高级细节

---

## Roadmap

### 1. 组件 API 设计的 4 个评分维度

| 维度 | 烂 | 好 |
|---|---|---|
| **能否上手** | 翻 50 行文档才知道 props | 看 JSX 就懂 |
| **能否扩展** | 加一个 case 改源码 | 提供 slot / 自带 escape hatch |
| **能否避错** | `<Modal open visible show />` | 类型保证只有一种状态 |
| **能否一致** | 每个组件各异 | 全库统一(命名、事件、props 形状) |

### 2. 受控 vs 非受控(Controlled / Uncontrolled)

```tsx
// 受控:state 在父组件
<Input value={v} onChange={setV} />

// 非受控:state 在组件内部,父用 ref 读
<Input defaultValue="hi" ref={ref} />

// 混合(最难,但最强):父可控可不控
<Input value={v} defaultValue="hi" onChange={setV} />
//      ↑ 给了 value 走受控,没给 走 defaultValue 非受控
```

**关键规则**:
- 一个 prop 只能选一种:`value` 或 `defaultValue`,不能两者都用
- 受控时,`onChange` 必须给(否则只读)
- 同一组件不能在受控/非受控之间切换(React 警告)
- `useControllableState` hook 抽出这个模式(Radix 提供,自己写见 [src/use-controllable.ts](src/use-controllable.ts))

### 3. Compound Components(复合组件)

```tsx
// ❌ 单组件 + 一堆 props
<Tabs
  items={[{ label: 'A', content: <A/> }, ...]}
  defaultIndex={0}
  onChange={...}
  variant="pills"
  iconPosition="left"
/>

// ✅ Compound:像 HTML 一样组合
<Tabs defaultValue="a">
  <Tabs.List>
    <Tabs.Trigger value="a"><Icon/> Tab A</Tabs.Trigger>
    <Tabs.Trigger value="b">Tab B</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="a"><A/></Tabs.Content>
  <Tabs.Content value="b"><B/></Tabs.Content>
</Tabs>
```

实现见 [src/compound-tabs.tsx](src/compound-tabs.tsx)。
关键:用 `Context` 共享 state,子组件 hooks 消费。

**何时不用**:
- 子组件很少变化 → 直接 props 更简单
- 子组件顺序无所谓 → render array 更直接

### 4. Render Props / Function as Children(已经过时但仍有用)

```tsx
<DataLoader url="/api/users">
  {({ data, loading, error }) =>
    loading ? <Spinner /> : <List items={data} />
  }
</DataLoader>
```

**现代替代**:custom hook (`const { data } = useData('/api/users')`)。
**仍有用场景**:库面向多框架 / 不能用 hook(class component / SSR streaming boundary)。

### 5. Headless 组件(behavior / state 分离 UI)

> Radix / Headless UI / TanStack 系列都是 headless

```tsx
// hook 返回 state + props getter,不渲染任何 UI
const { isOpen, getTriggerProps, getMenuProps, getItemProps } = useMenu()

return (
  <>
    <button {...getTriggerProps()}>Open</button>
    {isOpen && (
      <ul {...getMenuProps()}>
        <li {...getItemProps({ value: 'a' })}>A</li>
      </ul>
    )}
  </>
)
```

实现:[src/headless-menu.ts](src/headless-menu.ts)。

**优势**:
- 样式 100% 自由
- 框架可移植(React / Vue / Solid 同一份 logic + state machine)
- 可访问性内置(键盘 / aria 全在 hook 里管)

### 6. Slots(Vue / Web Component / Radix asChild)

```vue
<!-- Vue 命名插槽 -->
<Card>
  <template #header>标题</template>
  <template #default>正文</template>
  <template #footer><button>OK</button></template>
</Card>
```

```tsx
// React 用 children 子集 + Slot 组件
<Card>
  <Card.Header>标题</Card.Header>
  <Card.Body>正文</Card.Body>
  <Card.Footer><button>OK</button></Card.Footer>
</Card>

// 或 Radix asChild 模式:不渲染容器,把 props 合到子上
<Tooltip asChild>
  <button>Hover me</button>
</Tooltip>
```

`asChild` 实现见 [src/slot-as-child.tsx](src/slot-as-child.tsx)(merge props + ref forwarding)。

### 7. Polymorphic 组件(`as` prop)

```tsx
<Button as="a" href="/foo">Link</Button>
<Button as={Link} to="/bar">Router Link</Button>

// 类型:根据 as 自动推断剩余 props
```

**陷阱**:
- 类型签名极复杂(`ComponentPropsWithoutRef<E>` 大坑)
- ref 类型也要跟着变
- 推荐:用 Radix `asChild` 替代,简单 & 类型正确
- 完整实现:[src/polymorphic.tsx](src/polymorphic.tsx)

### 8. Inversion of Control(让用户决定渲染什么)

```tsx
// ❌ 我决定怎么渲染 row(用户没法换图标 / 加 badge)
<Table data={rows} columns={['name', 'age']} />

// ✅ 用户给函数
<Table data={rows} columns={[
  { key: 'name', render: r => <><Avatar/> {r.name}</> },
  { key: 'age', render: r => <Badge>{r.age}</Badge> },
]} />

// ✅✅ Compound + Headless 完全反转
<Table>
  {rows.map(r => (
    <Table.Row key={r.id}>
      <Table.Cell><Avatar/> {r.name}</Table.Cell>
      <Table.Cell>{r.age}</Table.Cell>
    </Table.Row>
  ))}
</Table>
```

### 9. Provider / Context 拆分

```tsx
// ❌ 一个 Context 装所有 state → 任何一处变,所有消费者 re-render
<AppContext.Provider value={{ user, theme, locale, settings }}>

// ✅ 按更新频率拆
<UserContext><ThemeContext><LocaleContext>...

// ✅✅ 引入 use-context-selector / Zustand 做选择性订阅
const userName = useAppStore(s => s.user.name)
```

### 10. ref 转发 + imperative handle

```tsx
// 默认 ref 拿到 DOM
const Input = forwardRef<HTMLInputElement, Props>((props, ref) => (
  <input ref={ref} {...props} />
))

// useImperativeHandle 暴露受控方法(慎用)
const VideoPlayer = forwardRef<{ play(): void; pause(): void }, Props>((props, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
  }), [])
  return <video ref={videoRef} />
})

// React 19+:ref 是 prop 了,不需要 forwardRef
function Input({ ref, ...props }: Props & { ref?: Ref<HTMLInputElement> }) { ... }
```

### 11. Portals + Focus 管理

```tsx
// Modal 必须用 Portal(脱离父 z-index / overflow:hidden 限制)
createPortal(modalUI, document.body)

// Focus trap:Tab 不能跑出 modal
// Restore focus:关闭后回到打开它的按钮
// inert 属性:让背景不可交互
<dialog open={open} ref={ref} aria-modal="true" inert={!open}>
```

工具:`@radix-ui/react-focus-scope` / `focus-trap-react`。

### 12. Vue / Svelte / Solid 的等价 pattern

| Pattern | React | Vue 3 | Svelte 5 | Solid |
|---|---|---|---|---|
| Compound | Context | provide/inject | $$slots + setContext | createContext |
| Render Props | function children | slot props / scoped slot | snippet | function children |
| Headless | custom hook | composable | $state / rune | createXxx |
| Polymorphic | `as` + generic | `is` attribute | `<svelte:element>` | dynamic |
| Slot | `children` + Slot | `<slot>` / template | `<slot>` / snippet | children |
| Forward ref | forwardRef / prop | template ref + expose | bind:this | ref prop |

### 13. Accessibility 必修

- 键盘:Tab / Shift+Tab / Esc / Enter / Space / Arrow 全要可用
- 焦点环:别 `outline: none`,用 `:focus-visible` 自定义
- ARIA:`role` / `aria-expanded` / `aria-controls` / `aria-haspopup` / `aria-selected`
- 屏幕阅读器:VoiceOver (Mac) / NVDA (Win) 真测
- 工具:`@axe-core/react`、Lighthouse a11y、Storybook a11y addon

---

## 必读:抄一遍 Radix 源码

`@radix-ui/react-dialog` 200 行,涵盖:Context + Portal + Focus trap + asChild + 受控/非受控 + ESC + Click outside + ARIA。

逐行抄一次 > 看 10 篇博客。

---

## src/ 索引

| 文件 | 主题 |
|---|---|
| [src/use-controllable.ts](src/use-controllable.ts) | 受控/非受控混合 hook |
| [src/compound-tabs.tsx](src/compound-tabs.tsx) | Compound 模式实战 |
| [src/headless-menu.ts](src/headless-menu.ts) | Headless menu state machine |
| [src/slot-as-child.tsx](src/slot-as-child.tsx) | Radix 风格 Slot / asChild |
| [src/polymorphic.tsx](src/polymorphic.tsx) | 完整类型安全的 `as` prop |
| [src/modal-portal.tsx](src/modal-portal.tsx) | Portal + focus trap + Esc + 受控 |

---

## 资源

- [Radix Primitives 源码](https://github.com/radix-ui/primitives) — 必读
- [Headless UI](https://headlessui.com/)
- [Reach UI](https://reach.tech/) — 已停更但思想精彩
- [ARK UI](https://ark-ui.com/) — 多框架 headless
- [shadcn/ui](https://ui.shadcn.com/) — Radix + Tailwind 最佳实践
- [Compound Components](https://kentcdodds.com/blog/compound-components-with-react-hooks) — Kent C. Dodds
- [Why I won't use Next.js](https://) — 关于组件 API 设计哲学
