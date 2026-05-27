// 现代 Webpack 5 配置(2026)
// 用 SWC loader 提速,避免 babel-loader 的瓶颈

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const { ModuleFederationPlugin } = require('webpack').container

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production'

  return {
    mode: isProd ? 'production' : 'development',
    entry: './src/index.tsx',

    output: {
      path: path.resolve(__dirname, '../dist'),
      filename: isProd ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
      chunkFilename: isProd ? 'js/[name].[contenthash:8].chunk.js' : 'js/[name].chunk.js',
      assetModuleFilename: 'assets/[name].[contenthash:8][ext]',
      publicPath: '/',
      clean: true,                                 // 替代 clean-webpack-plugin
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
      alias: {
        '@': path.resolve(__dirname, '../src'),
      },
    },

    // ==========================================
    // Source map
    // ==========================================
    devtool: isProd ? 'hidden-source-map' : 'eval-cheap-module-source-map',

    // ==========================================
    // Loader
    // ==========================================
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          loader: 'swc-loader',                    // 比 babel-loader 快 10×+
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic' } },
              target: 'es2020',
            },
          },
        },

        {
          test: /\.module\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            {
              loader: 'css-loader',
              options: {
                modules: {
                  localIdentName: isProd ? '[hash:base64:6]' : '[name]__[local]__[hash:base64:5]',
                  exportLocalsConvention: 'camelCase',
                },
              },
            },
            'postcss-loader',
          ],
        },

        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
            'postcss-loader',
          ],
        },

        // Webpack 5 内置 Asset Modules,替代 file-loader / url-loader
        {
          test: /\.(png|jpe?g|gif|webp|avif)$/i,
          type: 'asset',
          parser: { dataUrlCondition: { maxSize: 8 * 1024 } },   // < 8KB inline base64
        },

        {
          test: /\.svg$/,
          issuer: /\.[jt]sx?$/,
          use: ['@svgr/webpack'],                  // SVG → React component
        },

        {
          test: /\.(woff2?|ttf|eot)$/,
          type: 'asset/resource',
        },
      ],
    },

    // ==========================================
    // Optimization
    // ==========================================
    optimization: {
      minimize: isProd,
      minimizer: [
        new TerserPlugin({
          parallel: true,
          terserOptions: {
            compress: { drop_console: isProd, drop_debugger: true },
            format: { comments: false },
          },
          extractComments: false,
        }),
        new CssMinimizerPlugin(),
      ],

      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: 'react',
            priority: 20,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            priority: 10,
          },
          common: {
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      },

      runtimeChunk: 'single',                      // webpack runtime 独立成 chunk
      moduleIds: 'deterministic',                  // 稳定的 module id(利于长缓存)
    },

    // ==========================================
    // Plugins
    // ==========================================
    plugins: [
      new HtmlWebpackPlugin({
        template: 'index.html',
        inject: 'body',
        minify: isProd,
      }),
      isProd && new MiniCssExtractPlugin({
        filename: 'css/[name].[contenthash:8].css',
        chunkFilename: 'css/[id].[contenthash:8].css',
      }),
      env.analyze && new BundleAnalyzerPlugin({ analyzerMode: 'static' }),

      // ============ Module Federation ============
      // 主应用作为「host」消费其他应用的 module
      env.mf && new ModuleFederationPlugin({
        name: 'host',
        remotes: {
          dashboard: 'dashboard@http://localhost:3001/remoteEntry.js',
        },
        shared: {
          react: { singleton: true, requiredVersion: '^18.0.0' },
          'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        },
      }),
    ].filter(Boolean),

    // ==========================================
    // Dev server
    // ==========================================
    devServer: {
      port: 3000,
      hot: true,                                   // HMR
      open: false,
      historyApiFallback: true,                    // SPA 路由刷新 404 修复
      compress: true,
      client: {
        overlay: { errors: true, warnings: false },
      },
      proxy: [
        {
          context: ['/api'],
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      ],
    },

    // ==========================================
    // Caching
    // ==========================================
    cache: {
      type: 'filesystem',                          // 二次启动飞快
      buildDependencies: { config: [__filename] },
    },

    performance: {
      hints: isProd ? 'warning' : false,
      maxAssetSize: 250_000,                       // 250KB
      maxEntrypointSize: 250_000,
    },
  }
}

// ====================================================
// 性能优化总结
// ====================================================
//
// 1. swc-loader 替代 babel-loader     → 10-20× 提速
// 2. cache: 'filesystem'              → 二次启动从 30s → 3s
// 3. splitChunks                      → 利于缓存(改一个组件不需要重新下载 react)
// 4. contenthash                      → 浏览器长缓存(immutable)
// 5. analyze 模式                     → 定位 bundle 大的元凶
// 6. 大项目可换 Rspack(配置兼容,速度 Rust 级)
