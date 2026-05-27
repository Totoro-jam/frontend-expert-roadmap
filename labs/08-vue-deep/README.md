# 08 · Vue Deep Lab

> Vue 3 重写了响应式系统(Proxy)、虚拟 DOM(block/patch flag)、编译器(template → render fn)。
> 用过 Vue 2 的人来 Vue 3 经常困惑「为什么解构就丢响应式」「ref/reactive 到底用哪个」。本仓库讲清楚。

---

## 学这个能干什么

- 解释 `ref` `reactive` `shallowRef` `toRefs` `toRef` 的差异和正确用法
- 调试响应式丢失(解构、原始值、`Object.assign`、replace 数组)
- 看懂 Vue 3 编译产物(template → render function),理解 PatchFlag、HoistStatic 优化
- 写自定义指令 / 组合式 hook / provide-inject
- 区分 SFC 三种 script:`<script>` / `<script setup>` / `<script lang="ts" setup>` 的差异
- 看懂 Vue Router / Pinia / VueUse 的源码

---

## Roadmap

### 1. Reactivity:Proxy 的事实

```js
import { reactive, effect } from 'vue'

const state = reactive({ count: 0 })
effect(() => console.log(state.count))  // 立即跑一次:打印 0
state.count++                            // 自动打印 1
```

* `reactive(obj)` 返回**深层** Proxy(惰性递归,访问时才包装)
* `ref(v)` = 一个 `{ value: v }` 的 reactive 包装,**为了让原始值也能响应**
* `shallowRef` / `shallowReactive` —— 只追踪第一层,避免大数据深包装开销
* `markRaw(obj)` —— 明确告诉 Vue 「这个对象别响应化」(类实例 / 大 SDK 对象)

实现原理见 [01-js-advanced-lab/src/proxy-reactive.js](../01-js-advanced-lab/src/proxy-reactive.js) —— 50 行就能写出来。

### 2. 响应式丢失的 4 种姿势

```js
const state = reactive({ count: 0 })

// ❌ 1. 解构 reactive 对象
const { count } = state   // count 现在是普通数字,没响应了

// ❌ 2. 把 reactive 当 ref 用
const obj = reactive({ value: 1 })   // 这不是 ref,模板里写 obj 不会自动 .value

// ❌ 3. 用 Object.assign 替换
Object.assign(state, { count: 5 })   // ✅ 可以,会触发(因为是修改属性)
state = { count: 5 }                  // ❌ 重新赋值就丢了

// ❌ 4. 数组替换
const list = reactive([1, 2, 3])
list = [4, 5, 6]   // ❌
list.length = 0    // ✅ 保留 reactive
list.splice(0, list.length, 4, 5, 6)   // ✅
```

**解决工具**:

* `toRefs(state)` — 把 reactive 对象的每个字段变成 ref,可解构而不丢响应
* `toRef(state, 'count')` — 单个字段
* 推荐:**props / 从 hook 返回**的对象都用 `toRefs`

### 3. ref vs reactive,什么时候用哪个?

简单规则:
- **基本类型(数字/字符串/布尔)** → `ref`
- **对象/数组/Map/Set** → `reactive` 或 `ref`(都行)
- **模板里**:`ref` 自动 unwrap,`reactive` 直接用
- **JS 代码里**:`ref` 要 `.value`,`reactive` 直接访问

社区主流(Evan You 推荐):**统一用 `ref`**,即使是对象。一致性大于细微差异。

```js
// 推荐统一:
const count = ref(0)
const user  = ref({ name: 'A' })   // 内部仍是 reactive 包装
const list  = ref([])
```

### 4. 计算属性 / watch / watchEffect

```js
const count = ref(0)
const double = computed(() => count.value * 2)   // 只读
const doubleW = computed({
  get: () => count.value * 2,
  set: (v) => count.value = v / 2,                // 可写
})

// watch:显式依赖,惰性
watch(count, (n, o) => console.log(n, o))
watch([a, b], ([na, nb]) => {})
watch(() => state.deep.value, fn, { deep: true })

// watchEffect:自动收集依赖,立即跑一次(像 React useEffect 但更智能)
watchEffect(() => {
  console.log(count.value)
})
```

* **flush** 选项:`pre`(默认,DOM 更新前) / `post`(DOM 更新后) / `sync`(同步)
* `watchPostEffect` / `watchSyncEffect` 是语法糖

### 5. 组件通信全家桶

| 方式 | 用途 |
|---|---|
| `props` + `emit` | 父子 |
| `provide / inject` | 跨层级(类型用 `InjectionKey<T>`) |
| `defineExpose` | 子组件向父暴露方法/数据 |
| `v-model` | 双向绑定(本质 `:value` + `@update:value`)Vue 3 支持多 v-model |
| `slot` + `scoped slot` | 内容投影,父决定子如何渲染 |
| Pinia / 全局 store | 跨组件状态 |
| EventBus | 极少推荐(失控) |

### 6. `<script setup>` 的全部魔法

```vue
<script setup>
import { ref, computed } from 'vue'

// 顶层变量自动暴露给模板
const count = ref(0)
const double = computed(() => count.value * 2)
function inc() { count.value++ }

// 编译宏(不是真的函数)
const props = defineProps<{ msg: string }>()
const emit = defineEmits<{ change: [n: number] }>()
defineExpose({ inc })
</script>

<template>
  <p>{{ msg }} {{ count }} → {{ double }}</p>
  <button @click="inc">+1</button>
</template>
```

* `defineProps` / `defineEmits` / `defineExpose` / `defineModel`(3.4+ 一行解决 v-model)/ `defineSlots` —— 编译期宏
* SFC 真的会变成 JS,不是「魔法」。`vue-tsc` 处理这些宏

### 7. 模板编译优化(为什么 Vue 比 React 快?)

```html
<div>
  <p>{{ msg }}</p>           <!-- PatchFlag: TEXT,只 diff 文本 -->
  <span class="static">hi</span>  <!-- 静态节点 hoisted 出 render 函数 -->
</div>
```

编译产物(简化):

```js
const _hoisted = /*#__PURE__*/createElementVNode('span', { class: 'static' }, 'hi')

function render() {
  return openBlock(), createElementBlock('div', null, [
    createElementVNode('p', null, _ctx.msg, 1 /* TEXT */),
    _hoisted   // 静态,不参与 diff
  ])
}
```

* **PatchFlag**:告诉 runtime「这个节点只有 X 会变」,跳过其他比较
* **HoistStatic**:静态节点提到 render 函数外,只创建一次
* **Block Tree**:动态节点扁平化成 array,diff 时只看动态部分
* 结果:Vue 3 vs React,同等场景下 vdom 比较成本低 1-2 个数量级

### 8. 性能注意点

* 大列表用 `v-memo`(类似 React.memo)
* `shallowRef` + `markRaw` 处理大型数据(>1000 项数组、Class instance)
* `computed` 自动缓存,但**依赖纯净**才有效
* `defineAsyncComponent` 做路由级 / 组件级懒加载
* SSR Hydration 用 `defineAsyncComponent` + Suspense 减少 FCP

### 9. Composables(Vue 的 hooks)

```ts
// useMouse.ts
import { ref, onMounted, onUnmounted } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)
  const update = (e: MouseEvent) => { x.value = e.pageX; y.value = e.pageY }
  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))
  return { x, y }
}
```

* 跟 React Hook 不同:**Vue Composable 可以放任何位置**(没有「调用顺序」限制),因为没有 hooks 链表,响应式系统直接接管
* VueUse 是 200+ 个高质量 Composable 的合集,装上就用

### 10. 生态对比

| 类别 | 库 |
|---|---|
| 路由 | Vue Router |
| 状态 | Pinia(取代 Vuex)|
| 服务端 | Nuxt 3 / Vite SSR |
| UI 库 | Element Plus / Naive UI / Vuetify / PrimeVue |
| 表单 | VeeValidate / FormKit |
| 组件 testing | @vue/test-utils + Vitest |
| Composable | VueUse |

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [reactivity-pitfalls.js](src/reactivity-pitfalls.js) | 4 种响应式丢失场景 + 修复 |
| [use-mouse.ts](src/use-mouse.ts) | Composable 标准模板 |
| [defineModel-demo.vue](src/defineModel-demo.vue) | Vue 3.4+ 新写法对比 |

---

## 资源

- 📖 [Vue 3 官方文档](https://cn.vuejs.org)
- 📖 [Vue 3 源码解析(霍春阳)](https://book.douban.com/subject/35768338/)
- 📖 [VueUse](https://vueuse.org/) — 必读源码学习
- 📖 [Anthony Fu 博客](https://antfu.me/) — Vue 核心团队
- 🎥 [Evan You: State of Vue 2024](https://www.youtube.com/c/Vuejs)
