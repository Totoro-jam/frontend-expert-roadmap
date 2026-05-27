# 04 · HTML & Accessibility Lab

> 「HTML 没什么好学的」是初级前端最大的误解。
> 真正的专家知道:90% 的无障碍问题来源于错误的 HTML 语义,而不是没加 ARIA。

---

## 学这个能干什么

- 看到「`<div onclick>`」就知道是错的,能说出 5 个原因(键盘、屏幕阅读器、Form、focus、SEO)
- 给业务 UI 库的 Modal / Combobox / Tabs 写出符合 WAI-ARIA 规范的实现
- 用 axe / Lighthouse 跑 a11y 测试,看懂每条违规
- 写出能被屏幕阅读器(NVDA/JAWS/VoiceOver)正确朗读的复杂表单
- 区分 ARIA role / state / property,知道哪些「禁止」叠加(`role="button"` 不能放在 `<a>` 上)
- 了解残障人群的真实使用场景:盲人、低视力、色盲、运动障碍、认知障碍

---

## Roadmap

### 1. 语义 HTML 速查

每个标签都该用对:

| 用途 | 应该 | 不应该 |
|---|---|---|
| 主要内容区 | `<main>` | `<div id="main">` |
| 导航 | `<nav>` | `<div class="nav">` |
| 章节 | `<section>` 带 heading | `<div>` |
| 文章 | `<article>` | `<div>` |
| 列表 | `<ul><li>` | `<div><div>` |
| 按钮 | `<button>` | `<div onclick>` |
| 链接 | `<a href>` | `<span onclick>` |
| 表单标签 | `<label for>` | 邻近的 `<div>` |
| 突出文本 | `<strong>` 重要 / `<em>` 强调 | `<b>` `<i>`(纯样式) |
| 时间 | `<time datetime="2026-05-26">` | `<span>` |
| 进度 | `<progress>` `<meter>` | `<div class="bar">` |
| 折叠 | `<details><summary>` | 自己写 click |

**为什么重要?**

* SEO:Google 的爬虫优先理解语义
* 屏幕阅读器:`<nav>` 会被朗读为「导航区域」,`<div class="nav">` 不会
* 可发现性:用户用 NVDA 按 H 跳标题、按 D 跳地标(landmark),只有语义标签算
* 键盘:`<button>` 自动支持 Enter/Space 触发,`<div>` 没有

### 2. 标题层级(Heading Outline)

* `<h1>` 全页只一个,描述页面主题
* 不要跳级:`<h2>` 后不能直接 `<h4>`
* 不能用 CSS 调字号代替:`<h2 style="font-size:12px">` 不是 `<h6>`
* 用 [HeadingsMap](https://addons.mozilla.org/firefox/addon/headingsmap/) 扩展检查

### 3. ARIA 三大要素

```
role         = 这是什么(button、dialog、tab)
state        = 当前状态(aria-expanded、aria-checked)
property     = 静态描述(aria-label、aria-describedby、aria-labelledby)
```

**第一条 ARIA 规则**:**不要用 ARIA**。能用原生 HTML 就用原生。

```html
<!-- ❌ -->
<div role="button" tabindex="0" onclick="..." onkeydown="...">提交</div>

<!-- ✅ -->
<button type="submit">提交</button>
```

ARIA 是给原生 HTML 表达不出的 UI 用的(Combobox、Tree、Tabs、Carousel 等)。

### 4. 标签关联(三种方式)

```html
<!-- 方式 1:label 包住 input -->
<label>姓名 <input name="name" /></label>

<!-- 方式 2:for + id -->
<label for="name">姓名</label>
<input id="name" />

<!-- 方式 3:aria-labelledby(label 不能挪到 input 旁边时用)-->
<span id="name-label">姓名</span>
<input aria-labelledby="name-label" />

<!-- 方式 4:aria-label(没有视觉标签时,比如图标按钮)-->
<button aria-label="关闭对话框">✕</button>
```

错误示例(超常见):

```html
<input placeholder="姓名" />   <!-- placeholder ≠ label! -->
```

### 5. 焦点管理(Focus Management)

* `tabindex="0"` — 加入 Tab 顺序
* `tabindex="-1"` — 程序可 focus 但不在 Tab 顺序里(modal 标题用)
* `tabindex >= 1` — **永远不要用**,破坏 Tab 顺序
* `:focus-visible` — 鼠标点击不显示焦点环,键盘 focus 才显示(现代浏览器默认)

Modal 必须做的事:

1. 打开时 focus 移到 modal 内(第一个 focusable 元素或标题)
2. **焦点陷阱**(focus trap):Tab 不能跳出 modal
3. 按 ESC 关闭
4. 关闭后焦点**返回**到触发的按钮
5. `aria-modal="true"` + `role="dialog"` + `aria-labelledby`

完整实现见 `demos/modal.html`。

### 6. 屏幕阅读器友好

* `aria-live="polite"` — 区域更新时朗读(toast、表单错误)
* `aria-live="assertive"` — 立即打断朗读(报警,慎用)
* `aria-atomic="true"` — 整个区域朗读,而不是只读差异
* `sr-only` 类(视觉隐藏但屏幕阅读器可读):

  ```css
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0;
    margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
    white-space: nowrap; border: 0;
  }
  ```

  比 `display:none` / `visibility:hidden` 强,后两者屏幕阅读器也读不到。

### 7. 颜色与对比度

* WCAG AA:正文 4.5:1,大字 3:1
* WCAG AAA:正文 7:1,大字 4.5:1
* Chrome DevTools 颜色选择器直接显示对比度
* `prefers-contrast: more` — 用户偏好高对比度时调整 CSS
* `prefers-reduced-motion: reduce` — 关闭非必要动画
* `prefers-color-scheme: dark` — 暗黑模式

**禁忌**:只用颜色传达信息(红色 = 错误)。必须加图标或文字。色盲用户看不出。

### 8. 键盘交互模式(WAI-ARIA Authoring Practices)

[APG](https://www.w3.org/WAI/ARIA/apg/) 给每种组件定义了键盘交互规范。背几个:

| 组件 | 键盘 |
|---|---|
| Button | Enter / Space 激活 |
| Link | Enter 跳转 |
| Combobox | ↑↓ 移动,Enter 选,ESC 关闭 |
| Tabs | ←→ 切换 tab,Home/End 跳首尾 |
| Menu | ↑↓ 移动,Enter 触发,ESC 关闭 |
| Tree | ←→ 折叠/展开,↑↓ 移动 |
| Listbox | ↑↓ 移动,Space 多选,Shift+↑↓ 范围选 |
| Dialog | Tab 循环,ESC 关闭 |

不按这个做,残障用户用不了你的组件,「键盘党」也会骂你。

### 9. Form 高级

* `<input required>` `pattern` `minlength` `maxlength` —— 原生校验,免 JS
* `<input type=email|tel|url|number|date|color>` — 移动键盘自动切换
* `<datalist>` — 原生 autocomplete
* `:user-invalid` / `:user-valid`(2024)— 用户交互后才判断,比 `:invalid` 更友好
* `inputmode="numeric"` `inputmode="decimal"` — 数字键盘,但允许非数字字符(比 `type=number` 更灵活)
* `autocomplete` 取值精确化:`autocomplete="email"` `"name"` `"one-time-code"`(短信验证码自动填!)`"new-password"`

### 10. 测试工具

* **axe-core** — 自动化检测,90% 问题能查出来,可集成到 Vitest / Playwright
* **Lighthouse a11y 评分** — 入门门槛
* **WAVE** 浏览器扩展 — 可视化标注问题
* **NVDA**(Windows 免费)+ **VoiceOver**(Mac/iOS 自带)— 真实测试
* **键盘测试**:拔掉鼠标走一遍所有交互

```bash
# CI 集成
pnpm add -D @axe-core/playwright
```

---

## demos/

| 文件 | 主题 |
|---|---|
| [semantic-vs-divsoup.html](demos/semantic-vs-divsoup.html) | 同样 UI 的语义 vs div 汤对比 |
| [modal.html](demos/modal.html) | 完整无障碍 Modal 实现 |
| [aria-live.html](demos/aria-live.html) | 屏幕阅读器友好的 toast |

---

## 资源

- 📖 [MDN ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) — 每种组件的标准实现
- 📖 [WebAIM 对比度检查器](https://webaim.org/resources/contrastchecker/)
- 📖 [a11y-101](https://a11y-101.com/)
- 📖 [Inclusive Components](https://inclusive-components.design/) — Heydon Pickering 经典书
- 📖 [Reactive Accessibility](https://www.smashingmagazine.com/2024/11/reactive-accessibility/) — 现代框架下的 a11y 实践
- 🔧 [axe DevTools](https://www.deque.com/axe/devtools/) 浏览器扩展
