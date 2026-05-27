# Bundle 分析报告阅读指南

> 看懂 bundle 报告 = 知道砍哪里 = 真减肥
> 不会看报告 = 凭感觉删依赖 = 越改越大

---

## 1. 工具选择

| 工具 | 适合 | 形态 |
|---|---|---|
| `rollup-plugin-visualizer` | Vite/Rollup | Treemap HTML(强烈推荐) |
| `webpack-bundle-analyzer` | Webpack | Treemap HTML |
| `source-map-explorer` | 任意带 sourcemap | Treemap HTML |
| `statoscope` | Webpack | 深度对比 + CI 卡控 |
| `bundle-buddy` | 任意 | 找 duplicate code |
| `bundlephobia.com` | 评估新依赖 | 在线查包体积 |
| `import-cost` (VSCode) | 编辑时实时显示 | 编辑器内 |

---

## 2. Treemap 解读

```
┌─────────────────────────────────────────────┐
│              app.js  500 KB                 │
├──────────────────────┬──────────────────────┤
│    react-dom         │      moment          │
│      130 KB          │       72 KB ★ 元凶   │
├──────────┬───────────┼──────────────────────┤
│ lodash   │ chart.js  │    其他散乱小包      │
│  60 KB ★ │   170 KB ★│        68 KB         │
└──────────┴───────────┴──────────────────────┘
```

**看四个东西**:
1. **谁最大**(矩形面积) → 优先优化它
2. **重复包**(同一个库两个版本)→ resolve.alias 强制单版本
3. **没用的代码**(明明 tree-shake 该砍但还在)→ 检查 sideEffects
4. **意外的代码**(怎么把后端 SDK 打进来了)→ 找到 import 链

---

## 3. 常见元凶 + 解药

### 3.1 moment.js(72KB → 0)
```ts
// ❌ 全引
import moment from 'moment'

// ✅ 换 dayjs(2KB) / date-fns(按需)
import dayjs from 'dayjs'
import { format } from 'date-fns'
```

### 3.2 lodash(70KB → 2KB)
```ts
// ❌ 全引(整个 lodash 全打)
import _ from 'lodash'
_.debounce(...)

// ❌ tree-shake 假象(CJS 不支持 tree shaking)
import { debounce } from 'lodash'

// ✅ 单函数 import
import debounce from 'lodash/debounce'

// ✅✅ lodash-es(ESM 版,正确 tree shake)
import { debounce } from 'lodash-es'
```

### 3.3 antd / MUI 图标(数百 KB)
```ts
// ❌ 全引
import { Button, Modal, ... } from 'antd'  // 现代版按需,旧版要 babel-plugin

// ❌ 图标全引(致命)
import * as Icons from '@ant-design/icons'

// ✅ 按需
import { GithubOutlined, HomeFilled } from '@ant-design/icons'
```

### 3.4 chart.js / echarts(数百 KB)
```ts
// ❌
import * as echarts from 'echarts'

// ✅ 按需引入图表 + 渲染器
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, CanvasRenderer])

// ✅✅ 体积更小的替代:uPlot(40KB) / lightweight-charts(60KB)
```

### 3.5 polyfill(数十 KB)
```ts
// ❌ 全引 core-js
import 'core-js'

// ✅ 按 target browsers + browserslist 按需
// vite-plugin-legacy / babel preset-env with useBuiltIns: 'usage'
```

### 3.6 axios(33KB)
```ts
// ✅ 换 ky(5KB) / 原生 fetch + 自己包薄壳(0)
```

### 3.7 重复包(看到两份 react 之类)
```ts
// pnpm:
// pnpm why react  // 看谁引了它
// 添加 overrides 强制单版本
{
  "pnpm": {
    "overrides": {
      "react": "18.3.1",
      "react-dom": "18.3.1"
    }
  }
}

// Webpack:
resolve: {
  alias: {
    react: path.resolve('./node_modules/react'),
  },
}
```

---

## 4. tree shaking 失效检查

打开报告看到 lodash 90KB,但只 import 了 debounce → 失效

**checklist**:
1. ✅ 包的 `package.json` 有 `"type": "module"` 或 `"module": "..."` 字段
2. ✅ 包的 `package.json` 有 `"sideEffects": false`(或精确列出有副作用的文件)
3. ✅ 自己代码没整体 import `import * as X from 'pkg'`
4. ✅ 没用 `require()` (CJS 不支持 tree shaking)
5. ✅ 构建工具 production 模式(Webpack 自动开 `usedExports: true`,Vite 自动)
6. ✅ Terser/esbuild minify 开了(才会真删)
7. ✅ 没有把整个对象 `export default { ... }` 让人 destructure(无法静态分析)

---

## 5. 找到「这个东西是谁带来的」

### 5.1 Vite / Rollup
```sh
npx vite build --debug 2> debug.log
grep "imported by" debug.log
```

或装 plugin:
```ts
import { visualizer } from 'rollup-plugin-visualizer'
visualizer({ template: 'treemap', gzipSize: true, brotliSize: true })
```
然后 hover 节点看 "imported by"

### 5.2 Webpack
```sh
npx webpack --json > stats.json
# 上传到 https://chrisbateman.github.io/webpack-visualizer/
# 或本地:npx webpack-bundle-analyzer stats.json
```

### 5.3 pnpm 找依赖来源
```sh
pnpm why moment            # 谁依赖了 moment
pnpm why -r lodash         # 全 workspace 范围
```

---

## 6. 持续防退化:CI 卡尺寸

### size-limit(轻量,推荐)
```json
// package.json
{
  "size-limit": [
    { "path": "dist/main.*.js", "limit": "170 KB" },
    { "path": "dist/main.*.css", "limit": "50 KB" }
  ],
  "scripts": {
    "size": "size-limit"
  }
}
```

```yaml
# .github/workflows/size.yml
- uses: andresz1/size-limit-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

PR 自动评论:`+5.2 KB,limit 170 KB ✅` 或 `❌ 超 12 KB`

### Lighthouse CI(综合)
```sh
npx @lhci/cli@latest autorun --budget-path=src/perf-budget.json
```

### Bundlewatch
```json
{
  "files": [{ "path": "./dist/*.js", "maxSize": "200kB" }]
}
```

---

## 7. 实战流程

```
1. 首次跑 visualizer → 截图保存当前基线
2. 列出前 10 大模块,标记「可删 / 可换 / 必留」
3. 一次只动一个:删/换 + 重测 + 对比
4. CI 加 size-limit,防止偷偷膨胀
5. 季度 review:重新跑一次,找新元凶
```

---

## 8. 反常识

- **gzip 后体积才是用户实际下载的**(visualizer 会显示 gzip / brotli 列,看那个)
- **JS 解析时间 ≠ 体积线性关系**:100KB 复杂 JS 比 200KB 简单 JS 更慢(parse + compile)
- **chunk 不是越小越好**:HTTP/2 多路复用下,~30-50KB 一个 chunk 性价比最高;太小则请求开销 > 下载收益
- **共享 chunk 是双刃剑**:cacheable 但首次访问的页面要多下一个 chunk
