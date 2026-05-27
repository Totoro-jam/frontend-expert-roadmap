// 真实用户监控(RUM):Web Vitals + Long Tasks + 自定义事件
// 推荐 web-vitals 库(Google 官方,小,attribution 模式直接定位元凶)

import {
  onCLS,
  onINP,
  onLCP,
  onFCP,
  onTTFB,
  type Metric,
} from 'web-vitals/attribution'

// ====================================================
// 1. 上报通道
// ====================================================
function send(payload: object) {
  const body = JSON.stringify({
    ...payload,
    timestamp: Date.now(),
    url: location.href,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    connectionType: (navigator as any).connection?.effectiveType,
    deviceMemory: (navigator as any).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    sessionId: getSessionId(),
  })

  // sendBeacon 在页面卸载时也能发,且不阻塞 unload
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/rum', body)
  } else {
    fetch('/rum', { method: 'POST', body, keepalive: true })
  }
}

function getSessionId(): string {
  let id = sessionStorage.getItem('rum-session')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('rum-session', id)
  }
  return id
}

// ====================================================
// 2. Web Vitals
// ====================================================
function reportVitals(metric: Metric & { attribution?: any }) {
  send({
    type: 'vital',
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    // attribution:直接告诉你哪个元素 / 哪个 url / 哪段代码
    attribution: simplifyAttribution(metric.name, metric.attribution),
  })
}

function simplifyAttribution(name: string, attr: any) {
  if (!attr) return null

  switch (name) {
    case 'LCP':
      return {
        element: attr.element,                // CSS selector
        url: attr.url,                        // 图片 URL
        ttfb: attr.timeToFirstByte,
        resourceLoadTime: attr.resourceLoadTime,
        elementRenderDelay: attr.elementRenderDelay,
      }
    case 'INP':
      return {
        eventType: attr.interactionType,
        eventTarget: attr.interactionTarget,  // CSS selector of the slow element
        inputDelay: attr.inputDelay,
        processingTime: attr.processingTime,
        presentationDelay: attr.presentationDelay,
      }
    case 'CLS':
      return {
        largestShiftTarget: attr.largestShiftTarget,
        largestShiftTime: attr.largestShiftTime,
        loadState: attr.loadState,
      }
    default:
      return attr
  }
}

onCLS(reportVitals)
onINP(reportVitals)
onLCP(reportVitals)
onFCP(reportVitals)
onTTFB(reportVitals)

// ====================================================
// 3. Long Tasks(主线程阻塞)
// ====================================================
if ('PerformanceObserver' in window) {
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 200) {                  // 只报严重的(默认 50ms 太吵)
          send({
            type: 'longtask',
            duration: entry.duration,
            startTime: entry.startTime,
            attribution: (entry as any).attribution?.map((a: any) => ({
              name: a.name,
              entryType: a.entryType,
              containerType: a.containerType,
              containerSrc: a.containerSrc,
              containerId: a.containerId,
              containerName: a.containerName,
            })),
          })
        }
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // longtask 不支持
  }
}

// ====================================================
// 4. JS 错误 + Unhandled rejection
// ====================================================
window.addEventListener('error', (e) => {
  send({
    type: 'js-error',
    message: e.message,
    source: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    stack: e.error?.stack?.slice(0, 2000),
  })
})

window.addEventListener('unhandledrejection', (e) => {
  send({
    type: 'unhandled-rejection',
    reason: String(e.reason).slice(0, 500),
    stack: e.reason?.stack?.slice(0, 2000),
  })
})

// ====================================================
// 5. 资源加载错误(图片 404 / script 失败)
// ====================================================
window.addEventListener(
  'error',
  (e) => {
    const target = e.target as HTMLElement
    if (target && target !== (window as any) && ['IMG', 'SCRIPT', 'LINK'].includes(target.tagName)) {
      send({
        type: 'resource-error',
        tagName: target.tagName,
        src: (target as HTMLImageElement).src || (target as HTMLLinkElement).href,
      })
    }
  },
  true,                                              // capture phase 才能捕到资源错误
)

// ====================================================
// 6. 自定义业务事件
// ====================================================
export function reportCustom(name: string, data: object = {}) {
  send({ type: 'custom', name, ...data })
}

// 用法:reportCustom('checkout-completed', { amount: 100, items: 3 })

// ====================================================
// 7. Memory 周期采样
// ====================================================
if ((performance as any).memory) {
  setInterval(() => {
    const mem = (performance as any).memory
    if (mem.usedJSHeapSize > mem.jsHeapSizeLimit * 0.8) {
      send({
        type: 'memory-warning',
        used: mem.usedJSHeapSize,
        total: mem.totalJSHeapSize,
        limit: mem.jsHeapSizeLimit,
      })
    }
  }, 30_000)
}

// ====================================================
// 8. 服务端处理建议
// ====================================================
//
// 写入:
//   - 高频写入 → Kafka / Kinesis 缓冲,后台批写 ClickHouse / BigQuery
//   - 中等流量 → 直接写 InfluxDB / TimescaleDB
//
// 分析:
//   - Grafana 看板:p75 / p95 LCP / INP / CLS 趋势
//   - alarm:p75 LCP > 4s 报警
//   - 维度切片:按页面 / 设备 / 国家 / 版本
//
// 现成方案:
//   - Sentry Performance
//   - Datadog RUM
//   - SpeedCurve
//   - Cloudflare Browser Insights
