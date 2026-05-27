// qiankun React 子应用模板:lifecycle + 路由 basename + 双入口 + 沙箱兼容

import { createRoot, type Root } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { App } from './App'

// =====================================================
// 1. 检测运行环境
// =====================================================
declare global {
  interface Window {
    __POWERED_BY_QIANKUN__?: boolean
    __INJECTED_PUBLIC_PATH_BY_QIANKUN__?: string
  }
}

const inQiankun = !!window.__POWERED_BY_QIANKUN__

// =====================================================
// 2. 动态修正 publicPath(子应用资源在子应用域名下)
// =====================================================
if (inQiankun) {
  // @ts-ignore Webpack runtime
  __webpack_public_path__ = window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__
}

// =====================================================
// 3. 路由:basename 根据是否在 qiankun 内动态决定
// =====================================================
const basename = inQiankun ? '/products' : '/'

// =====================================================
// 4. 渲染函数
// =====================================================
let root: Root | null = null

function render(props: any) {
  const container = props.container
    ? props.container.querySelector('#root') as HTMLElement
    : document.getElementById('root')!

  root = createRoot(container)
  root.render(
    <BrowserRouter basename={basename}>
      <App {...props} />
    </BrowserRouter>,
  )
}

// =====================================================
// 5. 独立运行(npm run dev 时)
// =====================================================
if (!inQiankun) {
  render({})
}

// =====================================================
// 6. qiankun lifecycle exports
// =====================================================
export async function bootstrap() {
  console.log('[products] bootstrap')
  // 一次性初始化:埋点 SDK / Sentry init / 全局 fetch interceptor 等
}

export async function mount(props: any) {
  console.log('[products] mount', props)

  // 接收主应用 props
  props.onGlobalStateChange((state: any, prev: any) => {
    console.log('[products] received state', state, prev)
    // → 同步到本地 zustand / redux
  })

  render(props)
}

export async function unmount(props: any) {
  console.log('[products] unmount', props)
  root?.unmount()
  root = null
  // 清掉子应用注册的全局 listener / interval / observer
  // 这些不会被沙箱自动清,要手动!
}

export async function update(props: any) {
  // 可选:主应用 props 变化时调用(不会重新 mount)
  console.log('[products] update', props)
}

// =====================================================
// 7. UMD output(webpack.config.js)
// =====================================================
/*
const path = require('path')
const packageName = require('./package.json').name

module.exports = {
  // ...
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/',
    library: `${packageName}-[name]`,
    libraryTarget: 'umd',                                  // ← qiankun 要求
    globalObject: 'window',
    chunkLoadingGlobal: `webpackJsonp_${packageName}`,     // ← 避免多子应用 chunk 名冲突
  },
  devServer: {
    port: 7100,
    headers: { 'Access-Control-Allow-Origin': '*' },       // ← qiankun fetch 需要 CORS
    historyApiFallback: true,
  },
}
*/

// =====================================================
// 8. 沙箱注意事项
// =====================================================
//
// qiankun 用 Proxy 模拟 window 来隔离全局变量。
// 「会被自动清」的:
//   - window.x = y(代理拦下,unmount 后释放)
//   - 通过沙箱 window 注册的 addEventListener('xxx')
//
// 「不会被自动清,要手写 unmount」:
//   - document.addEventListener(...)
//   - setInterval / setTimeout(unmount 时 clear)
//   - new ResizeObserver / MutationObserver(unmount 时 disconnect)
//   - 第三方 SDK 在 document.body 插入的 widget
//   - WebSocket / EventSource(unmount 时 close)
//
// 内存泄漏一般都是这些没清。

// =====================================================
// 9. 子应用接收 props 的类型化
// =====================================================
/*
import type { SubAppProps } from '@yourorg/qiankun-types'

export async function mount(props: SubAppProps) {
  // props.emitNotification('hi')
  // const user = props.getUser()
}
*/
