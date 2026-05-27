# 12 · Forms Lab

> 表单是「最容易写但最难写好」的前端代码。
> 90% 的项目都把表单写成屎山:controlled / uncontrolled 混用、validate 散落各处、ARIA 全无、re-render 风暴。

---

## 学这个能干什么

- 区分 controlled / uncontrolled,知道什么时候用哪个
- 用 React Hook Form / VeeValidate 写出零样板、零 re-render 的表单
- 用 Zod / Valibot 实现「一份 schema → 类型 + 运行时校验」
- 给残障用户友好的表单(label / aria-describedby / aria-invalid)
- 处理复杂场景:多步表单、动态字段、文件上传、可访问的错误聚合

---

## Roadmap

### 1. Controlled vs Uncontrolled

```jsx
// Controlled:每次输入都 setState → re-render
function Controlled() {
  const [val, setVal] = useState('')
  return <input value={val} onChange={e => setVal(e.target.value)} />
}

// Uncontrolled:DOM 自己管,ref 取值
function Uncontrolled() {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <form onSubmit={() => alert(ref.current?.value)}>
      <input ref={ref} defaultValue="" />
    </form>
  )
}
```

| 场景 | 推荐 |
|---|---|
| 简单提交表单(注册 / 登录) | Uncontrolled |
| 实时联动(搜索、计算总价) | Controlled |
| 大表单(20+ 字段) | Uncontrolled + React Hook Form |

### 2. 朴素表单的 4 个痛点

```jsx
function NaiveForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name) e.name = 'Required'
    if (!/^.+@.+\..+$/.test(email)) e.email = 'Invalid email'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = (e) => {
    e.preventDefault()
    if (!validate()) return
    // ...
  }
}
```

痛点:
1. 每个字段一个 useState,加一个字段要改 3 处
2. 每次输入都 re-render 整个表单
3. validate 散落在 submit / blur / change 各处
4. 错误展示要手写 `{errors.name && <span>{errors.name}</span>}` × N

### 3. React Hook Form —— 极简 + 高性能

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
  age: z.coerce.number().int().positive(),
})

type FormData = z.infer<typeof schema>

function MyForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  return (
    <form onSubmit={handleSubmit(data => console.log(data))}>
      <input {...register('name')} aria-invalid={!!errors.name} />
      {errors.name && <span role="alert">{errors.name.message}</span>}

      <input {...register('email')} type="email" aria-invalid={!!errors.email} />
      {errors.email && <span role="alert">{errors.email.message}</span>}

      <button disabled={isSubmitting}>Submit</button>
    </form>
  )
}
```

**优势**:
- Uncontrolled 底层 → 输入时不触发整个表单 re-render
- `handleSubmit` 自动 validate
- 一份 zod schema 同时给 TS 类型推断和运行时校验
- formState 细粒度订阅(只用 errors 不会因 isDirty 变化 re-render)

### 4. Zod / Valibot 校验

```ts
const userSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
  passwordConfirm: z.string(),
}).refine(data => data.password === data.passwordConfirm, {
  message: 'Passwords do not match',
  path: ['passwordConfirm'],
})

// 类型自动推断
type User = z.infer<typeof userSchema>

// 运行时校验
const result = userSchema.safeParse(unknownInput)
if (!result.success) {
  console.log(result.error.flatten().fieldErrors)
}
```

Valibot 替代:bundle 比 Zod 小 10×,API 更函数式,适合用户端 bundle 敏感场景。

```ts
import * as v from 'valibot'

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(0)),
})
```

### 5. Vue:VeeValidate / FormKit

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(z.object({
    email: z.string().email(),
    password: z.string().min(8),
  })),
})

const [email, emailProps] = defineField('email')
const [password, passwordProps] = defineField('password')

const onSubmit = handleSubmit(values => console.log(values))
</script>

<template>
  <form @submit="onSubmit">
    <input v-model="email" v-bind="emailProps" />
    <span v-if="errors.email">{{ errors.email }}</span>
    <input v-model="password" v-bind="passwordProps" type="password" />
    <button>Submit</button>
  </form>
</template>
```

FormKit 是一体化方案(组件 + 校验 + i18n + 主题),代价是 bundle 大、定制门槛高。

### 6. 多步表单(Wizard)

```tsx
const [step, setStep] = useState(0)
const methods = useForm({ defaultValues: { ... } })

// 关键:整个 wizard 共享一个 form instance
return (
  <FormProvider {...methods}>
    {step === 0 && <PersonalInfo onNext={() => setStep(1)} />}
    {step === 1 && <Address onNext={() => setStep(2)} onPrev={() => setStep(0)} />}
    {step === 2 && <Review onSubmit={methods.handleSubmit(...)} />}
  </FormProvider>
)
```

技巧:
- 每步 `await methods.trigger(['field1', 'field2'])` 校验当前步字段
- 失败聚焦第一个 error: `methods.setFocus(Object.keys(errors)[0])`
- 草稿持久化:`watch` 整个 form state → localStorage,刷新恢复

### 7. 动态字段(useFieldArray)

```tsx
const { fields, append, remove } = useFieldArray({
  control: methods.control,
  name: 'phoneNumbers',
})

return (
  <>
    {fields.map((field, idx) => (
      <div key={field.id}>
        <input {...register(`phoneNumbers.${idx}.number`)} />
        <button type="button" onClick={() => remove(idx)}>Delete</button>
      </div>
    ))}
    <button type="button" onClick={() => append({ number: '' })}>Add</button>
  </>
)
```

⚠️ 用 `field.id`(library 生成)作为 key,**不要**用 `idx`,否则删除中间项会错位。

### 8. 文件上传

```tsx
const { register } = useForm()

<input
  type="file"
  multiple
  accept="image/*"
  {...register('files', {
    validate: {
      maxSize: (files) =>
        Array.from(files).every(f => f.size < 5 * 1024 * 1024) || 'Max 5MB',
    },
  })}
/>
```

进阶:
- 直接上传 S3:用 pre-signed URL,跳过自家服务器
- 分片上传:大文件切 chunk + 并发 + 断点续传(参考 tus.io)
- 拖拽:react-dropzone 提供 useDropzone hook

### 9. 可访问的错误展示

```tsx
<label htmlFor="email">Email</label>
<input
  id="email"
  type="email"
  {...register('email')}
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
/>
{errors.email && (
  <span id="email-error" role="alert">
    {errors.email.message}
  </span>
)}
```

要点:
- `<label htmlFor>` 必须配对(读屏器才能朗读)
- `aria-invalid` 让 AT 知道字段错了
- `aria-describedby` 关联错误信息(获焦时一并朗读)
- `role="alert"` 让新出现的错误自动朗读

**错误聚合**(提交失败时,在顶部列出所有错误并允许点击跳转):

```tsx
{Object.keys(errors).length > 0 && (
  <div role="alert" aria-labelledby="error-heading">
    <h2 id="error-heading">There were errors in your submission:</h2>
    <ul>
      {Object.entries(errors).map(([field, err]) => (
        <li key={field}>
          <a href={`#${field}`} onClick={() => setFocus(field)}>
            {err.message}
          </a>
        </li>
      ))}
    </ul>
  </div>
)}
```

### 10. 性能 & 服务端校验

- React Hook Form 默认 onSubmit 才 validate → 输入不卡
- 改 `mode: 'onBlur'` / `'onChange'` 时,注意 throttle / debounce
- 大表单(50+ 字段)+ 嵌套时,用 `<Controller>` 局部 controlled,大部分字段 uncontrolled
- 服务端校验:submit 失败把 server errors 写回 form:
  ```ts
  const onSubmit = async (data) => {
    const res = await fetch('/api/register', { method: 'POST', body: JSON.stringify(data) })
    if (res.status === 422) {
      const { errors } = await res.json()
      Object.entries(errors).forEach(([k, v]) => setError(k, { message: v as string }))
    }
  }
  ```

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [rhf-zod-form.tsx](src/rhf-zod-form.tsx) | React Hook Form + Zod 完整示例 |
| [wizard.tsx](src/wizard.tsx) | 多步表单 + 草稿持久化 |
| [field-array.tsx](src/field-array.tsx) | 动态字段(emails / phones) |
| [vee-validate-form.vue](src/vee-validate-form.vue) | Vue 等价实现 |

---

## 资源

- [React Hook Form 文档](https://react-hook-form.com/)
- [Zod 文档](https://zod.dev/)
- [Valibot 文档](https://valibot.dev/) — Zod 的轻量替代
- [VeeValidate 文档](https://vee-validate.logaretm.com/v4/)
- [FormKit 文档](https://formkit.com/)
- [WAI ARIA Authoring Practices: Forms](https://www.w3.org/WAI/ARIA/apg/patterns/) — 表单 a11y 圣经
