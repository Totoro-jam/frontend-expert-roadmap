// qiankun 主应用完整配置:注册、沙箱、prefetch、全局状态、错误处理

import {
  registerMicroApps,
  start,
  initGlobalState,
  setDefaultMountApp,
  addGlobalUncaughtErrorHandler,
  type MicroAppStateActions,
} from 'qiankun'

// =====================================================
// 1. 子应用清单(可来自远程 manifest)
// =====================================================
interface AppManifest {
  name: string
  entry: string                  // 部署地址 / 端口
  container: string              // 挂载容器 CSS selector
  activeRule: string | ((loc: Location) => boolean)
  props?: Record<string, any>
}

async function loadManifest(): Promise<AppManifest[]> {
  // 生产:从 CDN 拉清单
  // const res = await fetch('/manifest.json')
  // return res.json()

  // 本地开发示例:
  return [
    {
      name: 'react-products',
      entry: '//localhost:7100',
      container: '#subapp-viewport',
      activeRule: '/products',
    },
    {
      name: 'vue-users',
      entry: '//localhost:7200',
      container: '#subapp-viewport',
      activeRule: '/users',
    },
    {
      name: 'legacy-reports',
      entry: '//localhost:7300',
      container: '#subapp-viewport',
      activeRule: (loc) => loc.pathname.startsWith('/reports'),
    },
  ]
}

// =====================================================
// 2. 全局状态(主子共享)
// =====================================================
interface GlobalState {
  user: { id: string; name: string; role: string } | null
  theme: 'light' | 'dark'
  locale: string
}

const initialState: GlobalState = {
  user: null,
  theme: 'light',
  locale: 'zh-CN',
}

export const globalActions: MicroAppStateActions = initGlobalState(initialState)

// 主应用本地订阅(state 变化时同步 React store / Vuex)
globalActions.onGlobalStateChange((state, prev) => {
  console.log('[host] global state changed', state, prev)
  // syncToReactStore(state)
})

// =====================================================
// 3. 注册子应用
// =====================================================
async function bootstrap() {
  const apps = await loadManifest()

  registerMicroApps(
    apps.map(app => ({
      ...app,
      props: {
        ...app.props,
        // 注入主应用 API,子应用可以调
        emitNotification: (msg: string) => showNotification(msg),
        routerInstance: getRouterInstance(),
        getUser: () => globalActions.getGlobalState().user,
      },
    })),
    {
      // ---- lifecycle hooks ----
      beforeLoad: app => {
        console.log(`[qiankun] before load ${app.name}`)
        showLoading()
      },
      beforeMount: app => {
        console.log(`[qiankun] before mount ${app.name}`)
      },
      afterMount: app => {
        hideLoading()
        // 上报:子应用加载耗时
        reportPerf(app.name, performance.now())
      },
      beforeUnmount: app => {
        console.log(`[qiankun] before unmount ${app.name}`)
      },
      afterUnmount: app => {
        console.log(`[qiankun] after unmount ${app.name}`)
      },
    },
  )

  // 进首页默认装载哪个
  setDefaultMountApp('/products')

  // =====================================================
  // 4. 启动
  // =====================================================
  start({
    // 预加载
    prefetch: 'all',          // 'all' | true | false | 'static' | string[]
                              // 'all':主应用 first paint 之后,空闲时预加载所有子应用
                              // string[]:只预加载指定的

    // 沙箱
    sandbox: {
      strictStyleIsolation: false,            // Shadow DOM,最强但兼容差
      experimentalStyleIsolation: true,       // 加 [data-qiankun] 前缀,推荐
      // loose: true,                          // 多实例时关闭沙箱(性能)
    },

    // singular:同一时刻只一个子应用 mount(默认 true,推荐保持)
    singular: true,

    // fetch:自定义 fetch(加 token / cors / 缓存)
    fetch: window.fetch,

    // 取消所有子应用的 onerror 拦截(默认开启,可能拦了你的 error)
    // excludeAssetFilter: assetUrl => assetUrl.includes('analytics'),
  })

  // =====================================================
  // 5. 全局错误处理
  // =====================================================
  addGlobalUncaughtErrorHandler(event => {
    const errMsg = typeof event === 'string'
      ? event
      : (event as ErrorEvent).message
    console.error('[qiankun] uncaught', errMsg)

    // 子应用 entry.html 404 / cors / 解析失败 → 主应用兜底
    if (errMsg?.includes('LOAD_ERROR')) {
      showErrorPage('子应用加载失败,请刷新重试')
    }
    reportError('mfe-uncaught', errMsg)
  })
}

bootstrap()

// =====================================================
// 6. 占位辅助函数(示意)
// =====================================================
function showLoading() {}
function hideLoading() {}
function showNotification(_: string) {}
function showErrorPage(_: string) {}
function reportPerf(_: string, __: number) {}
function reportError(_: string, __: any) {}
function getRouterInstance() { return null }

// =====================================================
// 7. 子应用 props 类型(共享)
// =====================================================
/*
// shared-types/qiankun.ts
export interface SubAppProps {
  container: string
  emitNotification: (msg: string) => void
  routerInstance: any
  getUser: () => User | null
  onGlobalStateChange: (cb: (state: GlobalState, prev: GlobalState) => void) => void
  setGlobalState: (state: Partial<GlobalState>) => void
}
*/

// =====================================================
// 8. 主应用 index.html
// =====================================================
/*
<!doctype html>
<html>
<head>
  <title>Shell</title>
</head>
<body>
  <nav>...</nav>
  <main id="subapp-viewport"></main>   <!-- 子应用挂载点 -->
  <script src="/main.js"></script>
</body>
</html>
*/
