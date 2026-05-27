# 微前端选型决策树

> 大部分项目不需要微前端。
> 微前端不是「更好的代码组织」,是「不得不付出的隔离成本」换「独立部署」。

---

## 第一步:你真的需要微前端吗?

```
你的痛点是什么?
│
├── 「巨石应用 build 太慢」
│   → 先试 Vite/Rspack、bundle 拆 chunk、incremental build。一般够了。
│
├── 「不同模块用了不同技术栈」
│   → 真痛点。微前端 ✓
│
├── 「不同团队改一个仓库会冲突」
│   → 先试 monorepo(pnpm + Turborepo)+ CODEOWNERS。一般够了。
│
├── 「需要独立部署 / 独立发版」
│   → 真痛点。微前端 ✓(但先想想是否真的不能合并发版)
│
├── 「想要服务化感觉」
│   → 不,你只是想要更清晰的目录结构。
│
└── 「老系统迁移,新页面用 React」
    → 真痛点。qiankun / iframe ✓
```

---

## 第二步:技术选型

```
需要支持哪些技术栈?
│
├── 全部 React / 全部 Vue
│   │
│   ├── 全部 Webpack/Rspack
│   │   → Module Federation (优先,生态最强)
│   │
│   ├── 有 Vite
│   │   → vite-plugin-federation 或 Native Federation (Angular 思路)
│   │
│   └── 主应用是 SSR (Next.js)
│       → Next-Federation 或考虑 monorepo 替代
│
├── 多框架混搭 (React + Vue + Angular)
│   │
│   ├── 需要强样式 / JS 隔离
│   │   → qiankun (国内主流) / single-spa
│   │
│   ├── 想最隔离 / 老系统
│   │   → iframe / wujie / micro-app
│   │
│   └── 想最标准化
│       → Web Components(各框架编译成 custom element)
│
└── 主应用是非 SPA(rails / php / java 渲染)
    → iframe (最稳)/ Web Components / qiankun(部分嵌入模式)
```

---

## 第三步:依赖关系

```
子应用之间有共享 state 吗?
│
├── 完全独立(每个子应用是一个独立产品)
│   → iframe / Module Federation 简单模式
│
├── 共享 user / theme / locale 等全局
│   → qiankun globalState / Module Federation shared store
│   → BroadcastChannel + 类型化 EventBus
│
└── 业务紧耦合(子应用 A 改了订单,子应用 B 立刻看到)
    → 你可能不需要微前端,需要的是好状态管理
    → 真要拆 → 中心化 store (Zustand) + 通过 EventBus 同步
```

---

## 第四步:成本评估

| 成本项 | Module Federation | qiankun | iframe |
|---|---|---|---|
| 上手 | 中 | 中(中文文档好) | 简单 |
| 沙箱隔离 | 弱(shared 不慎就炸) | 强 | 最强 |
| 性能开销 | 低 | 中(Proxy 沙箱) | 高(独立 runtime) |
| 跨框架支持 | 弱 | 强 | 强 |
| 路由复杂度 | 中 | 中 | 高(主子同步难) |
| 部署灵活 | 强(manifest) | 强 | 中 |
| 调试 | 难(MF chunk 链复杂) | 中 | 易(独立 devtools) |
| 多团队接入 | 中 | 易 | 易 |
| SEO/SSR | 难 | 难 | 易(子应用各自 SSR) |
| 生态/社区 | Webpack 系强,Vite 一般 | 国内强 | 永久兼容 |

---

## 第五步:反向问题(何时合并)

| 信号 | 行动 |
|---|---|
| 团队从 5 个缩到 2 个 | 合并 MFE → monorepo |
| 子应用之间共享代码越来越多 | 提取 shared 包 |
| 独立发布的频次不再重要 | 合并 deploy |
| 沙箱 bug 占 oncall 30% | 撤掉沙箱,改 npm 包 |
| 团队对调试 MFE 抱怨 > 收益 | 合并 |

**关键原则**:微前端是「为团队规模而妥协」的架构,人少就该回退。

---

## 真实案例

### Spotify(Backstage)
- 内部开发者平台,数十个插件由不同团队开发
- 用 plugin 系统(本质 MFE 思想,但 npm 包形式)
- 选择不用运行时 MFE,因为他们能接受统一发布

### 阿里(Bigfish, 蚂蚁)
- 业务多、团队大 → qiankun 重度使用
- 把 qiankun 包装成产品级 framework

### 字节(Garfish)
- 类似 qiankun,自研
- 飞书内部用得多

### Zalando(Tailor)
- SSR 时代的 MFE,服务端片段组合
- 已经较少新用

### Spotify 反例
- 早期 web 端用过 MFE,后来撤了
- 因为团队规模可控,monorepo 更简单

---

## 一句话总结

> **能不上微前端就别上**;
> 上了,选 Module Federation(同栈)/ qiankun(多栈);
> 当团队规模回退,主动撤掉。
