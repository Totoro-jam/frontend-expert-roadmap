// Web Animations API(WAAPI)工具集
// 纯 JS、零依赖、原生支持。所有现代浏览器(2017+)都有
// 比 CSS animation 强:可暂停 / 倒放 / 时间轴控制 / Promise

// =====================================================
// 1. 基础:Element.animate
// =====================================================
//
// element.animate(keyframes, options)
//   → 返回 Animation 对象
//
// keyframes:数组(每帧)或 对象(from→to)
// options:duration / easing / iterations / direction / fill / delay / endDelay

// 简单 fade-in
export function fadeIn(el: Element, duration = 300): Animation {
  return el.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'both' },
  )
}

// fade-out + 移除
export function fadeOutRemove(el: Element, duration = 200): Promise<void> {
  const anim = el.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'both' },
  )
  return anim.finished.then(() => el.remove()).catch(() => el.remove())
}

// =====================================================
// 2. fill 模式(动画结束后的样子)
// =====================================================
//
// 'none'      (默认)动画结束样式还原 → 元素跳回原状,很丑
// 'forwards'  保持终态(最常用)
// 'backwards' delay 阶段就显示首帧
// 'both'      forwards + backwards
//
// ⚠️ 'forwards' 只是「视觉」保持,真实 style 没改 → 用 commitStyles 写回:
//
//   anim.commitStyles()        // 把当前计算值写到 inline style
//   anim.cancel()              // 然后清掉 fill,后续不再插值

// =====================================================
// 3. 多帧动画(类似 @keyframes)
// =====================================================

export function bounce(el: Element): Animation {
  return el.animate(
    [
      { transform: 'translateY(0)', offset: 0 },
      { transform: 'translateY(-20px)', offset: 0.3 },
      { transform: 'translateY(0)', offset: 0.5 },
      { transform: 'translateY(-10px)', offset: 0.7 },
      { transform: 'translateY(0)', offset: 1 },
    ],
    { duration: 600, easing: 'ease-out' },
  )
}

// 简化:不写 offset 让浏览器均分
// el.animate([{ x: '0' }, { x: '100px' }, { x: '50px' }, { x: '200px' }], 800)

// =====================================================
// 4. 控制:暂停 / 继续 / 倒放 / seek
// =====================================================

export function controllable(el: Element, keyframes: Keyframe[], duration: number) {
  const anim = el.animate(keyframes, { duration, fill: 'both' })
  return {
    pause: () => anim.pause(),
    play: () => anim.play(),
    reverse: () => anim.reverse(),
    /** 跳到指定时间(ms),0 ~ duration */
    seek: (t: number) => { anim.currentTime = t },
    /** 改速度,1 是正常,2 是双倍速,-1 是倒放 */
    setSpeed: (rate: number) => { anim.playbackRate = rate },
    finished: anim.finished,
    cancel: () => anim.cancel(),
  }
}

// =====================================================
// 5. 等待动画完成(Promise)
// =====================================================
//
// await el.animate(...).finished

export async function chain(el: Element, ...steps: [Keyframe[], number][]) {
  for (const [kf, dur] of steps) {
    await el.animate(kf, { duration: dur, fill: 'both' }).finished
    // 注意:连续 animate 不 commitStyles 的话,后一个会从 0 开始
  }
}

// 串行的另一种:用 delay
export function sequence(el: Element, steps: { kf: Keyframe[]; duration: number; delay?: number }[]) {
  let acc = 0
  return steps.map(step => {
    const anim = el.animate(step.kf, {
      duration: step.duration,
      delay: acc + (step.delay ?? 0),
      fill: 'both',
    })
    acc += step.duration + (step.delay ?? 0)
    return anim
  })
}

// =====================================================
// 6. document.getAnimations:列出所有正在跑的
// =====================================================
//
// 调试 / 全局减速 / 暂停 / cancel 用

export function pauseAll() { document.getAnimations().forEach(a => a.pause()) }
export function resumeAll() { document.getAnimations().forEach(a => a.play()) }
export function slowAll(rate = 0.1) { document.getAnimations().forEach(a => a.updatePlaybackRate(rate)) }
export function cancelAll() { document.getAnimations().forEach(a => a.cancel()) }

// =====================================================
// 7. composite mode(多个动画叠加)
// =====================================================
//
// 默认 'replace':后启动的覆盖前面的
// 'add':transform 相加(translate(10) + translate(20) = translate(30))
// 'accumulate':累计(适合循环 animation)
//
// 用例:hover scale + 按下时再加 rotate,不互相覆盖
//
// el.animate({ transform: 'scale(1.1)' }, { duration: 200, composite: 'add' })
// el.animate({ transform: 'rotate(5deg)' }, { duration: 200, composite: 'add' })

// =====================================================
// 8. iterations + direction
// =====================================================
//
// iterations: Infinity      无限循环
// direction:  'normal'(默认)/ 'reverse' / 'alternate'(来回) / 'alternate-reverse'
//
// 例:呼吸效果
// el.animate(
//   [{ opacity: 1 }, { opacity: 0.5 }],
//   { duration: 1500, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }
// )

// =====================================================
// 9. CSS Variables 当作动画属性
// =====================================================
//
// el.style.setProperty('--x', '0px')
// el.animate({ '--x': '200px' } as any, { duration: 500, fill: 'both' })
//
// 前提:用 CSS Houdini 注册类型,否则当 string 不能插值
//
//   @property --x {
//     syntax: '<length>';
//     inherits: false;
//     initial-value: 0px;
//   }

// =====================================================
// 10. Motion path(沿曲线运动)
// =====================================================
//
// CSS:
//   offset-path: path('M 0 0 Q 50 100, 100 0');
//   offset-distance: 0%;
//
// WAAPI:
//   el.animate({ offsetDistance: ['0%', '100%'] }, 1000)
//
// 用于按钮飞行 / 角色路径 / SVG 沿路径运动

// =====================================================
// 11. Spring approximation via cubic-bezier
// =====================================================
//
// WAAPI 本身没 spring,但用 linear() / 多关键帧近似:
//
// el.animate(
//   [{ transform: 'translateX(0)' },
//    { transform: 'translateX(220px)', offset: 0.5 },
//    { transform: 'translateX(180px)', offset: 0.7 },
//    { transform: 'translateX(208px)', offset: 0.85 },
//    { transform: 'translateX(200px)' }],
//   { duration: 600, easing: 'ease-out' }
// )
//
// 真要 spring 上 Motion One / Framer Motion / react-spring

// =====================================================
// 12. SVG 动画
// =====================================================
//
// WAAPI 可以动 SVG 属性:
//
// circle.animate(
//   [{ r: 10 }, { r: 50 }],
//   { duration: 800, easing: 'ease-out', fill: 'both' }
// )
//
// path 描边:
//   const length = path.getTotalLength()
//   path.style.strokeDasharray = String(length)
//   path.animate(
//     [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
//     { duration: 2000, fill: 'forwards' }
//   )

// =====================================================
// 13. Animation events
// =====================================================
//
// anim.onfinish = () => {}
// anim.oncancel = () => {}
// anim.onremove = () => {}
//
// 优先用 anim.finished Promise(更现代)
// anim.finished 在 cancel 时会 reject → 注意 catch

// =====================================================
// 14. Performance tips
// =====================================================
//
// 1. 优先动 transform / opacity(GPU 合成)
// 2. 大数组 animate 一起 → 别每帧创建新 animate
// 3. iterations: Infinity 的动画占用 raf,记得页面隐藏时暂停:
//
//    document.addEventListener('visibilitychange', () => {
//      const anims = document.getAnimations()
//      if (document.hidden) anims.forEach(a => a.pause())
//      else anims.forEach(a => a.play())
//    })
//
// 4. cancel 后 fill 状态会立刻消失 → 用 commitStyles 保留
// 5. 大量元素同时 animate(>100)考虑用 CSS animation(浏览器优化更深)

// =====================================================
// 15. WAAPI vs CSS animation
// =====================================================
//
//                          WAAPI         CSS animation
// 程序化(动态参数)?     ✅            ❌
// 暂停 / 回放?            ✅            ⚠️ animation-play-state 部分能
// Promise 等待结束?       ✅            ❌ 需 animationend 事件
// SVG 属性?               ✅            ⚠️ 仅限 SMIL 或 transform
// 写起来?                 长            短
// 浏览器优化?             相当          相当
//
// 推荐:简单 hover / loading 用 CSS;复杂控制 / 动态参数用 WAAPI

export {}
