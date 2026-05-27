# 25 - i18n / l10n Lab

> 国际化(i18n) / 本地化(l10n) 不只是「翻译几行字」。
> 它是「让产品在每一个语言、文化、时区、货币、数字、日期格式、阅读方向下都自然」。
> 做对了:全球能跑。做错了:翻译错一句话被告上法庭(真实案例,见第 22 节)。

---

## 学这个能干什么

- 用 `Intl` 写出格式化日期 / 数字 / 货币 / 复数 / 相对时间,不依赖 moment/dayjs 这些
- 在 React / Vue 项目里跑通完整翻译流程(从字符串到上线)
- 处理 ICU MessageFormat(复数、性别、嵌套选择)
- 适配 RTL(阿拉伯语 / 希伯来语) UI
- 设计 URL 策略(`/zh-CN/path` vs `zh.example.com` vs `?lang=zh`)
- 跑通翻译工作流(extract → translation memory → 上线 → 增量)
- 避免硬编码字符串 / 错误复数 / 错误日期 / 错误货币 / 错误排序的常见坑
- 处理时区、夏令时、农历、伊斯兰历这些进阶问题

---

## 1. i18n vs l10n 概念差

```
i18n (internationalization):
  「让产品能被本地化」
  → 工程能力:支持多语言基础设施、字符串外提、格式化框架

l10n (localization):
  「针对某地区做实际的本地化」
  → 翻译 + 文化适配:翻译字符串、改图、改交互习惯

g11n (globalization) = i18n + l10n

注意:数字 18 是「internationalization」中间字母数,11 是「localization」中间字母数,15 是「globalization」
```

简单说:**i18n 是工程师的事,l10n 是翻译 + PM + 设计的事**。

---

## 2. 现代 i18n 技术栈(2026)

| 层级 | 选项 | 推荐 |
|---|---|---|
| **格式化 API** | Intl.* (浏览器原生) | ✅ 首选,免依赖 |
| **React 框架** | react-i18next / FormatJS (react-intl) / LinguiJS / Tolgee | react-i18next 生态最大,FormatJS ICU 最规范 |
| **Vue 框架** | vue-i18n v9+ | ✅ 唯一选 |
| **Svelte** | svelte-i18n / typesafe-i18n | typesafe-i18n 类型最好 |
| **MessageFormat 规范** | ICU MessageFormat (industry standard) | ✅ 必学 |
| **翻译管理平台 TMS** | Crowdin / Lokalise / Phrase / Tolgee | Tolgee 自部署友好 |
| **机器翻译 fallback** | DeepL / Google Translate API | DeepL 质量更好(欧语) |
| **类型生成** | typesafe-i18n / @tolgee/cli / i18next-typescript | 强烈推荐 |

**别用**:
- moment.js(已 deprecated,体积大,用 Intl / Temporal / dayjs)
- 自己手写复数规则(用 Intl.PluralRules,各语言规则极复杂)
- numbro / accounting.js(Intl.NumberFormat 已经够用)

---

## 3. Intl API 全家桶

ECMAScript 自带,所有现代浏览器支持。**完全没必要装 i18n 库就能做 80% 的事**。

```ts
new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date())
// → "2026年5月26日星期二"

new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(1234.5)
// → "$1,234.50"

new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5)
// → "1.234,50 €"

new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(-1, 'day')
// → "昨天"

new Intl.PluralRules('en-US').select(1)         // 'one'
new Intl.PluralRules('en-US').select(2)         // 'other'
new Intl.PluralRules('ar-EG').select(5)         // 'few' (阿拉伯语 6 种!)

new Intl.ListFormat('en-US', { type: 'conjunction' }).format(['apple', 'orange', 'banana'])
// → "apple, orange, and banana"

new Intl.Collator('zh-CN').compare('张', '王')  // 中文笔画排序
new Intl.Collator('en-US').compare('a', 'B')    // 大小写敏感

new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of('US')      // "美国"
new Intl.DisplayNames(['zh-CN'], { type: 'language' }).of('en')    // "英语"
new Intl.DisplayNames(['zh-CN'], { type: 'currency' }).of('EUR')   // "欧元"

new Intl.Segmenter('zh-CN', { granularity: 'word' })
  .segment('我喜欢编程')
// 中日韩分词:["我", "喜欢", "编程"]
```

完整代码见 [src/intl-api.ts](src/intl-api.ts)。

---

## 4. Locale 标识符(BCP 47)

```
基础:    en          // 英语
地区:    en-US       // 美国英语
        en-GB       // 英国英语
        zh-CN       // 中国大陆中文(简体)
        zh-TW       // 台湾中文(繁体)
        zh-HK       // 香港中文(繁体)

进阶:   zh-Hans-CN  // 简体中文-中国大陆(脚本指定)
        zh-Hant-TW  // 繁体中文-台湾
        sr-Cyrl-RS  // 塞尔维亚-西里尔字母-塞尔维亚
        sr-Latn-RS  // 塞尔维亚-拉丁字母-塞尔维亚

扩展:   en-US-u-ca-gregory     // 公历
        ar-SA-u-ca-islamic     // 伊斯兰历
        zh-CN-u-ca-chinese     // 农历
        en-US-u-nu-arab        // 阿拉伯数字(٠١٢٣)
```

陷阱:
- `zh` 不是合法回退,要么 `zh-CN` 要么 `zh-Hans`
- 用户系统语言可能是 `en-US-POSIX`(不规范),要做 fallback
- locale 顺序敏感:`['zh-CN', 'en-US']` 是「先简中,缺则英美」

---

## 5. 字符串管理:locale 文件结构

平铺(简单):
```json
{
  "welcome": "Welcome",
  "login.button": "Sign in",
  "login.error.invalidPassword": "Invalid password"
}
```

嵌套(结构化):
```json
{
  "welcome": "Welcome",
  "login": {
    "button": "Sign in",
    "error": {
      "invalidPassword": "Invalid password"
    }
  }
}
```

**推荐嵌套**:命名空间清晰、IDE 折叠友好、便于按 feature 拆 namespace。

按 namespace 拆文件(规模大时必须):
```
locales/
  en-US/
    common.json         # 全局共用
    auth.json           # 登录注册
    dashboard.json      # 首页
    settings.json       # 设置
  zh-CN/
    common.json
    auth.json
    ...
```

Lazy load(避免一次性 200KB 翻译进 main bundle):
- react-i18next:`i18next-http-backend` 按需加载 namespace
- vue-i18n:`createI18n({ legacy: false, fallbackLocale: 'en' })` + 动态 import

---

## 6. ICU MessageFormat:复数 + 性别 + 嵌套

不是「英语 1 个 0 复数 → 中文一样」。
**俄语有 3 种,阿拉伯语有 6 种,威尔士语有 6 种。** 硬写 if/else 就废。

ICU 是工业标准:
```
{count, plural,
  =0 {No items}
  one {# item}
  other {# items}
}

→ count=0 → "No items"
→ count=1 → "1 item"
→ count=5 → "5 items"
```

性别:
```
{gender, select,
  male {He}
  female {She}
  other {They}
} liked your photo.
```

嵌套(订单显示):
```
{count, plural,
  one {You have {count} new message from {sender}}
  other {You have {count} new messages from {sender}}
}
```

实现:[src/icu-messageformat.ts](src/icu-messageformat.ts)。

---

## 7. React 实战:react-i18next

最大生态、最成熟。完整 setup 见 [src/react-i18next-setup.tsx](src/react-i18next-setup.tsx)。

```tsx
import { useTranslation, Trans } from 'react-i18next'

function MyComponent() {
  const { t, i18n } = useTranslation('auth')

  return (
    <>
      <h1>{t('login.title')}</h1>
      <p>{t('login.hint', { name: 'Alice' })}</p>
      <p>{t('messages', { count: 5 })}</p>      {/* 自动选 _one / _other */}

      {/* 富文本带 React 组件 */}
      <Trans i18nKey="terms">
        I agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy</a>
      </Trans>

      <button onClick={() => i18n.changeLanguage('zh-CN')}>中文</button>
    </>
  )
}
```

要点:
- 用 `Trans` 处理富文本(里面有标签、变量)
- key 命名:小写 + 点号(`section.subsection.action`)
- 永远要有 fallback 语言(英语兜底)
- SSR(Next):用 `next-i18next` 或 `next-intl`(后者更新)

---

## 8. Vue 实战:vue-i18n

完整 setup 见 [src/vue-i18n-setup.ts](src/vue-i18n-setup.ts)。

```vue
<template>
  <h1>{{ $t('welcome') }}</h1>
  <p>{{ $tc('items', count) }}</p>         <!-- 复数 -->
  <p>{{ $d(new Date(), 'long') }}</p>      <!-- 日期 -->
  <p>{{ $n(1234.5, 'currency') }}</p>      <!-- 数字 -->

  <i18n-t keypath="terms" tag="p">
    <template #terms>
      <a href="/terms">{{ $t('linkTerms') }}</a>
    </template>
  </i18n-t>
</template>
```

要点:
- v9+ 用 composition API(`useI18n()`)
- 关掉 `legacy: false` 用新 API
- `globalInjection: true` 让 `$t` 在 template 直接用
- Vite 用 `@intlify/unplugin-vue-i18n` 编译期注入

---

## 9. RTL(从右到左)适配

阿拉伯语 / 希伯来语 / 波斯语 / 乌尔都语 → 整个 UI 镜像。

```html
<html lang="ar" dir="rtl">
```

CSS 用「逻辑属性」(logical properties),自动跟着 `dir`:

```css
/* ❌ 物理方向(LTR / RTL 不会跟着改) */
margin-left: 1rem;
padding-right: 0.5rem;
border-left: 1px solid;
left: 0;

/* ✅ 逻辑方向 */
margin-inline-start: 1rem;
padding-inline-end: 0.5rem;
border-inline-start: 1px solid;
inset-inline-start: 0;
```

简写:
```css
/* 全部用 inline-* / block-* 替代 left/right/top/bottom */
margin-inline: 1rem;             /* margin-left + margin-right */
padding-block: 0.5rem;           /* padding-top + padding-bottom */
inset-inline: 0;                 /* left + right */
```

SVG 镜像(箭头要反过来):
```css
[dir="rtl"] .icon-arrow-back {
  transform: scaleX(-1);
}
```

但**别什么都镜像**:
- ✅ 镜像:箭头、导航 chevron、布局
- ❌ 不镜像:logo、品牌图标、媒体进度条(物理时间方向)、数字(123 不变)

代码:[src/rtl-helpers.ts](src/rtl-helpers.ts)。

---

## 10. URL 策略:三选一

| 策略 | 例子 | 优点 | 缺点 |
|---|---|---|---|
| **子目录** | `/zh-CN/about` | SEO 好、独立爬虫索引、易部署、HTTPS 共用证书 | URL 长 |
| **子域名** | `zh.example.com/about` | 物理隔离、各 region 独立部署 | DNS / 证书麻烦 |
| **顶级域名** | `example.cn/about` | 本地 SEO 极好 | 多份证书、维护成本高 |
| **查询参数** | `/about?lang=zh` | 改动小 | SEO 差、用户改 URL 容易出错 |
| **Cookie** | 一致 URL,后端识别 | URL 干净 | SEO 极差、共享链接错乱 |

**推荐**: 子目录 + 用户偏好(cookie) override:
```
1. URL 有 /zh-CN/ → 用 zh-CN(最高优先级)
2. cookie 有 locale → 用 cookie
3. Accept-Language header → 协商最佳匹配
4. 默认 en
```

具体逻辑:[src/locale-detection.ts](src/locale-detection.ts)。

---

## 11. 翻译工作流(从字符串到上线)

```
1. 工程师写代码:t('login.title') 或 <Trans>
   ↓
2. 提取(extract):
   - i18next-parser
   - @formatjs/cli extract
   - tolgee-cli
   生成 locales/en-US/auth.json(把 key 写进去,value 空 或 = 英文)
   ↓
3. 推到 TMS(Crowdin / Lokalise / Tolgee):
   - git push 触发同步 / GitHub Action / CLI
   ↓
4. 译者翻译(TMS 自带 translation memory、机器翻译预填、术语库)
   ↓
5. 拉回(pull):
   - tolgee pull / crowdin download
   生成 locales/zh-CN/auth.json
   ↓
6. CI 校验:
   - 所有 key 都有翻译?
   - 所有 placeholder({name}, {count}) 都在?
   - ICU 语法正确?
   - 长度限制(按钮文案不超 20 字符)?
   ↓
7. 构建 + 部署
```

详见 [examples/translation-workflow.md](examples/translation-workflow.md)。

---

## 12. 数字格式化的坑

```
1.234,56          ← 德语 / 法语:逗号是小数点,点是千位
1,234.56          ← 英美:点是小数点,逗号是千位
1 234,56          ← 法国(标准): 不间断空格做千位

١٢٣٤              ← 阿拉伯-印度数字
१२३४              ← 印地语数字
१,२३,४५६          ← 印度数字 + lakh / crore 分位(每 2 位一逗号)
```

**永远用 Intl.NumberFormat,不要自己 `.toLocaleString()` 或正则替换**:

```ts
new Intl.NumberFormat('hi-IN').format(1234567)
// → "12,34,567"   (印度风格,不是 1,234,567)

new Intl.NumberFormat('en-IN').format(1234567)
// → "12,34,567"   (同上)

new Intl.NumberFormat('en-US').format(1234567)
// → "1,234,567"
```

货币:
```ts
new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(99.5)
// → "¥99.50"

new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(99.5)
// → "¥100"  (JPY 无小数,自动 round)
```

**坑**:不要把货币符号 hardcode,不同 locale 显示同一货币也不一样:
- USD 在 en-US: `$1,234.50`
- USD 在 en-CA: `US$1,234.50`(加拿大要区分美元 vs 加元)
- USD 在 fr-FR: `1 234,50 $US`

---

## 13. 日期 / 时间的坑

```
2026-05-26        ← ISO,机器友好
26/05/2026        ← 英国 / 欧洲 dd/mm/yyyy
05/26/2026        ← 美国 mm/dd/yyyy
2026/5/26         ← 中日韩 yyyy/mm/dd
26.5.2026         ← 德语,点分
```

绝对**不要**:
- 用 `Date.prototype.toString()`(各浏览器各 locale 不一样,不稳定)
- 用 `Date.prototype.toLocaleDateString()` 不传 locale(用系统 locale,SSR / 测试不稳)
- 自己拼字符串 `${y}年${m}月${d}日`

绝对**要**:
```ts
new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(date)
new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
  timeZone: 'America/New_York',
  timeZoneName: 'short',
}).format(date)
```

时区:
- **永远存 UTC**(数据库、API)
- **展示用用户时区**(`Intl.DateTimeFormat` 默认用 `Intl.DateTimeFormat().resolvedOptions().timeZone`)
- **跨时区操作**(会议预约、航班)用 IANA 名(`Asia/Shanghai`),不用 offset(`+08:00`),因为有夏令时

相对时间:
```ts
new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(-1, 'day')
// → "昨天"  (不是 "1 天前")

new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(-3, 'day')
// → "3天前"
```

Temporal API(2026 已 stable, [Temporal Proposal](https://tc39.es/proposal-temporal/)):
```ts
const meeting = Temporal.ZonedDateTime.from({
  year: 2026, month: 6, day: 15, hour: 14,
  timeZone: 'Asia/Shanghai'
})
const localTime = meeting.withTimeZone('America/New_York')
```

> Temporal 比 Date 好太多。能用就用。Polyfill: `@js-temporal/polyfill`

---

## 14. 排序 / 搜索的本地化

```ts
const list = ['Zoë', 'apple', 'Banana', 'éclair']

// 错误:JS 默认排序按 char code
list.sort()
// → ["Banana", "Zoë", "apple", "éclair"]    // 大小写、变音号都乱

// 正确
list.sort(new Intl.Collator('en-US', { sensitivity: 'base' }).compare)
// → ["apple", "Banana", "éclair", "Zoë"]

// 中文按拼音
['张三', '李四', '王五', 'Anna'].sort(new Intl.Collator('zh-CN').compare)
// → ["Anna", "李四", "王五", "张三"]

// 中文按笔画
new Intl.Collator('zh-CN-u-co-stroke').compare('一', '二')

// 搜索时忽略大小写 + 变音号
new Intl.Collator('en-US', { sensitivity: 'base' }).compare('cafe', 'CAFÉ') === 0
```

---

## 15. 分词 / 字符计数(中日韩 / emoji)

```ts
// ❌ 错误:'你好👨‍👩‍👧'.length === 6(emoji = surrogate pair + ZWJ)
// ❌ split('')也错

// ✅ 用 Segmenter 按字符切
const seg = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
[...seg.segment('你好👨‍👩‍👧')].length
// → 3

// 按词切(中文分词)
const wordSeg = new Intl.Segmenter('zh-CN', { granularity: 'word' })
[...wordSeg.segment('我喜欢编程')].map(s => s.segment)
// → ["我", "喜欢", "编程"]
```

应用:
- 推文 / 微博字数限制(按 grapheme,不按 code unit)
- 截断长文(`.slice(0, 100)` 会切断 emoji,要按 grapheme)
- 全文搜索 tokenize(中日韩没有空格)

---

## 16. 字体 / 排版本地化

```css
body {
  font-family:
    /* 拉丁优先(英文字符走拉丁字体) */
    'Inter', system-ui,
    /* 中文 fallback */
    'PingFang SC', 'Microsoft YaHei',
    /* 日文 fallback */
    'Hiragino Sans', 'Yu Gothic',
    /* 韩文 */
    'Noto Sans KR',
    /* 阿拉伯 */
    'Noto Sans Arabic',
    sans-serif;
}

/* 中文行高要更高(汉字方正 + 上下空间需求) */
:lang(zh) { line-height: 1.7; }
:lang(en) { line-height: 1.5; }

/* 阿拉伯字体要更大 + 行高 */
:lang(ar) { font-size: 1.1em; line-height: 2; }

/* 中日韩不需要 letter-spacing,英文要 */
:lang(en) { letter-spacing: 0.01em; }
```

**word-break**:中日韩 = `word-break: normal`(可断行)
英文长 URL = `word-break: break-word` 或 `overflow-wrap: anywhere`

---

## 17. 不要硬编码:工程层防御

ESLint 规则强制走 t():
```js
// .eslintrc
{
  rules: {
    'react/jsx-no-literals': 'warn',                 // 警告 JSX 里裸字符串
    'i18next/no-literal-string': 'error',            // 强制 t()
  }
}
```

Pre-commit hook 扫源码,任何裸中文 / 长英文 报错:
```bash
grep -rn '[一-龥]' src/ --include='*.tsx' --include='*.ts' \
  | grep -v 't(' | grep -v '//'
```

---

## 18. 测试 i18n

```ts
// 测每个 locale 都能渲染不报错
test.each(['en-US', 'zh-CN', 'ar-SA', 'de-DE', 'ja-JP'])(
  'renders without error in %s',
  async (locale) => {
    i18n.changeLanguage(locale)
    render(<App />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  }
)

// 用最长翻译测「按钮文案是否撑爆」
test('button does not overflow with German', () => {
  i18n.changeLanguage('de-DE')
  render(<SaveButton />)
  // 德语动词通常比英语长 30-50%
  const btn = screen.getByRole('button')
  expect(btn.offsetWidth).toBeLessThan(200)
})

// 用「pseudo locale」检测漏翻
// en-XA 把所有翻译变成 [!! Tést Strīng !!]
i18n.changeLanguage('en-XA')
// 任何裸英文就一眼看出
```

---

## 19. SSR / SSG 注意

```
1. locale 必须在 server 决定(读 cookie / header / URL)
2. 翻译资源必须 server 端能加载(同 fs / 同 dist)
3. 客户端 hydration 不能改 locale(否则 mismatch)
4. 切语言 = full reload(不要 client-side 切,避免半中半英)
   或者:用 next-intl 这种为 RSC 设计的
5. <html lang> + <html dir> 必须 server 渲染(不要 useEffect 后改)
6. SEO:hreflang 标签
   <link rel="alternate" hreflang="zh-CN" href="https://example.com/zh-CN/" />
   <link rel="alternate" hreflang="en-US" href="https://example.com/en-US/" />
   <link rel="alternate" hreflang="x-default" href="https://example.com/" />
```

---

## 20. 性能

```
[ ] 翻译文件 lazy load(按 route / 按 namespace)
[ ] 不要把所有 locale 打进 main bundle
[ ] HTTP 缓存:locales/*.json 长缓存 + content hash
[ ] CDN 边缘缓存:不同语言走不同 cache key
[ ] 用 prefer-color-scheme 同款思路 + Accept-Language 加 Vary header
[ ] 翻译动态加载用 Suspense fallback,避免页面闪英文
[ ] Tree-shake 不用的 locale(Vite 已自动)
[ ] 监控:翻译 fetch 失败率
```

---

## 21. 翻译质量

```
1. 字符串要有上下文(给译者看)
   ❌ "Save"   → 保存?省钱?救助?
   ✅ t('settings.button.save', { context: 'Save settings form' })

2. 不要让译者填空(占位符变量)
   ❌ "{count} items in cart"  (译者可能不懂 {})
   ✅ TMS 平台直接展示「3 items in cart」让译者看到上下文

3. 避免文化敏感图标
   ❌ 大拇指 👍 在中东是侮辱
   ❌ 猫头鹰 🦉 在印度代表愚蠢
   ❌ 4 (四) 在中日韩代表死亡

4. 颜色文化差异
   - 红色:中国 = 喜庆,西方 = 警告 / 危险
   - 白色:西方 = 婚礼,东亚 = 葬礼

5. 名字 / 称呼
   - 西方:First Name / Last Name
   - 东亚:姓在前,名在后
   - 西班牙:双姓(父姓 + 母姓)
   - 冰岛:不用姓,用「父名 -son / -dóttir」
   → 不要把 firstName + lastName 当通用

6. 地址表单
   - 美国:Street / City / State / ZIP
   - 英国:Street / City / Postcode(没有 State)
   - 日本:邮编在最上面 / 都道府县 / 市区町村
   → 不要让全世界填同一个表单
```

---

## 22. 真实事故案例

```
1. HSBC 2009 全球 broker tag line "Assume Nothing"
   误译成 "Do Nothing"
   重新换 brand 花 1000 万美元

2. KFC 进中国早期 "Finger lickin' good"
   译成 "吃掉你的手指"

3. Pepsi 进中国 "Come alive with Pepsi"
   译成 "百事可以让你的祖先从坟墓里出来"

4. Parker 钢笔西班牙广告 "It won't leak in your pocket and embarrass you"
   "embarrass" 西班牙语 false friend → 译成 "怀孕"
   "它不会在你口袋里漏墨水让你怀孕"

5. 真实代码事故:
   - Twitter 早期日期显示 "in 4 个月" (没用 Intl.RelativeTimeFormat)
   - Slack 长期不支持 RTL,被中东用户吐槽
   - Notion 上线 1 年才支持 zh-CN,损失大量市场
   - 某电商把 USD$ 显示成 ¥(货币符号写死)→ 用户以为打 7 折,公司亏钱赔付
```

**教训**:**永远找 native speaker 审稿,不要只靠机翻**。

---

## 23. Checklist:i18n 上线前

完整版 [examples/i18n-checklist.md](examples/i18n-checklist.md)。

---

## src/ 索引

| 文件 | 说明 |
|---|---|
| [src/intl-api.ts](src/intl-api.ts) | Intl.* 全家桶用法 + 完整示例 |
| [src/react-i18next-setup.tsx](src/react-i18next-setup.tsx) | React 完整集成(配置 + hooks + Trans + SSR) |
| [src/vue-i18n-setup.ts](src/vue-i18n-setup.ts) | Vue 3 + Composition API 完整集成 |
| [src/icu-messageformat.ts](src/icu-messageformat.ts) | ICU MessageFormat 解析 / 复数 / select |
| [src/rtl-helpers.ts](src/rtl-helpers.ts) | RTL 检测 / CSS 逻辑属性 / SVG 镜像 |
| [src/locale-detection.ts](src/locale-detection.ts) | URL / cookie / Accept-Language 协商 |
| [locales/en.json](locales/en.json) | 英文翻译示例 |
| [locales/zh-CN.json](locales/zh-CN.json) | 简体中文翻译示例 |
| [examples/translation-workflow.md](examples/translation-workflow.md) | 翻译工作流(提取 → TMS → 拉回) |
| [examples/i18n-checklist.md](examples/i18n-checklist.md) | 国际化上线 checklist |

---

## 资源

- [MDN: Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [ECMA-402](https://tc39.es/ecma402/) — i18n API 规范
- [BCP 47](https://www.rfc-editor.org/info/bcp47) — locale tag 规范
- [Unicode CLDR](https://cldr.unicode.org/) — 各种本地化数据源(浏览器 Intl 的 backing)
- [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [react-i18next](https://react.i18next.com/)
- [vue-i18n](https://vue-i18n.intlify.dev/)
- [FormatJS](https://formatjs.io/) — Intl polyfill + react-intl
- [Tolgee](https://tolgee.io/) — 开源 TMS,可自部署
- [Temporal Proposal](https://tc39.es/proposal-temporal/)
- [W3C i18n Activity](https://www.w3.org/International/) — 标准 + 长篇 best practices
- [Smashing Magazine: Why You Should Use Logical Properties](https://www.smashingmagazine.com/2022/04/css-logical-properties-units/)
