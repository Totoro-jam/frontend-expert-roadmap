// Polymorphic 组件:`as` prop 实现 + 类型推断
// 用户可以 <Box as="a" href="..." /> 而且 TS 知道 href 是 a 的 prop

import { forwardRef, type ElementType, type ComponentPropsWithoutRef, type ComponentPropsWithRef } from 'react'

// =====================================================
// 类型工具:从 as 推断剩余 props
// =====================================================

/** 抽出 as 之外的 props,允许覆盖默认 props */
type AsProp<E extends ElementType> = { as?: E }

type PropsToOmit<E extends ElementType, P> = keyof (AsProp<E> & P)

/** 完整的 polymorphic props 类型(不含 ref)*/
export type PolymorphicProps<E extends ElementType, P = {}> =
  P & AsProp<E> & Omit<ComponentPropsWithoutRef<E>, PropsToOmit<E, P>>

/** 完整的 polymorphic ref */
export type PolymorphicRef<E extends ElementType> = ComponentPropsWithRef<E>['ref']

/** 完整 props + ref */
export type PolymorphicPropsWithRef<E extends ElementType, P = {}> =
  PolymorphicProps<E, P> & { ref?: PolymorphicRef<E> }

// =====================================================
// 实现:Box 默认是 div,可以变身
// =====================================================
type BoxOwnProps = {
  padding?: number
  rounded?: boolean
}

type BoxComponent = <E extends ElementType = 'div'>(
  props: PolymorphicPropsWithRef<E, BoxOwnProps>,
) => React.ReactElement | null

export const Box: BoxComponent = forwardRef(function Box<E extends ElementType = 'div'>(
  { as, padding, rounded, style, ...rest }: PolymorphicProps<E, BoxOwnProps>,
  ref: PolymorphicRef<E>,
) {
  const Comp: ElementType = as || 'div'
  const computedStyle = {
    padding,
    borderRadius: rounded ? 8 : undefined,
    ...style,
  }
  return <Comp ref={ref} style={computedStyle} {...rest} />
}) as BoxComponent

// =====================================================
// 用法 + 类型测试
// =====================================================
/*
// ✅ 默认 div
<Box padding={16}>hi</Box>

// ✅ 变 a:TS 知道现在可以传 href
<Box as="a" href="https://example.com" padding={16}>
  link
</Box>

// ✅ 变 button:可以传 disabled,但不能传 href
<Box as="button" disabled onClick={() => {}}>
  click
</Box>

// ✅ 变自定义组件
<Box as={Link} to="/foo">go</Box>

// ❌ TS 错:div 没有 href
<Box href="/foo">err</Box>
*/

// =====================================================
// 简化版:不要太多类型,但保留 as
// =====================================================
type SimpleAs<P, E extends ElementType> = { as?: E } & Omit<React.ComponentProps<E>, keyof P> & P

export function Heading<E extends ElementType = 'h2'>({
  as,
  ...props
}: SimpleAs<{ size?: 'sm' | 'md' | 'lg' }, E>) {
  const Tag: any = as || 'h2'
  return <Tag {...props} />
}

// =====================================================
// 反思:复杂度 vs 收益
// =====================================================
//
// 完整 polymorphic 类型很难写,维护成本高。
//
// 现代选择:
//   1. 不做 polymorphic,固定 div / button
//   2. 用 Radix 的 asChild 模式(slot-as-child.tsx),user 自己选标签
//   3. 用 chakra-ui / @stitches/react / panda-css 的成熟 as prop
//
// 何时值得做:
//   - 设计系统库(Chakra / Mantine / Radix)
//   - 高频使用的基础组件(Box / Stack / Text / Button)
//
// 何时别做:
//   - 业务组件(用 asChild 或干脆固定标签)
//
// asChild vs as:
//   - as:简洁,但类型难,自定义组件要二次包装
//   - asChild:更灵活(支持 Link 之类),类型简单,但多写一个 child
//
// Radix 团队权衡后选 asChild。
