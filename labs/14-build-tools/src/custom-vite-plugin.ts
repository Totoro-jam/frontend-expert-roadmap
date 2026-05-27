// 3 个生产可用的自定义 Vite plugin

import type { Plugin, ResolvedConfig } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'

// ====================================================
// Plugin 1:SVG → React Component(轻量版 SVGR)
// ====================================================
export function viteSvgr(): Plugin {
  return {
    name: 'vite-svg-to-react',
    enforce: 'pre',

    async load(id) {
      if (!id.endsWith('.svg?react')) return

      const filePath = id.replace(/\?react$/, '')
      const svg = await fs.readFile(filePath, 'utf-8')

      // 极简改写,真实场景用 @svgr/core
      const componentBody = svg
        .replace('<svg', '<svg {...props} ref={ref}')
        .replace(/class=/g, 'className=')
        .replace(/(\w+)-(\w+)=/g, (_, p1, p2) => `${p1}${p2[0].toUpperCase()}${p2.slice(1)}=`)

      return `
        import React, { forwardRef } from 'react'
        const Icon = forwardRef((props, ref) => (${componentBody}))
        export default Icon
      `
    },
  }
}

// 用法:
// import LogoIcon from './logo.svg?react'
// <LogoIcon width={32} fill="currentColor" />

// ====================================================
// Plugin 2:HTML 注入(把环境变量 / 版本号注入 <head>)
// ====================================================
export function viteHtmlInject(env: Record<string, string>): Plugin {
  return {
    name: 'vite-html-inject',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { name: 'app-version', content: env.npm_package_version ?? 'dev' },
              injectTo: 'head',
            },
            {
              tag: 'script',
              attrs: { type: 'application/json', id: 'env-config' },
              children: JSON.stringify({
                API_URL: env.VITE_API_URL,
                FEATURE_FLAGS: env.VITE_FEATURES?.split(','),
              }),
              injectTo: 'head',
            },
          ],
        }
      },
    },
  }
}

// 客户端读取:
// const env = JSON.parse(document.getElementById('env-config')!.textContent!)

// ====================================================
// Plugin 3:打包后生成 build 报告(版本 + 时间 + 文件清单)
// ====================================================
export function viteBuildReport(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'vite-build-report',
    apply: 'build',

    configResolved(c) {
      config = c
    },

    async writeBundle(_options, bundle) {
      const files = Object.values(bundle).map((file: any) => ({
        name: file.fileName,
        size: file.type === 'chunk' ? file.code.length : file.source?.length ?? 0,
        type: file.type,
      }))

      const report = {
        generatedAt: new Date().toISOString(),
        viteVersion: require('vite/package.json').version,
        mode: config.mode,
        files: files.sort((a, b) => b.size - a.size),
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      }

      await fs.writeFile(
        path.resolve(config.build.outDir, 'build-report.json'),
        JSON.stringify(report, null, 2),
      )

      // 控制台漂亮输出
      console.log('\n[build-report] Top 10 files:')
      report.files.slice(0, 10).forEach(f =>
        console.log(`  ${(f.size / 1024).toFixed(2).padStart(8)} KB  ${f.name}`),
      )
    },
  }
}

// ====================================================
// Vite Plugin 完整 Hook 列表
// ====================================================
//
// 通用 hooks(Rollup 兼容):
//   options          — 修改 input options
//   buildStart       — 构建开始
//   resolveId        — 解析 import id
//   load             — 加载模块内容
//   transform        — 转换代码
//   buildEnd         — 构建结束
//   generateBundle   — 生成 bundle 但未写入
//   writeBundle      — 写入磁盘后
//
// Vite 独有:
//   config           — 修改 vite config
//   configResolved   — config 已完全解析
//   configureServer  — 添加 dev server middleware
//   transformIndexHtml — 改 index.html
//   handleHotUpdate  — 控制 HMR 行为
//
// enforce: 'pre' / 'post' / 默认 — 控制插件顺序
// apply: 'serve' / 'build' / 默认 — 控制生效场景
//
// 完整文档:https://vitejs.dev/guide/api-plugin.html
