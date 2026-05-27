# 20 · Micro Frontends Lab

> 一个 SPA 撑不住时 → 拆。
> 但 80% 的项目根本不需要微前端。先确认你真的有这个问题:
> 「**多团队 / 多技术栈 / 独立发布 / 大体量 + 真的不能用 monorepo 解决**」

---

## 学这个能干什么

- 判断什么时候**不要**上微前端(防止过度架构)
- Module Federation(Webpack 5 / Rspack)运行时模块共享
- qiankun(蚂蚁,基于 single-spa,沙箱完备)
- single-spa(底层路由分发)
- Web Components(原生方案,跨框架)
- iframe(最古老,最隔离,最丑)
- 数据共享、路由协同、样式隔离、JS 沙箱、生产部署 / 灰度 / 监控

---

## Roadmap

### 1. 决策:你真的需要微前端吗?

| 信号 | 推荐方案 |
|---|---|
| 一个团队 < 50 人,纯 React/Vue | **❌ 不要**,monorepo + 模块化够了 |
| 多团队不同技术栈(React + Vue + 老 Angular) | ✅ MFE(qiankun / Module Federation) |
| 老系统迁移(jQuery 大块)+ 新页面用 React | ✅ qiankun / iframe |
| 巨石应用 build 5 分钟、改一处全量发 | ✅ MFE 拆 + 独立发布 |
| 跨团队共享一个「设计系统组件」 | ❌ npm 包就够 |
| 多页 SaaS 集成第三方页面 | ✅ iframe(最隔离最安全) |
| 想要「微服务感」 | ❌ 不,你只是想要更好的代码组织 |

**核心问题**:微前端能解的是**部署 / 团队隔离**,不是「代码重用」。

### 2. 三大流派

#### 2.1 Build-time 集成(伪 MFE)
```
- 所有子应用 npm 包形式
- 主应用 npm install 全装
- 一起打包发布
```
**本质**:Monorepo + 包。简单,但不算真 MFE(没独立部署)。

#### 2.2 Run-time 集成 — Module Federation
```
- 子应用独立 build,产出 remoteEntry.js
- 主应用启动后 fetch remoteEntry 拿到模块清单
- 按需 import 子应用模块,运行时 share 依赖
```
**代表**:Webpack 5 ModuleFederationPlugin,Rspack 同款,Vite 用 `@originjs/vite-plugin-federation`。

#### 2.3 Run-time 集成 — JS sandbox + 路由分发
```
- 主应用是壳,管路由
- 进入子应用路由 → fetch 子应用 entry.html → 解析 script/style → 沙箱内执行
- 离开路由 → 卸载
```
**代表**:qiankun(国内主流)、single-spa、micro-app(京东)、wujie(腾讯,iframe 内)。

### 3. Module Federation 实战

```js
// host(webpack.config.js)
const { ModuleFederationPlugin } = require('webpack').container

new ModuleFederationPlugin({
  name: 'host',
  remotes: {
    products: 'products@https://products.example.com/remoteEntry.js',
    users: 'users@https://users.example.com/remoteEntry.js',
  },
  shared: {
    react: { singleton: true, eager: true, requiredVersion: '^18.0.0' },
    'react-dom': { singleton: true, eager: true },
    '@yourorg/design-system': { singleton: true },
  },
})
```

```js
// remote (products app)
new ModuleFederationPlugin({
  name: 'products',
  filename: 'remoteEntry.js',
  exposes: {
    './ProductList': './src/ProductList',
    './ProductDetail': './src/ProductDetail',
  },
  shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
})
```

```tsx
// host 消费
const ProductList = React.lazy(() => import('products/ProductList'))

<Suspense fallback={<Spinner />}>
  <ProductList />
</Suspense>
```

**坑点**:
- shared 版本不匹配 → 跑两份 React → hooks 崩
- 远程 entry 没缓存策略 → 每次 build 浏览器都重下
- TypeScript types:用 `@module-federation/typescript` 自动同步
- 跨 host 路由:用 `single-spa` 嫁接 / 自己写路由分发

### 4. qiankun 实战

```ts
// 主应用
import { registerMicroApps, start } from 'qiankun'

registerMicroApps([
  {
    name: 'react-app',
    entry: '//localhost:7100',
    container: '#subapp-viewport',
    activeRule: '/app-react',
    props: { user: getCurrentUser() },             // 父传子
  },
  {
    name: 'vue-app',
    entry: '//localhost:7200',
    container: '#subapp-viewport',
    activeRule: '/app-vue',
  },
])

start({
  sandbox: { experimentalStyleIsolation: true },   // 样式隔离(给子应用 wrap data-qiankun)
  singular: true,                                  // 同时只有一个子应用
  prefetch: 'all',                                  // 闲时预加载
})
```

```ts
// 子应用(React)需要导出 3 个 lifecycle
let root: Root

export async function bootstrap() { /* 子应用启动前 */ }

export async function mount(props: any) {
  root = createRoot(document.getElementById(props.container)!.querySelector('#root')!)
  root.render(<App {...props} />)
}

export async function unmount() {
  root.unmount()
}

// webpack output 配置必须支持 umd
output: {
  library: `${packageName}-[name]`,
  libraryTarget: 'umd',
  globalObject: 'window',
  chunkLoadingGlobal: `webpackJsonp_${packageName}`,
}
```

**沙箱机制**:
- JS sandbox:Proxy 隔离 window(每个子应用一个虚拟 window)
- CSS sandbox:`experimentalStyleIsolation` 给所有选择器加 `[data-qiankun]` prefix;或 `strictStyleIsolation: true` 用 Shadow DOM(更强但兼容差)
- 全局事件:`window.__POWERED_BY_QIANKUN__` 告诉子应用「我在 qiankun 里」

### 5. 子应用通讯

| 方案 | 适合 | 坑 |
|---|---|---|
| **CustomEvent / window event** | 简单广播 | 没类型,字符串约定 |
| **qiankun globalState** | 全局状态共享 | 受 qiankun 限制 |
| **共享 npm 包(EventBus)** | 类型强 | 多版本要小心 |
| **URL / queryString** | 跨刷新 | 字段长 |
| **postMessage**(iframe) | 跨域子应用 | 异步,JSON 序列化限制 |
| **BroadcastChannel** | 多 tab 通讯 | 同域 |

### 6. iframe 方案(老但稳)

**何时用**:
- 子应用是第三方系统(salesforce / metabase / jupyter)
- 安全要求极高(CSP / 不信任源)
- 老旧 jQuery 应用嵌新页面

**优势**:
- 真隔离(JS / CSS / cookie 都独立)
- 任何技术栈,任何版本
- 安全
- 沙箱已经被浏览器实现到极致

**劣势**:
- 弹层超不出 iframe 边界
- 路由 history 复杂(主子各一套)
- 体积大(每个 iframe 完整 runtime)
- iOS Safari 性能差

**现代封装**:[wujie](https://wujie-micro.github.io/)(iframe + Web Component,腾讯)体验接近 qiankun。

### 7. Web Components 方案

```ts
// 子应用打包成 custom element
class UserWidget extends HTMLElement {
  connectedCallback() {
    // 内部用 React/Vue 渲染
    const shadow = this.attachShadow({ mode: 'open' })
    createRoot(shadow).render(<App />)
  }
}
customElements.define('user-widget', UserWidget)
```

```html
<!-- 主应用任何框架都能用 -->
<user-widget user-id="123"></user-widget>
```

**优势**:浏览器原生,跨框架天然
**劣势**:ShadowDOM 样式难穿透,事件复杂,SSR 难
**适用**:第三方 widget(comment / chat / analytics)

### 8. 路由协同

```
主应用 path:
  /                      ← host page
  /products/*            ← 转发到 products MFE
  /users/*               ← 转发到 users MFE
  /settings              ← host page
```

模式:
- **路径分发**:`/products/*` 全归子应用
- **完整 base path 注入**:子应用 router basename 为 `/products`,内部任何跳转加上 prefix
- **主子事件**:用户在子应用点跳转 → emit event → 主应用 router.push
- **同源**:都用 history mode,共用 `history.pushState`

### 9. 部署 / 灰度 / 监控

```
CDN:
  /host/                 ← 主应用(很少改)
  /products/v1.2.3/      ← 产品子应用版本目录
  /users/v0.9.1/

主应用 fetch 一个 manifest:
  {
    "products": "/products/v1.2.3/remoteEntry.js",
    "users": "/users/v0.9.1/remoteEntry.js"
  }

发新版本:
  1. 子应用打包 → 上传 /products/v1.2.4/
  2. CI 改 manifest 的 products 字段 → 上线
  3. 主应用下次 fetch manifest 就拿到新版本(可选 cache-busting)

灰度:
  manifest 按用户 / 比例返回不同版本
  {
    "products": rolloutFor(userId) > 0.05 ? "v1.2.3" : "v1.2.4"
  }

回滚:
  改 manifest 回旧版本路径,30 秒生效
```

**监控**:
- 每个 MFE 独立 RUM / Sentry 项目
- 主应用看 「子应用加载耗时 / 失败率」
- 错误归因到具体 MFE owner

### 10. 大坑警告

#### 10.1 多版本依赖
- React 17/18 混合 → hooks 全炸
- 大库重复(antd, mui)→ bundle 翻倍 + 样式冲突

#### 10.2 样式互相污染
- 全局 `body { ... }` 子应用覆盖主应用
- z-index 战争(子 modal 被主 header 盖)
- font-family 跨应用不一致

#### 10.3 全局变量打架
- jQuery 多版本互覆 $
- window.gtag / window.dataLayer 重复初始化
- localStorage key 冲突 → 加 prefix

#### 10.4 i18n 不统一
- 主子语言不同步切换 → 用户看到混合语言

#### 10.5 鉴权 token 共享
- 主应用登录后,子应用不知道 → 用 BroadcastChannel + httpOnly cookie

#### 10.6 性能
- 主应用 + 子应用各 200KB JS → 共需 400KB+
- 解药:shared 协议、prefetch、HTTP/2 复用、tree shake

### 11. 何时倒退 / 合并

微前端不是终点,业务收缩或团队减小时主动**合并**:
- 子应用 → npm 包(monorepo)
- 沙箱开销 → 直接 import
- 部署 → 统一发版

3 年合并 1 次很正常。

---

## src/ 索引

| 文件 | 主题 |
|---|---|
| [src/module-federation.config.js](src/module-federation.config.js) | host + remote 完整配置 |
| [src/qiankun-host.ts](src/qiankun-host.ts) | qiankun 主应用 + 沙箱配置 |
| [src/qiankun-sub-react.tsx](src/qiankun-sub-react.tsx) | React 子应用 lifecycle + 路由 |
| [src/event-bus.ts](src/event-bus.ts) | 类型安全的微前端事件总线 |
| [examples/decision-tree.md](examples/decision-tree.md) | 微前端选型决策树 |

---

## 资源

- [Module Federation](https://webpack.js.org/concepts/module-federation/)
- [@module-federation/enhanced](https://module-federation.io/) — 下一代 MF
- [qiankun](https://qiankun.umijs.org/)
- [single-spa](https://single-spa.js.org/)
- [micro-app](https://micro-zoe.github.io/micro-app/) — 京东,基于 CustomElement
- [wujie](https://wujie-micro.github.io/) — 腾讯,iframe + Shadow DOM
- [Garfish](https://garfish.top/) — 字节
- [Building Micro-Frontends (book)](https://www.buildingmicrofrontends.com/) — Luca Mezzalira
- [The Micro Frontends Revolution](https://martinfowler.com/articles/micro-frontends.html) — Martin Fowler
