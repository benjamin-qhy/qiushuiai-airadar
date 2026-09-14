# 真实信源与供应商访问准备

日期：2026-09-13
对应 Issue：[#16 准备六类真实信源与供应商访问](https://github.com/benjamin-qhy/qiushuiai-airadar/issues/16)

## 结论

目前还不能关闭 #16。

- RSS、X、YouTube、抖音已经选定真实测试信源，并完成最小只读请求。
- X 和 YouTube 的两个真实供应商都已连通。
- 抖音的 TikHub 与 Get笔记均已连通。
- 小红书和视频号的 TikHub 搜索接口曾成功返回真实数据，但在选定并验证具体账号前，TikHub 余额耗尽。
- 当前 `TIKHUB_API_KEY` 曾被供应商的 402 错误体原样回显，必须先更换，再继续使用。
- 旧项目 TikHub YouTube 代码使用的接口已失效；新项目应使用当前的 `youtube/web_v2` 接口。

运行中的应用和最终验收仍然禁止使用模拟内容。单元测试可以使用隔离的固定样例，但不能把样例伪装成真实抓取结果。

## 首期真实测试信源

| 信源类型 | 推荐测试信源 | 稳定身份 | 当前结果 |
| --- | --- | --- | --- |
| X | OpenAI | `OpenAI` | 已通过 TwitterAPI.io 与 TikHub 作品列表请求 |
| YouTube | OpenAI | `https://www.youtube.com/@OpenAI` | 已通过 Google Data API 与 TikHub；已确认能取得普通视频 |
| RSS | OpenAI News | `https://openai.com/news/rss.xml` | HTTP 200，返回有效 RSS XML |
| 抖音 | 清华姜学长 | `sec_user_id: MS4wLjABAAAAfte3rFiVQ8VUE3Nfxph1NhCnq1ZAttn43OIr5UsXD5c` | 已通过 TikHub 作品列表；Get笔记也能取得该账号历史内容 |
| 视频号 | 待选定 AI 相关账号 | 必须保存 `finder username`，不能只保存展示名 | 搜索曾返回真实结果；具体账号验证被余额阻塞 |
| 小红书 | 待选定 AI 相关账号 | 必须保存平台 `user_id`，不能只保存展示名 | 搜索曾返回真实图文；具体账号验证被余额阻塞 |

首期每种类型只启用表中的一个信源。其余迁移信源导入后默认停用。

## 供应商状态

| 信源类型 | 供应商 | 本机凭证 | 最小真实请求 | 结论 |
| --- | --- | --- | --- | --- |
| X | TwitterAPI.io | 已配置 | OpenAI 用户解析与作品列表成功 | 可用；请求需绕过本机错误代理配置 |
| X | TikHub | 已配置，但必须更换 | OpenAI 作品列表成功，返回 18 条 | 接口可用；更换 Token 后才能继续 |
| YouTube | Google Data API v3 | 已配置 | OpenAI 频道解析成功；前 10 条中取得 6 条普通视频 | 可用 |
| YouTube | TikHub | 已配置，但必须更换 | 当前 V2 接口成功，返回 30 条视频 | 可用；旧接口地址不可继续沿用 |
| RSS | 原生 HTTP/RSS | 不需要 | OpenAI News 返回 HTTP 200 | 可用 |
| 抖音 | TikHub | 已配置，但必须更换 | 清华姜学长作品列表成功，返回真实作品 | 可用；更换 Token 后才能继续 |
| 抖音 | Get笔记 | 已配置 | 知识库、博主、内容列表和详情四段请求成功 | 可作为补全或备用供应商 |
| 视频号 | TikHub | 已配置，但必须更换且充值 | AI 智能体搜索曾返回 10 条真实结果；后续请求返回 402 | 供应商接口存在，具体信源尚未验收 |
| 小红书 | TikHub | 已配置，但必须更换且充值 | AI 智能体图文搜索曾返回 20 条真实结果；后续请求返回 402 | 供应商接口存在，具体信源尚未验收 |

### 接口变化

- 旧 YouTube TikHub 地址：`/api/v1/youtube/web/get_channel_videos_v2`，当前返回 404。
- 当前可用地址：`/api/v1/youtube/web_v2/get_channel_videos`。
- 当前接口返回 `data.videos`；新适配器不能直接复用旧接口的 `data.items` 解析。
- 视频号作品和账号 ID 可能超过 JavaScript 安全整数范围，TypeScript 中必须按字符串处理。

## 旧项目 33 个信源迁移清单

只迁移信源定义，不迁移旧内容、收藏、反馈、评分、运行记录或缓存。

### X（16 个）

| slug | 名称 | 用户名 |
| --- | --- | --- |
| `x_openai` | OpenAI | `OpenAI` |
| `x_anthropic` | Anthropic | `AnthropicAI` |
| `x_karpathy` | Andrej Karpathy | `karpathy` |
| `x_ilyasut` | Ilya Sutskever | `ilyasut` |
| `x_akshay_pachaar` | Akshay Pachaar | `akshay_pachaar` |
| `x_saboo_shubham` | Shubham Saboo | `Saboo_Shubham_` |
| `x_langchain` | LangChain | `LangChain` |
| `x_llama_index` | LlamaIndex | `llama_index` |
| `x_ycombinator` | Y Combinator | `ycombinator` |
| `x_garrytan` | Garry Tan | `garrytan` |
| `x_levie` | Aaron Levie | `levie` |
| `x_amanda_askell` | Amanda Askell | `AmandaAskell` |
| `x_petergyang` | Peter G. Yang | `petergyang` |
| `x_bcherny` | Brian Cherny | `bcherny` |
| `x_catwu` | Cat Wu | `_catwu` |
| `x_gregisenberg` | Greg Isenberg | `gregisenberg` |

### YouTube（16 个）

| slug | 名称 | 频道地址 |
| --- | --- | --- |
| `yt_anthropic` | Anthropic | `https://www.youtube.com/@anthropic-ai` |
| `yt_claude` | Claude | `https://www.youtube.com/@claude/videos` |
| `yt_openai` | OpenAI | `https://www.youtube.com/@OpenAI` |
| `yt_ibm_tech` | IBM Technology | `https://www.youtube.com/@IBMTechnology` |
| `yt_ycombinator` | Y Combinator | `https://www.youtube.com/@ycombinator` |
| `yt_lennys_podcast` | Lenny's Podcast | `https://www.youtube.com/@LennysPodcast` |
| `yt_sequoia` | Sequoia Capital | `https://www.youtube.com/@sequoiacapital` |
| `yt_ai_advantage` | AI Advantage | `https://www.youtube.com/@aiadvantage` |
| `yt_tiago_forte` | Tiago Forte | `https://www.youtube.com/@TiagoForte` |
| `yt_nate_herk` | Nate Herk | `https://www.youtube.com/@nateherk` |
| `yt_cole_medin` | Cole Medin | `https://www.youtube.com/@ColeMedin` |
| `yt_jeff_su` | Jeff Su | `https://www.youtube.com/@JeffSu` |
| `yt_ali_abdaal` | Ali Abdaal | `https://www.youtube.com/@aliabdaal` |
| `yt_dan_koe` | Dan Koe | `https://www.youtube.com/@DanKoeTalks` |
| `yt_greg_isenberg` | Greg Isenberg | `https://www.youtube.com/@GregIsenberg` |
| `yt_ishan_sharma` | Ishan Sharma | `https://www.youtube.com/@IshanSharma7390` |

### RSS（1 个）

| slug | 名称 | Feed 地址 |
| --- | --- | --- |
| `openai_news` | OpenAI News | `https://openai.com/news/rss.xml` |

### 导入约束

- 保留 `slug`、名称、信源类型和平台稳定身份。
- 只启用 `x_openai`、`yt_openai`、`openai_news`；其他旧信源初始停用。
- 旧项目的 `tier`、`authority_weight` 和 `originality` 不能直接变成综合价值分加成。
- 供应商配置与信源定义分开保存；更换供应商不能产生新的信源或内容身份。
- 密钥只允许存在本机私有环境文件或系统凭证存储中。

## 安全处置与剩余阻塞

1. 在 TikHub 后台撤销当前 Token，创建新 Token，并充值足以完成视频号和小红书的最小验证。
2. 新 Token 只写入本机私有配置，不发到 Issue、聊天、日志、Markdown 主数据或 SQLite。
3. 用“AI 智能体”搜索结果各选一个长期关注的真实视频号和小红书账号，保存稳定账号 ID，再各拉一次作品列表。
4. 新项目的错误记录必须递归脱敏，至少删除请求头中的 `Authorization`、API Key、Cookie、Token 和 Secret；不能直接保存供应商 4xx/5xx 原始错误体。
5. 完成第 3 步后更新本文件并关闭 #16；在此之前 #17 及后续依赖票不能宣称验收完成。
