# Learnings

## [LRN-20260915-001] correction

**Logged**: 2026-09-15T14:42:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary

内容页头部除搜索框外，应统一使用 shadcn DropdownMenu，并以 ButtonGroup 呈现触发器。

### Details

首版将类型和推荐做成 Tabs、平台做成 Select、日期和更多筛选做成 Popover。用户进一步明确：搜索保留 Input，其余头部筛选统一使用 DropdownMenu；触发器采用 ButtonGroup 的连续按钮效果，不使用 Select 输入框外观；日期使用周、月、三个月、半年和自定义范围。后续头部排列应统一靠右，并按“关键词、类型、推荐、评分、平台、日期”排列；平台是内容来源类型，应覆盖系统当前支持的全部类型（X、YouTube、RSS、抖音、视频号、小红书），不能把具体博主当作平台，也不能擅自缩减平台集合。

### Suggested Action

修改内容页头部时，先确认筛选语义和固定顺序，再选择 shadcn 组件；平台选项必须绑定 `source.type`，不能绑定 `source.name`。

### Metadata

- Source: user_feedback
- Related Files: apps/web/src/features/content-workspace.tsx, apps/web/src/lib/content-filters.ts
- Tags: shadcn, dropdown-menu, content-filters
- Pattern-Key: frontend.content_header_component_contract
- Recurrence-Count: 4
- First-Seen: 2026-09-15
- Last-Seen: 2026-09-15

### Resolution

- **Resolved**: 2026-09-15T14:42:00+08:00
- **Notes**: 本次改造中统一组件并补充日期范围过滤。

---

## [LRN-20260917-001] correction

**Logged**: 2026-09-17T21:41:00+08:00
**Priority**: high
**Status**: pending
**Area**: tests

### Summary

仅在修改采集规则时才考虑清空旧测试数据并重跑真实信源，且每次删除前必须取得用户明确批准。

### Details

先前把“每次修改后测试”理解成所有代码变更都自动清空测试目录，并在未单独确认删除范围的情况下重建了独立测试库。用户纠正：只有采集规则等变更需要这样做；重跑时 YouTube、X、RSS 各选一个信源、各取前 10 条；删除之前数据并重新执行必须事先获得用户明确批准。正式数据与独立测试数据都不能因这句话被默认为可删除。

### Suggested Action

测试前先判断改动是否涉及采集规则。若需要清空，明确列出待删数据目录或范围与重跑内容，等待用户批准；未批准时只做不删除数据的验证。

### Metadata

- Source: user_feedback
- Related Files: scripts/accept-three-source-fresh.ts
- Tags: destructive-action, source-acceptance, approval
- Pattern-Key: tests.collection_reset_requires_approval
- Recurrence-Count: 1
- First-Seen: 2026-09-17
- Last-Seen: 2026-09-17

---

## [LRN-20260915-002] correction

**Logged**: 2026-09-15T20:27:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary

内容卡片外围应保持轻量，不使用阴影或粗描边。

### Details

用户明确要求内容列表卡片周边不要有阴影和粗线；选中与悬停状态应通过浅色背景和轻微边框颜色变化表达。

### Suggested Action

修改内容卡片时保留淡色 1px 边框，避免 `shadow-*`、额外 `ring-*` 和明显位移动画。

### Metadata

- Source: user_feedback
- Related Files: apps/web/src/features/content-workspace.tsx
- Tags: card, border, shadow, visual-style
- Pattern-Key: frontend.content_card_lightweight_surface
- Recurrence-Count: 1
- First-Seen: 2026-09-15
- Last-Seen: 2026-09-15

### Resolution

- **Resolved**: 2026-09-15T20:27:00+08:00
- **Notes**: 已移除卡片阴影、粗描边和悬停位移，选中状态改为浅色背景。

---

## [LRN-20260918-001] correction

**Logged**: 2026-09-18T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: docs

### Summary

AI Radar 单表方案的内容处理必须按信源串行且抓取接口不分页，英文内容先分析评分再决定是否意译。

### Details

先前方案把英文内容默认视为有中文文件，并把翻译放在分析前；用户纠正为：短帖不单独总结，英文短帖的 summary 初始为原文，达标意译后才改成中文；低分或垃圾英文内容没有中文正文；AI 生成的总结和分析结果均为中文。日志必须保留脱敏后的 request/response，内容文件属性要镜像表中关键字段。

### Suggested Action

实现内容流水线时逐分支核对短帖、长内容、英文翻译门槛、文件是否存在及 Front matter 同步；验收覆盖两个信源的串行与单页抓取。

### Metadata

- Source: user_feedback
- Related Files: docs/architecture/2026-09-17-single-table-markdown-storage-development-plan.md
- Tags: content-pipeline, translation, storage-design
- Pattern-Key: airadar.content_pipeline_user_contract
- Recurrence-Count: 1
- First-Seen: 2026-09-18
- Last-Seen: 2026-09-18

### Resolution

- **Resolved**: 2026-09-18T00:00:00+08:00
- **Notes**: 已更新开发方案的流程、字段、文件契约与验收要求。

---
