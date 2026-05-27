# 动画设计原则(深度版)

> 动画不是为了好看,是为了「沟通」。
> 任何「装饰性」动画都该删掉 —— 用户没空看。

---

## 1. 为什么动画存在

UI 切换是「瞬间的」,但人脑不是。

```
A 状态 → B 状态(瞬时切换)
   ↓ 大脑要补帧
   ↓ 「刚才发生了什么?」
   ↓ 「这个东西去哪了?」
   ↓ 慌
```

动画的作用 = **告诉大脑发生了什么**,让用户不需要思考就能跟上 UI 变化。

如果用户没有「东西突然消失了 / 长出来了 / 不知道哪冒出来的」感觉,你的 UI 就不需要动画。

---

## 2. 来自迪士尼的 12 原则(动画师必学)

1. **Squash & Stretch(挤压拉伸)** — 物体感受重力 / 弹性 → 你按按钮 scale: 0.96
2. **Anticipation(预备动作)** — 跳之前先蹲一下 → 抽屉打开前微微缩一下
3. **Staging(舞台感)** — 同时只动一个东西 → 多个动 = 视觉噪音
4. **Straight Ahead vs Pose-to-Pose** — 关键帧或一帧帧画 → CSS keyframes vs WAAPI
5. **Follow Through & Overlapping** — 抓手停了头发还在飘 → 卡片落定后阴影还在 settle
6. **Slow In Slow Out** — 不要 linear,要 ease-in-out → 这是 80% 动画问题的源头
7. **Arcs(弧线)** — 自然运动走弧线,不走直线 → 拖拽释放走 cubic bezier 弧
8. **Secondary Action(次级动作)** — 主动作之外加细节 → 模态出现 + 背景模糊
9. **Timing(节奏)** — 快重物感,慢轻柔感 → 100-400ms 是 UI 黄金区间
10. **Exaggeration(夸张)** — 适度夸张比写实更「真」→ overshoot 0.05 - 0.1
11. **Solid Drawing(扎实绘画)** — 物体有体积 / 重量 → 用 spring 比 ease 真
12. **Appeal(吸引力)** — 让人想看 → 但 UI 不是动画片,克制

---

## 3. UI 动画的「沟通职能」

| 类型 | 用动画干嘛 |
|---|---|
| **进入(enter)** | 「这是新东西」 + 「来自哪个方向」 |
| **离开(exit)** | 「这东西消失了」 + 「去了哪」 |
| **变化(change)** | 「这还是同一个东西,但变成 B」 |
| **关联(group)** | 「这些是一起的」(stagger 错峰) |
| **反馈(feedback)** | 「你的操作被收到了」 |
| **空间(spatial)** | 「这两层有上下/前后关系」 |
| **状态(state)** | 「loading / success / error」 |
| **优先级(focus)** | 「先看这个」 |
| **教程(onboarding)** | 「这里可以滑/点」 |

每个动画在贡献哪一项?如果都答不上来,就是装饰 → 删。

---

## 4. 时长(Duration)的科学

```
< 100ms     人类感知不到 → 看起来「瞬时」(不适合需要被注意的动画)
100-200ms   反馈类(hover / click / focus),感觉迅速
200-400ms   UI 切换类(modal / drawer / page),感觉自然
400-600ms   大幅变化(全屏 transition,page-to-page),感觉郑重
> 600ms     违反直觉(用户感觉 UI 卡),除非内容长(展开 + 滚到位)
```

### 进入 vs 离开

- **进入**:200-300ms,ease-out → 让用户感觉「快速到位」
- **离开**:150-250ms,ease-in → 不抢戏,礼貌让位
- **离开通常比进入快 30-50%**

理由:用户已经决定要关闭这个东西了,等的越久越烦。

### 距离的影响

```
移动距离 < 80px    → 200ms
移动距离 80-300px  → 300ms
移动距离 > 300px   → 400ms (+ ease-out 加强)
```

参考 Material Design Motion Duration tokens。

---

## 5. Easing 曲线选型

```
linear              ❌ UI 99% 不用,机械感(loader / progress 例外)
ease                ❌ 默认但不专业(慢→快→慢,感觉慢)
ease-out            ✅ 进入动画 80% 情况(快→慢,落定时减速)
ease-in             ✅ 离开动画(慢→快,加速消失)
ease-in-out         ⚠️ 来回切换(toggle,左右)
cubic-bezier(.4,0,.2,1)     ✅ Material standard,通用
cubic-bezier(.2,0,0,1)       ✅ iOS-like emphasized,锐利
cubic-bezier(.68,-.55,.27,1.55) ⚠️ overshoot 弹跳,谨慎用
spring(...)         ✅ 物理感,推荐拖拽 / 自然元素
```

### 调参直觉

- 曲线尾部「平」→ 落定柔和,感觉「物体」
- 曲线尾部「陡」→ 干脆,感觉「电子」
- 曲线 overshoot 越多 → 感觉「俏皮」(过头会让用户觉得幼稚)

---

## 6. Stagger(错峰)

列表项「依次」出现 vs 「一起」出现:

```
一起    →  视觉爆炸,用户不知道看哪
依次    →  眼睛有跟随轨迹,感觉「自然」
```

间隔建议:

- **30-60ms / 项**:节奏紧凑(列表 < 10 项)
- **60-100ms / 项**:轻松节奏(< 20 项)
- **100-200ms / 项**:戏剧化(< 5 项,营销页)

**总时长上限**:

```
total = (count × stagger) + duration
不要超过 600ms,否则最后一项出现时用户已经烦了
```

如果列表 > 20 项:
- 只 stagger 前 N 项(8-12),其余直接出现
- 或者使用 stagger ease-out(开头慢后面快)

---

## 7. 物理感(Spring)什么时候用

**适合 spring(物理感)**:
- 拖拽释放(必须 spring 才像「弹回去」)
- UI 出现 / 落地(感觉「有重量」)
- 跟随手势(惯性连续)
- 弹出层(modal、dropdown)

**不适合 spring**:
- Loader / progress(spring 不好估时长)
- 与音视频同步
- 极短动画(< 100ms 看不出来)
- 进度精确显示(spring overshoot 会跨过 100% 再回来)

### Spring 参数直觉

```
                          stiffness    damping     感觉
react-spring default      170          26          温和、温和
snappy(常用 UI)          300          30          快、刚
wobbly(俏皮)             200          15          弹、Q
heavy(重物感)            120          40          慢、稳
critically damped         k            2√k         无 overshoot,数学最快
```

---

## 8. 方向语义(进 vs 出)

**空间一致性**(spatial consistency):

```
来自下方  →  「从内容继续来」(notification / toast)
来自上方  →  「系统通知」(banner / pull-down)
来自右方  →  「下一页 / 详情」(forward navigation)
来自左方  →  「上一页 / 返回」(back navigation)
中心放大  →  「这是焦点 / 强调」(modal / popup)
中心缩小  →  「关闭 / 退后」(modal exit)
```

如果右边滑出来的东西关闭时往左走,用户会困惑「它去哪了」。
**进入方向 = 离开方向**(反向走)。

---

## 9. 焦点管理(Focus)

动画期间和动画后:

- **键盘 focus** 不能因为动画消失 → 模态打开时,focus 必须送进模态
- **焦点环**(focus ring)不能被动画隐藏
- **当前可点击元素** 在动画期间是否仍可点(短动画可,长动画禁用避免误点)

---

## 10. 中断 / 响应性(Interruptibility)

**铁律**:用户再次操作 = 动画必须立刻响应。

```
❌ 模态打开动画跑 300ms,期间用户点关闭 → 等动画完才响应 → 卡
✅ 模态打开 200ms 时用户点关闭 → 立刻反向(从当前位置 spring 回去)
```

实现:

- **GSAP / Framer**:re-trigger 时会从 currentValue 继续(自动)
- **CSS transition**:改 className,浏览器从当前插值继续
- **手写 WAAPI**:cancel 当前 animation,新 animate 从 commitStyles 继续

---

## 11. 性能预算

```
60fps  →  16.67ms / 帧 → 主线程任务 < 8ms 才安全
120fps →  8.33ms / 帧  → 移动端高刷新率
```

每帧:

- JS 执行 < 6ms
- 渲染(layout + paint + composite)< 4ms
- 留 6ms 给浏览器 / 系统

实测工具:

- **Chrome DevTools → Performance**:火焰图 + 帧时长
- **Chrome DevTools → Rendering → FPS meter**:实时 FPS
- **Layer panel**:看合成层数(过多会爆显存)
- **Real device**:Macbook 上 60fps 不代表 Android 中端机也行

---

## 12. 可访问性深度

### prefers-reduced-motion

不只是「关动画」,是「重新设计」:

```
完全去掉:
  - 视差(parallax)→ 静态
  - 360 旋转 → 不转
  - 全屏 cross-fade → 跳变
  - 频闪 / 闪烁(癫痫风险)→ 一律删

弱化:
  - hover / focus 反馈 → 改 instant 或保留极短(50ms)
  - 进入动画 → 改 50ms fade,无位移
  - 拖拽 → 保留(功能必需)

保留:
  - loading spinner(可以,但慢一点)
  - 状态变化(success/error 反馈)
  - 必要功能
```

### 频闪 / 频率红线

```
WCAG 2.3.1:任何元素 1 秒内 > 3 次闪烁 → 禁
WCAG 2.3.2:类似但更严(< 0% 视差移动)
```

任何高频闪烁(rave 灯、警告闪光)都可能触发癫痫 → 必须可关。

### 焦点过渡

screen reader 用户依赖 ARIA live regions:

```html
<!-- 动画过渡时,通知 screen reader -->
<div aria-live="polite" class="sr-only">
  Modal opened
</div>
```

---

## 13. 系统化(Design Token)

像字体 / 颜色一样,动画应该有 token:

```ts
// tokens.ts
export const motion = {
  duration: {
    instant: 100,
    fast: 200,
    base: 300,
    slow: 400,
    slower: 600,
  },
  easing: {
    standard: 'cubic-bezier(.4, 0, .2, 1)',
    emphasized: 'cubic-bezier(.2, 0, 0, 1)',
    decelerated: 'cubic-bezier(0, 0, .2, 1)',
    accelerated: 'cubic-bezier(.4, 0, 1, 1)',
  },
  spring: {
    snappy: { stiffness: 300, damping: 30 },
    soft: { stiffness: 170, damping: 26 },
    wobbly: { stiffness: 200, damping: 15 },
  },
} as const
```

**好处**:
- 所有动画一致(品牌感)
- 改一处全站统一(Material 改了 standard 曲线,所有页面跟着变)
- 设计师 / 开发对齐 vocabulary

---

## 14. 常见错误清单

| 错 | 对 |
|---|---|
| linear 用在 UI 切换 | 默认 ease-out |
| 进入和离开同时长 | 离开比进入快 30% |
| 多个动画同时争视觉 | 同时只动一个,其他静 |
| stagger 总时长 > 1s | 限制 600ms 以内 |
| width/height 动画 | 改 transform: scale |
| 动画期间用户点了无反应 | 必须可中断 |
| 无 prefers-reduced-motion 兼容 | 全局 CSS 兜底 |
| 大量 will-change 永不清 | 动画完 will-change: auto |
| modal 飞入 200px 还硬要 spring | 远距离用 cubic-bezier,近距离 spring |
| 全站不同曲线 | token 化 |
| 用 setTimeout 做帧 | requestAnimationFrame |

---

## 15. 进阶:Motion Design as a Language

苹果 / Material / 阿里 / 字节都有 motion guideline 文档:

- **Apple HIG: Motion** — https://developer.apple.com/design/human-interface-guidelines/motion
- **Material Motion** — https://m3.material.io/styles/motion
- **Ant Motion** — https://motion.ant.design/

读完会发现:他们用动画来传达品牌 — Apple「精致克制」/ Material「物理真实」/ Linear「速度感」

你的产品也应该有自己的「motion personality」:
- 是激进?(高 stiffness,短 duration,锐利曲线)
- 是亲和?(soft spring,中等 duration,温和曲线)
- 是专业?(emphasized 曲线,minimal motion)
- 是叙事?(timeline + stagger + parallax,长 duration)

---

## 16. 自检清单

每次写完一个动画问自己:

```
[ ] 它在传达什么信息?
[ ] 删掉这个动画用户会困惑吗?
[ ] 时长在 100-400ms?
[ ] 用 ease-out 或 spring?(不是 linear / ease)
[ ] 离开比进入快?
[ ] 同时其他元素没动?
[ ] 用户中途中断会怎样?
[ ] reduced-motion 用户体验如何?
[ ] 移动端 60fps?(实测,不是想)
[ ] 与设计系统其他动画一致?
[ ] 不是 width/height/top/left?
```

---

## 17. 读物推荐

- **The Animator's Survival Kit** — Richard Williams(动画 bible)
- **Designing Interface Animation** — Val Head(UI 动画领域必读)
- **Animation Handbook** — Designcode(Meng To)
- **Motion in Design Systems** — Smashing Magazine 系列
- **Frame Rate** — Andy Hall(高级 CSS / SVG 动画)
- Web 资料:
  - https://www.refactoringui.com/(动画原则总结)
  - https://motiondesign.school/
  - https://www.smashingmagazine.com/category/animation/

---

## 18. 最重要的一条

> **如果不确定要不要加动画,就不加。**
> 删动画从来不会让用户烦,多余的动画一定会让用户烦。
