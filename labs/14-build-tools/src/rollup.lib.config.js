// Rollup 配置:发布 npm 包(库作者必读)
// 输出 CJS / ESM / UMD,带 .d.ts 类型,带 sourcemap

import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import terser from '@rollup/plugin-terser'
import { dts } from 'rollup-plugin-dts'

const pkg = require('./package.json')

// 不打进 bundle 的依赖(peerDependencies 必须 external)
const external = [
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.dependencies ?? {}),
  /^node:/,                                          // node:fs / node:path 等
]

export default [
  // ==========================================
  // 1. JS 输出:CJS + ESM(应用使用)
  // ==========================================
  {
    input: 'src/index.ts',
    external,
    output: [
      {
        file: pkg.main,                              // dist/index.cjs
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: pkg.module,                            // dist/index.mjs
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      nodeResolve({ preferBuiltins: true }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.build.json' }),
    ],
  },

  // ==========================================
  // 2. UMD 输出:浏览器 <script> 直接引用
  // ==========================================
  {
    input: 'src/index.ts',
    external: ['react'],                             // UMD 通常只 external 框架
    output: {
      file: pkg.unpkg,                               // dist/index.umd.min.js
      format: 'umd',
      name: 'MyLib',                                 // 挂在 window.MyLib
      globals: { react: 'React' },
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ browser: true }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.build.json' }),
      terser(),
    ],
  },

  // ==========================================
  // 3. .d.ts 类型声明
  // ==========================================
  {
    input: 'src/index.ts',
    output: { file: pkg.types, format: 'esm' },     // dist/index.d.ts
    plugins: [dts()],
  },
]

// ====================================================
// 配套的 package.json 字段(2026 标准)
// ====================================================
/*
{
  "name": "my-lib",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "unpkg": "./dist/index.umd.min.js",

  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./styles.css": "./dist/styles.css"
  },

  "files": ["dist", "README.md"],

  "sideEffects": false,

  "peerDependencies": {
    "react": ">=18"
  },

  "publishConfig": {
    "access": "public",
    "provenance": true                              // npm provenance(2024+ 安全标准)
  }
}
*/

// ====================================================
// 关键经验
// ====================================================
//
// 1. peerDependencies 必须 external,否则用户 bundle 里有 2 个 React
// 2. "exports" 字段是新标准,types 必须放在第一位
// 3. "sideEffects": false 让用户能 tree-shake
// 4. 同时输出 CJS + ESM:
//    - CJS:Node 老版本 / 老 bundler
//    - ESM:现代 bundler / 浏览器
// 5. UMD 输出是为 CDN 用户(unpkg / jsDelivr)
// 6. 用 `publint` / `arethetypeswrong` 检查 package.json 配置是否合规
// 7. 用 `tsup` 可以零配置替代 Rollup(底层 esbuild,极速)
//
// 替代方案:
//   - tsup        — 0 配置,适合简单库
//   - unbuild     — Nuxt 团队出品
//   - microbundle — Preact 团队,适合极简库
//   - Rollup      — 完全控制,适合复杂库(本文件示例)
