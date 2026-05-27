// 生产级 Modal:Portal + Focus trap + Esc + 受控/非受控 + a11y
// 真实项目用 Radix Dialog / Headless UI Dialog,这里手写学原理

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from './use-controllable'

interface ModalProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** 关闭时的初始 focus 目标(默认回到打开它的按钮) */
  initialFocus?: React.RefObject<HTMLElement>
  /** 点击外部是否关闭 */
  closeOnOutsideClick?: boolean
  /** Esc 是否关闭 */
  closeOnEsc?: boolean
  trigger?: ReactNode
  children: ReactNode
  title: string
}

// 可 focus 元素选择器
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Modal({
  open,
  defaultOpen = false,
  onOpenChange,
  initialFocus,
  closeOnOutsideClick = true,
  closeOnEsc = true,
  trigger,
  children,
  title,
}: ModalProps) {
  const [isOpen, setOpen] = useControllableState({ value: open, defaultValue: defaultOpen, onChange: onOpenChange })
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const prevActive = useRef<HTMLElement | null>(null)

  const close = useCallback(() => setOpen(false), [setOpen])

  // 打开:记录上一个 focus,移到 modal
  useEffect(() => {
    if (!isOpen) return
    prevActive.current = document.activeElement as HTMLElement

    // 锁滚动
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 进入第一个 focusable
    queueMicrotask(() => {
      const target = initialFocus?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      target?.focus()
    })

    return () => {
      document.body.style.overflow = original
      // 关闭:还焦点
      prevActive.current?.focus()
    }
  }, [isOpen, initialFocus])

  // Esc 关闭
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, closeOnEsc, close])

  // Focus trap:Tab 出 modal 时拉回来
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  // trigger 包一层带 ref + 点击 open
  const triggerEl = trigger && (
    <span
      ref={el => { triggerRef.current = el }}
      onClick={() => setOpen(true)}
      style={{ display: 'inline-block' }}
    >
      {trigger}
    </span>
  )

  return (
    <>
      {triggerEl}
      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (closeOnOutsideClick && e.target === e.currentTarget) close()
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            style={{
              background: '#fff', borderRadius: 8, padding: 24,
              minWidth: 320, maxWidth: '90vw', maxHeight: '90vh',
              overflow: 'auto',
              outline: 'none',
            }}
            tabIndex={-1}
          >
            <h2 id="modal-title" style={{ marginTop: 0 }}>{title}</h2>
            <button
              aria-label="Close"
              onClick={close}
              style={{ position: 'absolute', top: 12, right: 12 }}
            >×</button>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// =====================================================
// 用法
// =====================================================
/*
// 非受控
<Modal trigger={<button>Open</button>} title="确认删除">
  <p>确定要删除吗?</p>
  <button onClick={...}>确认</button>
</Modal>

// 受控
const [open, setOpen] = useState(false)
<Modal open={open} onOpenChange={setOpen} title="...">
  ...
</Modal>

// 自动 focus 到指定元素
const inputRef = useRef<HTMLInputElement>(null)
<Modal open={open} onOpenChange={setOpen} initialFocus={inputRef} title="改名">
  <input ref={inputRef} />
</Modal>
*/

// =====================================================
// 这个手写版本欠的:
//   - inert 属性给背景(浏览器最新 API,Radix 已用)
//   - 滚动条隐藏要补偿 scrollbar 宽度避免抖动
//   - Animation:enter / exit 过渡,需配合 unmount 延迟
//   - nested modal:多个 modal 嵌套,Esc / focus trap 要栈式管理
//   - Mobile:虚拟键盘弹起 modal 错位
//
// 生产用 Radix Dialog / Headless UI Dialog,这些细节都覆盖了。
// 但抄一遍 = 真懂 a11y。
*/
