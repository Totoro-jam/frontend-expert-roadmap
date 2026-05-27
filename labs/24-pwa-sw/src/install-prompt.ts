// PWA Install Prompt + iOS 兜底 + 检测安装状态
// 这套代码处理三种情况:
//   1. Chrome / Edge / Android Chrome - beforeinstallprompt 自动触发
//   2. iOS Safari - 没有 prompt,必须教用户手动「添加到主屏幕」
//   3. 已经装了(standalone)- 隐藏所有 prompt

// =====================================================
// 1. 类型定义
// =====================================================

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

// =====================================================
// 2. 状态判断
// =====================================================

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone === true                   // iOS
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /android/i.test(navigator.userAgent)
}

export function getInstallabilityStatus() {
  if (isStandalone()) return 'installed' as const
  if (isIOS()) return 'ios-manual' as const                         // 必须手动加
  return 'pending' as const                                         // 等 beforeinstallprompt
}

// =====================================================
// 3. Install manager(单例)
// =====================================================

type Listener = (state: { canInstall: boolean; installed: boolean }) => void

class InstallManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private listeners = new Set<Listener>()
  private installed = isStandalone()

  init() {
    if (typeof window === 'undefined') return

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.deferredPrompt = e as BeforeInstallPromptEvent
      this.notify()
    })

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null
      this.installed = true
      this.notify()
    })

    // display-mode 改变(用户在浏览器内安装然后切换 standalone)
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', (e) => {
      this.installed = e.matches
      this.notify()
    })
  }

  get canInstall() {
    return !!this.deferredPrompt
  }

  get isInstalled() {
    return this.installed
  }

  async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt) return 'unavailable'
    this.deferredPrompt.prompt()
    const { outcome } = await this.deferredPrompt.userChoice
    this.deferredPrompt = null
    this.notify()
    return outcome
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn({ canInstall: this.canInstall, installed: this.installed })
    return () => this.listeners.delete(fn)
  }

  private notify() {
    const state = { canInstall: this.canInstall, installed: this.installed }
    this.listeners.forEach(fn => fn(state))
  }
}

export const installManager = new InstallManager()
installManager.init()

// =====================================================
// 4. React Hook
// =====================================================
//
// import { useEffect, useState } from 'react'
//
// export function useInstallPrompt() {
//   const [state, setState] = useState({ canInstall: false, installed: false })
//
//   useEffect(() => installManager.subscribe(setState), [])
//
//   const install = async () => {
//     const outcome = await installManager.promptInstall()
//     return outcome
//   }
//
//   return { ...state, install, isIOS: isIOS() }
// }

// =====================================================
// 5. 智能时机:不要装上来就弹
// =====================================================
//
// Lighthouse / Chrome 自带启发式:不在「无意义的时刻」自动弹 banner
// 你自己的 UI 提示也要遵守:
// - 用户至少互动过 2 次
// - 不要在首屏弹(用户还没建立信任)
// - 用户已访问过 N 次(localStorage 计次)
// - 不要在 30 天内重复提示
//
// 简单实现:

interface InstallTimingState {
  visits: number
  lastPromptAt: number
  dismissedAt: number
}

const KEY = 'pwa-prompt-state'

function readState(): InstallTimingState {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as InstallTimingState
  } catch {
    return { visits: 0, lastPromptAt: 0, dismissedAt: 0 }
  }
}

function writeState(s: InstallTimingState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

export function trackVisit() {
  const s = readState()
  s.visits = (s.visits ?? 0) + 1
  writeState(s)
}

export function shouldShowPrompt(): boolean {
  const s = readState()
  if (isStandalone()) return false

  // 至少 3 次访问
  if ((s.visits ?? 0) < 3) return false

  // 30 天内被 dismiss → 不再弹
  if (s.dismissedAt && Date.now() - s.dismissedAt < 30 * 24 * 60 * 60 * 1000) return false

  return true
}

export function markPromptShown() {
  const s = readState()
  s.lastPromptAt = Date.now()
  writeState(s)
}

export function markPromptDismissed() {
  const s = readState()
  s.dismissedAt = Date.now()
  writeState(s)
}

// =====================================================
// 6. iOS 兜底教学组件(React 示例)
// =====================================================
//
// 检测到 iOS Safari + 未安装 + 触发条件满足 → 显示「请点分享 → 添加到主屏幕」
//
// export function IOSInstallHint() {
//   const [show, setShow] = useState(false)
//
//   useEffect(() => {
//     if (isIOS() && !isStandalone() && shouldShowPrompt()) {
//       setShow(true)
//       markPromptShown()
//     }
//   }, [])
//
//   if (!show) return null
//   return (
//     <div className="ios-install-hint">
//       <p>把这个 App 装到主屏幕:</p>
//       <ol>
//         <li>点底部的「分享」按钮 <ShareIcon /></li>
//         <li>选「添加到主屏幕」</li>
//       </ol>
//       <button onClick={() => { markPromptDismissed(); setShow(false) }}>
//         以后再说
//       </button>
//     </div>
//   )
// }

// =====================================================
// 7. 分析 / 追踪
// =====================================================

export function trackInstallEvents(track: (event: string, props?: any) => void) {
  window.addEventListener('beforeinstallprompt', () => track('pwa_prompt_available'))
  window.addEventListener('appinstalled', () => track('pwa_installed'))

  // standalone 启动追踪(start_url 加 ?source=pwa)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('source') === 'pwa') track('pwa_launched')
  }
}

// =====================================================
// 8. 检测可达性(为什么 prompt 不出来)
// =====================================================
//
// Chrome 安装条件(都必须满足):
//   ✅ HTTPS(或 localhost)
//   ✅ 注册了 SW(且有 fetch handler,返回过 200)
//   ✅ Manifest 有 name + short_name + start_url + icons(至少 192 + 512)
//   ✅ Manifest 有 display: standalone / fullscreen / minimal-ui
//   ✅ 用户「engagement signal」(浏览 30 秒 + 点击)
//   ✅ 没装过(同一 origin)
//
// 看 DevTools → Application → Manifest 会列出缺什么
// 还有 Application → Service Workers 看 fetch handler 是否 active

// =====================================================
// 9. 多 PWA 安装(scope 不同)
// =====================================================
//
// 同 origin 不同 scope 可以装多个:
//   /app1/ + sw1.js → PWA 1
//   /app2/ + sw2.js → PWA 2
//
// Chrome 80+ 支持「app id」(manifest 的 id 字段)
//   { "id": "/app1/?source=pwa", ... }
// 让浏览器知道这是同一个 app(用于更新)

// =====================================================
// 10. 已装 PWA 内的特殊体验
// =====================================================

export function applyStandaloneTweaks() {
  if (!isStandalone()) return

  // 1. 拦截外链:在 PWA 内打开外链会变成 webview-like → 通常想用系统浏览器开
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!a) return
    if (a.origin === window.location.origin) return
    e.preventDefault()
    window.open(a.href, '_blank', 'noopener,noreferrer')
  })

  // 2. 隐藏「下载 app」横幅(在 PWA 内显然不需要)
  document.documentElement.classList.add('is-pwa')
}
