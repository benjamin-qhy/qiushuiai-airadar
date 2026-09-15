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
