// cva + Radix Slot + 完整类型推导的 Button(shadcn/ui 同款套路)

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'

// =====================================================
// 1. 用 cva 定义所有变体
// =====================================================
const buttonStyles = cva(
  // base:所有变体共有
  [
    'inline-flex items-center justify-center gap-2',
    'font-medium whitespace-nowrap select-none',
    'transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      intent: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
        secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus-visible:ring-gray-500',
        ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
        link: 'bg-transparent text-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm rounded-md',
        md: 'h-10 px-4 text-base rounded-md',
        lg: 'h-12 px-6 text-lg rounded-lg',
        icon: 'h-10 w-10 rounded-md',
      },
      fullWidth: {
        true: 'w-full',
      },
      loading: {
        true: 'cursor-wait',
      },
    },

    // compound variants:特定组合的额外样式
    compoundVariants: [
      { intent: 'link', size: 'sm', class: 'h-auto p-0' },
      { intent: 'link', size: 'md', class: 'h-auto p-0' },
      { intent: 'link', size: 'lg', class: 'h-auto p-0' },
    ],

    defaultVariants: {
      intent: 'primary',
      size: 'md',
    },
  },
)

// =====================================================
// 2. Props 类型(从 cva 自动推断 variant + 原生 button props)
// =====================================================
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  /** Radix Slot 模式:渲染到子元素而非自己 */
  asChild?: boolean
  /** loading 时显示 spinner 并 disable */
  loading?: boolean
  /** 左侧 icon */
  leftIcon?: React.ReactNode
  /** 右侧 icon */
  rightIcon?: React.ReactNode
}

// =====================================================
// 3. 组件
// =====================================================
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { asChild, intent, size, fullWidth, loading, leftIcon, rightIcon, className, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      className={clsx(buttonStyles({ intent, size, fullWidth, loading }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </Comp>
  )
})

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" fill="none" />
    </svg>
  )
}

// =====================================================
// 4. 用法
// =====================================================
/*
// 基础
<Button>Click me</Button>

// 变体
<Button intent="danger" size="lg">Delete</Button>
<Button intent="ghost" leftIcon={<Plus />}>Add</Button>

// loading
<Button loading>Saving...</Button>

// fullWidth + onClick
<Button fullWidth onClick={save}>Save</Button>

// asChild:渲染成 a / Link 而不渲染 button
<Button asChild>
  <a href="/foo">Visit</a>
</Button>

<Button asChild>
  <Link to="/settings">Settings</Link>
</Button>

// 类型推导:不能传 intent="weird"
<Button intent="weird" />          // ❌ TS 错
*/

// =====================================================
// 5. 对比:不用 cva 会怎样?
// =====================================================
//
// ❌ 手写 if/else
// function Button({ intent, size, ...p }) {
//   let cls = 'base ...'
//   if (intent === 'primary') cls += ' bg-blue-600'
//   if (intent === 'danger') cls += ' bg-red-600'
//   if (size === 'sm') cls += ' h-8'
//   if (size === 'md') cls += ' h-10'
//   // 5 个 variants × 4 个 size × 2 个 fullWidth → 40 个 if
// }
//
// 问题:
//   - 没类型(intent 是 string,可以传任意值)
//   - compoundVariants 难写
//   - default 难维护
//
// cva = TypeScript-first + 声明式 + 0 运行时性能损耗(就是字符串拼接)

// =====================================================
// 6. 备选:tailwind-variants
// =====================================================
// 同样思想,但有 slots(组件多 part)和 responsive 内置支持。
//
// import { tv } from 'tailwind-variants'
// const button = tv({
//   slots: { base: '...', icon: '...' },
//   variants: {
//     intent: {
//       primary: { base: 'bg-blue-600', icon: 'text-white' }
//     }
//   }
// })
