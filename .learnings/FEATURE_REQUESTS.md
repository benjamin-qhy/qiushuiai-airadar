# Feature Requests

## [FEAT-20260915-001] responsive_content_views

**Logged**: 2026-09-15T20:23:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Requested Capability

内容列表支持可调卡片宽度，并根据列表容器宽度自动调整瀑布流列数，同时提供瀑布流和表格两种展示方式。

### User Context

同一内容库需要兼顾大屏快速浏览、窄详情分栏和高密度表格查看。

### Complexity Estimate

medium

### Suggested Implementation

用 CSS 多列布局根据卡片目标宽度自动计算瀑布流列数；用 shadcn ButtonGroup、DropdownMenu 和 Table 提供视图切换、宽度选择和表格展示，并持久化用户选择。

### Metadata

- Frequency: first_time
- Related Features: content_workspace

### Resolution

- **Resolved**: 2026-09-15T20:23:00+08:00
- **Notes**: 已加入小、中、大卡片宽度，响应式瀑布流和表格视图。

---
