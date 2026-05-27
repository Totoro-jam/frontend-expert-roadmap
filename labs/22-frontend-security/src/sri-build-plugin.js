// Subresource Integrity:构建时自动生成 hash 并注入 <script integrity=>
// Webpack / Vite / Rollup 都有现成插件,这里讲原理 + 自定义

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// =====================================================
// 1. SRI 原理
// =====================================================
//
// <script
//   src="https://cdn.example.com/lib.js"
//   integrity="sha384-OQVuAFXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
//   crossorigin="anonymous"
// ></script>
//
// 浏览器:
//   1. 下载 lib.js
//   2. 计算 SHA-384(支持 256/384/512)
//   3. 用 base64 编码
//   4. 与 integrity 值对比
//   5. 不匹配 → 拒绝执行(报 CSP-like 错)
//
// crossorigin="anonymous" 必须有(对跨域资源)
//   - 跨域 fetch 默认不带 cookie
//   - 没 crossorigin → 浏览器 opaque response → 拿不到内容 → SRI 失败

// =====================================================
// 2. 计算 hash
// =====================================================
function computeIntegrity(content, algorithm = 'sha384') {
  const hash = crypto.createHash(algorithm).update(content).digest('base64')
  return `${algorithm}-${hash}`
}

// 命令行单次:
//   cat lib.js | openssl dgst -sha384 -binary | openssl base64 -A

// =====================================================
// 3. 简易 SRI 生成器(post-build)
// =====================================================
async function injectSri(htmlPath, distDir, cdnPrefix) {
  let html = await fs.promises.readFile(htmlPath, 'utf-8')

  // 匹配 <script src="..."> 和 <link rel="stylesheet" href="...">
  const scriptRegex = /<script\s+([^>]*?)src="([^"]+)"([^>]*?)><\/script>/g
  const linkRegex = /<link\s+([^>]*?)rel="stylesheet"\s+([^>]*?)href="([^"]+)"([^>]*?)\/?>/g

  html = html.replace(scriptRegex, (match, before, src, after) => {
    if (/integrity=/.test(match)) return match                  // 已有
    const localPath = resolveAsset(src, distDir, cdnPrefix)
    if (!localPath) return match                                 // 跨域且无法计算
    const content = fs.readFileSync(localPath)
    const integrity = computeIntegrity(content)
    return `<script ${before}src="${src}" integrity="${integrity}" crossorigin="anonymous"${after}></script>`
  })

  html = html.replace(linkRegex, (match, b1, b2, href, after) => {
    if (/integrity=/.test(match)) return match
    const localPath = resolveAsset(href, distDir, cdnPrefix)
    if (!localPath) return match
    const content = fs.readFileSync(localPath)
    const integrity = computeIntegrity(content)
    return `<link ${b1}rel="stylesheet" ${b2}href="${href}" integrity="${integrity}" crossorigin="anonymous"${after} />`
  })

  await fs.promises.writeFile(htmlPath, html, 'utf-8')
  console.log('[sri] injected for', htmlPath)
}

function resolveAsset(url, distDir, cdnPrefix) {
  // 处理:绝对 URL(CDN) / 相对路径 / 根路径
  if (url.startsWith('http')) {
    if (!cdnPrefix || !url.startsWith(cdnPrefix)) return null
    const relative = url.slice(cdnPrefix.length)
    return path.join(distDir, relative)
  }
  if (url.startsWith('/')) return path.join(distDir, url.slice(1))
  return path.join(distDir, url)
}

// =====================================================
// 4. Webpack 插件(简化版,生产用 webpack-subresource-integrity)
// =====================================================
class SimpleSriPlugin {
  constructor(opts = {}) {
    this.algorithm = opts.algorithm ?? 'sha384'
    this.htmlGlob = opts.htmlGlob ?? /\.html$/
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap('SimpleSriPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'SimpleSriPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets) => {
          // 1. 计算每个 chunk 的 SRI
          const integrityMap = {}
          for (const [filename, source] of Object.entries(assets)) {
            if (/\.(js|css)$/.test(filename)) {
              integrityMap[filename] = computeIntegrity(source.source(), this.algorithm)
            }
          }
          // 2. 暴露给 HtmlWebpackPlugin
          compilation.sriHashes = integrityMap
        },
      )

      // 3. 注入到 HTML(配合 HtmlWebpackPlugin)
      const HtmlWebpackPlugin = require('html-webpack-plugin')
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tap(
        'SimpleSriPlugin',
        (data) => {
          const inject = (tag) => {
            const src = tag.attributes.src ?? tag.attributes.href
            if (!src) return tag
            const filename = src.split('/').pop()
            const integrity = compilation.sriHashes[filename]
            if (integrity) {
              tag.attributes.integrity = integrity
              tag.attributes.crossorigin = 'anonymous'
            }
            return tag
          }
          data.assetTags.scripts = data.assetTags.scripts.map(inject)
          data.assetTags.styles = data.assetTags.styles.map(inject)
        },
      )
    })
  }
}

// 用法:
// plugins: [
//   new HtmlWebpackPlugin(),
//   new SimpleSriPlugin(),
// ]

// =====================================================
// 5. Vite 插件
// =====================================================
function viteSri(opts = {}) {
  const algorithm = opts.algorithm ?? 'sha384'
  return {
    name: 'vite-sri',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      this.sriMap = {}
      for (const [filename, chunk] of Object.entries(bundle)) {
        const content = chunk.type === 'chunk' ? chunk.code : chunk.source
        this.sriMap[filename] = computeIntegrity(content, algorithm)
      }
    },
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html
      return html.replace(
        /<(script|link)([^>]*?)(?:src|href)="([^"]+)"([^>]*?)>/g,
        (match, tag, before, url, after) => {
          const filename = url.replace(/^\//, '').split('?')[0]
          const integrity = this.sriMap?.[filename]
          if (!integrity) return match
          return `<${tag}${before}${tag === 'script' ? 'src' : 'href'}="${url}" integrity="${integrity}" crossorigin="anonymous"${after}>`
        },
      )
    },
  }
}

// vite.config.ts
// import { defineConfig } from 'vite'
// export default defineConfig({
//   plugins: [viteSri()],
// })

// =====================================================
// 6. 现成方案(推荐)
// =====================================================
//
// Webpack: webpack-subresource-integrity (官方维护)
//   const SubresourceIntegrityPlugin = require('webpack-subresource-integrity')
//   plugins: [new SubresourceIntegrityPlugin({ hashFuncNames: ['sha384'] })]
//
// Vite: vite-plugin-sri3
// Rollup: rollup-plugin-sri
// Next.js: 在 next.config.js 加 crossOrigin: 'anonymous' + 自定义 head 注入
// Astro: 自带支持
// Eleventy: eleventy-plugin-sri

// =====================================================
// 7. 第三方 CDN 资源(没有 build 入口)
// =====================================================
//
// 1. 在线工具:https://www.srihash.org/
// 2. 命令行:
//    curl -s https://cdn.example.com/jquery.js | openssl dgst -sha384 -binary | openssl base64 -A
// 3. npm 包:integrity (cli)
// 4. 提前定义版本不可变的 URL(jquery@3.6.0.js 而不是 latest)
//    否则每次更新都失效

// =====================================================
// 8. SRI vs CSP nonce
// =====================================================
//
// CSP nonce:防止意外加载未授权脚本(信任你的 HTML)
// SRI:防止已授权脚本被篡改(信任你的源代码但不信网络)
//
// 应当都开 + 配合 strict-dynamic:
//   script-src 'nonce-xxx' 'strict-dynamic'
//   每个 <script> 带 nonce + integrity

// =====================================================
// 9. 真实场景:动态 chunk 怎么办
// =====================================================
//
// Webpack 拆 chunk:main.js -> import('./Modal') -> Modal.chunk.js
// 浏览器跑 main 时动态 fetch Modal.chunk.js
// 没经过 HTML → integrity 怎么加?
//
// Webpack subresource-integrity 插件自动:
//   在 main 里把 chunk 的 hash 写进 __webpack_require__.sri map
//   动态 import 时把 hash 设到 <script integrity=>

// =====================================================
// 10. 失败处理
// =====================================================
//
// SRI 失败 → 浏览器拒绝执行 → 业务白屏
// 必须有 fallback / 监控:
//   window.addEventListener('error', e => {
//     if (e.target?.integrity) {
//       sendBeacon('/sri-fail', {
//         src: e.target.src,
//         integrity: e.target.integrity,
//       })
//     }
//   }, true)

// =====================================================
// 11. 反 SRI 攻击思路(知道才能防)
// =====================================================
//
// - 攻击者无法直接绕过 SRI(浏览器强制)
// - 但能让你不加 SRI:
//   - 通过 PR 注入 <script src> 无 integrity
//   - 通过 CMS 让管理员粘第三方 snippet
// → eslint rule:禁止任何 <script src 没 integrity 进 main bundle

module.exports = { computeIntegrity, injectSri, SimpleSriPlugin, viteSri }
