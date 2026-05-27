// React Hook Form + Zod 完整生产级示例
// 涵盖:校验、错误展示、a11y、服务端错误、提交状态

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// ====================================================
// 1. 一份 schema 同时给 TS 类型 + 运行时校验
// ====================================================
const schema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(20, 'At most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, digits and _'),

  email: z.string().email('Invalid email'),

  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Need 1 uppercase letter')
    .regex(/[0-9]/, 'Need 1 digit'),

  passwordConfirm: z.string(),

  age: z.coerce.number().int('Must be integer').min(18, 'Must be 18+'),

  agree: z.literal(true, { errorMap: () => ({ message: 'Must agree' }) }),
}).refine(d => d.password === d.passwordConfirm, {
  message: 'Passwords do not match',
  path: ['passwordConfirm'],
})

type FormData = z.infer<typeof schema>

// ====================================================
// 2. 组件
// ====================================================
export function RegisterForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onBlur',                      // 失焦时校验
    reValidateMode: 'onChange',          // 提交过一次后,改值实时校验
  })

  const onSubmit = async (data: FormData) => {
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      // 服务端校验失败 → 写回字段错误
      if (res.status === 422) {
        const { errors: serverErrors } = await res.json() as {
          errors: Record<keyof FormData, string>
        }
        Object.entries(serverErrors).forEach(([field, msg]) => {
          setError(field as keyof FormData, { type: 'server', message: msg })
        })
        return
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      setError('root', { message: (err as Error).message })
    }
  }

  if (isSubmitSuccessful) {
    return <div role="status">Registered!</div>
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {errors.root && (
        <div role="alert" style={{ color: 'red' }}>
          {errors.root.message}
        </div>
      )}

      <Field label="Username" name="username" error={errors.username?.message}>
        <input {...register('username')} autoComplete="username" />
      </Field>

      <Field label="Email" name="email" error={errors.email?.message}>
        <input type="email" {...register('email')} autoComplete="email" />
      </Field>

      <Field label="Password" name="password" error={errors.password?.message}>
        <input type="password" {...register('password')} autoComplete="new-password" />
      </Field>

      <Field label="Confirm" name="passwordConfirm" error={errors.passwordConfirm?.message}>
        <input type="password" {...register('passwordConfirm')} autoComplete="new-password" />
      </Field>

      <Field label="Age" name="age" error={errors.age?.message}>
        <input type="number" {...register('age')} />
      </Field>

      <Field label="" name="agree" error={errors.agree?.message}>
        <label>
          <input type="checkbox" {...register('agree')} />
          I agree to the terms
        </label>
      </Field>

      <button disabled={isSubmitting}>
        {isSubmitting ? 'Submitting…' : 'Register'}
      </button>
    </form>
  )
}

// ====================================================
// 3. 可访问的字段封装
// ====================================================
function Field({
  label,
  name,
  error,
  children,
}: {
  label: string
  name: string
  error?: string
  children: React.ReactNode
}) {
  const errorId = `${name}-error`
  return (
    <div>
      {label && <label htmlFor={name}>{label}</label>}
      {/* 给所有 input 注入 id / aria-* 应该用 cloneElement,这里简化 */}
      <div
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      >
        {children}
      </div>
      {error && (
        <span id={errorId} role="alert" style={{ color: 'red' }}>
          {error}
        </span>
      )}
    </div>
  )
}

// ====================================================
// 4. 经验
// ====================================================
//
// - schema 是「真理来源」:类型 + 校验 + API 文档(zod-to-openapi)都来自它
// - `noValidate` 关掉浏览器原生校验,避免和 zod 冲突
// - `autoComplete` 别忘了(浏览器密码管理器才能识别)
// - `mode: 'onBlur'` 是体验最好的默认:输入时不打断,失焦给反馈
// - 服务端校验失败用 422 + `{ errors: { field: 'msg' } }` 是标准约定
