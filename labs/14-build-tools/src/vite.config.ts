// 生产级 Vite 配置范本
// 覆盖:React/Vue 框架、env、proxy、SSR、chunks、HMR overlay、size analyzer

import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

export default defineConfig(({ mode, command }) => {
  // 加载 .env.* 文件
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // ============================================
    // 公共配置
    // ============================================
    root: '.',
    base: env.VITE_PUBLIC_PATH || '/',
    publicDir: 'public',

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../src'),
        '~assets': path.resolve(__dirname, '../assets'),
      },
    },

    // ============================================
    // Plugins
    // ============================================
    plugins: [
      react({
        // SWC: React Compiler / decorators / Emotion 都在这里
        plugins: [
          ['@swc/plugin-emotion', {}],
        ],
      }),

      // 仅生产构建启用
      command === 'build' && imageOptimizePlugin(),
      mode === 'analyze' && analyzerPlugin(),
    ].filter(Boolean) as PluginOption[],

    // ============================================
    // CSS
    // ============================================
    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName: command === 'build'
          ? '[hash:base64:6]'
          : '[name]__[local]___[hash:base64:5]',
      },
      preprocessorOptions: {
        scss: {
          additionalData: `@import "@/styles/_variables.scss";`,
        },
      },
      // 比 PostCSS 快 100×
      transformer: 'lightningcss',
    },

    // ============================================
    // Dev server
    // ============================================
    server: {
      port: 3000,
      strictPort: true,                          // 端口被占就报错,不静默切换
      host: '0.0.0.0',                           // 允许局域网访问(手机调试)
      open: false,
      cors: true,
      hmr: {
        overlay: true,                           // 错误时全屏遮罩
      },
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
        '/ws': {
          target: 'ws://localhost:8080',
          ws: true,
          changeOrigin: true,
        },
      },
    },

    // ============================================
    // Build
    // ============================================
    build: {
      target: ['es2020', 'chrome87', 'safari14'],
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: command === 'build' ? 'hidden' : true,

      // chunk size 警告阈值
      chunkSizeWarningLimit: 600,

      // CSS 拆分
      cssCodeSplit: true,

      // 用 esbuild 极速压缩(Vite 默认)
      minify: 'esbuild',
      // 或换 terser(更小但慢)
      // minify: 'terser',
      // terserOptions: { compress: { drop_console: true } },

      rollupOptions: {
        // 多入口
        // input: { main: 'index.html', admin: 'admin.html' },

        output: {
          // 智能 chunk:把大依赖拆出来,利于浏览器缓存
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) return 'react'
              if (id.includes('@tanstack/')) return 'tanstack'
              if (id.includes('@radix-ui/')) return 'radix'
              if (id.match(/[\\/]lodash|date-fns|dayjs/)) return 'utils'
              return 'vendor'
            }
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: ({ name }) => {
            if (/\.(png|jpe?g|svg|webp|avif|gif)$/.test(name ?? '')) {
              return 'assets/img/[name]-[hash][extname]'
            }
            if (/\.(woff2?|ttf|otf)$/.test(name ?? '')) {
              return 'assets/fonts/[name]-[hash][extname]'
            }
            return 'assets/[name]-[hash][extname]'
          },
        },
      },
    },

    // ============================================
    // SSR(如果跑 Vite SSR 模式)
    // ============================================
    ssr: {
      noExternal: ['some-esm-only-pkg'],
    },

    // ============================================
    // 依赖预构建
    // ============================================
    optimizeDeps: {
      include: ['react', 'react-dom'],
      exclude: ['some-esm-package-that-shouldnt-be-prebundled'],
    },

    // 测试集成(vitest)
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./test-setup.ts'],
    } as any,
  }
})

// ====================================================
// 自定义 plugin 示例(简化版,完整在 custom-vite-plugin.ts)
// ====================================================

function imageOptimizePlugin(): PluginOption {
  return {
    name: 'image-optimize',
    async transform(_code, id) {
      if (!/\.(png|jpg|jpeg)$/.test(id)) return
      // 真实场景接 sharp / squoosh
      return null
    },
  }
}

function analyzerPlugin(): PluginOption {
  // 真实场景用 rollup-plugin-visualizer
  return {
    name: 'analyzer',
    closeBundle() {
      console.log('Build done. Generate report...')
    },
  }
}
