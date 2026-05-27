# 15 · Monorepo Lab

> 一个仓库管理 5 个、50 个、500 个包。
> 用 polyrepo:依赖地狱 + 跨包重构地狱;用 monorepo:配错了构建慢 / CI 慢 / 版本管理乱。

---

## 学这个能干什么

- 选对 monorepo 工具:pnpm workspaces / Turborepo / Nx / Lerna / Bazel
- 设计「能扩展到 100+ 包」的目录结构
- 用 Changesets 做语义化版本 + changelog 自动生成
- 配置 CI 只构建「变化的包」(任务级缓存 + 远端缓存)
- 解决经典痛点:phantom dep / 重复打包 / 类型环依赖 / 共享 config

---

## Roadmap

### 1. 为什么用 monorepo?

**polyrepo 痛点**:
- 共享代码要发包 → 等版本号更新很慢
- 跨仓库重构 → 一个 PR 改不动 5 个 repo
- 工程化配置散落 → ESLint / TS / CI 5 份

**monorepo 优势**:
- 一次 PR 改全部
- 共享代码用 `workspace:*` 引用,不发包也能用
- 一套 ESLint / TS / CI 配置统治所有包
- 重构友好 → IDE 直接跨包跳转

**何时**别用 monorepo:
- 团队 / 业务线完全独立(权限 / release cycle)
- 项目体量小(2-3 个仓库可控)
- 需要不同语言栈共存(可以但工具复杂)

### 2. 包管理器选型

| | npm | yarn classic | yarn berry | pnpm |
|---|---|---|---|---|
| workspaces | ✅ 7+ | ✅ | ✅ | ✅ |
| 严格依赖(防 phantom) | ❌ | ❌ | ✅ PnP | ✅ |
| 磁盘节省 | ❌ | ❌ | ✅(PnP) | ✅(硬链接) |
| 安装速度 | 慢 | 中 | 快 | 最快 |
| 生态兼容 | 完美 | 完美 | 部分 | 完美 |

**2026 默认**:**pnpm**(快、节省磁盘、严格 hoisting)

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tooling/*'
```

### 3. 推荐目录结构

```
my-monorepo/
├── apps/                       # 应用(最终产物)
│   ├── web/                    # Next.js
│   ├── admin/                  # Vite SPA
│   └── docs/                   # 文档站(Docusaurus)
│
├── packages/                   # 共享库
│   ├── ui/                     # 共享 React 组件
│   ├── utils/                  # 工具函数
│   ├── api-client/             # 调用后端的封装
│   └── types/                  # 共享 TypeScript types
│
├── tooling/                    # 工程化配置
│   ├── eslint-config/
│   ├── tsconfig/
│   └── tailwind-config/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json                  # 或 nx.json
└── .changeset/                 # Changesets 配置
```

### 4. workspace 协议

```json
// apps/web/package.json
{
  "dependencies": {
    "@my/ui": "workspace:*",            // 自动指向 monorepo 里的 packages/ui
    "@my/api-client": "workspace:^"     // 同上,但 publish 时变成 ^x.y.z
  }
}
```

`workspace:*` 在 publish 时会被替换成具体版本号(`^1.2.3`),所以发布到 npm 也能工作。

### 5. Turborepo —— 任务级缓存

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],           // 依赖包先 build
      "outputs": ["dist/**", ".next/**"],
      "cache": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "cache": true
    },
    "dev": {
      "cache": false,                    // dev 不缓存
      "persistent": true                 // 持久运行
    }
  }
}
```

```sh
turbo run build --filter=web...         # 构建 web 和它依赖
turbo run test --filter=...[main]       # 测试相对 main 分支有变化的包
```

**关键能力**:
- **本地缓存**:同样的输入 = 跳过执行,直接复用结果
- **远端缓存**:Vercel Remote Cache,团队共享缓存(同事 build 过的,你直接用)
- **并行执行**:任务图调度,最大化 CPU 利用

### 6. Nx —— 更强的图分析 + plugin 生态

```json
// nx.json
{
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"]
    }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*"],
    "production": ["default", "!{projectRoot}/**/*.test.ts"]
  }
}
```

```sh
nx affected --target=build --base=main  # 智能算出受影响的包
nx graph                                # 可视化依赖图
nx run web:build                        # 跑单个任务
```

**Nx vs Turborepo**:
- Nx:更老牌、生态丰富(generator / executor)、更多约束、适合大企业
- Turborepo:简单、轻量、Vercel 出品、适合中小型

### 7. Changesets —— 版本管理

```sh
pnpm changeset                          # 交互式选哪些包要发版 + 类型(major/minor/patch)
pnpm changeset version                  # 应用 changeset → 更新 package.json + CHANGELOG
pnpm publish -r                         # 发布所有 changed 包
```

`.changeset/awesome-cats-sing.md`:
```md
---
"@my/ui": minor
"@my/utils": patch
---

Added new Button variants, fixed date formatter bug.
```

CI 自动化:
```yaml
- uses: changesets/action@v1
  with:
    publish: pnpm publish -r
    version: pnpm changeset version
    commit: 'chore: version packages'
```

→ 每次 merge 到 main,自动开个「Version Packages」PR,合并即发版。

### 8. 共享 TS 配置

```json
// tooling/tsconfig/base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  }
}

// packages/ui/tsconfig.json
{
  "extends": "@my/tsconfig/base.json",
  "include": ["src"]
}
```

### 9. 共享 ESLint 配置

```js
// tooling/eslint-config/index.js
module.exports = {
  extends: ['eslint:recommended', '@typescript-eslint/recommended'],
  rules: {
    'no-console': 'warn',
  },
}
```

各包只 `extends: ['@my/eslint-config']`。

### 10. CI 优化(只跑变化的包)

```yaml
# .github/workflows/ci.yml
- uses: pnpm/action-setup@v2
- run: pnpm install --frozen-lockfile

# Turborepo + 远端缓存
- run: pnpm turbo run lint test build --token=$TURBO_TOKEN --team=my-team

# 或 Nx affected
- run: pnpm nx affected --target=build,test,lint --base=origin/main
```

效果:首次 CI 20 分钟 → 后续无改动只跑被影响包(2 分钟)。

### 11. 经典陷阱

#### 陷阱 1:Phantom dependency
```ts
// packages/ui/src/Button.tsx
import { something } from 'lodash'      // package.json 没声明 lodash
```
npm/yarn 不严格,会 hoist 到根 node_modules 让你用上;pnpm 严格,会报错。**用 pnpm**。

#### 陷阱 2:循环依赖
```
A → B → C → A
```
TS 看似能编译,运行时部分 export 为 undefined。`madge --circular packages/` 自动检测。

#### 陷阱 3:版本不一致(同一个库不同包用不同版本)
```sh
pnpm dedupe
# 或
syncpack list-mismatches
```

#### 陷阱 4:dev 时改 packages/ui,apps/web 看不到
要么 packages/ui 起 `tsc --watch`,要么用「source 直接 export」:
```json
// packages/ui/package.json
{
  "exports": {
    ".": {
      "import": "./src/index.ts"        // dev:直接 export source
    }
  }
}
```
配合 Next.js 的 `transpilePackages: ['@my/ui']`。

### 12. 大规模:Bazel / Pants / Buck2

> 当你有 1000+ 包 / 多语言栈(JS+Go+Rust)/ 需要远端构建集群,JS 生态工具已经不够。

- **Bazel**(Google):多语言、超严格、配置巨复杂
- **Pants**(Twitter):Python 焦点,Python 团队首选
- **Buck2**(Meta,Rust 重写):比 Bazel 快,生态新

Spotify / Slack / Pinterest 都用 Bazel 管所有代码。

---

## src/ 示例

| 文件 | 主题 |
|---|---|
| [pnpm-workspace.yaml](src/pnpm-workspace.yaml) | workspace 声明 |
| [turbo.json](src/turbo.json) | Turborepo 完整 pipeline |
| [example-package.json](src/example-package.json) | workspace: 协议演示 |
| [changesets-config.md](src/changesets-config.md) | Changesets 配置 + CI |
| [migration-guide.md](src/migration-guide.md) | 从 polyrepo 迁移到 monorepo 的步骤 |

---

## 资源

- [Turborepo docs](https://turbo.build/repo/docs)
- [Nx docs](https://nx.dev/)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [Changesets](https://github.com/changesets/changesets)
- [Monorepo.tools](https://monorepo.tools/) — 各工具特性对比
- [The Monorepo Handbook](https://earthly.dev/blog/monorepo-tools/)
