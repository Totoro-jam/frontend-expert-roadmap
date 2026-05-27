// Style Dictionary 配置:tokens/*.json → CSS / SCSS / TS / iOS / Android
// 跑:npx style-dictionary build

const StyleDictionary = require('style-dictionary')

// =====================================================
// 自定义 transform:把 darkValue 抽出来成 dark token
// =====================================================
StyleDictionary.registerTransform({
  name: 'value/darkmode',
  type: 'value',
  transitive: true,
  matcher: t => t.darkValue !== undefined,
  transformer: t => t.value,                // 默认值不变(light)
})

// =====================================================
// 自定义 format:输出 CSS with 两个主题
// =====================================================
StyleDictionary.registerFormat({
  name: 'css/themed-variables',
  formatter({ dictionary }) {
    const allTokens = dictionary.allTokens.filter(t => !t.name.startsWith('color-'))

    const lightColor = dictionary.allTokens
      .filter(t => t.name.startsWith('color-'))
      .map(t => `  --${t.name}: ${t.value};`)
      .join('\n')

    const darkColor = dictionary.allTokens
      .filter(t => t.name.startsWith('color-') && t.darkValue !== undefined)
      .map(t => {
        // resolve dark value 中的引用,例如 {color.gray.900}
        let v = t.darkValue
        if (typeof v === 'string' && v.startsWith('{')) {
          const refPath = v.slice(1, -1).replace(/\./g, '-')
          v = `var(--${refPath})`
        }
        return `  --${t.name}: ${v};`
      })
      .join('\n')

    const others = allTokens
      .map(t => `  --${t.name}: ${t.value};`)
      .join('\n')

    return `:root {
${others}
${lightColor}
}

[data-theme='dark'] {
${darkColor}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${darkColor}
  }
}
`
  },
})

// =====================================================
// 自定义 format:TypeScript const + type
// =====================================================
StyleDictionary.registerFormat({
  name: 'typescript/strict',
  formatter({ dictionary }) {
    const lines = dictionary.allTokens.map(t => `  '${t.name}': '${t.value}'`).join(',\n')
    return `export const tokens = {
${lines}
} as const

export type TokenName = keyof typeof tokens
`
  },
})

// =====================================================
// 配置
// =====================================================
module.exports = {
  source: ['tokens/**/*.json'],

  platforms: {
    // ---- CSS Variables(浏览器主要消费)----
    css: {
      transformGroup: 'css',
      transforms: ['attribute/cti', 'name/cti/kebab', 'value/darkmode'],
      buildPath: 'dist/css/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/themed-variables',
        },
      ],
    },

    // ---- SCSS variables ----
    scss: {
      transformGroup: 'scss',
      buildPath: 'dist/scss/',
      files: [{ destination: '_tokens.scss', format: 'scss/variables' }],
    },

    // ---- TypeScript const(运行时用,如 inline style)----
    ts: {
      transformGroup: 'js',
      transforms: ['attribute/cti', 'name/cti/kebab'],
      buildPath: 'dist/ts/',
      files: [{ destination: 'tokens.ts', format: 'typescript/strict' }],
    },

    // ---- Tailwind 配置(merge 进 tailwind.config.js)----
    tailwind: {
      transformGroup: 'js',
      buildPath: 'dist/tailwind/',
      files: [{ destination: 'theme.json', format: 'json/nested' }],
    },

    // ---- iOS Swift ----
    ios: {
      transformGroup: 'ios-swift',
      buildPath: 'dist/ios/',
      files: [{ destination: 'Tokens.swift', format: 'ios-swift/class.swift', className: 'Tokens' }],
    },

    // ---- Android XML ----
    android: {
      transformGroup: 'android',
      buildPath: 'dist/android/',
      files: [{ destination: 'colors.xml', format: 'android/colors' }],
    },

    // ---- Documentation JSON(给 Storybook / 文档站消费)----
    docs: {
      transformGroup: 'js',
      buildPath: 'dist/docs/',
      files: [{ destination: 'tokens.json', format: 'json/flat' }],
    },
  },
}

// =====================================================
// 输出示例:tokens.css
// =====================================================
//
// :root {
//   --spacing-4: 16px;
//   --radius-md: 8px;
//   --color-blue-500: #3b82f6;
//   --color-bg-canvas: #f9fafb;
//   --color-text-primary: #111827;
//   --color-action-primary: #3b82f6;
// }
//
// [data-theme='dark'] {
//   --color-bg-canvas: var(--color-gray-900);
//   --color-text-primary: var(--color-gray-50);
//   ...
// }
//
// @media (prefers-color-scheme: dark) {
//   :root:not([data-theme='light']) { ... }
// }
