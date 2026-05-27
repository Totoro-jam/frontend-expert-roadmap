// useFieldArray:动态字段列表(emails / phones / 教育经历)
// 关键陷阱:用 field.id(library 生成)作为 key,不要用 index!

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  contacts: z
    .array(
      z.object({
        type: z.enum(['email', 'phone']),
        value: z.string().min(1),
      }),
    )
    .min(1, 'At least one contact')
    .max(5, 'At most 5 contacts'),
})

type FormData = z.infer<typeof schema>

export function ContactForm() {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      contacts: [{ type: 'email', value: '' }],
    },
  })

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'contacts',
  })

  return (
    <form onSubmit={handleSubmit(d => console.log(d))}>
      <input {...register('name')} placeholder="Name" />
      {errors.name && <span role="alert">{errors.name.message}</span>}

      <h3>Contacts</h3>
      {errors.contacts?.root && (
        <span role="alert">{errors.contacts.root.message}</span>
      )}

      <ul>
        {fields.map((field, idx) => (
          // ✅ field.id 来自 RHF,删除中间项不会错位
          // ❌ key={idx} 会导致 React 复用 DOM,残留旧值
          <li key={field.id}>
            <select {...register(`contacts.${idx}.type`)}>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>

            <input
              {...register(`contacts.${idx}.value`)}
              type={field.type === 'email' ? 'email' : 'tel'}
            />

            {errors.contacts?.[idx]?.value && (
              <span role="alert">{errors.contacts[idx]?.value?.message}</span>
            )}

            <button type="button" onClick={() => remove(idx)} aria-label={`Remove contact ${idx + 1}`}>
              ✕
            </button>

            {idx > 0 && (
              <button type="button" onClick={() => move(idx, idx - 1)}>↑</button>
            )}
            {idx < fields.length - 1 && (
              <button type="button" onClick={() => move(idx, idx + 1)}>↓</button>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => append({ type: 'email', value: '' })}
        disabled={fields.length >= 5}
      >
        Add contact
      </button>

      <button type="submit">Submit</button>
    </form>
  )
}

// ====================================================
// useFieldArray 全 API
// ====================================================
//
//   append(value)                — 末尾追加
//   prepend(value)               — 开头插入
//   insert(idx, value)           — 任意位置插入
//   swap(a, b)                   — 交换两个
//   move(from, to)               — 移动
//   update(idx, value)           — 替换单项(会重新生成 id)
//   remove(idx)                  — 删除
//   replace(values[])            — 整个数组替换
//
// ⚠️ 性能提示:
//   - field 上有 id / 原始字段;register 用路径 `name.${idx}.field`
//   - 极大数组(100+)可考虑「虚拟化 + uncontrolled」自己管 ref
//
// ⚠️ schema 提示:
//   - 用 .min(1) 保证至少一项,避免空数组
//   - .max() 在 UI 也要禁用 add 按钮(双重保护)
