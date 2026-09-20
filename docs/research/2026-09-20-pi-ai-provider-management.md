# Pi 0.85.1 大模型提供商管理调研

> 日期：2026-09-20
>
> 范围：仅核对项目当前安装的 `@earendil-works/pi-ai@0.85.1` README、类型声明和运行时代码；不把采集平台供应商纳入“大模型提供商”。

## 结论

模型管理页不应只有一个只读的 Codex 状态卡。它应直接以 Pi 的 provider 注册表为数据源，列出全部内置大模型提供商，并根据每个 provider 的 `auth.apiKey` / `auth.oauth` 能力显示对应操作：

- API Key 或云凭据：显示“配置凭据”；
- 订阅 OAuth：显示“登录订阅”；
- 同时支持两种方式：让用户选择认证方式；
- 已配置状态：使用 `Models.checkAuth()`；
- 真正的连接测试：选择该 provider 的一个可用模型执行最小请求，不能把“已保存凭据”冒充为“连接成功”。

OpenAI 与 OpenAI Codex 必须是两张不同的 provider 卡：`openai` 使用 `OPENAI_API_KEY`、调用 `https://api.openai.com/v1`；`openai-codex` 只支持 OAuth，使用 ChatGPT Plus/Pro 订阅、调用 `https://chatgpt.com/backend-api`。二者不能共用一个“OpenAI 已配置”状态。证据：`dist/providers/openai.js:5-12`、`dist/providers/openai-codex.js:6-19`。

## 1. 如何列出全部提供商与模型

推荐在后端创建一份长期复用的 `Models` 实例：

```ts
import { builtinModels } from '@earendil-works/pi-ai/providers/all'

const models = builtinModels({ credentials, modelsStore })

const providers = models.getProviders()
const allModels = models.getModels()
const providerModels = models.getModels(providerId)
const model = models.getModel(providerId, modelId)
```

`builtinModels()` 注册全部内置 provider；`getProviders()`、`getModels()` 和 `getModel()` 都读取当前已知目录。对动态 provider，应先调用 `models.refresh({ providers: [providerId] })`，再读模型列表。也可用 `getBuiltinProviders()` / `getBuiltinModels(providerId)` 只读取静态生成目录。证据：`README.md:255-323`、`dist/providers/all.js:47-117`、`dist/models.d.ts:101-123`。

当前安装包运行时注册 **40 个 provider**：39 个有静态模型目录，`radius` 是动态目录。下表的模型数是当前安装包内置目录快照（生成时间 `2026-09-05T11:58:56.761Z`），实现不能把这些数字写死。

| Provider ID | 显示名 | 支持的配置方式 | 当前目录模型数 |
| --- | --- | --- | ---: |
| `amazon-bedrock` | Amazon Bedrock | 云凭据/环境配置 | 121 |
| `ant-ling` | Ant Ling | API Key | 3 |
| `anthropic` | Anthropic | API Key、订阅 OAuth | 14 |
| `azure-openai-responses` | Azure OpenAI | API Key + Azure 配置 | 39 |
| `baseten` | Baseten | API Key | 20 |
| `cerebras` | Cerebras | API Key | 2 |
| `cloudflare-ai-gateway` | Cloudflare AI Gateway | API Key + 账户/网关配置 | 50 |
| `cloudflare-workers-ai` | Cloudflare Workers AI | API Key + 账户配置 | 18 |
| `deepseek` | DeepSeek | API Key | 3 |
| `fireworks` | Fireworks | API Key | 20 |
| `github-copilot` | GitHub Copilot | Token、订阅 OAuth | 28 |
| `google` | Google | API Key | 22 |
| `google-vertex` | Google Vertex AI | API Key、ADC 或服务账号 | 14 |
| `groq` | Groq | API Key | 7 |
| `huggingface` | Hugging Face | Token | 71 |
| `kimi-coding` | Kimi For Coding | API Key、订阅 OAuth | 4 |
| `minimax` | MiniMax | API Key | 3 |
| `minimax-cn` | MiniMax CN | API Key | 3 |
| `mistral` | Mistral | API Key | 32 |
| `moonshotai` | Moonshot AI | API Key | 10 |
| `moonshotai-cn` | Moonshot AI CN | API Key | 10 |
| `nvidia` | NVIDIA | API Key | 20 |
| `openai` | OpenAI | API Key | 39 |
| `openai-codex` | OpenAI Codex | ChatGPT Plus/Pro OAuth | 8 |
| `opencode` | OpenCode Zen | API Key | 68 |
| `opencode-go` | OpenCode Go | API Key | 27 |
| `openrouter` | OpenRouter | API Key、OAuth | 366 |
| `qwen-token-plan` | Qwen Token Plan | API Key | 18 |
| `qwen-token-plan-cn` | Qwen Token Plan CN | API Key | 18 |
| `qwen-token-plan-individual` | Qwen Token Plan Individual | API Key | 9 |
| `radius` | Radius | API Key、OAuth；动态模型目录 | 0（刷新前） |
| `together` | Together | API Key | 21 |
| `vercel-ai-gateway` | Vercel AI Gateway | API Key | 237 |
| `xai` | xAI | API Key、订阅 OAuth | 3 |
| `xiaomi` | Xiaomi | API Key | 3 |
| `xiaomi-token-plan-ams` | Xiaomi Token Plan AMS | API Key | 2 |
| `xiaomi-token-plan-cn` | Xiaomi Token Plan CN | API Key | 2 |
| `xiaomi-token-plan-sgp` | Xiaomi Token Plan SGP | API Key | 2 |
| `zai` | Z.AI | API Key | 7 |
| `zai-coding-cn` | Z.AI Coding CN | API Key | 10 |

表的 provider 顺序与运行时 `builtinProviders()` 一致，认证能力来自每个 provider 的 `auth` 对象，不是人工猜测。证据：`dist/providers/all.js:67-117`、`dist/models.d.ts:58-90`。

## 2. API Key 应如何保存和传入

Pi 的正式边界是 `CredentialStore`：每个 provider ID 最多一条带类型的凭据。API Key 形状为 `{ type: 'api_key', key, env? }`；OAuth 形状为 `{ type: 'oauth', access, refresh, expires, ... }`。`list()` 只能返回不含秘密的 `{ providerId, type }`，所有写入都必须通过按 provider 串行化的 `modify()`，删除使用 `delete()`。证据：`dist/auth/types.d.ts:11-78`、`README.md:383-408`。

管理后台的推荐流程：

1. 浏览器把密钥通过 HTTPS 提交给后端，不在浏览器、localStorage、YAML 或普通日志中持久化；Pi 自己也明确警告生产环境应通过后端保护密钥（`README.md:1407-1432`）。
2. 后端为 `builtinModels({ credentials })` 注入一个持久化且加密/受保护的 `CredentialStore`；Pi 默认的 `InMemoryCredentialStore` 重启即丢失，不适合作为管理后台存储（`dist/auth/credential-store.d.ts:1-16`）。
3. 通过 `models.login(providerId, 'api_key', interaction)` 运行 provider 自己的输入流程并保存凭据，尤其不能假设所有 provider 都只有一个 key 字段；Cloudflare、Azure、Bedrock、Vertex 等还有附加配置。
4. 普通标准 provider 的解析优先级是：显式单次请求 key > 已保存凭据 > 环境变量。只要某 provider 已有保存凭据，环境变量就不再作为失败兜底，避免悄悄切换账户。证据：`dist/auth/helpers.js:1-29`、`dist/auth/resolve.js:20-54`。
5. 不要把 `models.getAuth()` 的返回值发给前端，因为其中可能包含实际 `apiKey`、Authorization header 或 base URL；状态页只用 `checkAuth()` 和 `CredentialStore.list()`。

## 3. OAuth / 订阅登录

0.85.1 的运行时代码中有 **7 个 OAuth provider**：

- 订阅型：`anthropic`、`openai-codex`、`github-copilot`、`kimi-coding`、`xai`；
- 非订阅型 OAuth：`openrouter`（OAuth 最终换取永久 API Key）、`radius`。

这里必须动态判断 `provider.auth.oauth` 与 `oauth.isSubscription`。本版本 README 的 OAuth 小节只列出 Anthropic、OpenAI Codex、GitHub Copilot、OpenRouter（`README.md:1507-1516`），但 0.85.1 的实际 provider 源码还包含 Kimi、xAI 和 Radius，因此不能把 README 的四项列表写死到界面。

登录应由后端调用：

```ts
await models.login(providerId, 'oauth', {
  signal,
  prompt: async (prompt) => /* 转成前端可回答的交互 */,
  notify: (event) => /* 推送 URL、设备码或进度给前端 */,
})
```

Pi 通过统一 `AuthInteraction` 协议发出：

- prompt：`text`、`secret`、`select`、`manual_code`；
- event：`info`、`auth_url`、`device_code`、`progress`。

因此 UI 需要一个可持续的登录会话，而不是单次 PUT：创建登录会话、接收事件、打开授权网址或展示设备码、提交用户回答、支持取消，成功后由 `Models.login()` 写入 `CredentialStore`。OAuth 登录代码只支持 Node，Web 前端必须通过后端驱动。证据：`dist/auth/types.d.ts:99-165`、`README.md:1516-1549`、`README.md:1428-1432`。

OpenAI Codex 的登录尤其需要完整交互：用户先选择“浏览器登录”或“设备码登录”；浏览器登录会发出 `auth_url`，同时等待本机 callback 或用户粘贴授权码/重定向 URL；设备码登录会发出 `device_code` 并轮询。证据：`dist/auth/oauth/openai-codex.js:342-449`。

## 4. Codex 订阅与 OpenAI API Key 的区别

| 项目 | OpenAI API | OpenAI Codex 订阅 |
| --- | --- | --- |
| Provider ID | `openai` | `openai-codex` |
| 认证 | API Key / `OPENAI_API_KEY` | ChatGPT Plus/Pro OAuth |
| 地址 | `https://api.openai.com/v1` | `https://chatgpt.com/backend-api` |
| 模型目录 | OpenAI API 模型 | GPT-5.x Codex 订阅模型 |
| 凭据类型 | `api_key` | `oauth`，含 access/refresh/expiry/accountId |
| 刷新 | 无 OAuth 刷新 | Pi 自动在锁内刷新并保存轮换 token |

这不是同一 provider 的两个输入框，而是两个独立 provider、独立凭据和独立模型目录。Codex 登录成功也不能说明 OpenAI API Key 可用，反之亦然。证据：`dist/providers/openai.js:5-12`、`dist/providers/openai-codex.js:6-19`、`dist/auth/oauth/openai-codex.js:320-449`。

## 5. 状态检查与真实连接测试

建议把界面状态分成三层：

1. **未配置 / 已配置**：`await models.checkAuth(providerId)`。它只检查凭据配置是否完整，且不会刷新 OAuth（`dist/models.d.ts:120-123`）。
2. **可选模型**：`await models.getAvailable(providerId)`。它先检查认证，再应用 provider 对当前凭据的模型过滤，但仍不是一次模型推理成功证明（`dist/models.js:255-273`）。
3. **连接测试成功**：从 `getAvailable(providerId)` 取一个明确的测试模型，执行受超时和取消控制的最小 `completeSimple()` 请求；只有得到成功响应才显示“连接正常”。失败要区分未授权、权限/订阅不含模型、限流/额度、网络和 provider 错误。

`getAuth()` 会在需要时刷新 OAuth，失败时抛出 `ModelsError`：OAuth 刷新失败是 `oauth`，凭据解析/存储失败是 `auth`。失败的 OAuth 凭据会保留，用户可重新登录，系统不能静默退回环境变量。证据：`README.md:341-357`、`dist/auth/resolve.js:65-115`。

## 6. `Models`、`CredentialStore`、`ModelsStore` 的职责

- `Models`：运行时 provider 注册表、模型查询、认证解析、登录/退出、动态目录刷新和实际调用；管理 API 与业务调用应复用同一配置方式。
- `CredentialStore`：只保存 provider 凭据。应使用受保护的持久化实现；必须遵守 `modify()` 唯一写路径，才能保证 OAuth token 并发刷新安全。
- `ModelsStore`：只缓存动态 provider 的模型目录、ETag、Last-Modified 和检查时间；它不是凭据仓库，也不是“默认模型/各环节模型选择”的配置表。证据：`dist/models-store.d.ts:1-27`、`README.md:1113-1135`。
- 项目的默认模型及分类、评分、翻译等环节覆盖仍应保存在项目自己的业务配置中，值使用稳定的 `providerId/modelId`；保存时通过 `models.getModel()` 校验存在性，实际执行前通过 `getAvailable()` 校验当前凭据是否可用。

## 7. 对当前管理界面的直接约束

1. “提供商管理”从 `builtinModels().getProviders()` 生成，不能只展示 Codex，也不能维护另一份人工 provider 枚举。
2. 每张卡至少显示：名称、provider ID、支持的认证方式、配置状态、模型数量；绝不回显 key/token。
3. 操作按能力生成：配置 API Key/云凭据、登录订阅、重新登录、退出/删除凭据、连接测试、查看模型。
4. OAuth 必须由后端启动并通过事件通道驱动 UI；前端不能直接运行 Pi OAuth。
5. OpenAI API Key 与 ChatGPT Codex 订阅必须分卡、分状态、分模型列表。
6. 模型下拉框按已配置且可用的 provider/model 展示；如果保留未配置模型，必须明确标记“提供商未配置”，不能允许保存后直到任务运行才暴露问题。
7. 测试按钮要做真实最小调用；`checkAuth()` 只适合状态徽标，不适合显示“测试通过”。

## 第一方证据索引

本报告使用的本地安装包根目录：

`node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.1.12/node_modules/@earendil-works/pi-ai/`

- `README.md:231-323`：provider、全部注册、模型查询和动态刷新。
- `README.md:325-457`：认证解析、CredentialStore、环境变量。
- `README.md:1407-1432`：浏览器密钥风险和 OAuth 后端边界。
- `README.md:1507-1596`：OAuth 统一交互、CLI 与 Codex 订阅说明。
- `dist/providers/all.js:47-117`：0.85.1 的实际内置 provider 注册表。
- `dist/models.d.ts:58-158`：Provider/Models 接口、`checkAuth()`、`getAvailable()`、登录与退出。
- `dist/auth/types.d.ts:11-230`：凭据、CredentialStore、AuthInteraction 与认证能力类型。
- `dist/auth/helpers.js:1-51`、`dist/auth/resolve.js:20-123`：API Key 优先级、OAuth 刷新和失败语义。
- `dist/providers/openai.js:5-12`、`dist/providers/openai-codex.js:6-19`：OpenAI API 与 Codex 订阅的 provider 边界。
- `dist/auth/oauth/openai-codex.js:320-449`：Codex 浏览器/设备码登录、token 和刷新。
- `dist/models-store.d.ts:1-27`、`README.md:1113-1135`：ModelsStore 仅用于动态模型目录。
