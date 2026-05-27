# 前端安全事件应急手册

> 出事时,慌乱比攻击更可怕。
> 这本手册给「在凌晨被叫醒,半睡半醒还要处理」的你用。

---

## 通用原则

1. **保留现场**:不要先 rollback,先截图 / 抓包 / 抓日志
2. **优先止血**:无法马上根因,先把流量 / 入口断了
3. **同步状态**:每 15 分钟在事件群里发一次,即使没进展
4. **决策记录**:边处理边写「现在做什么、为什么」,事后写 postmortem 时不会忘
5. **不能让单人扛**:第 30 分钟还没控住,叫人

---

## 事件 1:发现凭证泄露到 git

**症状**:GitHub secret scanning / 安全工具发邮件,某 SSH key / API key / .env 提交到公共/内部仓库。

### 第一时间(5 分钟内)
```
1. 立即 revoke 该 key
   - AWS:Console → IAM → 删除 access key
   - 数据库:改密
   - 第三方 API:登 SDK 网站删 token
   - GitHub PAT:Settings → PAT → revoke
   - 永远先 revoke,后想根因

2. 看监控:这个 key 最近被谁用过?
   - AWS CloudTrail
   - 数据库 audit log
   - API 服务商 audit log
   - 异常 IP / region → 标红
```

### 第二时间(30 分钟内)
```
3. 从 git history 彻底清掉
   git filter-repo --invert-paths --path '.env'
   # 或
   bfg --delete-files .env
   git push --force --all
   # ⚠️ 需所有协作者 force-pull,沟通

4. 评估扩散:
   - 仓库是 public? → 假设被爬走,极小概率没人看到
   - 仓库是 private? → 看 access log 谁 fork / clone

5. 通知:
   - 同 team / 上级
   - 如涉及用户数据 → legal / compliance
   - 如已发生未授权访问 → 通知受影响用户
```

### 复盘(48h 内)
```
- 为什么这个 key 进了 git?(没 gitignore / 测试代码留的)
- 为什么没被 pre-commit hook 拦?(没装 gitleaks)
- 立刻装:
  - gitleaks pre-commit
  - GitHub secret scanning + push protection
  - 例行 CI 跑一遍 git history scan
```

---

## 事件 2:发现网站被注入恶意 JS(供应链或 XSS)

**症状**:用户报告页面弹奇怪东西、卡 / 跳转奇怪 URL,CSP report 飙升,Sentry 看到陌生 origin 的 script。

### 第一时间(5 分钟内)
```
1. 确认是真事件不是误报:
   - 在自己浏览器跑,看 Network → Sources 找陌生 JS
   - view-source 看 HTML 里有没有突兀 <script>

2. 第一招:把 CSP 改严(临时):
   - 移掉所有外部 origin,只留 'self' + nonce
   - 这会让 GA / 客服 SDK 暂时不工作,但能立刻封住注入
   - 头部下发:Content-Security-Policy: script-src 'self' 'nonce-XXX'

3. 第二招:rollback 到上一个已知好的版本
   - 但保留出问题的 build artifact(取证)
```

### 第二时间(30 分钟内)
```
4. 找注入源:
   - 是 CDN 第三方 script 被劫持?
     → diff: 当前 CDN 文件 hash vs 上次部署时记录的 hash
     → 如果是,立刻从 HTML 移除,联系 CDN 厂商
   - 是 npm 包被投毒?
     → 看 lockfile,看 audit,锁定版本
     → npm install 时是否有 postinstall 脚本跑?
   - 是 XSS 漏洞被利用?
     → 看 access log,找触发 payload 的请求
     → 找到对应 input 字段,临时禁用或加 sanitize

5. 评估用户影响:
   - 注入的 JS 干啥?(挖矿 / 偷 cookie / 重定向)
   - 影响时间窗口?
   - 期间登录用户:他们的 session token 是否泄露?
     → 如是,全员 force logout + revoke token
```

### 复盘
```
- 加 SRI(整改后 100% CDN script 有 integrity)
- 上 Trusted Types(防同类 XSS)
- 上 git pre-merge dependency review
- 加 CSP strict-dynamic + report-uri 监控
```

---

## 事件 3:DDoS / 撞库 / 暴力破解

**症状**:CDN 流量飙升,登录失败率激增,API 服务异常。

### 第一时间
```
1. WAF 启动 rate limit:
   - Cloudflare:开「Under Attack」模式
   - AWS:WAF rate-based rule 全开
   - 自建 nginx:limit_req_zone
   - 临时 ban 异常 IP 段

2. 关键操作加 captcha:
   - 登录 / 注册 / 改密 / 验证码触发
   - hCaptcha / Cloudflare Turnstile

3. 看监控:
   - 流量来源国/IP/UA 分布
   - 99% 来自 N 个 IP → 黑名单
   - 来源分散 → botnet → 上 captcha

4. 通知:
   - SRE / Ops
   - 业务方(支付 / 客服可能有影响)
```

### 中期
```
5. 上 bot management:
   - DataDome / Akamai / Cloudflare Bot Mgmt
   - JS 挑战 + 行为分析

6. 撞库专门处理:
   - 看登录失败的 username 重复度
   - 如多账号被同一 IP 试 → 该 IP 段拉黑
   - 如同一 username 被多 IP 试 → 该账号锁定

7. 改密强制(如果疑似撞库成功):
   - 通知该用户改密 + 检查最近登录
```

---

## 事件 4:用户报告账号被盗

**症状**:用户邮件「我账号被改了密 / 收不到邮件 / 余额没了」。

### 第一时间
```
1. 立即冻结该账号(所有操作 hold):
   - admin 后台 一键冻结
   - 所有 session 失效
   - 所有 API token revoke

2. 取证:
   - 看该账号最近 30 天操作日志
   - 看 IP 列表:有没有异地登录?有没有 UA 异常?
   - 看登录方式:密码 / SSO / OAuth
   - 改密 / 改邮箱 的事件时间点

3. 与用户沟通:
   - 询问:最近有没有共享密码 / 钓鱼邮件 / 失窃设备?
   - 验证身份(身份证 / 历史交易等多因素)
```

### 处理
```
4. 恢复账号:
   - 改密 / 改回邮箱
   - 提供 2FA / Passkey 启用
   - 解冻

5. 损失评估:
   - 已发生转账 / 数据访问
   - 是否需赔付
   - 是否要全员被盗扫描(可能多账号都中招)

6. 如果是平台漏洞:
   - 修漏洞 → 全用户改密 → 公告
```

---

## 事件 5:第三方 SDK 突然行为异常

**症状**:GA / Intercom / Sentry / 客服 SDK 突然报错 / 全屏弹窗 / 偷重定向。

### 第一时间
```
1. 立即从 HTML 摘除该 SDK 标签
   - 或在 CSP 拒绝其 origin

2. 联系厂商 / 看 status page
   - 通常是厂商 bug,他们 30 分钟内修

3. 如果发现是恶意行为(SDK 公司被黑):
   - 公告 + 通知厂商
   - 评估用户数据泄露
```

### 长期
```
- 关键 SDK 用 npm 包 + 锁版本 + SRI
- 不放 SDK 在敏感页(支付 / 个人信息)
- 评估替代方案 / 自建
```

---

## 事件 6:Service Worker 失控

**症状**:更新部署了,用户报「看到老版本」、「页面打不开」、「无限循环」。

### 第一时间
```
1. 立即下发 kill-switch SW:
   // 部署一个新版 sw.js,内容只有:
   self.addEventListener('install', () => self.skipWaiting())
   self.addEventListener('activate', async (event) => {
     event.waitUntil((async () => {
       // 清所有缓存
       const keys = await caches.keys()
       await Promise.all(keys.map(k => caches.delete(k)))
       // 取消注册自己
       const regs = await self.registration.unregister()
     })())
   })

2. CDN 强制刷新 sw.js(no-cache)

3. 通知用户:刷新页面或 Ctrl+Shift+R
```

### 长期
```
- 部署前在 dev / preview 完整回归
- updateViaCache: 'none' 默认开启
- 有「逃生开关」按钮 / 页面让用户主动清 SW
```

---

## 事件 7:DNS 劫持 / 子域接管

**症状**:用户看到的页面不是你的 / 子域指向第三方且失控。

### 第一时间
```
1. DNS 控制台立刻改 record(去掉劫持记录)
2. 如果 DNS 账号本身被攻破:
   - 联系注册商客服紧急锁
   - 改 DNS 账号密码 + 2FA
3. 子域接管(指向已弃用 SaaS):
   - 立刻删 CNAME
   - 或重新申请回该 SaaS 资源
   - 监控:dnstwist / can-i-take-over-xyz
```

---

## 事件 8:CDN 缓存了私密内容

**症状**:用户 A 访问到了用户 B 的页面 / 数据。

### 第一时间
```
1. 立即清空 CDN 全量缓存(global purge)
   - 别担心 origin 流量飙,这是优先于性能的
2. 改服务端,确认 Cache-Control:
   - 个性化 response 必须 Cache-Control: private, no-store
   - 静态资源公共可以 public, max-age=N
3. 排查根因:
   - 为啥个性化 response 进了共享缓存?
   - 是没设 cache-control?
   - 还是 CDN 配置错(忽略了某些 header)?
```

---

## Postmortem 模板

事件结束后 24h 内出。重点:**不指责个人,只分析系统**。

```markdown
# 事件 postmortem: [简短描述]

## 影响
- 时间窗口: YYYY-MM-DD HH:MM ~ HH:MM (X 小时)
- 受影响用户数: ~N
- 业务影响: 收入 / 信任 / 法律

## 时间线(精确到分钟)
- HH:MM 监控告警/用户报告
- HH:MM 工程师确认
- HH:MM 第一道止血措施
- HH:MM 根因找到
- HH:MM 修复部署
- HH:MM 业务恢复
- HH:MM 监控正常

## 根因
[技术层面 + 流程层面]

## 检测
- 现有监控为何没早发现?
- 改进:加什么告警?

## 响应
- 哪些做得对?
- 哪些走了弯路?

## 修复
- 短期修复(已做)
- 中期改进(规划)
- 长期防御(架构)

## Action items
- [ ] [负责人] [deadline] action

## 教训
- 给团队 / 公司其他人的学习要点
```

---

## 平时准备

```
[ ] 全员有 incident 通讯录(电话 + 备用)
[ ] 紧急联系厂商列表(CDN / Auth / 支付 / SaaS)
[ ] runbook 文档放共享盘
[ ] 演练每半年一次(模拟某事件,看团队多快响应)
[ ] kill-switch / maintenance mode 一键启
[ ] 监控告警分级(P0 立刻电话 / P1 短信 / P2 邮件)
[ ] 法务 / PR 在重大事件群里(避免公开声明的尴尬)
```

---

## 最重要的事

1. **冷静**:慌了会做更多错事
2. **沟通**:再多沟通也不嫌多
3. **保留证据**:别急着覆盖
4. **修系统,不打人**:错的是流程,不是同事
5. **公开诚实**:出大事时把事实讲清楚比包庇更能保住信任
