# 网页正文 HTTP 403：现有方案与第二获取方案（2026-09-18）

范围：只读检查本项目源码、对 OpenAI 失败链接做最小 HTTP 实测，并核对各方案的一手官方资料。**本报告不修改抓取流程，也不声称备用服务已在本机抓取成功。** 价格和限额会变化，接入前应重查官方页面。

后续状态（2026-09-18）：主抓取路径已修复，原先失败的两篇 RSS 文章已通过真实重试取得正文并完成处理。下文保留调研当时的代码状态和测试结论，不代表当前实现仍未修改。

## 结论

1. 当前项目用 `fetch` 取 HTML，`linkedom` 转 DOM，最后由 Mozilla `Readability` 提取正文。Readability 的输入是已有 DOM，不负责向目标站点请求网页；**HTTP 403 发生在正文提取之前，调整 Readability 本身不能解决**。[本项目 `enrichArticle`](../../packages/pipeline/src/index.ts)、[Mozilla Readability 官方说明](https://github.com/mozilla/readability/blob/main/README.md)
2. 本机针对四个失败的 `openai.com/index/...` 链接，当前 `AI-Radar/0.1` User-Agent 得到 403；完整的常见 Chrome User-Agent 得到 200，随后现有 Readability 能提取正文。**优先修复当前 HTTP 获取层，并保留现有正文提取器**。这是这四个链接在本机的实测结论，不保证其他站点或未来仍返回 200。[本项目请求头与状态检查](../../packages/pipeline/src/index.ts)
3. 第二方案候选为 **Jina Reader**：它在另一服务端读取 URL，输出适合模型使用的 Markdown。官方允许把 `https://r.jina.ai/` 加在 URL 前面使用，默认引擎会用无头浏览器渲染；但官方明确说**不会绕过网站的反机器人和访问控制**。本机匿名请求同一 OpenAI 链接实际返回 **401 `AuthenticationRequiredError`**（网络信誉导致匿名查询被阻止），因此目前**不能把匿名 Jina 当作已验证可用的备用通道**。若用户愿意配置 API key，需先用四条失败链接做脱敏真实验收。[Jina Reader 官方说明与限制](https://jina.ai/reader/)
4. 若 Jina 带密钥测试仍失败，可以评估 **Firecrawl Scrape API**：官方支持单页转 Markdown，支持基本/增强代理；官方文档称可无密钥试用，按 credits 计费，但本机无密钥实测也因出口 IP 信誉被拒绝（API 403），需要密钥再验证。同样不能保证取得被目标站阻断的内容。[Firecrawl 官方抓取文档](https://docs.firecrawl.dev/features/scrape)、[增强代理](https://docs.firecrawl.dev/features/stealth-mode)、[官方价格](https://www.firecrawl.dev/pricing)

## 当前代码路径及失败位置

`apps/service/src/single-table-provider.ts` 中的普通文章会走 `enrichArticle(url, trackedFetch)`；原生 X Article 且配置相应密钥时才走专门接口。`enrichArticle()` 的顺序是请求 URL → 检查 HTTP 状态与 HTML 类型 → `linkedom.parseHTML()` → `Readability.parse()` → 验证正文不少于 200 字。当前请求会带 `AI-Radar/0.1 (+personal content reader)` User-Agent。403 时直接抛 `Article request failed with HTTP 403`，后续 DOM/Readability 根本没有执行。[内容解析路由](../../apps/service/src/single-table-provider.ts)、[正文获取实现](../../packages/pipeline/src/index.ts)

生产路径传入包装过的 `trackedFetch`，走 `fetcher !== globalThis.fetch` 分支，并使用 `redirect: 'follow'`。另一条直接 Node HTTP 分支有公共地址与 DNS 检查；**不能假定它的全部保护自动覆盖生产使用的包装分支**。为第二供应商接入设计 URL 校验时要特别核对这一点。[本项目 `enrichArticle`](../../packages/pipeline/src/index.ts)

### 本机最小实测（2026-09-18）

| 请求 | 结果 | 说明 |
| --- | --- | --- |
| 当前 `AI-Radar/0.1` User-Agent 请求 `https://openai.com/index/astra-for-law` | HTTP 403 | 失败发生于读取正文之前 |
| 常见完整 Chrome User-Agent 请求四个失败链接 | 均为 HTTP 200 | 现有 Readability 随后能提取正文；仅证明本机当时可用 |
| 匿名请求 `https://r.jina.ai/https://openai.com/index/astra-for-law` | HTTP 401；`AuthenticationRequiredError`，提示当前网络不能匿名查询 | 未取得正文；API key 路径尚未测试 |
| 无密钥请求 Firecrawl `/v2/scrape` 获取同一 OpenAI 链接 | API HTTP 403，提示本机 IP 可疑，须申请免费 API key | 尚未取到目标页；带密钥未测 |
| Playwright 浏览器请求 | 未测试 | 不得写成已经解决 |

四个目标链接：`astra-for-law`、`cooley-gopublic`、`put-data-to-work`、`codex-quantum-computing-experiments`，均位于 `openai.com/index/`。这里只记录请求状态，不在研究文档复制网页全文或凭证。

## 第二方案比较

| 方式 | 能提供什么 | 对这次 403 的判断 | 费用/依赖 | 当前证据等级 |
| --- | --- | --- | --- | --- |
| 调整当前 HTTP 请求头 + 原有 Readability | 保留原站 HTML 与现有正文提取、图片逻辑 | **本机四条已成功**；低改动，优先 | 无新服务费；仍受网站访问策略影响 | 已实测，不保证长期 |
| Jina Reader | 服务端读取目标 URL，返回 Markdown；官方默认引擎渲染 JS 页面 | 理论上可作为不同获取通道，但**匿名路径本机 401**；即使带密钥也不会突破目标站封锁 | 无密钥基础使用官方列 20 RPM；API key 提高限额，按输出 token 计费，具体以官方实时页为准 | 官方能力已核对；本机仅验证了匿名失败，带密钥未测 |
| Firecrawl `/scrape` | 单页 Markdown，可选增强代理 | 可以作为另一第三方尝试，**对本次四条是否成功未知**；本机匿名调用被服务本身拒绝 | 官方称可无密钥试用，但本机须 API key；当前免费 1,000 credits/月，基本抓取 1 credit/页，增强可到 5 credits/请求；失败的 403 页面也可能计费 | 官方能力已核对；本机仅验证匿名 API 403，带密钥未测 |
| 本机 Playwright 浏览器 | 启动浏览器访问页面，可读取渲染后的 DOM，再交给 Readability | 可解决依赖 JS 渲染的问题，**不保证绕过 403**；与当前机器共用出口时尤其不应假设会改变访问结果 | 本机浏览器/运行资源、维护成本较高 | 官方能力已核对；本机未测 |

来源：[Jina Reader 官方 API/计费/防护 FAQ](https://jina.ai/reader/)、[Firecrawl Scrape](https://docs.firecrawl.dev/features/scrape)、[Firecrawl 增强代理](https://docs.firecrawl.dev/features/stealth-mode)、[Firecrawl 价格与失败收费规则](https://www.firecrawl.dev/pricing)、[Playwright 页面与网络文档](https://playwright.dev/docs/pages)、[Playwright 网络响应文档](https://playwright.dev/docs/network)。

## 建议的后续实现顺序（建议，不是本次改动）

1. **先修现有方案**：将可配置、合规的请求头用于主抓取路径；对这四条链接和一个非 OpenAI 链接回归，确认正文质量、图片、最终 URL、错误日志。不要只把状态 200 算作成功，还要验证抽到的是真实正文而非挑战页。
2. **备用方案只在明确的获取失败或正文不足时触发**：先以 Jina Reader 的 API key 做小样本人工验收；若它仍失败，再考虑 Firecrawl。不要让所有文章默认经过收费第三方，也不要把 RSS 描述或搜索摘要冒充全文。对不同失败原因（403、429、超时、正文太短）分别记录供应商、状态与重试原因。
3. **安全与质量门槛**：限制只抓公开 HTTP(S) URL；阻止内网、回环、凭证 URL 和不安全重定向；限制响应大小、耗时及重试次数；请求与响应日志脱敏；向第三方发送 URL 前确认其内容/数据政策可接受。备用 Markdown 需保存来源 URL、取回时间、供应商、标题和正文完整性检查结果，最终仍进同一条 `contents` 记录。以上为基于本项目数据模型的设计建议，不代表供应商官方保证成功。[本项目当前请求实现](../../packages/pipeline/src/index.ts)、[Mozilla Readability 安全提示](https://github.com/mozilla/readability/blob/main/README.md)

**验收门槛**：只有在带密钥 Jina 或 Firecrawl 对上述四条实际返回可读、足量、与原站一致的正文，并确认账单与日志处理后，才把它标记为“可用的第二方案”。目前成功的只是**独立请求头试验后沿用现有 Readability 的提取验证**；项目抓取代码尚未修改，第三方备用服务也尚未验证成功。
