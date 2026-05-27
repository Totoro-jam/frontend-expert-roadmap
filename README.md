# Frontend Expert Roadmap

基于 pnpm monorepo 的前端专家学习路线图，包含 25 个独立 Lab。

## 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8

```bash
# 安装 pnpm（如未安装）
npm install -g pnpm
```

## 快速开始

```bash
# 克隆仓库
git clone <repo-url>
cd frontend-expert-roadmap

# 安装全部依赖
pnpm install

# 仅安装某个 Lab 的依赖
pnpm --filter 01-js-advanced install
```

## 目录结构

```
frontend-expert-roadmap/
├── labs/
│   ├── 01-js-advanced/          # 闭包、原型、this、异步、Proxy
│   ├── 02-typescript-advanced/  # 泛型、条件类型、infer、类型体操
│   ├── 03-browser-internals/    # 事件循环、渲染管线、合成层
│   ├── 04-html-a11y/            # 语义化 HTML、ARIA、WCAG
│   ├── 05-css-modern/           # Grid、Container Queries、@layer
│   ├── 06-css-architecture/     # BEM、Tailwind、CSS-in-JS
│   ├── 07-react-deep/           # Hooks、Fiber、并发渲染、RSC
│   ├── 08-vue-deep/             # 响应式、Composition API、Vapor
│   ├── 09-signals-reactivity/   # Signal vs Proxy vs VDOM 对比
│   ├── 10-state-management/     # Redux、Zustand、Jotai、XState
│   ├── 11-data-fetching/        # TanStack Query、SWR、缓存策略
│   ├── 12-forms/                # 受控/非受控、复杂校验
│   ├── 13-network-layer/        # REST、GraphQL、WebSocket、SSE
│   ├── 14-build-tools/          # Vite、Webpack、esbuild、HMR
│   ├── 15-monorepo/             # pnpm workspaces、Turborepo、Nx
│   ├── 16-performance-runtime/  # Web Vitals、性能分析、虚拟列表
│   ├── 17-performance-loading/  # Code Splitting、懒加载、预加载
│   ├── 18-component-patterns/   # Compound、Headless、Polymorphic
│   ├── 19-design-systems/       # Design Tokens、主题、Radix
│   ├── 20-micro-frontends/      # Module Federation、qiankun
│   ├── 21-ssr-hydration/        # Streaming、RSC、Islands
│   ├── 22-frontend-security/    # XSS、CSRF、CSP、OAuth
│   ├── 23-animation/            # FLIP、Motion、GSAP
│   ├── 24-pwa-sw/               # Service Worker、离线、Push
│   └── 25-i18n-l10n/            # Intl API、react-i18next、RTL
├── package.json                 # 根工作区配置
├── pnpm-workspace.yaml          # 工作区声明
├── .npmrc                       # pnpm 配置
├── .editorconfig                # 编辑器统一配置
└── .gitignore
```

## 常用命令

```bash
# 启动某个 Lab 的开发服务
pnpm dev --lab=07-react-deep

# 运行所有 Lab 的测试
pnpm test

# 运行指定 Lab 的测试
pnpm test:filter --lab=01-js-advanced

# 类型检查
pnpm typecheck

# 清理所有 node_modules 和构建产物
pnpm clean
```

## 单独使用某个 Lab

每个 Lab 都是独立的，拥有自己的 `package.json`，可以单独运行：

```bash
cd labs/01-js-advanced
pnpm install
pnpm test
```

或者在根目录通过 pnpm filter 操作：

```bash
pnpm --filter 01-js-advanced test
pnpm --filter 07-react-deep dev
```

## Lab 内部结构

每个 Lab 遵循统一的目录规范：

```
labs/XX-topic-name/
├── README.md        # 知识地图与学习目标
├── package.json     # 该 Lab 的依赖和脚本
├── src/             # 源码和实现
├── examples/        # 可运行的示例（部分 Lab 用 demos/）
└── tsconfig.json    # TypeScript 配置（如需要）
```

## 学习路径

### 推荐顺序

| 阶段 | Lab | 聚焦领域 |
|------|-----|----------|
| A. 语言内功 | 01-02 | JS/TS 深入 |
| B. 平台与样式 | 03-06 | 浏览器、HTML、CSS |
| C. 框架内核 | 07-09 | React、Vue、Signals |
| D. 状态与数据 | 10-13 | 状态管理、数据请求、表单、网络 |
| E. 构建与工程 | 14-15 | 构建工具、Monorepo |
| F. 性能优化 | 16-17 | 运行时 & 加载性能 |
| G. 架构设计 | 18-21 | 组件模式、设计系统、微前端、SSR |
| H. 跨领域能力 | 22-25 | 安全、动画、PWA、国际化 |

### 按角色选择

- **React/Vue 资深应用开发**：01 02 04 05 06 07/08 09 10 11 12 13 16 17 18
- **基础架构/平台工程师**：01 02 03 14 15 16 17 18 19 20 21 22
- **大型 SaaS / B 端开发**：01 02 04 10 11 12 13 19 20 22 24 25
- **C 端 / 增长型前端**：03 05 06 16 17 23 24
- **Web 性能 / 体验专家**：03 04 05 16 17 23

## 贡献规范

1. 每个 Lab 必须可独立安装和运行
2. Lab 自身的依赖放在各自的 `package.json` 中
3. 命名遵循 `XX-topic-name` 格式
4. 必须包含 `README.md`，写明学习目标和知识地图

## License

MIT
