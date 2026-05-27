// Module Federation 双向配置:host + remote
// Webpack 5 / Rspack 通用,Vite 用 @originjs/vite-plugin-federation 语义一致

// =====================================================
// HOST(shell 应用,消费别人的模块)
// =====================================================
const { ModuleFederationPlugin } = require('webpack').container
const path = require('path')

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: 'https://shell.example.com/',     // 必须绝对路径,否则 chunk 加载错
    clean: true,
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'shell',

      // ---- 消费的远程 ----
      remotes: {
        // 静态(简单,但版本切换要改代码)
        products: 'products@https://products.example.com/remoteEntry.js',

        // 动态(从 manifest 读 URL,生产推荐)
        users: `promise new Promise(resolve => {
          fetch('/manifest.json').then(r => r.json()).then(m => {
            const script = document.createElement('script')
            script.src = m.users
            script.onload = () => {
              const proxy = {
                get: (request) => window.users.get(request),
                init: (arg) => {
                  try { return window.users.init(arg) } catch (e) {}
                },
              }
              resolve(proxy)
            }
            document.head.appendChild(script)
          })
        })`,
      },

      // ---- shared:全 federation 单例 ----
      shared: {
        react: {
          singleton: true,                         // 全场单例(不允许多版本)
          requiredVersion: '^18.0.0',
          eager: true,                              // host 主 bundle 同步加载,避免拆 chunk
          strictVersion: true,                      // 版本不匹配 → 报错而非 fallback
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.0.0',
          eager: true,
        },
        'react-router-dom': { singleton: true, requiredVersion: '^6.0.0' },

        // 设计系统组件库
        '@yourorg/ui': { singleton: true, requiredVersion: '^2.0.0' },

        // 工具库(允许多版本,各自打)
        'date-fns': { singleton: false },
      },
    }),
  ],
}

// =====================================================
// REMOTE(products 子应用,暴露模块)
// =====================================================
const remoteConfig = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    publicPath: 'https://products.example.com/',  // 子应用部署地址
    uniqueName: 'products',                        // 避免 webpack runtime 冲突
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'products',
      filename: 'remoteEntry.js',                   // host 通过这个文件发现暴露

      // ---- 暴露的模块 ----
      exposes: {
        './ProductList':   './src/features/ProductList',
        './ProductDetail': './src/features/ProductDetail',
        './routes':        './src/routes',          // 暴露整个路由配置
        './store':         './src/store/products',  // 暴露 zustand store
      },

      // ---- 同样要声明 shared(避免下重复 React)----
      shared: {
        react:       { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        '@yourorg/ui': { singleton: true },
      },
    }),
  ],
}

// =====================================================
// 用法:host 端 lazy import
// =====================================================
/*
// app.tsx
import { lazy, Suspense } from 'react'

const ProductList = lazy(() => import('products/ProductList'))
const UserProfile = lazy(() => import('users/Profile'))

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/products/*" element={<ProductList />} />
        <Route path="/profile" element={<UserProfile />} />
      </Routes>
    </Suspense>
  )
}

// TypeScript 类型:声明模块
// remotes.d.ts
declare module 'products/ProductList' {
  const ProductList: React.ComponentType
  export default ProductList
}
// 自动生成用 @module-federation/typescript
*/

// =====================================================
// manifest.json(动态远程 URL,部署 / 灰度核心)
// =====================================================
/*
{
  "products": "https://cdn.example.com/products/v1.2.3/remoteEntry.js",
  "users":    "https://cdn.example.com/users/v0.9.1/remoteEntry.js"
}

发布:
  1. 子应用 build → 上传 /products/v1.2.4/
  2. CI 更新 manifest.json → push CDN
  3. 主应用下次访问拿到新版本

灰度:
  动态 manifest 根据 user / region 返回不同版本

回滚:
  改 manifest 回旧版本,30 秒生效
*/

// =====================================================
// 大坑速查
// =====================================================
//
// 1. shared 版本不匹配 → 加载两份 React → "Invalid hook call"
//    解药:singleton: true + strictVersion + lock 主版本
//
// 2. remoteEntry.js 浏览器缓存太久 → 改了不生效
//    解药:Cache-Control: max-age=0, must-revalidate(remoteEntry 本身不能 hash)
//          内部 chunk 走长缓存 immutable
//
// 3. publicPath 配错(相对路径)→ 子应用 chunk 走主应用域名 404
//    解药:必须绝对路径,或 runtime 注入(window.__webpack_public_path__)
//
// 4. CSS 不隔离 → 全局样式互覆
//    解药:每个 MFE 用 CSS Modules 或 scoped + 主应用样式不全局污染
//
// 5. shared 内 hook(useState)实例不同 → "rendered fewer hooks"
//    解药:确保 singleton + 同一文件路径(用 alias 强制)
//
// 6. 子应用 独立开发模式 → host 不在,export 暴露的组件无法直接渲染
//    解药:写一个 dev 入口,自渲染 ProductList(双入口模式)
