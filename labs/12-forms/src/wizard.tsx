// 多步表单(Wizard)+ 草稿持久化
// 关键:共享一个 form instance(FormProvider),每步只校验自己的字段

import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const fullSchema = z.object({
  // Step 1
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),

  // Step 2
  street: z.string().min(1, 'Required'),
  city: z.string().min(1, 'Required'),
  country: z.string().min(1, 'Required'),

  // Step 3
  cardNumber: z.string().regex(/^\d{16}$/, '16 digits'),
  cvv: z.string().regex(/^\d{3,4}$/, '3-4 digits'),
})

type FormData = z.infer<typeof fullSchema>

const STEPS: { title: string; fields: (keyof FormData)[] }[] = [
  { title: 'Personal', fields: ['firstName', 'lastName'] },
  { title: 'Address',  fields: ['street', 'lastName', 'city', 'country'] },
  { title: 'Payment',  fields: ['cardNumber', 'cvv'] },
]

const DRAFT_KEY = 'wizard-draft'

// ====================================================
// 入口
// ====================================================
export function Wizard() {
  const [step, setStep] = useState(0)

  const methods = useForm<FormData>({
    resolver: zodResolver(fullSchema),
    defaultValues: loadDraft(),
    mode: 'onBlur',
  })

  // 自动保存草稿
  useEffect(() => {
    const sub = methods.watch(values => saveDraft(values))
    return () => sub.unsubscribe()
  }, [methods])

  const next = async () => {
    const ok = await methods.trigger(STEPS[step].fields)
    if (ok) setStep(s => s + 1)
    else {
      // 聚焦第一个错误字段
      const firstError = STEPS[step].fields.find(f => methods.formState.errors[f])
      if (firstError) methods.setFocus(firstError)
    }
  }

  const prev = () => setStep(s => s - 1)

  const submit = methods.handleSubmit(async (data) => {
    await fetch('/api/checkout', { method: 'POST', body: JSON.stringify(data) })
    clearDraft()
    alert('Done!')
  })

  return (
    <FormProvider {...methods}>
      <StepIndicator current={step} />
      <form onSubmit={submit}>
        {step === 0 && <PersonalStep />}
        {step === 1 && <AddressStep />}
        {step === 2 && <PaymentStep />}

        <nav>
          {step > 0 && <button type="button" onClick={prev}>Back</button>}
          {step < STEPS.length - 1 && <button type="button" onClick={next}>Next</button>}
          {step === STEPS.length - 1 && (
            <button type="submit" disabled={methods.formState.isSubmitting}>
              Submit
            </button>
          )}
        </nav>
      </form>
    </FormProvider>
  )
}

// ====================================================
// 步骤组件(共享 form context)
// ====================================================
function PersonalStep() {
  const { register, formState: { errors } } = useFormContext<FormData>()
  return (
    <fieldset>
      <legend>Personal Info</legend>
      <Field label="First Name" name="firstName" error={errors.firstName?.message}>
        <input {...register('firstName')} />
      </Field>
      <Field label="Last Name" name="lastName" error={errors.lastName?.message}>
        <input {...register('lastName')} />
      </Field>
    </fieldset>
  )
}

function AddressStep() {
  const { register, formState: { errors } } = useFormContext<FormData>()
  return (
    <fieldset>
      <legend>Address</legend>
      <Field label="Street" name="street" error={errors.street?.message}>
        <input {...register('street')} />
      </Field>
      <Field label="City" name="city" error={errors.city?.message}>
        <input {...register('city')} />
      </Field>
      <Field label="Country" name="country" error={errors.country?.message}>
        <input {...register('country')} />
      </Field>
    </fieldset>
  )
}

function PaymentStep() {
  const { register, formState: { errors } } = useFormContext<FormData>()
  return (
    <fieldset>
      <legend>Payment</legend>
      <Field label="Card Number" name="cardNumber" error={errors.cardNumber?.message}>
        <input {...register('cardNumber')} inputMode="numeric" autoComplete="cc-number" />
      </Field>
      <Field label="CVV" name="cvv" error={errors.cvv?.message}>
        <input {...register('cvv')} inputMode="numeric" autoComplete="cc-csc" />
      </Field>
    </fieldset>
  )
}

// ====================================================
// UI helpers
// ====================================================
function StepIndicator({ current }: { current: number }) {
  return (
    <ol style={{ display: 'flex', gap: 16 }} aria-label="Progress">
      {STEPS.map((s, i) => (
        <li
          key={s.title}
          aria-current={i === current ? 'step' : undefined}
          style={{ fontWeight: i === current ? 'bold' : 'normal' }}
        >
          {i + 1}. {s.title}
        </li>
      ))}
    </ol>
  )
}

function Field({ label, name, error, children }: any) {
  const errorId = `${name}-error`
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <div aria-describedby={error ? errorId : undefined}>{children}</div>
      {error && <span id={errorId} role="alert">{error}</span>}
    </div>
  )
}

// ====================================================
// 草稿存取
// ====================================================
function loadDraft(): Partial<FormData> {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveDraft(values: Partial<FormData>) {
  // ⚠️ 真实场景应过滤掉敏感字段(如 cvv / 密码)
  const { cvv, cardNumber, ...safe } = values
  localStorage.setItem(DRAFT_KEY, JSON.stringify(safe))
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

// ====================================================
// 经验
// ====================================================
//
// 1. methods.trigger(fields) → 局部校验当前步,不影响其他步
// 2. setFocus(field) → 失败自动跳到第一个错误,a11y 大幅提升
// 3. watch 订阅整个 form state,debounce 后存草稿
// 4. ⚠️ 敏感字段(信用卡 / 密码)不要存 localStorage
// 5. aria-current="step" → 屏幕阅读器朗读「Step 2 of 3, current」
