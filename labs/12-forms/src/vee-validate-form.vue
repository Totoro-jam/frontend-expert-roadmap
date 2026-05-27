<script setup lang="ts">
// Vue 端等价方案:VeeValidate + Zod
// 优势:模板里 v-model 就够了,不需要像 RHF 那样 register

import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'

const schema = toTypedSchema(
  z.object({
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(8),
    passwordConfirm: z.string(),
  }).refine(d => d.password === d.passwordConfirm, {
    message: 'Passwords do not match',
    path: ['passwordConfirm'],
  }),
)

const { defineField, handleSubmit, errors, isSubmitting } = useForm({
  validationSchema: schema,
})

// defineField 返回 [model, props]
// props 提供 onBlur 触发校验等行为
const [username, usernameProps] = defineField('username')
const [email, emailProps] = defineField('email')
const [password, passwordProps] = defineField('password')
const [passwordConfirm, passwordConfirmProps] = defineField('passwordConfirm')

const onSubmit = handleSubmit(async (values) => {
  await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(values),
  })
})
</script>

<template>
  <form @submit="onSubmit" novalidate>
    <div>
      <label for="username">Username</label>
      <input id="username" v-model="username" v-bind="usernameProps" />
      <span v-if="errors.username" role="alert">{{ errors.username }}</span>
    </div>

    <div>
      <label for="email">Email</label>
      <input id="email" type="email" v-model="email" v-bind="emailProps" />
      <span v-if="errors.email" role="alert">{{ errors.email }}</span>
    </div>

    <div>
      <label for="password">Password</label>
      <input id="password" type="password" v-model="password" v-bind="passwordProps" />
      <span v-if="errors.password" role="alert">{{ errors.password }}</span>
    </div>

    <div>
      <label for="passwordConfirm">Confirm</label>
      <input
        id="passwordConfirm"
        type="password"
        v-model="passwordConfirm"
        v-bind="passwordConfirmProps"
      />
      <span v-if="errors.passwordConfirm" role="alert">{{ errors.passwordConfirm }}</span>
    </div>

    <button :disabled="isSubmitting">
      {{ isSubmitting ? 'Submitting…' : 'Register' }}
    </button>
  </form>
</template>

<!--
  对比 RHF vs VeeValidate:
  - 心智:VeeValidate 更 Vue 化(v-model);RHF 用 ref-based
  - 性能:都是 uncontrolled,re-render 都很少
  - schema:都支持 zod / yup / valibot
  - 字段数组:VeeValidate 用 useFieldArray 等价
  - Wizard:VeeValidate 用 <FormContext> + <SubForm> 类似
  - 推荐:Vue 项目首选 VeeValidate 或 FormKit;React 首选 React Hook Form
-->
