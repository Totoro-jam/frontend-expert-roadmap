// Radix 风格的 Slot / asChild 实现
// 不渲染额外 DOM,把 props + ref + handler 合并到唯一 child

import {
  cloneElement,
  forwardRef,
  isValidElement,
  Children,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'

// =====================================================
// 1. mergeProps:合并 className / style / handlers
// =====================================================
function mergeProps(parent: any, child: any) {
  const merged: any = { ...parent, ...child }

  // 事件 handler:两个都调
  for (const key in parent) {
    const parentH = parent[key]
    const childH = child[key]
    if (typeof parentH === 'function' && typeof childH === 'function' && /^on[A-Z]/.test(key)) {
      merged[key] = (...args: any[]) => {
        childH(...args)
        parentH(...args)
      }
    }
  }

  // className:拼起来
  if (parent.className && child.className) {
    merged.className = `${parent.className} ${child.className}`.trim()
  }

  // style:浅合并
  if (parent.style && child.style) {
    merged.style = { ...parent.style, ...child.style }
  }

  return merged
}

// =====================================================
// 2. mergeRefs:同时把 ref 转给两边
// =====================================================
function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T) => {
    for (const r of refs) {
      if (!r) continue
      if (typeof r === 'function') r(node)
      else (r as any).current = node
    }
  }
}

// =====================================================
// 3. Slot 组件:本身不渲染 DOM,把 props / ref 灌给唯一 child
// =====================================================
export const Slot = forwardRef<HTMLElement, { children: ReactNode } & React.HTMLAttributes<HTMLElement>>(
  function Slot({ children, ...slotProps }, forwardedRef) {
    const child = Children.only(children) as ReactElement<any>

    if (!isValidElement(child)) {
      throw new Error('Slot requires exactly one valid React element as child')
    }

    return cloneElement(child, {
      ...mergeProps(slotProps, child.props),
      ref: mergeRefs(forwardedRef, (child as any).ref),
    })
  },
)

// =====================================================
// 4. 在自己组件里用 asChild
// =====================================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: 'solid' | 'outline'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ asChild, variant = 'solid', className = '', ...props }, ref) {
    const Comp: any = asChild ? Slot : 'button'
    const cls = `btn btn-${variant} ${className}`.trim()
    return <Comp ref={ref} className={cls} {...props} />
  },
)

// =====================================================
// 用法对比
// =====================================================
/*

// ❌ 没有 asChild → 多渲染一个 button,链接得放里面
<Button>
  <a href="/foo">Go</a>
</Button>
// 结果:<button class="btn"><a href="/foo">Go</a></button>  ← 嵌套不合法,a11y 烂

// ✅ asChild → button 的 className/handler/ref 全合并给 <a>
<Button asChild>
  <a href="/foo">Go</a>
</Button>
// 结果:<a href="/foo" class="btn">Go</a>  ← 干净

// ✅✅ 和 react-router 的 Link 组合
<Button asChild>
  <Link to="/foo">Go</Link>
</Button>

// ✅ 处理事件合并
<Button asChild onClick={() => console.log('button')}>
  <a href="/foo" onClick={() => console.log('a')}>Go</a>
</Button>
// 点击:打印 'a' 然后 'button'(child 优先,符合直觉)

*/

// =====================================================
// 5. 注意事项
// =====================================================
//
// 1. Slot 只接受一个 child(Children.only),否则报错
// 2. event handler 合并是「都调」,不是覆盖。child handler 先调。
// 3. 同名 props(非事件 / className / style)采用 child 覆盖 parent(用户意图)
// 4. ref:用 mergeRefs 同时支持 callback ref 和 RefObject
// 5. style 是浅合并,深合并会破坏 transition / transform 组合
// 6. React 19 ref 作 prop 后,代码可以更简洁(不再 forwardRef)
//
// 真实 Radix 源码:packages/react/slot/src/Slot.tsx
// 把 onClick capture 阶段、onPointerDown 等 16 个 handler 都列出来合并
