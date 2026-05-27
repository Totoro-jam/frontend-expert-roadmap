// Intl API 全家桶 - 浏览器原生,免 polyfill
//
// 覆盖:
// - DateTimeFormat        日期 / 时间
// - NumberFormat          数字 / 货币 / 百分比 / 单位
// - RelativeTimeFormat    "昨天" "3 天前"
// - PluralRules           复数规则(各语言天差地别)
// - Collator              本地化排序
// - ListFormat            列表(A, B, and C)
// - DisplayNames          国家 / 语言 / 货币的本地名称
// - Segmenter             分词 / 字符切分(中日韩 / emoji)

// =====================================================
// 1. DateTimeFormat
// =====================================================

export function formatDate(date: Date, locale: string, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, opts).format(date)
}

// 预设风格(简洁)
export function formatDateStyles(date: Date, locale: string) {
  return {
    full: new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date),
    long: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date),
    medium: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date),
    short: new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date),
  }
}

// 自定义字段
export function formatDateCustom(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Shanghai',
    timeZoneName: 'short',
    hour12: false,
  }).format(date)
}

// 切分输出(可拿到每个 token 单独处理)
export function formatDateToParts(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).formatToParts(date)
  // [
  //   { type: 'year', value: '2026' },
  //   { type: 'literal', value: '年' },
  //   { type: 'month', value: '5' },
  //   ...
  // ]
}

// 区间(range)
export function formatDateRange(start: Date, end: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).formatRange(start, end)
  // → "2026年5月1日 — 2026年5月26日"
}

// 农历 / 伊斯兰历
export function formatDateInCalendar(date: Date, calendar: 'chinese' | 'islamic' | 'hebrew' | 'gregory') {
  return new Intl.DateTimeFormat(`zh-CN-u-ca-${calendar}`, {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(date)
}

// =====================================================
// 2. NumberFormat
// =====================================================

export function formatNumber(n: number, locale: string, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, opts).format(n)
}

// 货币
export function formatCurrency(amount: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',                     // 'symbol' | 'narrowSymbol' | 'code' | 'name'
  }).format(amount)
}

// 百分比
export function formatPercent(n: number, locale: string, fractionDigits = 1) {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

// 紧凑数字(1.2K / 1.2M)
export function formatCompact(n: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',                       // 'short' | 'long'
  }).format(n)
  // en-US: 1234 → "1.2K"  ;  1234567 → "1.2M"
  // zh-CN: 12345 → "1.2万"  ;  123456789 → "1.2亿"
}

// 单位(2026 已稳定)
export function formatWithUnit(n: number, locale: string, unit: string) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,                                          // 'kilometer-per-hour' | 'celsius' | 'liter' | 'megabyte' ...
    unitDisplay: 'long',                           // 'long' | 'short' | 'narrow'
  }).format(n)
  // formatWithUnit(80, 'en-US', 'kilometer-per-hour') → "80 kilometers per hour"
  // formatWithUnit(80, 'zh-CN', 'kilometer-per-hour') → "每小时 80 公里"
}

// 有符号(显示 + / -)
export function formatSignedNumber(n: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    signDisplay: 'always',                         // 'auto' | 'always' | 'exceptZero' | 'never' | 'negative'
  }).format(n)
}

// 工程师专属:科学计数法
export function formatScientific(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: 'scientific' }).format(n)
  // 0.0000123 → "1.23E-5"
}

// 解析数字回数值(formatRange + range)
export function parseLocaleNumber(str: string, locale: string): number {
  // Intl 没提供 parse,要自己实现:
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  const group = parts.find(p => p.type === 'group')?.value ?? ','
  const decimal = parts.find(p => p.type === 'decimal')?.value ?? '.'
  const cleaned = str
    .replace(new RegExp(`\\${group}`, 'g'), '')
    .replace(new RegExp(`\\${decimal}`), '.')
  return parseFloat(cleaned)
}

// =====================================================
// 3. RelativeTimeFormat
// =====================================================

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: string) {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
  // formatRelativeTime(-1, 'day', 'zh-CN')   → "昨天"
  // formatRelativeTime(-3, 'day', 'zh-CN')   → "3天前"
  // formatRelativeTime(2, 'week', 'en-US')   → "in 2 weeks"
}

// 自动选最合适的 unit(智能展示)
export function smartRelative(date: Date, locale: string, now = new Date()): string {
  const diffMs = date.getTime() - now.getTime()
  const diffSec = Math.round(diffMs / 1000)
  const diffMin = Math.round(diffSec / 60)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)
  const diffMonth = Math.round(diffDay / 30)
  const diffYear = Math.round(diffDay / 365)

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second')
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour')
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day')
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month')
  return rtf.format(diffYear, 'year')
}

// =====================================================
// 4. PluralRules
// =====================================================
//
// 各语言复数形态:
//   英语 / 中文 / 日文 / 韩文 / 越南语:1 种或 2 种
//   俄语 / 波兰语:3 种(one / few / many)
//   阿拉伯语 / 威尔士语:6 种(zero / one / two / few / many / other)

export function getPluralCategory(count: number, locale: string): Intl.LDMLPluralRule {
  return new Intl.PluralRules(locale).select(count)
}

// 配合翻译 key
export function pluralKey(base: string, count: number, locale: string): string {
  const category = new Intl.PluralRules(locale).select(count)
  return `${base}_${category}`
  // pluralKey('items', 1, 'en-US')  → "items_one"
  // pluralKey('items', 5, 'en-US')  → "items_other"
  // pluralKey('items', 1, 'ar-EG')  → "items_one"
  // pluralKey('items', 0, 'ar-EG')  → "items_zero"
  // pluralKey('items', 2, 'ar-EG')  → "items_two"
  // pluralKey('items', 5, 'ar-EG')  → "items_few"
}

// 序数(1st / 2nd / 3rd)
export function getOrdinalCategory(n: number, locale: string): Intl.LDMLPluralRule {
  return new Intl.PluralRules(locale, { type: 'ordinal' }).select(n)
  // en-US: select(1) → 'one'   → "1st"
  //        select(2) → 'two'   → "2nd"
  //        select(3) → 'few'   → "3rd"
  //        select(4) → 'other' → "4th"
}

const ENGLISH_ORDINAL_SUFFIX: Record<Intl.LDMLPluralRule, string> = {
  zero: 'th', one: 'st', two: 'nd', few: 'rd', many: 'th', other: 'th',
}

export function formatEnglishOrdinal(n: number): string {
  const category = new Intl.PluralRules('en-US', { type: 'ordinal' }).select(n)
  return `${n}${ENGLISH_ORDINAL_SUFFIX[category]}`
  // formatEnglishOrdinal(1) → "1st"  ; formatEnglishOrdinal(22) → "22nd"
}

// =====================================================
// 5. Collator(本地化排序)
// =====================================================

export function localeSort<T>(items: T[], locale: string, key?: (x: T) => string): T[] {
  const cmp = new Intl.Collator(locale, { sensitivity: 'base', numeric: true }).compare
  return [...items].sort((a, b) => cmp(key ? key(a) : String(a), key ? key(b) : String(b)))
}

// 中文按拼音 / 按笔画
export function chineseSort(items: string[], by: 'pinyin' | 'stroke') {
  const locale = by === 'pinyin' ? 'zh-CN' : 'zh-CN-u-co-stroke'
  return [...items].sort(new Intl.Collator(locale).compare)
}

// 自然排序("file2" < "file10")
export function naturalSort(items: string[]) {
  return [...items].sort(new Intl.Collator('en-US', { numeric: true }).compare)
  // ["file1", "file2", "file10"]  ←  不是默认的字符串排序("file1", "file10", "file2")
}

// 用于搜索(忽略大小写 + 变音号)
export function localeIncludes(haystack: string, needle: string, locale: string): boolean {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', usage: 'search' })
  const needleLen = needle.length
  for (let i = 0; i <= haystack.length - needleLen; i++) {
    if (collator.compare(haystack.substr(i, needleLen), needle) === 0) return true
  }
  return false
  // localeIncludes('Café Rio', 'cafe', 'en-US') → true
  // localeIncludes('München', 'munchen', 'de-DE') → true
}

// =====================================================
// 6. ListFormat
// =====================================================

export function formatList(items: string[], locale: string, type: 'conjunction' | 'disjunction' | 'unit' = 'conjunction') {
  return new Intl.ListFormat(locale, { style: 'long', type }).format(items)
  // formatList(['A','B','C'], 'en-US', 'conjunction')  → "A, B, and C"
  // formatList(['A','B','C'], 'en-US', 'disjunction')  → "A, B, or C"
  // formatList(['A','B','C'], 'zh-CN', 'conjunction')  → "A、B和C"
  // formatList(['A','B','C'], 'de-DE', 'conjunction')  → "A, B und C"
}

// =====================================================
// 7. DisplayNames
// =====================================================

export function getDisplayName(
  code: string,
  type: 'language' | 'region' | 'script' | 'currency' | 'dateTimeField',
  locale: string,
): string {
  return new Intl.DisplayNames([locale], { type }).of(code) ?? code
  // getDisplayName('US', 'region', 'zh-CN')  → "美国"
  // getDisplayName('en', 'language', 'zh-CN')  → "英语"
  // getDisplayName('EUR', 'currency', 'zh-CN')  → "欧元"
  // getDisplayName('Hans', 'script', 'zh-CN')   → "简体"
}

// 拿当前 locale 下所有国家的列表(给国家选择器用)
export function listAllCountries(displayLocale: string): { code: string; name: string }[] {
  const dn = new Intl.DisplayNames([displayLocale], { type: 'region' })
  // ISO-3166-1 alpha-2 全集
  const codes = [
    'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
    'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
    'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
    'DE','DJ','DK','DM','DO','DZ',
    'EC','EE','EG','EH','ER','ES','ET',
    'FI','FJ','FK','FM','FO','FR',
    'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
    'HK','HM','HN','HR','HT','HU',
    'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
    'JE','JM','JO','JP',
    'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
    'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
    'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
    'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
    'OM',
    'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
    'QA',
    'RE','RO','RS','RU','RW',
    'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
    'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
    'UA','UG','UM','US','UY','UZ',
    'VA','VC','VE','VG','VI','VN','VU',
    'WF','WS',
    'YE','YT',
    'ZA','ZM','ZW',
  ]
  return codes
    .map(c => ({ code: c, name: dn.of(c) ?? c }))
    .sort(localeCmp(displayLocale, x => x.name))
}

function localeCmp<T>(locale: string, key: (x: T) => string) {
  const cmp = new Intl.Collator(locale).compare
  return (a: T, b: T) => cmp(key(a), key(b))
}

// =====================================================
// 8. Segmenter(分词 / 字符切分)
// =====================================================

// 按 grapheme(用户看到的「一个字符」)
export function countGraphemes(text: string, locale = 'en'): number {
  const seg = new Intl.Segmenter(locale, { granularity: 'grapheme' })
  return [...seg.segment(text)].length
  // 'a'.length = 1, countGraphemes('a') = 1
  // '👨‍👩‍👧'.length = 8, countGraphemes('👨‍👩‍👧') = 1
  // '你好'.length = 2, countGraphemes('你好') = 2
}

// 按 grapheme 安全截断(不会切断 emoji / 组合字符)
export function safeSlice(text: string, maxGraphemes: number, locale = 'en'): string {
  const seg = new Intl.Segmenter(locale, { granularity: 'grapheme' })
  const graphemes = [...seg.segment(text)]
  return graphemes.slice(0, maxGraphemes).map(g => g.segment).join('')
}

// 按词切分(中日韩无空格)
export function tokenize(text: string, locale: string): string[] {
  const seg = new Intl.Segmenter(locale, { granularity: 'word' })
  return [...seg.segment(text)]
    .filter(s => s.isWordLike)
    .map(s => s.segment)
  // tokenize('我喜欢编程', 'zh-CN') → ["我", "喜欢", "编程"]
  // tokenize('I love coding', 'en')  → ["I", "love", "coding"]
}

// 按句子切分
export function splitSentences(text: string, locale: string): string[] {
  const seg = new Intl.Segmenter(locale, { granularity: 'sentence' })
  return [...seg.segment(text)].map(s => s.segment.trim()).filter(Boolean)
}

// =====================================================
// 9. Locale 解析 / 协商
// =====================================================

// 解析 BCP 47
export function parseLocale(tag: string) {
  const loc = new Intl.Locale(tag)
  return {
    baseName: loc.baseName,                        // 'zh-Hans-CN'
    language: loc.language,                        // 'zh'
    script: loc.script,                            // 'Hans'
    region: loc.region,                            // 'CN'
    calendar: loc.calendar,                        // 'gregory' | 'chinese' | ...
    numberingSystem: loc.numberingSystem,          // 'latn' | 'arab' | ...
    hourCycle: loc.hourCycle,                      // 'h12' | 'h23' | ...
  }
}

// 改 locale 的扩展
export function withCalendar(tag: string, calendar: string) {
  return new Intl.Locale(tag, { calendar }).toString()
  // withCalendar('zh-CN', 'chinese')   → "zh-CN-u-ca-chinese"
}

// 拿浏览器最大化 / 最小化的 locale
export function maximizeLocale(tag: string) {
  return new Intl.Locale(tag).maximize().toString()
  // 'zh'  → 'zh-Hans-CN'   (推断脚本 + 地区)
}

export function minimizeLocale(tag: string) {
  return new Intl.Locale(tag).minimize().toString()
  // 'zh-Hans-CN'  → 'zh'
}

// =====================================================
// 10. 工具:格式化器缓存(性能优化)
// =====================================================
//
// Intl.* 构造函数有开销(尤其在循环里),应该缓存

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

export function cachedDateFormatter(locale: string, opts?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts ?? {})}`
  let f = dateFormatterCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts)
    dateFormatterCache.set(key, f)
  }
  return f
}

const numberFormatterCache = new Map<string, Intl.NumberFormat>()

export function cachedNumberFormatter(locale: string, opts?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(opts ?? {})}`
  let f = numberFormatterCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, opts)
    numberFormatterCache.set(key, f)
  }
  return f
}

// =====================================================
// 11. 浏览器 / Node 已支持的 Intl 检查
// =====================================================

export function intlSupport() {
  return {
    Segmenter: typeof Intl.Segmenter !== 'undefined',
    DisplayNames: typeof Intl.DisplayNames !== 'undefined',
    ListFormat: typeof Intl.ListFormat !== 'undefined',
    RelativeTimeFormat: typeof Intl.RelativeTimeFormat !== 'undefined',
    PluralRules: typeof Intl.PluralRules !== 'undefined',
    DateTimeFormat: typeof Intl.DateTimeFormat !== 'undefined',
    NumberFormat: typeof Intl.NumberFormat !== 'undefined',
    Collator: typeof Intl.Collator !== 'undefined',
    Locale: typeof Intl.Locale !== 'undefined',
  }
}

// 缺失时退化:
// - DateTimeFormat / NumberFormat / Collator / PluralRules → 全浏览器都有
// - RelativeTimeFormat / ListFormat / DisplayNames → 2019+
// - Segmenter → Chrome 87+, Firefox 125+, Safari 14.1+
//   如果用 Segmenter,可考虑 polyfill: @formatjs/intl-segmenter

// =====================================================
// 12. 常见错误示范
// =====================================================
//
// ❌ 直接用 Date.toLocaleString() 不传 locale
//    -> 用系统 locale,SSR 不稳定
//
// ❌ 自己 split('') 数字符
//    -> emoji / 组合字符算错
//
// ❌ 拼字符串 `${year}年${month}月`
//    -> 跨语言不工作
//
// ❌ Array.prototype.sort() 不传 compare
//    -> 中文按 unicode point 排,几乎乱码
//
// ❌ 硬编码货币符号 '$' / '¥'
//    -> 同币种在不同 locale 显示不同
//
// ❌ 用 / 替换千位分隔符
//    -> 法语用空格,印度逗号位置不同
//
// ✅ 永远用 Intl,并显式传 locale + options
