# Changesets 完整配置 + CI

## 1. 安装

```sh
pnpm add -Dw @changesets/cli @changesets/changelog-github
pnpm changeset init
```

## 2. 配置 `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    { "repo": "my-org/my-monorepo" }
  ],
  "commit": false,
  "fixed": [],
  "linked": [["@my/ui", "@my/icons"]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@my/web", "@my/docs"]
}
```

字段说明:
- `linked`:这几个包永远同步版本号(就像 React 和 ReactDOM)
- `fixed`:更严格的 linked,永远一致
- `ignore`:这几个包不要 publish(私有 app)
- `updateInternalDependencies`:依赖的内部包 patch 升级时,自己也 patch++

## 3. 开发者流程

```sh
# 写完代码,提交前
pnpm changeset

# 交互问:
#   - 哪些包变化了?(spacebar 选 / a 全选)
#   - 各自是 major/minor/patch?
#   - 写一段 changelog 描述
#
# 自动生成 .changeset/<random-name>.md,提交进 PR
```

## 4. CI 自动化

`.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  id-token: write           # for npm provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # changesets 需要完整 git history

      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build test lint --filter='./packages/*'

      - uses: changesets/action@v1
        id: changesets
        with:
          publish: pnpm changeset publish
          version: pnpm changeset version
          commit: 'chore: version packages'
          title: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

## 5. 工作流程示意

```
开发者 PR:
  feat: add Button variant
  + .changeset/lazy-pandas-jump.md   ← changeset 文件

         ↓ merge to main

CI 检测到 changesets:
  自动创建 PR「chore: version packages」
    - 更新各包 package.json 版本号
    - 生成 CHANGELOG.md
    - 删除 .changeset/lazy-pandas-jump.md

         ↓ 维护者 review + merge

CI 检测无 changeset + 版本号已变:
  自动 npm publish
  自动创建 GitHub Release
```

## 6. pre-release(发 beta / alpha)

```sh
pnpm changeset pre enter beta
pnpm changeset                # 正常创建
pnpm changeset version        # 版本会变成 x.y.z-beta.0
pnpm changeset publish

# 退出 pre-release
pnpm changeset pre exit
```

## 7. snapshot 发布(每个 commit 都发一个一次性版本)

```sh
pnpm changeset version --snapshot pr-123
pnpm changeset publish --tag pr-123 --no-git-tag
```

→ 发布版本 `0.0.0-pr-123-20260101120000`,适合 PR 预览。

## 8. 常见问题

- **Q:Changesets 适合 monorepo 还是单 repo?**
  A:都行。单 repo 也能用,只是只有一个包要 version。

- **Q:不用 Changesets,有什么替代?**
  A:semantic-release(根据 commit message 决定版本)、release-please(Google,PR-based)、Lerna(老牌)

- **Q:为什么不直接 `npm version`?**
  A:monorepo 里包的依赖关系自动处理才是关键。手动 bump 一个版本号,所有依赖它的包 package.json 都要改,容易漏。
