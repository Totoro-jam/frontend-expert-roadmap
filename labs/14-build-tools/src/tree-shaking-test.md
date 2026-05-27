# Tree Shaking 是否生效?实测方法

## 步骤 1:写一个小测试

```ts
// test.ts
import { debounce, throttle } from 'lodash-es'
console.log(debounce, throttle)        // 故意不引用 lodash 的其他函数
```

## 步骤 2:打包

```sh
npx esbuild test.ts --bundle --minify --analyze | less
```

或用 Vite:

```sh
npx vite build --mode production
```

然后看 `dist/assets/*.js` 大小。

## 步骤 3:对比

| 写法 | bundle 大小 | 说明 |
|---|---|---|
| `import _ from 'lodash'` | ~70 KB | ❌ 整个 lodash 进来 |
| `import { debounce } from 'lodash'` | ~70 KB | ❌ lodash CJS 不能 tree-shake |
| `import { debounce } from 'lodash-es'` | ~3 KB | ✅ lodash-es 是 ESM |
| `import debounce from 'lodash/debounce'` | ~3 KB | ✅ 直接路径 import |

## 常见失败原因

### 1. CJS 包
```ts
// node_modules/some-pkg/index.js
module.exports = { foo: 1, bar: 2 }
```
bundler 看不到这是「object 还是 namespace」,只能整个保留。

**解决**:找它的 ESM 版本(`some-pkg/esm` / `some-pkg/dist/esm.js`),或在配置里给个 `mainFields: ['module', 'main']`。

### 2. sideEffects 没配
```json
// 你的库的 package.json
{ "sideEffects": false }
```

不写 = 默认所有文件可能有副作用 = 全部保留。

如果某些文件确实有副作用(全局 polyfill / CSS):
```json
{
  "sideEffects": ["*.css", "./src/polyfills.js"]
}
```

### 3. 顶级有副作用代码
```ts
// my-lib/index.ts
console.log('Library loaded')      // ❌ 这行会让 import 这个文件的代码都保留
export function foo() {}
```

去掉所有顶层副作用,只导出 pure function / class。

### 4. 用了 `*` namespace import
```ts
import * as utils from './utils'
console.log(utils.foo)
```

bundler 不知道你后续是不是动态读 `utils[someVar]`,只好保留全部。

**改写**:`import { foo } from './utils'`

### 5. webpack 4 / Rollup `treeshake.moduleSideEffects` 未配
- Webpack 4:`optimization.usedExports + sideEffects`
- Webpack 5:默认开启
- Rollup:`treeshake: 'recommended'` 或 `'smallest'`

## 工具检查

### 1. esbuild --analyze
```sh
esbuild src/index.ts --bundle --analyze
```
输出每个 module 占多大,直接看出元凶。

### 2. rollup-plugin-visualizer
```ts
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'
plugins: [visualizer({ open: true, gzipSize: true })]
```

打开 HTML 互动 treemap,放大缩小看。

### 3. webpack-bundle-analyzer
```js
new BundleAnalyzerPlugin()
```

经典互动 treemap。

### 4. bundlephobia
访问 https://bundlephobia.com/package/lodash-es,直接看任何 npm 包的「真实 bundle 影响」。

### 5. import-cost VSCode 插件
import 一行时,IDE 直接显示「这个 import 增加了 X KB」。

## 检查表

- [ ] 用的依赖都有 ESM 版本
- [ ] 自己的库 package.json 写了 `"type": "module"` 和 `"sideEffects": false`
- [ ] 没有 `import * as X` 然后散乱使用
- [ ] 没有 `import _ from 'lodash'`,改成 `'lodash-es'` 或路径 import
- [ ] CSS / polyfill 文件在 sideEffects 数组里
- [ ] 顶层代码没有 console / 注册全局事件
- [ ] CI 里加了 size-limit / @size-limit/preset-app

满足以上 7 条 = tree shaking 基本能正常工作。
