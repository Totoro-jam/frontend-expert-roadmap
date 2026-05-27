// GSAP(GreenSock Animation Platform)+ ScrollTrigger
// 老牌专业,timeline 之王,营销页 / 演示页几乎绕不开
//
// 协议:核心免费,部分插件(SplitText / MorphSVG / DrawSVG)曾收费
// GSAP 3.13+ 起所有插件免费(Webflow 收购后)— 但企业核查最新条款

// =====================================================
// 1. 安装
// =====================================================
//
// npm i gsap
// npm i @gsap/react              # React 集成
//
// import { gsap } from 'gsap'
// import { ScrollTrigger } from 'gsap/ScrollTrigger'
// gsap.registerPlugin(ScrollTrigger)
//
// React:
// import { useGSAP } from '@gsap/react'

// =====================================================
// 2. 基础:gsap.to / gsap.from / gsap.fromTo
// =====================================================
//
// gsap.to(target, vars)         从当前状态动到 vars
// gsap.from(target, vars)       从 vars 动到当前状态(进入动画)
// gsap.fromTo(target, from, to) 完全指定首末
//
// vars 常用:
//   duration, delay, ease,
//   x, y, scale, rotate, opacity,
//   onStart, onComplete, onUpdate, repeat, yoyo, stagger
//
// ease 内置:
//   'none', 'power1', 'power2', 'power3', 'power4',
//   'back', 'elastic', 'bounce', 'sine', 'circ', 'expo'
//   后缀: '.in' / '.out' / '.inOut'
//
// 例:
//   gsap.to('.box', { x: 100, duration: 0.6, ease: 'power2.out' })
//   gsap.from('.hero', { opacity: 0, y: 50, duration: 0.8 })

// =====================================================
// 3. Timeline(GSAP 真正的力量)
// =====================================================
//
// 链式 / 时间轴控制:
//
// const tl = gsap.timeline({ defaults: { duration: 0.6, ease: 'power2.out' } })
// tl.from('.title', { opacity: 0, y: 30 })
//   .from('.subtitle', { opacity: 0, y: 20 }, '-=0.3')    // 倒退 0.3s(重叠)
//   .from('.cta', { opacity: 0, scale: 0.8 }, '+=0.2')    // 等 0.2s
//   .from('.bg', { opacity: 0 }, '<')                     // 与上一个同时开始
//   .to('.section', { backgroundColor: '#000' }, '>')     // 上一个完后立刻
//
// 位置参数:
//   absolute    number(秒)
//   '+=0.5'     相对前一个结束 + 0.5
//   '-=0.5'     相对前一个结束 - 0.5(重叠)
//   '<'         前一个动画的开始时间
//   '>'         前一个动画的结束时间
//   'label'     给某点取名(tl.addLabel('intro', 1.0))
//
// 控制:
//   tl.play() / pause() / reverse() / restart()
//   tl.seek(2.5)
//   tl.timeScale(2)        // 2 倍速
//   tl.paused(true)
//   tl.kill()

// =====================================================
// 4. Stagger(列表错峰)
// =====================================================
//
// gsap.from('.card', {
//   opacity: 0,
//   y: 30,
//   duration: 0.5,
//   stagger: 0.08,                           // 简单:间隔 0.08s
// })
//
// 高级:
// stagger: {
//   each: 0.08,
//   from: 'center',                          // 'start' / 'end' / 'center' / 'edges' / 'random' / index
//   ease: 'power2.inOut',
//   grid: 'auto',
//   axis: 'y',
// }
//
// 网格 stagger:
//   stagger: { grid: [5, 5], from: 'center', each: 0.05 }

// =====================================================
// 5. ScrollTrigger:滚动驱动
// =====================================================
//
// import { ScrollTrigger } from 'gsap/ScrollTrigger'
// gsap.registerPlugin(ScrollTrigger)
//
// 模式 A:scrub(进度跟着滚动条)
//
//   gsap.to('.parallax', {
//     y: -200,
//     ease: 'none',
//     scrollTrigger: {
//       trigger: '.section',
//       start: 'top center',                // [trigger_position viewport_position]
//       end: 'bottom top',
//       scrub: true,                         // true 立刻 / 数字 = 平滑时长
//       markers: process.env.NODE_ENV !== 'production',  // 开发时显示标记
//     },
//   })
//
// 模式 B:trigger(进入视口触发一次)
//
//   gsap.from('.card', {
//     opacity: 0,
//     y: 50,
//     scrollTrigger: {
//       trigger: '.card',
//       start: 'top 80%',
//       toggleActions: 'play none none reverse',  // 进/反/再进/反 各四种动作
//     },
//   })
//
// toggleActions 四个值对应:
//   onEnter onLeave onEnterBack onLeaveBack
//   可选: 'play', 'pause', 'resume', 'reset', 'restart', 'complete', 'reverse', 'none'
//
// pin(钉住一个元素直到滚出):
//
//   ScrollTrigger.create({
//     trigger: '.hero',
//     start: 'top top',
//     end: '+=500',                          // 5个视口高度
//     pin: true,
//     pinSpacing: true,
//   })

// =====================================================
// 6. 实际案例:首屏 + scroll 故事
// =====================================================
//
// gsap.registerPlugin(ScrollTrigger)
//
// // 首屏进入
// const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
// intro.from('.hero h1', { y: 60, opacity: 0, duration: 0.8 })
//      .from('.hero p',  { y: 30, opacity: 0, duration: 0.6 }, '-=0.4')
//      .from('.hero .cta', { scale: 0.8, opacity: 0, duration: 0.5 }, '-=0.3')
//
// // 章节1:横向滚动
// gsap.to('.gallery', {
//   xPercent: -100 * (panels.length - 1),
//   ease: 'none',
//   scrollTrigger: {
//     trigger: '.gallery-wrap',
//     pin: true,
//     scrub: 1,
//     snap: 1 / (panels.length - 1),
//     end: () => '+=' + document.querySelector('.gallery-wrap')!.offsetWidth,
//   },
// })
//
// // 章节2:数字 count up
// gsap.fromTo('.stat', { textContent: 0 }, {
//   textContent: 12345,
//   snap: { textContent: 1 },
//   ease: 'power1.out',
//   duration: 2,
//   scrollTrigger: { trigger: '.stat', start: 'top 80%' },
// })

// =====================================================
// 7. React 集成(@gsap/react)
// =====================================================
//
// import { useGSAP } from '@gsap/react'
// import { useRef } from 'react'
//
// export function AnimatedHero() {
//   const container = useRef<HTMLDivElement>(null)
//
//   useGSAP(() => {
//     gsap.from('h1', { y: 50, opacity: 0, duration: 0.6 })
//     gsap.from('p',  { y: 20, opacity: 0, duration: 0.5, delay: 0.2 })
//   }, { scope: container })       // scope 限制 selector 只在 container 内
//
//   return (
//     <div ref={container}>
//       <h1>Hello</h1>
//       <p>World</p>
//     </div>
//   )
// }
//
// useGSAP 优势:
// - 自动 cleanup(组件卸载 kill 所有动画)
// - HMR 友好(改代码重启动画)
// - StrictMode 二次 render 不会双重创建

// =====================================================
// 8. Context(批量管理 + 一键 cleanup)
// =====================================================
//
// 类组件 / 复杂场景:
//
// useEffect(() => {
//   const ctx = gsap.context(() => {
//     gsap.from('.box', { x: -100 })
//     gsap.to('.bg',   { opacity: 1 })
//     ScrollTrigger.create({ ... })
//   }, container)
//
//   return () => ctx.revert()           // 卸载时全部 kill + 还原 inline style
// }, [])

// =====================================================
// 9. matchMedia(响应式动画)
// =====================================================
//
// const mm = gsap.matchMedia()
//
// mm.add('(min-width: 800px)', () => {
//   gsap.from('.desktop-anim', { x: -200 })
// })
//
// mm.add('(max-width: 799px)', () => {
//   gsap.from('.mobile-anim', { y: -50 })
// })
//
// mm.add('(prefers-reduced-motion: reduce)', () => {
//   // 关闭所有动画,只 set 终态
//   gsap.set('.everything', { clearProps: 'all' })
// })

// =====================================================
// 10. SplitText(逐字动画,GSAP 插件)
// =====================================================
//
// import { SplitText } from 'gsap/SplitText'
// gsap.registerPlugin(SplitText)
//
// const split = new SplitText('h1', { type: 'chars,words' })
// gsap.from(split.chars, {
//   opacity: 0,
//   y: 20,
//   duration: 0.4,
//   stagger: 0.02,
//   ease: 'power2.out',
// })
//
// 用完记得 split.revert() 还原 DOM(否则 SR / SEO 受影响)

// =====================================================
// 11. ScrollSmoother(柔化滚动)
// =====================================================
//
// const smoother = ScrollSmoother.create({
//   wrapper: '#smooth-wrapper',
//   content: '#smooth-content',
//   smooth: 1.5,                  // 滚动跟手延迟(秒)
//   effects: true,                // 启用 data-speed / data-lag attribute
// })
//
// HTML:
//   <div id="smooth-wrapper"><div id="smooth-content">
//     <div data-speed="0.5">慢一半</div>
//     <div data-speed="2">快一倍</div>
//   </div></div>
//
// 警告:全局 smooth scroll 可能影响 a11y / 用户体验,慎用,商业站常见
//       Mobile / iOS 上小心被动事件影响

// =====================================================
// 12. 性能 tips
// =====================================================
//
// 1. 用 transform / opacity,GSAP 自动加 will-change
// 2. 大量 ScrollTrigger → ScrollTrigger.batch() 合并触发
// 3. resize 触发重新计算:用 ScrollTrigger.refresh()
// 4. 滚动卡:scrub 数字越小越平滑但越贵,平衡
// 5. SSR:GSAP 在 useEffect / useGSAP 里,不要在 module top level 跑
// 6. Animation 注册过多会影响主线程,做 ScrollTrigger.killAll() 切页面时

// =====================================================
// 13. 调试 + Markers
// =====================================================
//
// ScrollTrigger({ ... markers: true })   会显示绿/紫 marker 表示触发线
// GSAP DevTools(浏览器扩展)            timeline 可视化 + scrub bar

// =====================================================
// 14. 何时 GSAP / 何时 Framer / 何时 CSS
// =====================================================
//
// GSAP 适合:
// - 营销页 / Landing page(复杂叙事)
// - SVG 路径 / Morph 动画
// - ScrollTrigger 重度依赖
// - 时间轴 sync(配合视频 / 音频)
// - 非 React 项目 / vanilla JS
//
// Framer Motion 适合:
// - React app UI 动画
// - 不需要时间轴
// - layout / shared element 动画
//
// CSS / WAAPI 适合:
// - 简单 hover / state transition
// - 性能极敏感
// - 没 bundle 预算

// =====================================================
// 15. Bundle 优化
// =====================================================
//
// 只导入用到的插件:
//
// import { gsap } from 'gsap/gsap-core'
// import { CSSPlugin } from 'gsap/CSSPlugin'
// import { ScrollTrigger } from 'gsap/ScrollTrigger'
// gsap.registerPlugin(CSSPlugin, ScrollTrigger)
//
// (默认 import 'gsap' 会带常用插件,~40KB gzip)
//
// 不用 ScrollTrigger 的页面不要 import,~15KB

export {}
