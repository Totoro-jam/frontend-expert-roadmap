// useControllableState:同一个组件,允许「受控」或「非受控」使用
// 这是 Radix / React Spectrum / Mantine 都用的核心 hook

import { useCallback, useRef, useState, useEffect } from 'react'

type Setter<T> = T | ((prev: T) => T)

interface Options<T> {
  value?: T              // 受控值(给了就走受控)
  defaultValue?: T       // 非受控初始值
  onChange?: (next: T) => void
}

/**
 * 用法:
 *   const [val, setVal] = useControllableState({ value, defaultValue, onChange })
 *
 * 行为:
 *   - 父传了 value → 受控,组件不自己存,setVal 只 emit onChange
 *   - 父没传 value → 非受控,组件内部存,setVal 既更新内部又 emit onChange
 *   - 父切换受控/非受控 → dev 模式 warn(React 自己也这样)
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: Options<T>): [T, (next: Setter<T>) => void] {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState<T>(defaultValue as T)

  // 持续记 onChange 最新引用(避免 setter 闭包过期)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // 警告受控/非受控切换
  const wasControlled = useRef(isControlled)
  useEffect(() => {
    if (wasControlled.current !== isControlled) {
      console.warn(
        `[useControllableState] switched ${
          wasControlled.current ? 'controlled → uncontrolled' : 'uncontrolled → controlled'
        }. Decide one and keep it.`,
      )
    }
    wasControlled.current = isControlled
  }, [isControlled])

  const current = isControlled ? (value as T) : internal

  const set = useCallback(
    (next: Setter<T>) => {
      const resolved = typeof next === 'function'
        ? (next as (p: T) => T)(isControlled ? (value as T) : internal)
        : next

      if (!isControlled) setInternal(resolved)
      onChangeRef.current?.(resolved)
    },
    [isControlled, value, internal],
  )

  return [current, set]
}

// =====================================================
// 示例:Switch 组件,允许受控或非受控
// =====================================================
/*
function Switch({ checked, defaultChecked = false, onChange }: {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (v: boolean) => void
}) {
  const [on, setOn] = useControllableState({
    value: checked,
    defaultValue: defaultChecked,
    onChange,
  })

  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => setOn(prev => !prev)}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  )
}

// 受控
<Switch checked={state} onChange={setState} />

// 非受控
<Switch defaultChecked onChange={v => console.log(v)} />
*/
