// React + i18next 生产级集成
//
// 包含:
// - 初始化(资源加载、lazy load、SSR-safe)
// - useTranslation hook 用法
// - Trans 组件(富文本、嵌入 React 元素)
// - 复数 / 上下文 / namespace
// - 切语言 + 持久化
// - TypeScript 类型增强
// - Next.js 集成提示

// =====================================================
// 1. 安装依赖
// =====================================================
//
// npm i i18next react-i18next i18next-http-backend i18next-browser-languagedetector

// =====================================================
// 2. 初始化(src/i18n.ts)
// =====================================================

import i18n from 'i18next'
import { initReactI18next, useTranslation as useI18nextTranslation, Trans } from 'react-i18next'
import Backend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import React, { useEffect, useState, Suspense } from 'react'

export const SUPPORTED_LOCALES = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'de-DE', 'fr-FR', 'ar-SA'] as const
export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export const NAMESPACES = ['common', 'auth', 'dashboard', 'settings'] as const
export type Namespace = typeof NAMESPACES[number]

void i18n
  // backend:从 /locales/{lng}/{ns}.json 拉
  .use(Backend)
  // 检测语言:URL → localStorage → cookie → navigator
  .use(LanguageDetector)
  // 与 React 绑定
  .use(initReactI18next)
  .init({
    supportedLngs: SUPPORTED_LOCALES,
    fallbackLng: 'en-US',
    ns: NAMESPACES,
    defaultNS: 'common',

    backend: {
      // 必须带 build hash 防缓存
      loadPath: '/locales/{{lng}}/{{ns}}.json?v=' + (process.env.BUILD_HASH ?? 'dev'),
    },

    detection: {
      order: ['path', 'localStorage', 'cookie', 'navigator', 'htmlTag'],
      lookupFromPathIndex: 0,                    // /zh-CN/foo → 'zh-CN'
      caches: ['localStorage', 'cookie'],
      cookieMinutes: 60 * 24 * 365,
    },

    interpolation: {
      escapeValue: false,                        // React 已经 escape,这里关掉
      format(value, format, lng) {
        // 自定义格式器:t('born', { date, format: 'date-long' })
        if (value instanceof Date) {
          const opts: Intl.DateTimeFormatOptions =
            format === 'date-long' ? { dateStyle: 'long' } :
            format === 'date-short' ? { dateStyle: 'short' } :
            { dateStyle: 'medium' }
          return new Intl.DateTimeFormat(lng, opts).format(value)
        }
        if (typeof value === 'number') {
          if (format === 'currency') return new Intl.NumberFormat(lng, { style: 'currency', currency: 'USD' }).format(value)
          if (format === 'percent') return new Intl.NumberFormat(lng, { style: 'percent' }).format(value)
        }
        return String(value)
      },
    },

    react: {
      useSuspense: true,                         // 配合 <Suspense> 等翻译加载
      transWrapTextNodes: 'span',                // <Trans> 把文本节点包 <span>(方便选择器)
    },

    // 开发期警告
    saveMissing: import.meta.env?.DEV,
    missingKeyHandler: (lng, ns, key) => {
      console.warn(`[i18n] missing key: ${ns}:${key} (${lng})`)
    },
  })

export default i18n

// =====================================================
// 3. TypeScript 类型增强(react-i18next.d.ts)
// =====================================================
//
// 让 t('key') 有类型补全和拼写检查:
//
// import 'react-i18next'
// import type common from '../public/locales/en-US/common.json'
// import type auth from '../public/locales/en-US/auth.json'
//
// declare module 'react-i18next' {
//   interface CustomTypeOptions {
//     defaultNS: 'common'
//     resources: {
//       common: typeof common
//       auth: typeof auth
//     }
//   }
// }
//
// 这样 t('login.title') 会自动校验存在性

// =====================================================
// 4. 基本用法 + Suspense
// =====================================================

export function App() {
  return (
    <Suspense fallback={<div>Loading translations…</div>}>
      <Page />
    </Suspense>
  )
}

function Page() {
  const { t } = useI18nextTranslation('auth')      // 指定 namespace
  return (
    <div>
      <h1>{t('login.title')}</h1>
      <p>{t('login.subtitle')}</p>
    </div>
  )
}

// =====================================================
// 5. 插值
// =====================================================

function Greeting({ name }: { name: string }) {
  const { t } = useI18nextTranslation('common')
  return <p>{t('greeting', { name })}</p>
  // common.json: { "greeting": "Hello, {{name}}!" }
}

// =====================================================
// 6. 复数(配合 ICU MessageFormat 或 i18next 简易语法)
// =====================================================
//
// 简易语法(i18next 自带):
// {
//   "items_zero": "No items",
//   "items_one": "{{count}} item",
//   "items_two": "{{count}} items",        // 阿拉伯语等
//   "items_few": "{{count}} items",
//   "items_other": "{{count}} items"
// }

function Cart({ count }: { count: number }) {
  const { t } = useI18nextTranslation('common')
  return <p>{t('items', { count })}</p>
  // count=0 → "No items"
  // count=1 → "1 item"
  // count=5 → "5 items"
}

// 上下文(context):同一个 key 因「场景」不同译法不同
// {
//   "greeting_male": "Mr. {{name}}",
//   "greeting_female": "Mrs. {{name}}",
//   "greeting_other": "{{name}}"
// }

function GenderedGreeting({ name, gender }: { name: string; gender: 'male' | 'female' | 'other' }) {
  const { t } = useI18nextTranslation('common')
  return <p>{t('greeting', { context: gender, name })}</p>
}

// =====================================================
// 7. Trans 组件(富文本 / 嵌入元素)
// =====================================================
//
// 字符串里有 React 元素时,t() 不行(只能返回字符串)
// 用 <Trans> 保留 HTML / React 子树结构

function TermsAgreement() {
  return (
    <Trans i18nKey="termsAgreement" ns="auth">
      I agree to the <a href="/terms">terms of service</a> and <a href="/privacy">privacy policy</a>.
    </Trans>
  )
  // auth.json:
  // { "termsAgreement": "I agree to the <1>terms of service</1> and <3>privacy policy</3>." }
  //
  // <1> 对应第一个非文本子节点(<a href="/terms">),里面的文字是 children 的 value
  //
  // 中文翻译保持标签序号:
  // { "termsAgreement": "我同意<1>服务条款</1>和<3>隐私政策</3>。" }
}

// 进阶:用 components / values 显式声明,避免数字标签混乱
function TermsAgreementV2() {
  return (
    <Trans
      i18nKey="termsAgreement"
      ns="auth"
      components={{
        termsLink: <a href="/terms" />,
        privacyLink: <a href="/privacy" />,
      }}
    />
  )
  // auth.json:
  // { "termsAgreement": "I agree to the <termsLink>terms</termsLink> and <privacyLink>privacy</privacyLink>." }
}

// =====================================================
// 8. 切换语言 + 持久化
// =====================================================

function LanguageSwitcher() {
  const { i18n } = useI18nextTranslation()

  const change = async (lng: SupportedLocale) => {
    await i18n.changeLanguage(lng)
    // languageDetector 已经写 localStorage / cookie
    // 同时改 <html lang> 和 <html dir>
    document.documentElement.lang = lng
    document.documentElement.dir = lng.startsWith('ar') || lng.startsWith('he') ? 'rtl' : 'ltr'
  }

  return (
    <select value={i18n.language} onChange={e => void change(e.target.value as SupportedLocale)}>
      {SUPPORTED_LOCALES.map(l => (
        <option key={l} value={l}>
          {new Intl.DisplayNames([l], { type: 'language' }).of(l)}
        </option>
      ))}
    </select>
  )
}

// =====================================================
// 9. 手动加载 namespace(代码分割)
// =====================================================
//
// 默认 namespace 自动按需加载;但如果你想确保某 namespace 在路由切到之前就已加载:

function LazyRoute() {
  const { t, ready } = useI18nextTranslation('settings', { useSuspense: false })
  if (!ready) return <div>Loading…</div>
  return <h1>{t('title')}</h1>
}

// 或预加载
export async function preloadNamespace(ns: Namespace) {
  await i18n.loadNamespaces(ns)
}

// =====================================================
// 10. 自定义格式化:date / number / list 直接走 Intl
// =====================================================

export function useFormatters() {
  const { i18n } = useI18nextTranslation()
  const lng = i18n.language

  return {
    formatDate: (d: Date, opts?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(lng, opts ?? { dateStyle: 'medium' }).format(d),
    formatCurrency: (n: number, currency = 'USD') =>
      new Intl.NumberFormat(lng, { style: 'currency', currency }).format(n),
    formatRelative: (date: Date) => {
      const diff = Math.round((date.getTime() - Date.now()) / 86400000)
      return new Intl.RelativeTimeFormat(lng, { numeric: 'auto' }).format(diff, 'day')
    },
    formatList: (items: string[]) =>
      new Intl.ListFormat(lng, { type: 'conjunction' }).format(items),
  }
}

// =====================================================
// 11. HOC:non-hook 场景
// =====================================================
//
// import { withTranslation, WithTranslation } from 'react-i18next'
//
// class LegacyComponent extends React.Component<WithTranslation> {
//   render() {
//     return <h1>{this.props.t('title')}</h1>
//   }
// }
//
// export default withTranslation('common')(LegacyComponent)

// =====================================================
// 12. SSR(Next.js)
// =====================================================
//
// Next App Router 推荐用 next-intl(对 RSC 设计更友好):
//   npm i next-intl
//
// 旧 Pages Router 用 next-i18next:
//   npm i next-i18next
//   配 next-i18next.config.js
//   getStaticProps 里 serverSideTranslations(locale, ['common', 'auth'])
//
// 关键:server 必须知道当前 locale 并预加载需要的翻译,否则 hydration mismatch
//
// 路由前缀:
//   /zh-CN/about
//   /en-US/about
//   通过 middleware.ts 解析 URL → 决定 locale → rewrite

// =====================================================
// 13. Vite + react-i18next bundle 体积
// =====================================================
//
// 默认配置:
//   - i18next 核心 ~30 KB(gzip ~10 KB)
//   - react-i18next ~5 KB
//   - 翻译 lazy load(http backend)
//
// 优化:
//   - 不要 bundle 所有 locale → 让 backend 按需 fetch
//   - 大型 namespace 单独拆,按 route 加载
//   - 关掉 saveMissing 在 prod
//   - HTTP 缓存:locales/*.json 加 ?v=hash 长缓存

// =====================================================
// 14. 测试 i18n
// =====================================================
//
// import { I18nextProvider } from 'react-i18next'
// import i18n from './i18n-test'        // 一个 init 同步配置的简化 i18n 实例
//
// function renderWithI18n(ui: React.ReactElement, locale = 'en-US') {
//   i18n.changeLanguage(locale)
//   return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)
// }
//
// it('renders Spanish', () => {
//   renderWithI18n(<Greeting name="Ana" />, 'es-ES')
//   expect(screen.getByText('¡Hola, Ana!')).toBeInTheDocument()
// })

// =====================================================
// 15. 常见错误
// =====================================================
//
// 1. ❌ t('foo.bar.baz') 但 namespace 没加载 → 显示原 key
//    ✅ useTranslation('namespaceName') 指定 ns 或 ns: 'common.foo.bar.baz'
//
// 2. ❌ <Trans>{t('html')}</Trans>  → 双重 escape
//    ✅ <Trans i18nKey="html" />     → 让 Trans 自己处理
//
// 3. ❌ Suspense fallback 闪一下英文(SSR mismatch)
//    ✅ next-intl / next-i18next 配 serverSide preload
//
// 4. ❌ 改 locale 后页面不重渲染
//    ✅ useTranslation 已订阅 i18n,自动 rerender;若是非 hook 场景手动 i18n.on('languageChanged', ...)
//
// 5. ❌ 翻译里写 HTML <br>  → Trans 也认不出
//    ✅ 用换行符 \n + CSS white-space,或用 components={{ br: <br /> }}
//
// 6. ❌ count: 0 → fallback 到 _one(英语)
//    ✅ 加 items_zero 显式声明
//
// 7. ❌ 翻译写 `{name}`  → 不工作
//    ✅ i18next 默认是 `{{name}}` 双花括号
