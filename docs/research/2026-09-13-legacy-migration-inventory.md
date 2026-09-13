# 旧项目信源、画像与可迁移能力调研

> 调研对象：`/Users/qiushui/work/qiushui/qiushuiai-aicontnet-extract`
>
> 源码快照：`main@c3a572c3ccc8594dc54f669aa42c0135cb09d8b8`
>
> 结论日期：2026-09-13
>
> 本文只盘点可作为新项目输入的事实，不决定新项目的最终架构，也不迁移历史内容、收藏或反馈。

## 一句话结论

应迁移的是 **33 个信源定义、抓取适配经验、个人兴趣种子、处理审计与失败恢复规则**；应重设计的是 **画像、两级评分、四态反馈、自我迭代、统一内容库和邮件推送**；不应迁移的是 **Python 运行时代码、SQLite 数据库、历史业务数据、旧页面交互、明文账号与浏览器 Cookie**。

## 1. 调研口径

本报告以旧项目的源码、配置和测试为一手证据。旧仓库当前工作树还包含未提交文档，因此：

- 源码事实以提交 `c3a572c3ccc8594dc54f669aa42c0135cb09d8b8` 下的文件为准；
- 未提交的 2026-09-13 调研文档只用于交叉检查，没有作为唯一事实来源；
- “已支持”表示存在可调用源码与测试，不表示本次做过真实外网、密钥、浏览器或生产验收。

下文的 `旧仓库：路径:行号` 均指上述本地旧仓库。

## 2. 信源盘点

### 2.1 数量

旧配置共有 **33 个信源，全部启用**：

| 维度 | 数量 |
|---|---:|
| X | 16 |
| YouTube | 16 |
| RSS | 1 |
| T1 核心源 | 10 |
| T2 普通源 | 23 |
| primary 原创/一手 | 14 |
| commentary 评论/二手 | 19 |

证据：旧仓库 `config/sources.yaml:6-25,43-318,334-611`。`defaults.enabled` 为 `true`，33 项没有单独关闭配置。

### 2.2 全部 33 个信源

| slug | 名称 | 类型 | 层级 | 账号、频道或地址 |
|---|---|---|---|---|
| `x_openai` | X / OpenAI | `x` | T1 | `OpenAI` |
| `x_anthropic` | X / Anthropic | `x` | T1 | `AnthropicAI` |
| `x_karpathy` | X / Andrej Karpathy | `x` | T1 | `karpathy` |
| `x_ilyasut` | X / Ilya Sutskever | `x` | T1 | `ilyasut` |
| `x_akshay_pachaar` | X / Akshay Pachaar | `x` | T2 | `akshay_pachaar` |
| `x_saboo_shubham` | X / Shubham Saboo | `x` | T2 | `Saboo_Shubham_` |
| `x_langchain` | X / LangChain | `x` | T2 | `LangChain` |
| `x_llama_index` | X / LlamaIndex | `x` | T2 | `llama_index` |
| `x_ycombinator` | X / Y Combinator | `x` | T1 | `ycombinator` |
| `x_garrytan` | X / Garry Tan | `x` | T2 | `garrytan` |
| `x_levie` | X / Aaron Levie | `x` | T2 | `levie` |
| `x_amanda_askell` | X / Amanda Askell | `x` | T2 | `AmandaAskell` |
| `x_petergyang` | X / Peter G. Yang | `x` | T2 | `petergyang` |
| `x_bcherny` | X / Brian Cherny | `x` | T2 | `bcherny` |
| `x_catwu` | X / Cat Wu | `x` | T2 | `_catwu` |
| `x_gregisenberg` | X / Greg Isenberg | `x` | T2 | `gregisenberg` |
| `yt_anthropic` | YouTube / Anthropic | `youtube` | T1 | `https://www.youtube.com/@anthropic-ai` |
| `yt_claude` | YouTube / Claude | `youtube` | T1 | `https://www.youtube.com/@claude/videos` |
| `yt_openai` | YouTube / OpenAI | `youtube` | T1 | `https://www.youtube.com/@OpenAI` |
| `yt_ibm_tech` | YouTube / IBM Technology | `youtube` | T2 | `https://www.youtube.com/@IBMTechnology` |
| `yt_ycombinator` | YouTube / Y Combinator | `youtube` | T1 | `https://www.youtube.com/@ycombinator` |
| `yt_lennys_podcast` | YouTube / Lenny's Podcast | `youtube` | T2 | `https://www.youtube.com/@LennysPodcast` |
| `yt_sequoia` | YouTube / Sequoia Capital | `youtube` | T2 | `https://www.youtube.com/@sequoiacapital` |
| `yt_ai_advantage` | YouTube / AI Advantage | `youtube` | T2 | `https://www.youtube.com/@aiadvantage` |
| `yt_tiago_forte` | YouTube / Tiago Forte | `youtube` | T2 | `https://www.youtube.com/@TiagoForte` |
| `yt_nate_herk` | YouTube / Nate Herk | `youtube` | T2 | `https://www.youtube.com/@nateherk` |
| `yt_cole_medin` | YouTube / Cole Medin | `youtube` | T2 | `https://www.youtube.com/@ColeMedin` |
| `yt_jeff_su` | YouTube / Jeff Su | `youtube` | T2 | `https://www.youtube.com/@JeffSu` |
| `yt_ali_abdaal` | YouTube / Ali Abdaal | `youtube` | T2 | `https://www.youtube.com/@aliabdaal` |
| `yt_dan_koe` | YouTube / Dan Koe | `youtube` | T2 | `https://www.youtube.com/@DanKoeTalks` |
| `yt_greg_isenberg` | YouTube / Greg Isenberg | `youtube` | T2 | `https://www.youtube.com/@GregIsenberg` |
| `yt_ishan_sharma` | YouTube / Ishan Sharma | `youtube` | T2 | `https://www.youtube.com/@IshanSharma7390` |
| `openai_news` | OpenAI News | `rss` | T1 | `https://openai.com/news/rss.xml` |

证据：X 定义见旧仓库 `config/sources.yaml:43-318`；YouTube 定义见 `config/sources.yaml:334-592`；RSS 定义见 `config/sources.yaml:602-611`。

### 2.3 “已配置”与“代码支持”不是一回事

旧代码注册了 5 类抓取器：`rss`、`hackernews`、`html_css`、`x`、`youtube`；但当前 YAML 只实际配置了 X、YouTube、RSS 三类，Hacker News 和 HTML/CSS 的配置数量都是 0。证据：旧仓库 `src/fetchers/__init__.py:13-17` 与 `config/sources.yaml:26-611`。

各类抓取经验如下：

| 类型 | 旧实现 | 值得保留的契约 | 不应直接照搬的部分 |
|---|---|---|---|
| RSS | HTTP 获取 Feed，`feedparser` 解析，使用 entry id/guid/URL 作为原生标识 | Feed URL、增量时间、原生 ID、规范化 URL、摘要不是完整正文 | Python `feedparser` 代码 |
| Hacker News | Firebase Top Stories API；按 `min_score` 和前 N 条过滤 | `min_score`、抓取条数、故事分数与评论数 | 当前没有实际启用信源，不能当成已运营能力 |
| HTML/CSS | CSS 选择器提取列表、标题、链接、可选摘要和日期 | 通用选择器配置模型 | 页面变更后选择器容易失效，需要健康检查 |
| X | `twitterapi_io` 拉账号时间线；跳过回复，可配置转推/引用；长文、外链正文和普通推文分流 | username、转推/引用开关、拉取上限、互动指标、原帖/引用/外链上下文 | `tikhub` 虽允许配置，但运行时直接抛出“未实现” |
| YouTube | Google Data API 解析频道和最新视频；保留简介、时长、缩略图、互动；字幕优先 TikHub，回退 `yt-dlp` | channel URL、Shorts 开关、拉取上限、30 天窗口、简介与字幕分开保存 | 本地二进制、Cookie 文件和进程级“暂停”状态 |

证据：RSS 见旧仓库 `src/fetchers/rss.py:16-68`；Hacker News 见 `src/fetchers/hackernews.py:14-84`；HTML/CSS 见 `src/fetchers/html_css.py:17-92`；X 见 `src/fetchers/x.py:18-60,146-174,176-260`；YouTube 见 `src/fetchers/youtube.py:17-35,95-129,131-153`；字幕降级见 `src/services/youtube_subtitle.py:1-8,113-194,196-245`。

### 2.4 调度事实

旧配置保留了每个信源的 `interval_minutes`，但主调度器并不按它排程；所有启用信源都在统一的每日 `fetch_at` 时间运行，并加 0–30 秒随机抖动。流水线在每日 `pipeline_at` 运行。当前值是上海时区 04:00 抓取、04:30 处理。证据：旧仓库 `config/sources.yaml:6-23`、`config/config.yaml:8-11`、`src/scheduler.py:82-93,282-305`。

因此，新项目可迁移“每个信源可配置计划”的产品意图，但不能误以为旧代码已经实现了按源频率调度。

## 3. 旧用户画像

旧项目没有一个可版本化的“画像实体”；画像散落在三个 Prompt 和信源元数据里。

### 3.1 最接近真实个人画像的内容

`personal_relevance.txt` 给出的个人背景与目标是：

- 独立开发者、一人公司；有 20+ 年技术、产品、方案、销售复合经验；
- 通过 AI 内容输出积累用户、线索和信任；
- 建设 AI 内容筛选、知识沉淀、选题与自动化工作流；
- 关注 AI 应用、AI 编程、Agent 产品、企业 AI 落地、一人公司增长；
- 希望发现可复用工具、产品机会、工作流改进、内容素材、客户洞察、商业判断和技术路线参考。

它要求输出一句“对秋水的价值”和 1–3 条具体收获；价值低时允许没有收获。证据：旧仓库 `config/prompts/personal_relevance.txt:1-18,26-40`。

### 3.2 主题兴趣词表

预筛 Prompt 实际有 14 个主题：AI动态、AI产品、AI编程、AI智能体、AI工程化、AI落地、AIGC创作、AI硬件、AI知识库、AI提示词、GEO、自媒体运营、一人公司、创业增长。它还定义了 8 个内容形态：资讯、实战、技巧、资源、分析、案例、访谈、开源项目。证据：旧仓库 `config/prompts/prefilter.txt:10-26,71-82`。

预筛的强负面规则包括纯广告、活动/报名/招聘/抽奖、引流壳、空泛观点、无细节产品宣发、目录壳、封闭不可达内容和只有结果没有方法的案例。证据：旧仓库 `config/prompts/prefilter.txt:28-70`。

### 3.3 画像不一致

评分 Prompt 只写了 7 个关注领域，并强调“实用性优先”；它没有覆盖预筛中的 AIGC、AI硬件、AI提示词、GEO、自媒体运营、一人公司等完整分类，也没有把个人背景结构化。证据：旧仓库 `config/prompts/score.txt:1-9`。

结论：这些内容适合做新画像的 **初始访谈草稿**，不适合原样当成新项目的最终画像。新画像至少要成为可版本化、可回测、需人工确认后生效的独立对象，而不是继续散落在 Prompt 里。

## 4. 旧评分、精选与反馈

### 4.1 旧评分公式

LLM 给 5 个 1–10 分的分项：

| 分项 | 权重 |
|---|---:|
| 可实操性 `actionability` | 30% |
| AI 核心度 `ai_relevance` | 20% |
| 商业价值 `business_value` | 20% |
| 内容深度 `depth` | 15% |
| 新鲜度 `novelty` | 15% |

之后纯代码按下面的方式合成 0–100 总分：

```text
基础分 = 加权分项总和 × 10
调整分 = 基础分 × 信源层级倍率 × 内容形态倍率
         + 信源类型加分 + 原创性加分 + 手工权威加分
最终分 = 限制到 0..100(调整分 - 重复发现惩罚)
```

当前配置的层级倍率为 T1=1.10、T1.5=1.00、T2=0.90；内容形态倍率为 0.90–1.15；精选阈值为 T1=55、T1.5=60、T2=70。证据：旧仓库 `config/config.yaml:60-85`、`src/scoring_strategy.py:19-48`。

评分结果还保存内容形态、分项分、总分、版本、标签、推荐短句、处理建议和分数拆解，这种“可解释评分记录”值得迁移为新系统的数据契约。证据：旧仓库 `src/pipeline/score.py:72-117`、`src/schema.sql:42-54`。

### 4.2 旧精选不是新的“两级流”

旧系统只有“是否达到精选阈值”的一层判断，而且阈值随信源 T1/T2 改变。它没有“第一级最符合、第二级次符合”的统一产品模型。数据库视图还把阈值写死，而 Web 从运行时配置读取，存在两套口径。证据：旧仓库 `src/schema.sql:108-116`、`src/web/routers/items.py:204-208,342-354`。

此外，评分 Worker 虽存在，但每日主流水线只执行预筛和提炼，没有调用评分或聚类；源码注释、命令帮助和前端提示仍声称流水线包含 score/cluster，事实不一致。证据：旧仓库 `src/scheduler.py:149-199,200-246`、`src/main.py:122-132,193-207`、`ui/src/pages/Pipeline.tsx:79-98`。

### 4.3 旧反馈语义

旧系统支持：

- `mark_fp`：误选；保留条目原状态，但从 Feed 和本地导出排除；
- `mark_fn`：漏选；把条目退回 `PREFILTERED` 等待再处理；
- `undo`：新增一条撤销记录；
- `score_adjust`：人工修改总分，并保存旧分、新分与备注；
- 反馈快照：保存当时标题、摘要、分项分、总分、内容形态和评分版本。

证据：旧仓库 `src/web/routers/feedback.py:51-64,95-147`、`src/web/routers/items.py:471-508`、`src/services/feed_export.py:143-152`。

它不等于新项目已经确认的“喜欢、一般、不喜欢、垃圾”四态反馈，也没有“系统生成画像候选版本 → 回测 → 人工确认 → 生效/回滚”的闭环。`is_optimized` 只是可手工修改的记录字段。证据：旧仓库 `src/schema.sql:118-132`、`src/web/routers/feedback.py:184-202`。

### 4.4 全量可见性缺口

旧 Web 把数据拆成待处理、Feed、已拒绝和反馈页面；主 `/api/items` 明确排除 RAW、REJECTED 以及最近一次 `mark_fp` 的条目，没有一个统一查看所有内容的入口。证据：旧仓库 `src/web/routers/items.py:254-289,292-367,370-420`。

新项目要求“所有数据都有统一查看处，包括垃圾内容”，因此垃圾必须是 **可筛选状态/标签，不是删除动作**；统一内容库应能覆盖任何处理状态与任何反馈状态。

### 4.5 旧模型调用剖面（供后续架构比较）

旧项目不是“一个智能体自己决定下一步”，而是代码固定编排：每个 Worker 读取固定状态的条目，拼固定 Prompt，调用固定的模型槽位，再由代码写回固定状态。`LLMClient` 只有 `cheap` 和 `main` 两个槽位，各自绑定 provider、model、并发和超时。当前两个槽位实际都配置为火山 Ark 的 `doubao-seed-2-0-mini-260428`，并发均为 3、超时均为 60 秒。证据：旧仓库 `config/config.yaml:13-41`、`src/ai/llm.py:20-148`。

#### 每条内容的调用次数

下表只计算模型请求，不计算抓取网页、X API、YouTube API 或字幕请求。

| 内容路径 | 固定调用 | 当前日常链路中的总调用数 |
|---|---|---:|
| 预筛后拒绝 | `prefilter`：标题 + 正文调用 1 次 `cheap_json`；YouTube 只传标题 + 简介 | 1 cheap |
| 普通文章 / X 长文 / 外链文章，通过预筛 | 预筛 1 cheap；`distill_summary` 用完整正文调用 1 main text；`distill_personal_relevance` 用摘要调用 1 main JSON | 1 cheap + 2 main |
| 普通 X 短帖，通过预筛 | 预筛 1 cheap；`distill_translate` 1 cheap；不再调用深度摘要；个人价值 1 main JSON | 2 cheap + 1 main |
| 不超过 60 分钟的 YouTube，通过预筛 | 预筛只看简介 1 cheap；深度总结读取完整字幕 1 main text；个人价值读取摘要 1 main JSON | 1 cheap + 2 main |
| 超过 60 分钟的 YouTube，通过预筛 | 预筛只看简介 1 cheap；跳过深度总结；个人价值基于标题 + 简介调用 1 main JSON | 1 cheap + 1 main |
| 评分（Worker 单独运行时） | `score` 用提炼结果（没有则原文）调用 1 main JSON | 日常 Runner 未调用；若接入则再加 1 main |
| 聚类（Worker 单独运行时） | 标题 + 正文前 500 字生成一次 embedding，再与全部 canonical 向量做本地余弦比较 | 日常 Runner 未调用；默认还是本地 hash stub |

证据：预筛输入与调用见旧仓库 `src/pipeline/prefilter.py:91-125`；翻译、摘要和个人价值分支见 `src/pipeline/distill.py:135-223`；评分输入见 `src/pipeline/score.py:67-117`；聚类输入和默认实现见 `src/pipeline/cluster.py:18-27,39-75,104-127`。

#### 批处理与并发不是模型 Batch API

- 配置把 `prefilter`、`distill`、`score` 的批量上限都设为 1000；Runner 每轮最多分别取 1000 个 RAW、1000 个 PREFILTERED、1000 个兼容 ENRICHED 条目，然后为每条内容创建一个异步任务。证据：旧仓库 `config/config.yaml:43-50`、`src/scheduler.py:149-187`。
- Runner 用 `ai.main.concurrency` 作为全条目并发闸门，当前为 3；`LLMClient` 内部又为 cheap/main 各设一个并发信号量，当前也都是 3。同一条目的多个阶段按顺序调用。证据：旧仓库 `src/scheduler.py:179-187`、`src/ai/llm.py:20-27,29-148`。
- 这里的“batch”只是一次从数据库取多少条，再发出很多单条 HTTP 请求；没有使用提供商的离线 Batch API，也没有把多条内容合并进一次模型请求。Ark provider 每次调用都会向 `/responses` 发一个 system + user 请求。证据：旧仓库 `src/ai/providers/ark.py:57-77,90-106,114-208`。

#### 状态恢复、重试与避免重复消费

- 成功后条目从 RAW → PREFILTERED/REJECTED → DISTILLED 推进；下一轮只查询仍停留在对应状态且 `retry_count < 3` 的条目，所以已成功阶段一般不会重复调用。失败时状态不推进，只增加重试数并保留错误。证据：旧仓库 `src/db.py:835-870`、`src/pipeline/prefilter.py:33-66`、`src/pipeline/distill.py:113-133,213-223`、`src/pipeline/score.py:37-47,101-123`、`tests/test_prefilter_worker.py:90-145`、`tests/test_score_worker.py:95-129`。
- provider 对网络错误和 5xx 最多重试 3 次，退避 2–8 秒；外层条目又允许最多 3 次运行机会。因此同一逻辑阶段持续遇到“可重试错误”时，理论上最多可能产生 9 次网络请求。4xx 不重试；Ark JSON 解析失败也不在 provider 重试条件内，而由外层条目重试处理。证据：旧仓库 `src/ai/providers/ark.py:16-21,108-113,158-163`、`src/ai/providers/base.py:60-77`。
- URL 规范化唯一索引避免同一个 URL 建多个主条目，多信源命中则保存 discovery；这能减少对完全相同主条目的重复模型处理。证据：旧仓库 `src/schema.sql:62-68,156-169`。

#### Token 与效率：源码能证明什么，不能证明什么

能直接证明的事实：

- 预筛对普通内容传完整 `content`，没有字符或 Token 截断；YouTube 是特例，只传 description。证据：旧仓库 `src/pipeline/prefilter.py:91-123`。
- 普通文章和 60 分钟以内 YouTube 的深度总结传完整内容/字幕，也没有通用截断；个人价值阶段再把生成的完整摘要传给下一次 main 调用。证据：旧仓库 `src/pipeline/distill.py:146-198`。
- 超过 60 分钟的 YouTube 跳过完整字幕总结，只用简介做个人价值判断；这是唯一明确的长内容成本闸门。代码会记录 YouTube 分析输入字符数，但其他内容没有同类字段。证据：旧仓库 `src/pipeline/distill.py:23,86-93,159-171,201-211`。
- 聚类若换成真实 embedding，每条只发送“标题 + 正文前 500 字”；默认本地 stub 不产生远程 Token。证据：旧仓库 `src/pipeline/cluster.py:18-27,39-60,69-76`、`src/ai/embedding.py:9-31`。

不能从旧系统直接得到的事实：

- `ProviderCallResult` 和 `item_llm_calls` 都没有 input/output/total token 或费用字段；审计只保存 provider、model、请求、原始响应、成功/错误与耗时。因此旧数据库不能直接汇总“每条内容用了多少 Token、花了多少钱”。Ark 的原始响应文本可能携带 provider usage，但旧代码没有把它规范化为可查询字段。证据：旧仓库 `src/ai/providers/base.py:11-19`、`src/schema.sql:185-207`、`src/ai/llm.py:150-215`。
- 源码没有保存 Prompt 字符数、普通正文输入字符数或模型缓存命中信息，也没有跨条目 Prompt 缓存/前缀缓存的显式控制。因此后续比较只能先使用上面的“每条调用次数 + 输入范围 + 并发”作为静态基线；真实 Token/耗时必须从样本运行重新测量。

这一节只提供比较基线，不据此决定新项目应采用固定流水线、Pi 智能体或两者混合。

## 5. 值得迁移的清单

这里的“迁移”指把事实或行为契约带入 TypeScript 新项目，不等于复制旧代码。

| 输入 | 迁移方式 | 原因 |
|---|---|---|
| 33 个信源的 slug、名称、账号/频道/Feed、T1/T2、source kind、originality、authority weight | 转成新项目的可导入信源种子；默认先禁用，再按测试范围启用 | 这是已积累的信源资产 |
| 5 类抓取器的配置模型 | 在 TypeScript 中重写为适配器接口和类型校验 | RSS、HN、HTML/CSS、X、YouTube 的输入差异仍然成立 |
| URL 规范化、主内容去重、多信源发现记录、互动快照 | 迁移为数据库约束与领域契约 | 同一内容可能从多个源发现，不能丢出处 |
| X 长文、外链文章、普通推文三路分流 | 迁移行为测试 | 可避免把外链壳或 X 长文误当普通短帖 |
| YouTube 简介、字幕、时长与 30 天窗口分开处理 | 迁移为可配置策略 | 简介适合便宜预判，字幕适合深加工 |
| 每阶段状态、错误、重试次数、耗时、抓取调用与模型调用审计 | 迁移为统一任务运行/内容处理记录 | 便于恢复、排障与回测 |
| 个人画像文字和 14 主题/8 形态词表 | 只作为新版画像确认的种子 | 有真实偏好价值，但当前不一致且不可版本化 |
| 5 个评分维度、总分拆解和评分版本 | 作为新评分方案的基线与回测对照 | 支持用户要求的“总分 + 悬停/点击看分项” |
| 旧测试表达的行为边界 | 改写成 TypeScript 测试 | 测试意图有价值，Python 测试实现没有迁移价值 |

去重、发现、快照与调用审计的数据依据见旧仓库 `src/schema.sql:25-78,156-227`；状态依据见 `src/status.py:4-21`；配置类型依据见 `src/config.py:16-26,40-67,101-144`。

## 6. 必须重设计的清单

| 能力 | 为什么不能原样迁移 | 新项目需要保留的边界 |
|---|---|---|
| 个人画像 | 分散在多个 Prompt，主题口径不一致，没有版本、证据或回滚 | 系统可提出画像更新；人工确认后生效；能回测与回滚 |
| 两级每日精选 | 旧系统只有按信源层级变化的单阈值精选 | 总分对应两级；数量不限；低于第二级仍在统一内容库可查 |
| 四态反馈 | 旧语义是“误选/漏选”，不是“喜欢/一般/不喜欢/垃圾” | 无操作不等于负反馈；垃圾是强负样本但内容仍保留 |
| 自我迭代 | 旧系统只存反馈，没有自动形成候选规则的运行闭环 | 画像、Prompt、权重或阈值变更都需候选版本、回测、人工批准 |
| 统一内容库 | 旧页面和接口按状态拆开，部分内容被主列表排除 | 一处可查全部原始、处理中、两级精选、低分、拒绝和垃圾内容 |
| 邮件推送 | 旧运行依赖与路由中没有邮件发送模块 | 推送是处理结果的消费者；失败不能影响抓取和处理；需要发送审计与重试 |
| 调度 | `interval_minutes` 名义存在但未生效 | 明确是全局批次计划还是逐信源计划，避免配置失真 |
| 鉴权 | 固定明文账号密码，业务身份由可伪造的 `X-User` 头传递 | 单用户私有 Web 仍需真实会话与远程访问保护 |
| 信源删除 | 旧代码临时关闭外键后删除信源，故意留下孤儿内容 | 为满足“所有数据可查”，应停用/归档信源，不破坏内容来源关系 |

证据：旧鉴权明确自称“非真实鉴权”，见旧仓库 `src/web/routers/auth.py:1-4,22-34` 和 `src/web/deps.py:12-23`；信源删除见 `src/web/routers/sources.py:167-177`；旧依赖清单无邮件组件，见 `pyproject.toml:7-27`。

## 7. 明确不迁移的清单

| 不迁移对象 | 处理方式 |
|---|---|
| Python/FastAPI/APScheduler/`sqlite3` 运行时代码 | 新项目用 TypeScript + Pi 重写；只带走行为契约 |
| SQLite DDL、`.db` 文件、SQLite 视图/PRAGMA/迁移脚本 | 不进入新项目；新存储由架构票决定，但必须支持统一查询、审计和版本化 |
| 历史内容、收藏、已读和反馈 | 按用户要求全部舍弃，新项目重新抓取 |
| 旧的 `mark_fp`/`mark_fn` 页面交互 | 用四态反馈和统一内容库取代 |
| 旧的单层 `is_curated` 逻辑 | 用新的两级内容分层取代 |
| 旧的明文账号配置 | 不复制密码或用户配置 |
| `youtube-cookies.txt`、API key、`.env` 或其他本机凭证 | 绝不提交或复制；在新项目用秘密管理重新配置 |
| 旧本地 Markdown 收藏/导出结果 | 用户不迁移历史内容；是否保留“导出能力”另行决定 |
| 旧页面布局和桌面优先交互 | 新 Web 需响应式；分数明细桌面悬停、移动端点击 |

Python 与 SQLite 的直接耦合可见旧仓库 `pyproject.toml:1-27`、`src/main.py:43-50,122-151`、`src/db.py:1-24`、`src/scheduler.py:1-50`。数据表范围可见 `src/schema.sql:1-251`。

## 8. 已知缺陷与风险，禁止无意带入新项目

1. **日常处理链路不含评分。** 主 Runner 停在 `DISTILLED`，所以旧“精选”无法由日常任务稳定产出。旧 E2E 测试是直接逐个调用 Worker，不能证明 Runner 已串通评分。证据：旧仓库 `src/scheduler.py:149-199`、`tests/test_pipeline_e2e.py:96-117,148-171`。
2. **调度配置名不副实。** 每源 `interval_minutes` 不参与实际排程。证据：旧仓库 `config/sources.yaml:6-23`、`src/scheduler.py:82-93`。
3. **精选阈值双口径。** SQLite 视图写死 55/60/70，Web 读取运行时配置。证据：旧仓库 `src/schema.sql:108-116`、`src/web/routers/items.py:342-354`。
4. **画像与分类漂移。** 预筛有 14 个主题，评分只描述 7 个领域，个人价值又在第三个 Prompt 里。证据：旧仓库 `config/prompts/prefilter.txt:10-26`、`config/prompts/score.txt:1-9`、`config/prompts/personal_relevance.txt:9-18`。
5. **X provider 配置会骗人。** 校验允许 `tikhub`，真正构建时却直接报未实现。证据：旧仓库 `src/fetchers/x.py:26-31,50-60`。
6. **删除信源破坏来源完整性。** 路由关闭外键后删除信源并保留条目，留下无法正常关联的来源。证据：旧仓库 `src/web/routers/sources.py:167-177`、`tests/test_web_sources.py:72-91`。
7. **反馈不能直接支持新版学习。** 只有误选、漏选、撤销和改分，没有四态语义，也没有画像候选版本与批准记录。证据：旧仓库 `src/schema.sql:118-132`、`src/web/routers/feedback.py:21-34,95-147`、`src/web/routers/items.py:471-508`。
8. **全部内容无法在一个入口查看。** 主列表主动排除了待处理、拒绝和误选内容。证据：旧仓库 `src/web/routers/items.py:292-367`。
9. **单用户安全仍不合格。** 密码来自明文配置，登录只返回用户名，后端直接相信 `X-User`。证据：旧仓库 `config/config.yaml:3-6`、`src/web/routers/auth.py:22-34`、`src/web/deps.py:12-14`。
10. **字幕依赖脆弱。** TikHub、`yt-dlp`、本地 Cookie、语言轨和平台风控任一项都可能导致空字幕，而且部分失败会使本进程后续请求整体暂停。证据：旧仓库 `src/services/youtube_subtitle.py:1-8,109-134,167-245`。

## 9. 给后续决策票的输入

后续票不必再重新盘点旧项目，可以直接从这些问题开始：

1. 新版画像用哪些结构化维度表示，初始版本如何从旧画像中确认？
2. 两级精选各自的分数含义和阈值是什么？信源权威度是总分的一部分，还是只做解释信息？
3. “喜欢、一般、不喜欢、垃圾”分别如何影响画像、评分和信源健康；需要多少样本才提出新版本？
4. 统一内容库如何表示原始内容、处理状态、两级精选和垃圾，同时保证任何数据都可检索？
5. 邮件发送的是摘要、链接还是完整精选；何时发送、失败如何重试？
6. 33 个旧信源在首期如何分批验证，哪些仅迁移为禁用候选？

## 10. 建议的验收基线

当后续进入实施时，至少应验证：

- 33 个信源定义可导入，且不会自动全量抓取；
- 每种实际启用的抓取器至少用 1 个真实信源完成抓取；
- 每条数据无论低分、拒绝或垃圾，都能从统一内容库检索并打开；
- 每条精选展示总分，桌面悬停、移动端点击可看分项；
- 四态反馈保留当时画像版本、评分版本和分数快照；
- 系统只能提出调整候选，未经人工确认不能改变线上画像或评分；
- 邮件失败不回滚已经完成的抓取与处理，并有重试/审计记录；
- 进程重启后可从持久状态继续，不重复抓取、不丢反馈；
- 仓库、构建产物和运行目录中不存在 SQLite 数据库或 SQLite 依赖。
