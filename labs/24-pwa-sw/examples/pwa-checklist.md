# PWA 上线 checklist

> 不是「装上 SW 就完事」。下面这套清单是「能上生产、能扛事故、能持续运维」的最小标准。

---

## 0. 上线前必须确认

```
[ ] HTTPS(localhost 也算)
[ ] manifest.webmanifest 200 + 正确 Content-Type
[ ] sw.js 路径决定 scope(放根目录 → 全站可控)
[ ] sw.js 响应头:Cache-Control: no-cache 或 max-age=0
[ ] 已经 staging 环境跑过至少 1 周
[ ] 准备好 kill switch 应急方案
[ ] 准备好 /reset 页面给客服指引
```

---

## 1. Manifest 完整性

```
[ ] name(完整名,≥3 字符)
[ ] short_name(≤12 字符,首屏图标用)
[ ] description
[ ] start_url(带 ?source=pwa 追踪)
[ ] id(显式指定,否则浏览器从 start_url 推断,易踩坑)
[ ] scope(限定 SW 控制范围)
[ ] display: standalone(或 display_override 进阶)
[ ] background_color(splash 屏背景,要和首屏首像素接近)
[ ] theme_color(状态栏色)
[ ] icons:必有 192 + 512(any),应有 maskable + monochrome
[ ] screenshots:narrow + wide 各 1 张(否则桌面 Edge 安装 UI 体验差)
[ ] categories
```

**iOS 额外**(manifest 不够,要 meta):
```html
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="MyApp">
```

进阶字段(2026):
```
[ ] shortcuts(右键 / 长按图标的快捷动作)
[ ] share_target(成为系统分享目标)
[ ] file_handlers(打开文件类型)
[ ] protocol_handlers(注册自定义协议)
[ ] launch_handler(navigate-existing / focus-existing)
[ ] edge_side_panel(Edge 侧边栏)
[ ] handle_links: preferred(系统内链接默认用 PWA 打开)
```

验证:
- Chrome DevTools → Application → Manifest:看是否报 warning
- https://manifest-validator.appspot.com/ 校验
- Lighthouse PWA audit ≥ 90

---

## 2. Service Worker 注册

```
[ ] 注册时机:页面 'load' 事件后(不抢主线程)
[ ] updateViaCache: 'none'(关键,否则 sw.js 自己被缓存就无法更新)
[ ] type: 'module'(ES module SW)或 'classic'(看你的构建)
[ ] 注册失败有 catch + 上报
[ ] 错误码完整(浏览器不支持 / HTTPS 缺失 / scope 越界)
```

```ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      // 后续监听 updatefound / controllerchange
    } catch (err) {
      Sentry.captureException(err)
    }
  })
}
```

---

## 3. SW 缓存策略

每个资源类型必须有明确策略,不可「全交给 SW 自己看着办」:

```
[ ] HTML(navigation)→ NetworkFirst + 离线兜底 offline.html
[ ] JS / CSS(hash 文件名)→ CacheFirst + Expiration 30 天
[ ] 图片 → CacheFirst + Expiration + maxEntries 限额(避免占爆配额)
[ ] 字体 → CacheFirst + 1 年
[ ] API GET → NetworkFirst 或 SWR(看实时性要求)
[ ] API POST/PUT/DELETE → NetworkOnly + BackgroundSync 排队(写场景)
[ ] /admin /auth/callback → 完全不进 SW(NavigationRoute denylist)
[ ] 第三方资源(Google Fonts / CDN)→ 单独命名 cache + opaque response 处理
```

**安全**:
```
[ ] 不缓存 Authorization 相关 response
[ ] 不缓存 Set-Cookie 的 response
[ ] 不缓存 Cache-Control: private 的 response
[ ] Range request(视频)直接 passthrough,不要全缓存
[ ] 查询参数会污染 cache key → 必要时 strip 或自定义 key
```

---

## 4. 更新流程

```
[ ] sw.js 路径不变(全站永远是 /sw.js)
[ ] 内容变化 → 浏览器自动重启 install
[ ] updatefound → 监听新版本就绪
[ ] 选择:
    A. 自动更新(skipWaiting + clients.claim) → 适合工具类
    B. 提示用户「有新版本」点按钮才更新 → 适合编辑器类
[ ] controllerchange 单例 reload(避免双 reload)
[ ] 24h 主动 update() 一次(用户长时间不关 tab)
[ ] 切换前台时(visibilitychange)check update
```

---

## 5. 安装提示(beforeinstallprompt)

```
[ ] 监听 beforeinstallprompt + preventDefault 存住 event
[ ] 不在首屏自动弹(用户没建立信任)
[ ] 至少 3 次访问 + 30 天不重复才弹
[ ] 弹之前有上下文说明(为什么装、装了有什么好处)
[ ] 用户 dismissed 记录,N 天内不再问
[ ] appinstalled 事件 → 上报
[ ] iOS 单独教学(没有 prompt,要画分享按钮 + 「添加到主屏幕」步骤)
```

---

## 6. 离线体验

```
[ ] 离线 fallback 页面(/offline.html)预缓存
[ ] 关键页面有 stale 数据展示能力(SWR)
[ ] 用户状态指示器:在线 / 离线 / 同步中 / 同步失败
[ ] navigator.onLine 不可信 → 用 /api/ping HEAD 主动探活
[ ] 关键 mutation(写操作)用 BackgroundSync 排队
[ ] 排队失败有 UI 反馈(不要 silent fail)
[ ] 服务端做幂等(去重 key,避免重试导致重复)
```

---

## 7. Web Push(如启用)

```
[ ] VAPID 公私钥已生成,私钥不进 git
[ ] 申请权限时机:user gesture 内(点订阅按钮),不是进站就问
[ ] 申请文案有上下文(为什么要权限)
[ ] 已订阅 user 不再重复申请
[ ] subscription 上报后端 + DB 存储
[ ] pushsubscriptionchange 事件处理(endpoint 失效自动续订)
[ ] 后端发送有 410 / 404 处理(过期就删)
[ ] notificationclick 找到已打开 client 优先 focus,否则 openWindow
[ ] 测试 push 按钮(订阅后立即收一条验证)
[ ] iOS 16.4+ 用户:必须先「添加到主屏幕」才能用 push
[ ] 不发垃圾(频率上限、用户可关、可订阅特定 topic)
```

---

## 8. 性能

```
[ ] sw.js 体积 ≤ 50 KB(gzip)
[ ] precache 体积 ≤ 5 MB(否则用户首次装慢)
[ ] precache 不要塞大图片 / 视频(用 runtime cache + 配额)
[ ] activate 清旧 cache(避免无限增长)
[ ] navigator.storage.estimate() 监控 quota 使用率
[ ] 接近 quota 时 LRU 清理(否则浏览器会一次清光)
```

---

## 9. 监控 / 可观测性

```
[ ] SW install / activate / 更新 上报
[ ] SW 错误上报(self.addEventListener('error') + Sentry)
[ ] SW 注册数(后端 endpoint 统计)
[ ] 离线发生率 / 时长
[ ] 同步成功率 / 失败率
[ ] PWA 安装率(beforeinstallprompt + appinstalled 比值)
[ ] PWA 启动率(?source=pwa)
[ ] Cache hit rate(SW 内 console.log 抽样)
[ ] Web Push 送达 / 点击率
[ ] 「重置 PWA」事件(用户主动 reset 多 = 出问题)
```

---

## 10. 应急预案

```
[ ] Kill switch:sw.js 自毁版本已准备好(随时可部署)
[ ] 远程开关:/sw-kill-switch.json 后端可改
[ ] /reset 页面已上线,客服文档已更新
[ ] 客服话术:「访问 /reset → 关浏览器重开」
[ ] 错误率监控有告警(SW 5xx > 阈值 → 自动通知值班)
[ ] postmortem 模板准备好
```

事故场景:
| 症状 | 第一反应 |
|---|---|
| 大量用户看到老版本 | 检查 sw.js 是否被 CDN / 浏览器缓存 → purge + 强制 update |
| SW 死循环 / 高 CPU | 远程开关 killed=true,触发 unregister |
| Cache 占满用户磁盘 | 部署 cleanupOutdatedCaches + 收紧 ExpirationPlugin |
| 用户报错「打不开」 | 引导走 /reset |
| Push 大量送不到 | 检查 410/404 处理是否生效,清理过期 sub |

---

## 11. 渐进增强 / 退路

```
[ ] SW 注册失败,页面仍正常工作(SSR HTML standalone)
[ ] SW 加载 timeout(> 5 秒)→ 跳过,直接走网络
[ ] 浏览器不支持 SW → 不影响主流程
[ ] DevTools "Bypass for network" 开启时,页面行为正常
[ ] 隐私模式下行为正常(SW 可注册但 cache 不持久)
```

---

## 12. 上线 deploy checklist

```
[ ] 构建产物有 service-worker.js / sw.js
[ ] 构建产物有 manifest.webmanifest
[ ] 构建产物有 icons 全套(192/512/maskable/monochrome)
[ ] CDN 配置:sw.js Cache-Control: no-cache
[ ] CDN 配置:manifest.webmanifest 短缓存(< 1 小时)
[ ] CDN 配置:icons 长缓存(1 年,带 hash)
[ ] CSP 头允许 SW 注册(default-src 'self' or worker-src 'self')
[ ] 验证生产 URL HTTPS 完整(证书 + 重定向)
[ ] 灰度:1% → 10% → 50% → 100%
[ ] 灰度期间盯监控
```

---

## 13. iOS 特殊清单

```
[ ] apple-touch-icon 180×180 已放
[ ] apple-mobile-web-app-capable / -title / -status-bar-style 已配
[ ] 已测过 iPhone Safari 「添加到主屏幕」流程
[ ] 已测过 standalone 启动后跳转保持在 PWA 内(不要跳 Safari)
[ ] 已知 iOS 限制告知用户(50MB 限额 / Push 需 16.4+ / 不能后台 sync)
[ ] iOS 用户的「装到桌面」教学 UI 已做
```

---

## 14. 长尾质量

```
[ ] Lighthouse PWA 分 ≥ 90
[ ] Lighthouse 在 throttling Slow 3G 下 LCP < 3 秒
[ ] Lighthouse 离线测试通过
[ ] 真机:iOS Safari / Android Chrome / 桌面 Edge / Firefox 都测过
[ ] 真机:飞行模式打开仍能打开
[ ] PWA 内点外链行为正确(系统浏览器开)
[ ] 装到桌面后图标 + splash 屏正确
[ ] 卸载流程顺(用户点桌面图标右键 → 卸载)
[ ] 数据迁移方案(用户清缓存 → 重新装,数据从云端拉)
```

---

## 15. 一句话总结

```
PWA 不是「加个 SW 就完事」。
它是一个「持续运维 + 应急方案 + 渐进增强」的工程系统。

最低要求:能上线、能更新、能下线、能让用户清缓存。

做到这四条,你就是 95% 网站的水平之上。
```
