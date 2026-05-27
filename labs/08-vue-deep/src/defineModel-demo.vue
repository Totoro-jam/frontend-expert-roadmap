<!--
Vue 3.4+ `defineModel()` 让 v-model 子组件实现简化为一行
对比 3 个时代写法
-->

<!-- ========== 时代 1:Vue 2 / Vue 3.0 写法 ========== -->
<!--
<script>
export default {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  computed: {
    value: {
      get() { return this.modelValue },
      set(v) { this.$emit('update:modelValue', v) }
    }
  }
}
</script>

<template>
  <input v-model="value" />
</template>
-->

<!-- ========== 时代 2:Vue 3 <script setup>(2022) ========== -->
<!--
<script setup>
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
</script>

<template>
  <input
    :value="modelValue"
    @input="emit('update:modelValue', $event.target.value)"
  />
</template>
-->

<!-- ========== 时代 3:Vue 3.4+ defineModel(2024) ========== -->
<script setup lang="ts">
// 一行解决!
const model = defineModel<string>()

// 还支持多个 v-model + 修饰符
const firstName = defineModel<string>('firstName')
const lastName  = defineModel<string>('lastName', { required: true })

// 修饰符(v-model.capitalize="...")
const [capitalize, modifiers] = defineModel<string>('capitalize', {
  set: (v) => modifiers.capitalize ? v.charAt(0).toUpperCase() + v.slice(1) : v
})
</script>

<template>
  <input v-model="model" placeholder="基本 v-model" />

  <input v-model="firstName" placeholder="firstName" />
  <input v-model="lastName"  placeholder="lastName(required)" />

  <input v-model.capitalize="capitalize" placeholder="带修饰符" />
</template>

<!--
父组件用法:

<MyComponent v-model="text" />
<MyComponent v-model:first-name="first" v-model:last-name="last" />
<MyComponent v-model.capitalize="title" />

关键差异 vs React:
- React 受控:value={v} onChange={e => setV(e.target.value)} 必须显式写
- Vue v-model:语法糖,但 defineModel 让组件作者也不痛了
- React 19 也在向类似方向走(useFormStatus / Actions)
-->
