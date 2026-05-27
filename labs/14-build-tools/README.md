# 14 · Build Tools Lab

> 「构建」是把你写的代码变成浏览器能跑的代码的全套工程化基础设施。
> 用错工具:dev 启动 30s、prod 输出 5MB、HMR 一改就崩、source map 死活定位不到。

---

## 学这个能干什么

- 通晓主流打包器原理:Vite / Rollup / esbuild / Webpack / Rspack / Turbopack / Parcel
- 通晓 transpiler:SWC / Babel / TS 编译器
- 写自定义 plugin / loader / resolver
- 设计真正高效的 dev / prod 配置:HMR、CSS / 图片处理、tree shaking、code splitting
- 监控 + 优化 bundle size,知道每 KB 来自哪
- 看懂 ESM / CJS / UMD / IIFE / SystemJS 输出格式的差异

---

## Roadmap

### 1. 历史脉络

| 时代 | 工具 | 核心理念 |
|---|---|---|
| 2010 | RequireJS / Browserify | CommonJS 浏览器化 |
| 2014 | Webpack | 万物皆 module(JS/CSS/img) |
| 2016 | Rollup | 真正的 tree shaking + ESM 输出 |
| 2019 | Parcel | 零配置 |
| 2020 | esbuild | Go 写的极速 transpiler |
| 2020 | Snowpack / Vite | 利用浏览器原生 ESM,跳过打包 |
| 2022 | SWC | Rust 写的极速 transpiler |
| 2022 | Turbopack | Rust + 增量计算(尚未稳定) |
| 2023 | Rspack | Rust 写的 Webpack 兼容打包器 |
| 2024 | Rolldown | Rust 重写的 Rollup(将取代 Vite 的 Rollup) |

### 2. dev server:Vite 为什么这么快?

**Webpack 的痛点**:dev 启动时必须打包整个项目 → 大项目 30s+。

**Vite 的策略**:
1. **dev**:不打包业务代码,浏览器原生 ESM 按需加载;`node_modules` 用 esbuild 预打包成 ESM(避免几百个 import 请求)
2. **HMR**:文件变化只编译变化的 module + 通知浏览器,O(1) 不是 O(n)
3. **prod**:用 Rollup(很快也会换成 Rolldown)产出 tree-shaking 后的 bundle

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-popover'],
        },
      },
    },
  },
})
```

### 3. esbuild 和 SWC:transpiler 之争

| | Babel | esbuild | SWC |
|---|---|---|---|
| 语言 | JS | Go | Rust |
| 速度 | 1× | 20-100× | 20-70× |
| 插件生态 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| 自定义语法 | ✅ Babel macros | ❌ | ⭐ |
| 类型检查 | ❌ | ❌ | ❌ |
| 代码风格 | 完美 | 略改格式 | 良好 |
| Webpack 用 | babel-loader | esbuild-loader | swc-loader |
| Next.js | 已弃用 | — | ✅ 默认 |
| Vite | — | ✅ 默认(dev) | 可换 |

**选型**:
- 简单 transpile → esbuild(最快)
- 需要 React Compiler / 复杂 transform → SWC plugin
- 老项目 / preset-env 完美支持 → 暂留 Babel

### 4. Webpack 5 核心概念

```js
// webpack.config.js
module.exports = {
  entry: './src/index.tsx',
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'swc-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader', 'postcss-loader'] },
      { test: /\.(png|jpg)$/, type: 'asset' },        // Webpack 5 内置 asset module
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  plugins: [
    new HtmlWebpackPlugin({ template: './index.html' }),
    new MiniCssExtractPlugin({ filename: '[name].[contenthash].css' }),
  ],
  optimization: {
    splitChunks: { chunks: 'all' },
    runtimeChunk: 'single',
  },
}
```

**核心概念**:Entry / Output / Module / Loader / Plugin / Chunk / Module Federation / Asset Modules

### 5. Rspack:Rust 重写的 Webpack

```js
// rspack.config.js(几乎 Webpack 配置照搬)
module.exports = {
  entry: './src/index.tsx',
  builtins: {
    react: { runtime: 'automatic' },
    treeShaking: true,
  },
  module: {
    rules: [
      { test: /\.tsx?$/, type: 'tsx' },             // 内置 SWC
    ],
  },
}
```

- 优势:Webpack 配置兼容(loader / plugin 大部分能跑),Rust 速度
- 适合:Webpack 老项目「无痛迁移」加速

### 6. Rollup:库作者的最佳选择

```js
// rollup.config.js
import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'

export default {
  input: 'src/index.ts',
  output: [
    { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    { file: 'dist/index.mjs', format: 'esm', sourcemap: true },
    { file: 'dist/index.umd.js', format: 'umd', name: 'MyLib', sourcemap: true },
  ],
  external: ['react'],                                // peerDeps 不打进 bundle
  plugins: [nodeResolve(), typescript(), terser()],
}
```

为什么 Rollup 适合写库:
- 真正的 ESM 优先,tree shaking 干净
- 输出多格式(CJS/ESM/UMD)同时兼容老老老用户
- 没有 chunk 概念,产物是「一个 module = 一个文件」,容易调试

### 7. Tree Shaking 实战与坑

**生效条件**:
1. 用 ESM(`import` / `export`),不能用 CJS
2. package.json `"sideEffects": false` 或精确列出有副作用的文件
3. 不写「副作用导入」:`import './styles.css'` 这种必须列在 sideEffects

```json
{
  "name": "my-lib",
  "sideEffects": [
    "*.css",
    "./src/polyfills.js"
  ]
}
```

**常见 tree shaking 失败**:
```js
// ❌ 默认导出整个 object,bundler 不知道哪些用了
import _ from 'lodash'
_.debounce(...)

// ✅ 命名导入
import { debounce } from 'lodash-es'
```

工具:
- [bundlephobia.com](https://bundlephobia.com) — 看库的真实 bundle 影响
- [esbuild-visualizer](https://esbuild.github.io/analyze/) — 看 bundle 组成
- [rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer) — Vite/Rollup 用

### 8. Code Splitting

```ts
// 1. 动态 import → bundler 自动拆 chunk
const Editor = lazy(() => import('./Editor'))

// 2. 手动指定 chunk(Webpack magic comment)
import(/* webpackChunkName: "editor" */ './Editor')

// 3. Vite / Rollup manualChunks
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules')) {
          if (id.includes('react')) return 'react'
          if (id.includes('lodash')) return 'lodash'
          return 'vendor'
        }
      },
    },
  },
}
```

⚠️ 别过度拆 chunk:HTTP/2 多路复用快,但 chunk 太多有 overhead(每个 chunk 一个 manifest entry / 解析成本)。经验:首屏 < 5 个 chunk。

### 9. 自定义 Vite Plugin

```ts
import { Plugin } from 'vite'

// 把 .svg 文件转换成 React 组件
function svgr(): Plugin {
  return {
    name: 'vite-plugin-svgr',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.svg')) return
      const svg = await fs.readFile(id, 'utf-8')
      return {
        code: `
          import React from 'react'
          export default function Icon(props) {
            return ${svg.replace('<svg', '<svg {...props}')}
          }
        `,
        map: null,
      }
    },
  }
}
```

Hook 顺序:`config` → `configResolved` → `buildStart` → `resolveId` → `load` → `transform` → `buildEnd`

### 10. Source Map 的真相

| 模式 | 体积 | 调试体验 | 用途 |
|---|---|---|---|
| `eval` | 0 | 差 | 最快 dev |
| `eval-source-map` | 小 | 好 | 最佳 dev(Webpack 默认) |
| `inline-source-map` | 大 | 完美 | 单文件场景 |
| `source-map` | 0(独立文件) | 完美 | prod 上传 Sentry |
| `hidden-source-map` | 0 | 完美 | prod,不暴露给用户 |
| `nosources-source-map` | 小 | 行号有,源码无 | 折中方案 |

```js
// vite 生产环境推荐
build: {
  sourcemap: 'hidden',          // 生成 map 但不引用,上传 Sentry
}
```

### 11. PostCSS / Lightning CSS

PostCSS 插件链:
- autoprefixer:自动加浏览器前缀
- postcss-preset-env:用未来 CSS 语法
- cssnano:压缩
- tailwindcss:utility CSS 引擎

Lightning CSS(由 Parcel 团队 Rust 写):
- 比 PostCSS 快 100×
- 内置 autoprefixer + minify + browserslist
- Vite 中:`css: { transformer: 'lightningcss' }`

### 12. 监控 bundle size(CI 必加)

```yaml
# .github/workflows/bundle-size.yml
- uses: andresz1/size-limit-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

```json
// package.json
"size-limit": [
  { "path": "dist/index.js", "limit": "10 KB" },
  { "path": "dist/*.js", "limit": "150 KB" }
]
```

每个 PR 自动 comment「这次比 main 多了 +5KB」。

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [vite.config.ts](src/vite.config.ts) | 生产级 Vite 配置(SSR / chunks / proxy / env) |
| [webpack.config.js](src/webpack.config.js) | 现代 Webpack 5 完整配置 |
| [rollup.lib.config.js](src/rollup.lib.config.js) | 发布 npm 包的 Rollup 配置 |
| [custom-vite-plugin.ts](src/custom-vite-plugin.ts) | 3 个自定义 plugin 示例 |
| [tree-shaking-test.md](src/tree-shaking-test.md) | 检查 tree shaking 是否生效的实测方法 |

---

## 资源

- [Vite docs](https://vitejs.dev/)
- [Webpack docs](https://webpack.js.org/)
- [Rollup docs](https://rollupjs.org/)
- [esbuild docs](https://esbuild.github.io/)
- [SWC docs](https://swc.rs/)
- [Rspack docs](https://rspack.dev/)
- [Lightning CSS](https://lightningcss.dev/)
- [The Workshop Project](https://kentcdodds.com/workshops/build-an-epic-react-app-from-scratch)
- [Bundlephobia](https://bundlephobia.com/) — 检查任何 npm 包的体积
