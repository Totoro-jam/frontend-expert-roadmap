# 从 Polyrepo 迁移到 Monorepo 的真实步骤

## 现状评估

适合迁移:
- ✅ 5+ 仓库共享代码,版本同步麻烦
- ✅ 跨仓库 PR 频繁
- ✅ 工程化配置已多份分歧

不适合迁移:
- ❌ 团队权限隔离要求高
- ❌ release cycle 完全独立
- ❌ 各仓库技术栈差异大(虽然 monorepo 也能支持,但复杂)

## 7 步迁移流程

### Step 1:选工具栈

- 包管理器:**pnpm**
- 任务编排:**Turborepo**(简单)或 **Nx**(企业)
- 版本管理:**Changesets**
- TypeScript:**TS 5+**,用 `references` 做项目引用

### Step 2:建空骨架

```sh
mkdir my-monorepo && cd my-monorepo
pnpm init
echo '{ "extends": "@my/tsconfig/base" }' > tsconfig.json

cat > pnpm-workspace.yaml <<EOF
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tooling/*'
EOF

pnpm add -Dw turbo typescript @changesets/cli
```

### Step 3:用 `git subtree` 保留历史迁入

```sh
# 在 monorepo 根目录
git subtree add --prefix=apps/web https://github.com/old/web main
git subtree add --prefix=apps/admin https://github.com/old/admin main
git subtree add --prefix=packages/utils https://github.com/old/utils main
```

每个 subtree 都带过来完整 git log(`git log apps/web/` 能看到原 repo 历史)。

替代方案:`git filter-repo` 更彻底但更复杂。

### Step 4:统一基础配置

把每个 app/package 里重复的 `.eslintrc` `tsconfig.json` `prettier.config.js` 抽到 `tooling/`:

```sh
mkdir -p tooling/eslint-config tooling/tsconfig tooling/prettier-config
```

然后各包改成:
```json
// packages/utils/.eslintrc.cjs
module.exports = { extends: ['@my/eslint-config'] }
```

### Step 5:转换共享代码为 workspace 引用

之前:
```json
"dependencies": { "@my/utils": "^1.2.3" }
```

现在:
```json
"dependencies": { "@my/utils": "workspace:*" }
```

然后 `pnpm install` 会创建 symlink。

### Step 6:配 Turborepo / Nx

```sh
echo '{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test":  { "dependsOn": ["^build"] },
    "lint":  {}
  }
}' > turbo.json
```

### Step 7:CI 切换

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm turbo run lint test build --token=${{ secrets.TURBO_TOKEN }} --team=my-team
```

→ 加远端缓存(Vercel Remote Cache 免费 60GB / 月)。

## 迁移期常见痛点

### 1. CI 时间暴涨
**原因**:第一次构建所有包
**解决**:开启 turbo 远端缓存(后续 CI 命中缓存秒过)

### 2. 同事 IDE 卡
**原因**:TS 项目太大,language server 累
**解决**:
- 用 TS Project References + 增量编译
- VSCode 设置 `typescript.tsserver.experimental.enableProjectDiagnostics: false`
- 关掉 `Auto Imports`(性能杀手)

### 3. 第三方 npm 包冲突
**原因**:同一个库被 hoist 到不同位置
**解决**:
- pnpm catalog(统一版本)
- `pnpm dedupe`
- `syncpack` 自动同步版本号

### 4. CI 上 publish 失败
**原因**:Changesets 找不到 base branch
**解决**:`fetch-depth: 0` 完整 history

### 5. 老 repo 还有 CI / issue 移交
**操作**:
- 老 repo 改 README 指向 monorepo + 改 archived
- 用 GitHub `migrate issues` 工具迁移
- Cron 定期同步 issue / star count

## 时间表(参考)

| 阶段 | 耗时 |
|---|---|
| 工具选型 + POC | 1 周 |
| 骨架搭建 + 1 个包迁入验证 | 1 周 |
| 全部 repo 迁入 + 配置统一 | 2-4 周 |
| CI / 缓存 / 远端 publish | 1 周 |
| 团队培训 + 老 repo 归档 | 1 周 |
| **总计** | **6-8 周(10+ 仓库规模)** |

## 推荐先看的真实案例

- Vercel monorepo:https://github.com/vercel/turborepo/tree/main/examples
- Shopify Hydrogen:https://github.com/Shopify/hydrogen
- TanStack(pnpm + Nx):https://github.com/TanStack/query
- Astro(pnpm + Turborepo + Changesets):https://github.com/withastro/astro
