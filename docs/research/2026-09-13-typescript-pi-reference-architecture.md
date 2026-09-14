# TypeScript、Pi 与参考项目的架构边界

> 日期：2026-09-13
>
> 对应决策票：研究 TypeScript、Pi 与参考项目的架构边界
>
> 调研口径：只使用官方文档、官方仓库源码和本项目旧代码；外部仓库结论固定到文末列出的 commit。

## 一句话结论

采用**混合式架构**：TypeScript 任务系统负责定时抓取、去重、状态、重试、计分、分级、保存和邮件；高频的单条语义处理通过 Pi 的统一模型 API 做一次性结构化调用；只有低频、需要跨多条反馈推理的“画像演进”才交给 Pi Agent，并显式调用一个受限 Skill。**Skill 不是流水线，也不是计算引擎。**

```text
确定性 TypeScript 数据面                         低频 Pi 智能面

定时器 -> 抓取 -> 归一化/去重 -> 全量入库          人工反馈累计
                    |                                |
                    v                                v
          一次性模型分析（Pi AI）              Pi Agent + 画像演进 Skill
                    |                                |
                    v                                v
          代码计算总分/两级分流              画像草案 + 回测结果
                    |                                |
                    v                                v
        Web 全量查看 + 幂等邮件发送          人工确认后才切换版本
```

这个边界既保留旧项目“模型只判断、程序负责编排”的优点，又把真正需要多步推理的个性化演进交给 Pi。

## 1. 已确认的产品约束

- Web 是主要产品形态，响应式适配手机；不为首期另建原生移动端或桌面端。
- 每条内容保存一个总分和可追溯的分项分数；电脑悬停、手机点击查看分项。
- 精选分两级，数量不限：第一级最符合当前画像，第二级是探索候选；分级由版本化阈值决定。
- 手工反馈为“喜欢 / 一般 / 不喜欢 / 垃圾”；没有操作不等于负反馈。
- “垃圾”表示广告、引流壳或无实质内容等强负样本，但**仍须保留并可在统一的全部内容视图查询**。
- 系统可以总结反馈规律并提出画像新版本，但未经人工确认，不得自动启用新画像、Prompt 或评分规则。
- 推送渠道首期为邮箱；邮件只是已保存结果的投影视图，不是数据来源或唯一副本。

## 2. 核心选择：直接调用，还是 Pi + Skill

### 2.1 先把三个概念分开

1. **确定性程序任务**：普通 TypeScript 代码。固定输入和规则版本下，规则计算应得到相同结果，不消耗模型 Token；网络请求本身可能失败，所以要用幂等键和持久化状态保证可重试。
2. **一次性模型调用**：程序明确选择 Prompt、模型和输出结构，调用一次后校验结果；适合“给这条内容分类/总结/打分”。Pi 的 `pi-ai` 官方定位是统一模型 API，并直接提供 provider、认证、Token/成本统计和 `complete()` 能力。[Pi AI README](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/ai/README.md#L1-L5) [调用与用量](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/ai/README.md#L101-L129)
3. **Pi Agent + Skill**：模型先读取 Skill 的说明，再自行决定调用哪些工具、是否继续下一轮。Pi Agent 是“带工具执行和事件流的有状态智能体”，工具调用会形成新的模型轮次。[Pi Agent README](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/README.md#L1-L3) [工具调用流程](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/README.md#L91-L124)

Pi 官方对 Skill 的定义是按需加载的工作流说明、脚本和参考资料。启动时只放名称和描述，命中任务后才读取完整 `SKILL.md`；官方还明确提示模型不一定总会自动加载，应通过 Prompt 或显式命令强制。[Pi Skills](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/skills.md#L3-L7) [加载机制](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/skills.md#L65-L72)

还要注意：裸 `new Agent()` 不会凭空发现产品 Skill。Pi 仓库把“扫描目录、加载 `SKILL.md`、格式化调用 Prompt”做成显式的 harness 函数，应用必须主动接入 loader，并在画像演进任务中指定要调用的 Skill；否则它只是普通 Agent。[Pi Skill loader 源码](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/skills.ts#L38-L77)

因此，Skill 能统一“怎么做”的知识，却不会自动提供可靠调度、幂等、事务或持久化。Skill 里即使带脚本，真正可重试的工作仍是脚本/工具本身。

### 2.2 量化比较

评分为 1–5，5 表示更适合本项目的定时批处理。Token 一栏的 5 表示消耗最低。

| 方案 | 批量效率 | Token | 并发/重试 | 确定性 | 审计 | 测试 | 维护 | 结论 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| TypeScript 确定性任务 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 所有可编码规则的默认选择 |
| 程序直接调用 Pi AI，一次一任务 | 4 | 4 | 4 | 2 | 5 | 4 | 4 | 单条分类、总结、分项评分的默认选择 |
| 每条内容启动 Pi Agent + Skill | 2 | 2 | 2 | 1 | 3 | 2 | 3 | 不用于日常内容流水线 |
| 确定性数据面 + 一次性调用 + 低频 Agent Skill | 5 | 4 | 5 | 4 | 5 | 4 | 5 | **推荐** |

说明：

- Skill 标准给出的上下文量级是：目录中的每个 Skill 元数据约 50–100 Token；激活后完整 `SKILL.md` 建议少于 5,000 Token；脚本输出又会进入上下文。[Agent Skills 渐进加载](https://agentskills.io/client-implementation/adding-skills-support#the-core-principle-progressive-disclosure) [规范](https://agentskills.io/specification#progressive-disclosure)
- 一次性调用近似为 `任务 Prompt + 内容 + 输出`。Agent + Skill 至少多出 `Agent 系统提示 + Skill 目录 + Skill 正文`；一旦调用工具，官方事件流显示工具结果后还会再发起下一轮模型调用。
- 对 100 条独立内容，如果每条都新开 Agent，固定上下文会重复 100 次；直接调用只需一次模型往返/条，并可由队列按 provider 限流并发。实际倍率取决于 Skill 长度、工具结果和模型缓存，架构上不承诺一个虚假的固定百分比。
- Pi Agent 支持同一轮工具并行、逐个执行和调用前拦截，但这是**单次 Agent 运行内**的能力，不等于持久化作业队列。[工具执行模式与拦截](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/README.md#L117-L128)
- Pi 的 `continue()` 可在一次会话出错后继续，但它不提供业务作业的幂等键、退避、死信和跨进程恢复；这些仍由任务系统负责。[continue](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/README.md#L152-L161)

### 2.3 旧方案不是推倒重来

旧项目已经采用了正确的基本方向：Worker 并发调用 LLM、校验结构化输出、记录调用审计，并由纯代码根据分项分数计算最终分。例如 `ScoreWorker` 明确写成“LLM 五维评分 + 纯代码 final_score”，`LLMClient` 控制并发并保存请求、响应、错误和耗时。

需要重构的是运行可靠性和边界，而不是把这些高频调用全部改成 Agent：

- 从进程内 `gather + retry_count` 升级为可恢复的持久化作业；
- 从散落 Prompt 升级为版本化的 AI 任务契约；
- 从“被拒绝就离开主视图”升级为“所有内容都保留，状态只影响默认视图和推送”；
- 增加 Pi Agent + Skill 的画像演进控制面，但不让它接管逐条流水线。

## 3. 每个阶段到底用什么

| 阶段 | 执行方式 | 原因与边界 |
|---|---|---|
| 定时触发、错峰、互斥 | TypeScript 确定性任务 | 时间和锁不能交给模型判断；触发只负责入队 |
| 信源抓取 | TypeScript `SourceAdapter` | 每个信源独立超时、限流、游标、重试；首测每类信源配置 1 个实例 |
| 正文/字幕补全 | TypeScript，必要时调用专用外部服务 | HTTP/API 优先，HTML 次之，浏览器最后；失败不阻塞同源其他条目 |
| URL 归一化、去重、来源合并 | TypeScript + 数据库约束 | 必须幂等；同内容多信源发现仍保留发现证据 |
| 明显垃圾规则 | TypeScript | 已知广告域名、空壳、重复模板等低成本规则；只写判断，不删除内容 |
| 语义垃圾、兴趣匹配、质量/深度/实用性/新颖性 | **程序直接调用 Pi AI** | 一条输入、一份结构化输出，不需要 Agent 选工具 |
| 摘要、推荐理由、翻译 | **程序直接调用 Pi AI** | 无外部动作；按内容版本缓存，失败只重试本阶段 |
| 总分与两级分流 | TypeScript | 模型只给分项和证据，代码按版本化权重计算总分与阈值 |
| Web 全量查询与反馈 | TypeScript API | “垃圾”仍可查；反馈追加记录，不覆盖历史判断 |
| 画像演进 | **Pi Agent + 显式 Skill** | 跨反馈样本归纳规律、比较旧/新画像、调用回测工具，适合多步推理 |
| 画像生效 | TypeScript 人工确认接口 | Agent 只能提交草案；确认、版本切换和回滚必须确定性执行 |
| 每日邮件 | TypeScript 幂等任务；AI 总览可选用一次性调用 | 邮件只读已入库的精选；按日期/收件人建立幂等键，失败可重发 |

高频 AI 任务应放在 `packages/ai-tasks` 一类的普通 TypeScript 包中，每个任务固定：输入 schema、输出 schema、Prompt 版本、模型策略、超时、最大重试和成本上限。输出校验失败视为本阶段失败，不允许模型自行绕过 schema。

画像演进 Skill 则只包含本项目特有的判断流程，并只暴露受限工具，例如：

- `read_feedback_window`：只读一段时间内的反馈和当时快照；
- `read_profile_version`：读取当前及候选画像；
- `run_profile_backtest`：用确定性程序在保留样本上回测；
- `submit_profile_proposal`：只创建待确认草案，不能激活；
- 不提供删除内容、发送邮件、改信源、直接改 active profile 的工具。

Skill 需显式调用，不依赖模型自行“猜中”是否加载；每次运行保存 Skill 版本、模型、输入样本范围、工具调用、输出草案和回测结果。Pi 的 `beforeToolCall` 可再阻止越权工具，但数据库权限和服务端校验仍是最终边界。[Pi 调用前拦截](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/README.md#L124-L128)

## 4. 推荐的 TypeScript 结构

“全栈 TypeScript”不等于把 Web、定时器、抓取和 Agent 塞进一个进程。建议一个仓库、三个运行入口、共享领域契约：

```text
apps/
  web/                 # 响应式 Web + shadcn/ui；页面与轻量 API/BFF
  worker/              # 抓取、处理、评分、邮件、回测
  scheduler/           # 只产生周期任务；也可与 worker 同部署但保持代码边界
packages/
  domain/              # Item、Source、Feedback、Profile、Job 状态与规则
  db/                  # 唯一数据访问边界、迁移、事务
  source-adapters/     # 每个信源一个适配器
  jobs/                # 作业 schema、幂等键、重试策略
  ai-tasks/            # 一次性模型任务、Prompt/schema/version
  pi-profile-agent/    # Pi Agent、画像 Skill、受限工具
  ui/                  # 项目持有的 shadcn/ui 组件和设计令牌
```

TypeScript 官方建议给 server、DOM、worker、test 和共享代码分别设置 `tsconfig`，再用 project references 连接，以强化逻辑边界。[TypeScript 编译配置建议](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options#im-writing-an-app) [Project References](https://www.typescriptlang.org/docs/handbook/project-references)

所有外部输入必须做运行时校验：TypeScript 是运行前静态检查，不能替代对 RSS、第三方 API、任务 payload 和模型 JSON 的 Zod/TypeBox 校验。[TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro)

### 4.1 最小领域状态

- `source`：配置、类型、启停、游标、健康状态；不把密钥放进普通配置 JSON。
- `item`：归一化内容主记录，任何判断结果都不删除它。
- `discovery`：某信源在何时发现某条内容，保留原始外部 ID 和快照。
- `content_revision`：正文/字幕的版本和提取证据。
- `analysis_run`：任务、Prompt、画像、模型、输入版本、Token/成本、响应、错误。
- `score`：分项、总分、分级、理由及使用的规则版本。
- `feedback_event`：喜欢/一般/不喜欢/垃圾/撤销，追加写并保存当时快照。
- `profile_version`：草案、已确认、已停用、回滚关系。
- `job_run`：幂等键、状态、尝试次数、下次重试时间、错误。
- `delivery_attempt`：邮件内容版本、收件人、发送状态和 provider message id。

“统一查看所有数据”意味着 Web 的“全部内容”直接查询同一套 `item` 权威数据，通过状态筛选垃圾、低分、失败、待处理和两级精选；不能为垃圾单独建一个不可见的黑洞库，也不能只保留聚合统计。

### 4.2 幂等与重试键

- 抓取：`source_id + external_id`，没有稳定 external id 时使用归一化 URL hash。
- 内容分析：`item_id + content_revision + task_type + prompt_version + profile_version + model`。
- 画像回测：`candidate_profile_version + dataset_snapshot`。
- 每日邮件：`digest_date + recipient + digest_version`。

网络超时、429 和临时 provider 错误可退避重试；schema 不合法可有限重试；确定性的无正文、已禁用信源和非法配置直接终止并标明原因。不得重跑已成功且幂等键未变化的模型任务。

## 5. 参考项目：借什么，不借什么

### 5.1 TrendRadar

**值得借鉴**

- 将 `collect / analyze / push` 作为三个独立调度动作，并记录某时段是否已执行，说明采集、分析和推送不应绑成一次不可拆的运行。[Scheduler](https://github.com/sansan0/TrendRadar/blob/b6ceb76ad3f8f4b34bc39e8ac73cd3e969f97217/trendradar/core/scheduler.py#L17-L45)
- 对兴趣描述做 hash，给标签做版本，并跳过已分析内容；兴趣变化时区分增量更新和全量重算。[筛选流水线](https://github.com/sansan0/TrendRadar/blob/b6ceb76ad3f8f4b34bc39e8ac73cd3e969f97217/trendradar/ai/filter_pipeline.py#L68-L73) [更新与重分类](https://github.com/sansan0/TrendRadar/blob/b6ceb76ad3f8f4b34bc39e8ac73cd3e969f97217/trendradar/ai/filter_pipeline.py#L174-L237)
- 保存“已分析但未匹配”的记录，避免重复 Token；这与本项目“垃圾和低分也保留”的要求一致。[AI filter schema](https://github.com/sansan0/TrendRadar/blob/b6ceb76ad3f8f4b34bc39e8ac73cd3e969f97217/trendradar/storage/ai_filter_schema.sql#L40-L53)
- 推送 dispatcher 独立支持邮件，适合借鉴“渲染和发送不影响内容处理”的边界。[通知 dispatcher](https://github.com/sansan0/TrendRadar/blob/b6ceb76ad3f8f4b34bc39e8ac73cd3e969f97217/trendradar/notification/dispatcher.py#L255-L363)

**不应照搬**

- 不复制其 Python、SQLite 或一体化主流程；本项目明确采用 TypeScript，且需更强的逐作业恢复和统一数据查询。
- 不让 AI 根据兴趣变化自动替换生效标签；本项目只能产出候选画像，必须人工确认。
- 仓库是 GPL-3.0；只能学习思想，复制代码前必须单独做许可评估。[License](https://github.com/sansan0/TrendRadar/blob/b6ceb76ad3f8f4b34bc39e8ac73cd3e969f97217/LICENSE)

### 5.2 RSSHub

**值得借鉴**

- 每个站点按 namespace/route 隔离，并用统一 `Route` 类型描述参数、能力和 handler，适合抽象本项目的 `SourceAdapter`。[官方 Route 指南](https://github.com/RSSNext/rsshub-docs/blob/7623171adbeb6f03134511a01d7f1987d33a7839/src/joinus/new-rss/start-code.md#L51-L67)
- 抓取优先使用官方 API，再退到 HTML，最后才使用浏览器；信源适配层应遵守相同优先级。[官方创建 Route 指南](https://github.com/RSSNext/rsshub-docs/blob/7623171adbeb6f03134511a01d7f1987d33a7839/src/joinus/new-rss/start-code.md#writing-route-handler-function)
- 对昂贵的详情/全文提取按 URL 缓存，避免重复请求。[官方缓存指南](https://github.com/RSSNext/rsshub-docs/blob/7623171adbeb6f03134511a01d7f1987d33a7839/src/joinus/advanced/use-cache.md#L5-L32)

**不应照搬**

- RSSHub 是“把网站转换成 Feed”的适配网络，不是内容数据库、评分系统或用户画像引擎；优先把它当外部 Feed 来源，不迁入数千条 route。
- 缓存命中不是持久化审计。RSSHub 缓存只能作性能层，不能成为本项目 `item` 的权威来源。
- 仓库是 AGPL-3.0；不要直接复制 route 代码进闭源或许可不兼容的产品。[License](https://github.com/DIYgod/RSSHub/blob/67305a500b0c90fba23a9155440ed28d2b011a6b/LICENSE)

### 5.3 Folo

**值得借鉴**

- 产品层面借鉴“多订阅进入一条统一时间线”和文章/视频/图片/音频的统一卡片语法。[Folo README](https://github.com/RSSNext/Folo/blob/44f0e5df06eba774afe1f1aea30d90a742da5dec/README.md#L37-L47) [动态内容与 AI](https://github.com/RSSNext/Folo/blob/44f0e5df06eba774afe1f1aea30d90a742da5dec/README.md#L79-L97)
- 共享包与应用代码分离、TypeScript strict、TanStack Query 管理服务端状态，这些边界适合 Web 首期。[Folo 架构说明](https://github.com/RSSNext/Folo/blob/44f0e5df06eba774afe1f1aea30d90a742da5dec/AGENTS.md#L5-L12) [类型与组件边界](https://github.com/RSSNext/Folo/blob/44f0e5df06eba774afe1f1aea30d90a742da5dec/AGENTS.md#L61-L67)

**不应照搬**

- 不采用 Electron + Expo + SSR 三套客户端。首期响应式 Web 足够，避免为同一个单用户场景维护多套界面。
- 不复制它的社交、共享列表、创作者经济和复杂客户端状态组合；这些超出“每日精选 + 全量后台 + 反馈”的终点。
- Folo 是 AGPL-3.0；只借产品模式和公开架构思想。[License](https://github.com/RSSNext/Folo/blob/44f0e5df06eba774afe1f1aea30d90a742da5dec/LICENSE)

### 5.4 Karakeep

**值得借鉴**

- Web/API 与 background workers 分开，抓取、推理、索引、Feed、Webhook 等作业各有独立 worker。[官方项目结构](https://github.com/karakeep-app/karakeep/blob/5a2f009e2f6d266087f2f3f527e6e384cefd6de4/AGENTS.md#L11-L35)
- 作业 payload 用 Zod 校验，显式设置重试次数；抓取提供稳定幂等键，高低优先级使用独立队列。[队列定义](https://github.com/karakeep-app/karakeep/blob/5a2f009e2f6d266087f2f3f527e6e384cefd6de4/packages/shared-server/src/queues.ts#L80-L135)
- embedding、tagging、indexing 拆开重试，避免索引失败重跑昂贵推理；这是本项目所有 AI 阶段应采用的失败隔离原则。[独立重试边界](https://github.com/karakeep-app/karakeep/blob/5a2f009e2f6d266087f2f3f527e6e384cefd6de4/packages/shared-server/src/queues.ts#L137-L170)
- 队列接口暴露幂等键、优先级、延迟、分组、并发、超时和状态统计；比让 Agent 自己“重试一下”更适合批量任务。[Queue 接口](https://github.com/karakeep-app/karakeep/blob/5a2f009e2f6d266087f2f3f527e6e384cefd6de4/packages/shared/queueing.ts#L20-L84)
- 抓取完成后才分别入队推理、索引和 webhook；失败时记录最终状态，说明副作用应以作业为单位隔离。[Crawler worker](https://github.com/karakeep-app/karakeep/blob/5a2f009e2f6d266087f2f3f527e6e384cefd6de4/apps/workers/workers/crawlerWorker.ts#L108-L199) [后续作业](https://github.com/karakeep-app/karakeep/blob/5a2f009e2f6d266087f2f3f527e6e384cefd6de4/apps/workers/workers/crawlerWorker.ts#L259-L327)

**不应照搬**

- Karakeep 的核心是“用户先保存书签，再抓取/标注”，本项目是“系统持续采集，再筛给用户”；不能让 bookmark 成为本项目领域中心。
- 不照搬其完整多应用、搜索、资产归档、规则引擎和插件体系；首期只取队列、状态、观测和分层 worker 的原则。
- 不继承其具体存储或队列实现；本项目必须先满足统一数据权威和部署约束。
- Karakeep 是 AGPL-3.0；不直接复制实现。[License](https://github.com/karakeep-app/karakeep/blob/5a2f009e2f6d266087f2f3f527e6e384cefd6de4/LICENSE)

### 5.5 shadcn/ui

shadcn/ui 官方明确称它不是传统组件库，而是把顶层组件源码交给项目持有，强调开放代码、组合和统一接口。[官方介绍](https://github.com/shadcn-ui/ui/blob/2b3e6d4f8d9161fe5c19340dc383aade392012dd/apps/v4/content/docs/%28root%29/index.mdx#L1-L18)

因此本项目应：

- 把引入的组件保存在 `packages/ui`，以项目自己的设计令牌、交互和无障碍测试为准；
- 统一卡片、筛选器、分数明细、反馈按钮和移动端交互，不在页面里各写一套；
- 把“悬停看分项”同时实现为可聚焦/可点击的 Popover，确保手机和键盘可用；
- 不把 shadcn/ui 当业务框架，也不复制其官网应用结构。

## 6. 对后续决策的硬约束

1. **Pi 不拥有流水线状态。** 数据库中的 item/job/profile 版本才是事实来源；Agent 消息历史不能代替业务数据。
2. **Skill 不逐条处理内容。** 高频内容任务直接调用 Pi AI；只有跨样本、需要工具迭代的画像演进使用 Pi Agent + Skill。
3. **Agent 无权直接生效画像。** 只能创建草案和回测；人工确认是独立确定性命令，可回滚。
4. **所有内容先保存再判断。** 垃圾、低分、失败和未处理都在同一“全部内容”查询面；状态不会触发物理删除。
5. **模型不计算最终总分。** 模型输出分项、标签、理由和置信度；TypeScript 按版本化公式计算总分和两级阈值。
6. **每个阶段独立幂等与重试。** 抓取失败不重做已成功分析，邮件失败不重跑评分，索引失败不重跑模型。
7. **Prompt、画像和规则都版本化。** 每次结果必须指向内容版本、Prompt 版本、画像版本、模型和规则版本。
8. **模型调用有预算。** 先用代码规则与短文本便宜筛选，再对候选做全文处理；不重复处理未变化内容。
9. **Web 首期只有一套。** 响应式 Web 覆盖电脑和手机；原生客户端、社交和公共订阅市场不进入首期。
10. **参考 AGPL/GPL 项目只借思想。** 若未来要复制代码，必须先单独完成许可证兼容审查。
11. **Pi 包坐标实施前再核验。** 本次官方仓库已从 `badlogic/pi-mono` 重定向至 `earendil-works/pi`，当前 README 使用 `@earendil-works/pi-*`；架构文档依赖能力边界，不把旧包名写死进长期契约。
12. **Skill 加载必须显式集成。** 画像演进入口主动加载并指定 Skill，启动时校验 Skill 版本和诊断结果；不能假设裸 Pi Agent 会自动发现或可靠选中它。

## 7. 需要后续决策票继续明确的事项

- 统一权威数据库与持久化队列的具体技术选型、备份和恢复目标。
- 首期信源清单、每种信源的稳定外部 ID、限流和正文完整性验收。
- 分项评分定义、权重、两级阈值，以及“垃圾”的自动规则与人工反馈优先级。
- 画像演进的最小样本数、触发周期、保留回测集和人工确认界面。
- 每日邮件发送时间、第一/第二级展示范围、失败重发和退订/停发方式。
- 模型提供方、便宜/主模型分工、单日 Token/费用上限和敏感内容保留期限。

## 8. 一手资料版本

本次于 2026-09-13 核验：

| 项目 | 固定版本 | 许可证 |
|---|---|---|
| Pi | [`71dca87`](https://github.com/earendil-works/pi/tree/71dca871bc80b6bc97be37f0ca3189399d651fff) | MIT |
| shadcn/ui | [`2b3e6d4`](https://github.com/shadcn-ui/ui/tree/2b3e6d4f8d9161fe5c19340dc383aade392012dd) | MIT |
| TrendRadar | [`b6ceb76`](https://github.com/sansan0/TrendRadar/tree/b6ceb76ad3f8f4b34bc39e8ac73cd3e969f97217) | GPL-3.0 |
| RSSHub | [`67305a5`](https://github.com/DIYgod/RSSHub/tree/67305a500b0c90fba23a9155440ed28d2b011a6b) | AGPL-3.0 |
| RSSHub docs | [`7623171`](https://github.com/RSSNext/rsshub-docs/tree/7623171adbeb6f03134511a01d7f1987d33a7839) | 官方文档仓库 |
| Folo | [`44f0e5d`](https://github.com/RSSNext/Folo/tree/44f0e5df06eba774afe1f1aea30d90a742da5dec) | AGPL-3.0 |
| Karakeep | [`5a2f009`](https://github.com/karakeep-app/karakeep/tree/5a2f009e2f6d266087f2f3f527e6e384cefd6de4) | AGPL-3.0 |

本项目旧代码核验路径：

- `/Users/qiushui/work/qiushui/qiushuiai-aicontnet-extract/src/scheduler.py`
- `/Users/qiushui/work/qiushui/qiushuiai-aicontnet-extract/src/pipeline/prefilter.py`
- `/Users/qiushui/work/qiushui/qiushuiai-aicontnet-extract/src/pipeline/distill.py`
- `/Users/qiushui/work/qiushui/qiushuiai-aicontnet-extract/src/pipeline/score.py`
- `/Users/qiushui/work/qiushui/qiushuiai-aicontnet-extract/src/ai/llm.py`

这些旧项目路径只用于确认现状，不作为新项目可复制的架构规范。
