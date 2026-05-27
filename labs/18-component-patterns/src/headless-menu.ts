// Headless Menu:state + a11y 全包,UI 0 行
// 模仿 Downshift / react-aria / Headless UI 的 useMenu

import { useState, useCallback, useRef, useEffect, useId } from 'react'

export interface MenuItem {
  value: string
  label: string
  disabled?: boolean
}

interface UseMenuOptions {
  items: MenuItem[]
  onSelect?: (value: string) => void
  defaultOpen?: boolean
}

export function useMenu({ items, onSelect, defaultOpen = false }: UseMenuOptions) {
  const [isOpen, setOpen] = useState(defaultOpen)
  const [activeIndex, setActiveIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const triggerId = `${id}-trigger`
  const menuId = `${id}-menu`

  const open = useCallback(() => {
    setOpen(true)
    setActiveIndex(0)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    triggerRef.current?.focus()
  }, [])

  const toggle = useCallback(() => (isOpen ? close() : open()), [isOpen, open, close])

  const select = useCallback((value: string) => {
    const item = items.find(i => i.value === value)
    if (!item || item.disabled) return
    onSelect?.(value)
    close()
  }, [items, onSelect, close])

  // 找下一个可用 item(跳过 disabled)
  const moveActive = useCallback((delta: 1 | -1) => {
    setActiveIndex(prev => {
      let next = prev
      for (let i = 0; i < items.length; i++) {
        next = (next + delta + items.length) % items.length
        if (!items[next].disabled) return next
      }
      return prev
    })
  }, [items])

  // 点外面关闭
  useEffect(() => {
    if (!isOpen) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) close()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isOpen, close])

  // 键盘
  const getTriggerProps = () => ({
    ref: triggerRef,
    id: triggerId,
    type: 'button' as const,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? menuId : undefined,
    onClick: toggle,
    onKeyDown(e: React.KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
  })

  const getMenuProps = () => ({
    ref: menuRef,
    id: menuId,
    role: 'menu' as const,
    'aria-labelledby': triggerId,
    tabIndex: -1,
    onKeyDown(e: React.KeyboardEvent) {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); moveActive(1); break
        case 'ArrowUp':   e.preventDefault(); moveActive(-1); break
        case 'Home':      e.preventDefault(); setActiveIndex(0); break
        case 'End':       e.preventDefault(); setActiveIndex(items.length - 1); break
        case 'Escape':    e.preventDefault(); close(); break
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (activeIndex >= 0) select(items[activeIndex].value)
          break
        default:
          // 首字母搜索
          if (e.key.length === 1) {
            const idx = items.findIndex(
              (it, i) => i > activeIndex && it.label.toLowerCase().startsWith(e.key.toLowerCase()),
            )
            if (idx >= 0) setActiveIndex(idx)
          }
      }
    },
  })

  const getItemProps = (item: MenuItem, index: number) => ({
    role: 'menuitem' as const,
    tabIndex: -1,
    'aria-disabled': item.disabled,
    'data-active': index === activeIndex,
    onClick: () => select(item.value),
    onMouseEnter: () => setActiveIndex(index),
  })

  return {
    isOpen, activeIndex, items,
    open, close, toggle, select,
    getTriggerProps, getMenuProps, getItemProps,
  }
}

// =====================================================
// 用法:UI 完全你决定
// =====================================================
/*
function ColorPicker() {
  const menu = useMenu({
    items: [
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
      { value: 'green', label: 'Green', disabled: true },
    ],
    onSelect: v => console.log('picked', v),
  })

  return (
    <>
      <button {...menu.getTriggerProps()}>Pick a color</button>
      {menu.isOpen && (
        <ul {...menu.getMenuProps()} className="my-fancy-menu">
          {menu.items.map((it, i) => (
            <li key={it.value} {...menu.getItemProps(it, i)}>
              {it.label}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
*/

// =====================================================
// 关键收获
// =====================================================
//
// 1. props getter 把 a11y + 事件全包好,用户只需 spread
// 2. ref 自动管理(menu / trigger)
// 3. 键盘:Up/Down/Home/End/Esc/Enter/Space/首字母,全部 WAI-ARIA Authoring Practices 标准
// 4. 框架适配:这个 logic 抽出后 React/Vue/Solid 都能复用
// 5. 真实库:Headless UI / Radix / react-aria 都是这个套路,但内部更复杂(focus trap、portal、collision detection 等)
