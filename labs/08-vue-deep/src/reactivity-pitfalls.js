// Vue 3 响应式 4 种丢失姿势 + 修复
// 这是 Vue 写 3 年还在踩坑的最多一类 bug

import { ref, reactive, toRefs, toRef, watchEffect, readonly } from 'vue'

// ====================================================
// 案例 1:解构 reactive
// ====================================================
function bug1() {
  const state = reactive({ count: 0, name: 'A' })
  const { count, name } = state    // ❌ count / name 是普通值,失去响应

  watchEffect(() => console.log(count))   // 永远打印 0
  state.count++                            // 不会触发
}

function fix1() {
  const state = reactive({ count: 0, name: 'A' })
  const { count, name } = toRefs(state)    // ✅ 现在都是 ref
  // 或者:const count = toRef(state, 'count')

  watchEffect(() => console.log(count.value))   // 注意 .value
  state.count++                                   // ✅ 触发
}

// ====================================================
// 案例 2:Hook 返回 reactive,父组件解构
// ====================================================
function useMouseBug() {
  const pos = reactive({ x: 0, y: 0 })
  // ... 监听 mousemove
  return pos    // ❌ 父组件 const { x, y } = useMouseBug() 就丢了响应
}

function useMouseFix() {
  const x = ref(0)
  const y = ref(0)
  // ... 监听 mousemove
  return { x, y }   // ✅ 全用 ref,可解构
}

// 或者:
function useMouseFix2() {
  const pos = reactive({ x: 0, y: 0 })
  return toRefs(pos)   // ✅ 返回时转 refs
}

// ====================================================
// 案例 3:数组 / 对象整体替换
// ====================================================
function bug3() {
  const list = reactive([1, 2, 3])
  // ❌ 不能这样:list = [4, 5, 6]   // 编译报错(const)
  // 但下面这种是常见错:用 ref 包了再这样写
  const listRef = ref([1, 2, 3])
  listRef.value = [4, 5, 6]    // ✅ ref 这样可以
}

function fix3() {
  const list = reactive([1, 2, 3])

  // 方法 a:就地修改
  list.splice(0, list.length, 4, 5, 6)

  // 方法 b:length 清空 + push
  list.length = 0
  list.push(4, 5, 6)

  // 方法 c:直接用 ref 包数组 + 整体替换
  const listRef = ref([1, 2, 3])
  listRef.value = [4, 5, 6]
}

// ====================================================
// 案例 4:把 reactive 当 ref 用(模板里写 .value)
// ====================================================
/*
<script setup>
const obj = reactive({ value: 1 })
</script>

<template>
  {{ obj }}         <!-- 显示 { value: 1 },整个对象 -->
  {{ obj.value }}   <!-- 显示 1,正确 -->
  {{ obj }}.value 不是自动 unwrap !!
</template>
*/

// 真正的 ref 才会被模板自动 unwrap:
// const count = ref(0)
// 模板:{{ count }} → 显示 0(不需要 .value)

// ====================================================
// Bonus:reactive 对象里嵌套 ref 的 unwrap 规则
// ====================================================
function unwrapRules() {
  const count = ref(0)
  const state = reactive({ count })

  console.log(state.count)        // 0 (在 reactive 里,ref 被自动 unwrap)
  state.count++                    // 实际改了 count.value
  console.log(count.value)         // 1

  // 但!array 里的 ref 不会 unwrap:
  const list = reactive([ref(1), ref(2)])
  console.log(list[0])             // 是 ref,要 list[0].value
  // 所以列表里别放 ref,放普通对象
}

// ====================================================
// 调试技巧
// ====================================================
//
// Vue DevTools 看响应式追踪:点 reactive 对象能看到 dep
// 控制台 isRef / isReactive / isProxy 检查
// 写 watchEffect 中加 console.log(toRaw(obj)) 看原始对象

export { bug1, fix1, useMouseBug, useMouseFix, useMouseFix2, fix3, unwrapRules }
