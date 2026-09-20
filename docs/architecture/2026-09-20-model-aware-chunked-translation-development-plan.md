# 按模型容量分段翻译与长视频人工翻译开发方案

> 日期：2026-09-20
>
> 状态：核心功能已实现，已通过自动化、开发页面和 DeepSeek 真实模型分段验收
>
> 范围：英文文章、英文字幕和英文短文的中文意译；内容分析与评分规则保持不变

## 1. 目标

本次开发解决三个问题：

1. 翻译不再把整篇文章或整份字幕一次性交给模型，而是按照当前翻译模型的上下文上限和最大输出上限计算安全分段，逐段翻译，最后按原顺序合并。
2. 时长达到 30 分钟，或源正文/字幕达到半小时内容等价值的视频不再自动翻译，但仍照常完成内容分析和评分；详情页提供“生成中文意译”按钮，由用户明确触发完整翻译。
3. 分类、评分、翻译、模型连通性测试等所有模型调用都关闭推理，不再使用 `low`。

## 2. 当前代码事实

### 2.1 正式运行路径

发布版 CLI 和本地 `serve:v2` 都使用：

```text
createSingleTableServiceApp
  -> collectSingleTable
  -> collectSourcesSerially
  -> processSingleTableContent
  -> createSingleTableModelGateway
```

仓库同时保留了 `createServiceApp -> analyzeStoredContent -> createPiModelGateway` 这一套运行路径，部分测试和验收脚本仍在使用。两套路径都必须复用同一个翻译模块和“关闭推理”调用适配器，不能各修一套。

### 2.2 翻译目前仍是整篇一次调用

- `processSingleTableContent` 把完整 `original.body` 同时放进分类、评分和翻译变量。
- 翻译阶段只调用一次模型，再直接执行 `saveTranslation`。
- 翻译输出上限最高设为 32,000 Token；这是输出上限，不会自动限制或拆分输入。
- 另一套 `analyzeStoredContent` 路径把分析、评分和完整翻译合并在一次模型调用里，同样没有切块。

因此，超长正文可能超过模型上下文，长译文也可能因输出上限被截断；简单重试不会改变结果。

### 2.3 模型容量已经存在，但应用没有使用

当前依赖 `@earendil-works/pi-ai@0.85.1` 的 `Model` 已提供：

- `contextWindow`：输入与输出合计可使用的上下文容量；
- `maxTokens`：单次最大输出容量；
- `reasoning` 和 `thinkingLevelMap`：模型是否支持推理及其映射。

当前默认 `gpt-5.5` 的本地模型目录值为 `contextWindow = 272000`、`maxTokens = 128000`。容量应读取实际选中的翻译模型对象，不能写死为某个模型的数值；翻译阶段可以配置独立模型，因此不能只读取默认模型。

### 2.4 当前推理没有关闭

两套模型网关都显式传入了 `reasoning: 'low'`，所以当前是低强度推理，不是关闭推理。

Pi 0.85.1 的模型层认识 `off`，但 `completeSimple` 的公开参数只声明 `minimal | low | medium | high | xhigh | max`。因此不能只把字符串改成 `off` 并用类型断言掩盖问题。实现时应在统一模型调用适配器里按模型 API 明确关闭推理，并用最终请求体测试证明没有启用推理参数。

### 2.5 30 分钟判断所需数据尚未完整传递

- 来源适配器能取得 `video.durationSeconds`。
- 单表数据库已有 `video_duration_seconds` 列，接口也会返回它。
- 但 `DiscoveredContent -> OriginalContent -> saveOriginal` 目前没有传递和写入视频时长。

所以必须先补齐视频时长的数据链，之后才能可靠执行“30 分钟以上不自动翻译”。

### 2.6 详情页已有按钮外观，但操作不正确

详情页对“英文且未翻译”的内容已经显示“生成中文意译”图标，但它调用的是通用 `/retry`。正式单表服务只允许失败或等待转写的内容重试；已完成但未翻译的长视频会得到 `content_not_retryable`。需要独立的翻译操作，不能继续借用重试。

## 3. 方案总览

新增一个深模块 `DocumentTranslation`，其外部接口只接收完整文档和触发方式，内部负责模型容量、分段、调用、断点、合并和校验。

```text
自动处理 / 详情页人工按钮
          |
          v
 translateDocument(document, trigger)
          |
          +-- 读取翻译阶段实际模型及容量
          +-- 判断自动翻译资格（含 30 分钟规则）
          +-- 按格式切成安全片段
          +-- 逐片调用无推理模型
          +-- 保存片段检查点
          +-- 校验、按顺序合并
          +-- 原子写入最终中文 Markdown
```

建议接口：

```ts
interface TranslationDocument {
  contentId: string
  title?: string
  body: string
  format: 'plain_text' | 'markdown_article' | 'subtitle'
  kind: 'short_post' | 'video' | 'image_post' | 'article'
  videoDurationSeconds?: number
}

interface TranslationRequest {
  document: TranslationDocument
  trigger: 'automatic' | 'manual'
}

interface TranslationResult {
  chineseTitle: string | null
  chineseBody: string
  chunkCount: number
  provider: string
  model: string
  usage: ModelUsage
}
```

调用方不需要知道如何估算容量、如何切块或如何续跑。测试也通过这一接口验证完整结果。

## 4. 按模型上限计算安全片段

### 4.1 容量来源

`SingleTableModelGateway` 增加只读能力信息：

```ts
interface ModelCapacity {
  contextWindow: number
  maxOutputTokens: number
  reasoningCanBeDisabled: boolean
}
```

该值必须来自翻译阶段最终解析到的 `Model`，而不是配置文件中的默认模型名称。

### 4.2 安全预算

模型上下文需要同时容纳系统提示词、标题、片段、上下文提示和译文。每个片段按下面原则计算：

1. 只使用模型 `contextWindow` 的 80%，预留 20% 给不同供应商的 Token 误差和协议开销。
2. 从可用容量中扣除固定提示词、标题、片段编号、上一段末尾参考内容等开销。
3. 剩余容量约一半给英文原文，一半给中文输出。
4. 单次输出预算不得超过模型 `maxTokens`。
5. 如果计算后连一个最小自然段都放不下，提前返回“模型容量不足”，不发送必然失败的请求。

Pi 当前没有暴露跨供应商统一 tokenizer。首期使用保守估算：以 UTF-8 字节数作为 Token 上界近似，而不是用“字符数除以 4”这种容易低估中文和特殊字符的方法。实际请求返回的 Token 用量继续进入执行日志，后续可按供应商增加精确 tokenizer，但不改变翻译模块接口。

### 4.3 分段规则

不同格式使用不同切分器：

| 原文格式 | 首选切分位置 | 兜底切分位置 | 不允许破坏 |
|---|---|---|---|
| Markdown 文章 | 标题前、段落间 | 句子边界 | 代码围栏、表格行、链接和列表项 |
| 字幕 | 时间片段组、说话人段落 | 单个字幕片段 | 时间顺序和说话人归属 |
| 普通文本 | 空行、段落 | 句子边界，最后才按字符安全切分 | URL、Markdown 链接 |

片段之间不重复翻译正文，避免合并后重复内容。每次调用可携带上一片段译文末尾作为“只供术语衔接、不得重复输出”的参考，并把这部分计入容量预算。

### 4.4 调用、重试与合并

- 同一文档内按顺序翻译，保证段落顺序和术语连续；不同内容仍可由现有任务机制并行。
- 每个片段独立校验、独立记录 Token、耗时和错误；失败只重试当前片段，不重新翻译已成功片段。
- 标题在第一个片段中翻译一次；后续片段不允许重新生成标题。
- 全部片段成功后按原顺序合并。Markdown 文章保留原有块结构；字幕和普通文本以自然段空行连接。
- 只有全部片段成功并通过完整性校验后，才写入 `中文.md` 并设置 `translated_to_chinese = 1`。中途失败不能留下“已翻译”的半成品。

### 4.5 断点续译

在数据根目录增加可恢复的翻译工作区，例如：

```text
translation-work/<内容 ID 的 SHA-256>/
  manifest.json
  chunk-0001.json
  chunk-0002.json
```

`manifest.json` 保存原文哈希、提示词版本、供应商、模型、容量和片段总数。只有这些值全部一致时才能复用已完成片段；原文、模型或提示词变化时建立新工作区。成功合并后删除工作片段，最终中文 Markdown 和执行日志继续作为正式证据。

## 5. 30 分钟视频与等价字数规则

### 5.1 自动处理

规则定义为以下任一条件成立即跳过自动翻译：

- `durationSeconds >= 1800`；
- `sourceCharacterCount >= 27000`。

`27,000` 个字符按英文口语约 150 词/分钟、30 分钟约 4,500 词、每词连同空格平均约 6 个字符折算。字符数按 Unicode 字符统计并包含正文中的正常空格；这是用于控制自动成本的稳定产品阈值，不代替模型容量分段。也就是说，未达到自动阈值的内容仍会根据实际模型容量拆成多段；达到任一阈值的内容只是不自动翻译，用户仍可手动触发分段翻译。

- 仍然取得并保存完整字幕；
- 仍然执行中文总结、垃圾判断和评分；
- 不自动执行全文翻译；
- 内容正常标记为处理完成，不能因为跳过翻译而进入失败状态；
- 页面显示“未生成中文意译”，并根据实际原因显示“视频达到 30 分钟”或“内容字数达到半小时等价值，已跳过自动翻译”。

如果视频时长缺失，自动流程也不翻译，并记录 `video_duration_unknown`；用户仍可手工触发。这样不会因为供应商漏传时长而意外产生超长翻译。

### 5.2 人工翻译

新增：

```http
POST /api/contents/:id/translate
```

约束：

- 只接受已有完整英文正文、非垃圾且尚未完成翻译的内容；
- 人工触发绕过 30 分钟自动限制和自动翻译最低分门槛；
- 已在翻译时返回 `409 translation_already_running`；
- 已翻译时返回当前结果，不重复扣费；
- 接口返回 `202`，翻译在后台执行，页面通过已有内容查询刷新状态；
- 服务重启后，根据翻译状态和检查点恢复未完成片段。

通用 `/retry` 继续只负责采集、补全、分析失败恢复，不再承担“已完成内容补译”。

### 5.3 翻译状态

在现有 `contents` 单表中增加产品级字段，不新建业务表：

- `translation_status`：`not_applicable | pending | skipped | running | succeeded | failed`；
- `translation_skip_reason`：例如 `video_duration_limit`、`video_duration_unknown`、`below_score_threshold`；
- `translation_error`：最后一次翻译错误的脱敏摘要；
- `translation_chunk_count`、`translation_completed_chunks`：进度和恢复依据。

保留 `translated_to_chinese` 作为现有兼容字段；只有 `translation_status = succeeded` 时才为 1。启动时使用 `PRAGMA table_info(contents)` 做幂等增量迁移，不能要求删除或重建现有数据库。

## 6. 补齐视频时长数据链

需要依次修改：

1. `DiscoveredContent` 增加 `videoDurationSeconds`；发现阶段从来源结果的 `item.video.durationSeconds` 复制。
2. `OriginalContent` 增加可选 `videoDurationSeconds`；解析字幕时继续保留该值。
3. `saveOriginal` 插入和更新 `video_duration_seconds`，首次成功后不因后续缺失值清空。
4. 人工重试从数据库重建 `OriginalContent` 时恢复该字段。
5. API 继续通过现有 `video.durationSeconds` 返回页面。

必须用真实供应商响应夹具验证时长单位是秒，不能根据字幕行数推测时长。

## 7. 所有模型调用关闭推理

新增统一的模型调用适配器，例如 `completeWithoutReasoning`，所有业务调用只能经过这个接口。

实现要求：

- 删除现有两处 `reasoning: 'low'`；
- 对 OpenAI Codex Responses 明确发送 `reasoningEffort: 'none'`，同时关闭 reasoning summary；
- 其他供应商按其 Pi 适配器支持的关闭方式处理；仅省略字段不足以证明关闭时，必须检查最终请求体；
- 如果某个模型不能关闭推理，则该模型不能用于分类、评分或翻译，页面保存配置和连通性测试应给出明确错误；
- 模型连通性测试也走同一适配器，不能成为遗漏入口；
- 审计日志记录 `reasoning: off`，但不保存凭据。

测试通过 `onPayload` 捕获最终发往供应商的脱敏请求，断言不存在启用推理的参数，并针对 Codex 断言 `reasoning.effort = none`（或该模型目录定义的等价关闭值）。

## 8. 页面调整

详情页沿用现有按钮位置，不增加新的卡片或弹窗层级：

- 英文、非垃圾、有完整正文、尚未翻译时显示文字清楚的“生成中文意译”按钮；
- 点击后显示“正在翻译 2/6”，按钮禁用，避免重复提交；
- 30 分钟以上或时长未知的视频显示跳过自动翻译的简短原因；
- 翻译失败显示“翻译失败，可重试”，点击仍调用 `/translate`；
- 成功后刷新详情，优先展示合并后的中文正文，并保留英文原文切换；
- 通用“单条恢复”按钮只在采集、补全或分析失败时显示。

移动端按钮不得只依赖鼠标悬停说明；按钮必须有可见文字或在正文空态中提供明确操作。

## 9. 文件改动范围

预计涉及：

- `packages/pipeline/src/document-translation.ts`：容量预算、格式切分、逐片翻译、合并和检查点接口；
- `packages/pipeline/src/single-table-flow.ts`：把现有单次翻译替换为翻译模块，关闭推理；
- `packages/pipeline/src/index.ts`：保留路径复用同一翻译模块和无推理适配器；
- `packages/runtime/src/single-table.ts`：视频时长写入、翻译状态、幂等字段迁移和原子完成；
- `packages/pipeline/src/single-table-collector.ts`、`apps/service/src/single-table-provider.ts`：传递视频时长；
- `apps/service/src/single-table-service.ts`：新增人工翻译接口、后台执行和状态恢复；
- `apps/web/src/types.ts`、`apps/web/src/features/content-workspace.tsx`：翻译状态、进度和按钮；
- `docs/prompts/single-table-content/03-英文内容意译.md`：改为单片段契约；
- `config/analysis.yaml`、配置校验：增加 `automatic_video_max_duration_seconds: 1800` 和 `automatic_max_source_characters: 27000`，容量安全比例保持内部常量，不暴露给非技术用户。

## 10. 测试与验收

### 10.1 单元测试

- 不同 `contextWindow`、`maxTokens` 产生不同安全片段大小；
- 极小容量模型在调用前失败；
- Markdown 代码围栏、表格、链接和列表不被切坏；
- 字幕顺序和说话人不被打乱；
- 多片合并无重复、无漏片；
- 第 3 片失败后重试只调用第 3 片及之后片段；
- 合并前 `translated_to_chinese` 始终为 0；
- 29:59 且少于 27,000 字符时自动翻译；30:00 自动跳过；不足 30 分钟但达到 27,000 字符也自动跳过；时长未知自动跳过；
- 人工操作可以翻译 30 分钟以上视频；
- 所有模型请求均无推理；不支持关闭推理的模型在调用前被拒绝。

### 10.2 服务与接口测试

- 已完成但未翻译内容调用 `/translate` 返回 202，而 `/retry` 仍拒绝它；
- 同一内容重复点击只启动一个翻译；
- 服务重启能从片段检查点继续；
- 翻译失败不破坏已有摘要、评分、英文原文和历史中文译文；
- 旧数据库原地升级，现有内容和 Markdown 文件不丢失。

### 10.3 真实验收

至少准备以下真实内容：

1. 一篇超过单次安全预算的英文 Markdown 长文；
2. 一个 29 分 59 秒英文视频；
3. 一个恰好 30 分钟英文视频；
4. 一个超过 30 分钟英文视频，并在详情页人工触发翻译；
5. 一个时长缺失的视频。
6. 一个不足 30 分钟但正文达到 27,000 字符的视频。

验收时查看页面、最终中英文 Markdown、执行日志和脱敏后的模型请求，确认片段数、顺序、Token、模型容量、推理关闭状态及恢复过程一致。

### 10.4 2026-09-20 DeepSeek 实际验收结果

- 使用官方当前低价模型 `deepseek-v4-flash`（当前实际路由为 DeepSeek Flash），真实模型容量识别为 1,000,000 上下文、384,000 最大输出；验收时临时压缩为 12,000/6,000，确保 10,966 字符的隔离字幕一定产生多段请求。
- 实际拆成 4 段，4 段全部成功；合并结果包含 24 个连续编号段落，顺序为 01 到 24，无重复、无漏段，页面中文详情正常展示。
- 4 次请求均记录 `reasoning: off`，模型返回的 reasoning Token 合计为 0。
- 总计 3,345 输入 Token、2,327 输出 Token，供应商日志计费约 0.001124 美元。
- 首轮实际调用发现 Codex 不接受 `reasoningSummary: off`，已改为只发送 `reasoningEffort: none`；首轮 DeepSeek 调用发现字幕片段被重复放入提示词且相似段落可能被压缩，已去掉重复输入，并增加“译文异常过短即失败”的完整性保护。
- 验收使用隔离临时数据库；完成后已删除临时数据库和临时凭据副本，并恢复原开发数据库。

## 11. 实施顺序

1. 先补模型容量与视频时长接口，并写失败测试。
2. 实现无推理调用适配器，替换所有模型调用并验证最终请求体。
3. 实现 `DocumentTranslation` 的预算、切分、逐片调用、检查点和合并。
4. 接入正式单表流水线，再让保留的另一条分析路径复用同一模块。
5. 增加翻译状态字段和幂等迁移。
6. 增加 `/translate` 后台操作和重启恢复。
7. 修改详情页按钮及进度展示。
8. 完成单元、服务、构建和真实浏览器验收。

## 12. 明确不做

- 不改变垃圾判断、评分权重和推荐门槛；
- 不把不同文章合并成一个模型请求；
- 不用截断正文代替完整翻译；
- 不把 30 分钟以上视频标记为处理失败；
- 不删除英文原文、旧分析结果或执行日志；
- 不新建第二套翻译数据库，也不要求清空现有数据。
