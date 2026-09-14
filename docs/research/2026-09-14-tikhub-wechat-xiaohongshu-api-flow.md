# TikHub 视频号与小红书账号作品链路（2026-09-14）

范围：仅核对 TikHub 官方文档与公开 OpenAPI；未读取本地密钥，也未调用计费接口。

## 结论

- 视频号已有官方明确链路：**关键词搜视频 → 用 `exportId` 查视频详情 → 从详情取 finder `username` → 用 `username` 拉账号作品**。
- 如果手里只有公开 `sph...` 视频号 ID，可先调用 ID 转 username 接口，再拉账号作品。
- 小红书 App V2 已明确支持“搜用户”和“按 `user_id` 拉用户笔记”，并明确优先使用 `user_id`。但官方文档和公开 OpenAPI **没有给出搜索结果内 `user_id` 的准确 JSON Path**，所以当前不能把某个路径当成稳定契约；#16 仍需用一次脱敏真实响应确认。

## 视频号：search → detail → finder username → user videos

### 1. 搜视频号视频

`POST /api/v1/wechat_search/v2/fetch_search_videos`

JSON body：

- 必填：`keyword`
- 可选：`duration`（`all|short|medium|long` 或 `0..3`）、`sort`（`default|latest|hot` 或 `0..2`）、`publish_time`（`all|day|week|half_year` 或 `0..3`）、`offset`、`cursor`、`raw`
- 首页 `offset=0`、`cursor` 留空；翻页必须原样回传上一页 `cursor`，只传 `offset` 无效。

建议显式传 `raw=false`。精简响应结构与综合搜索相同：结果为 `$.data.items[]`，分页为 `$.data.continue_flag` 和 `$.data.cursor`。视频项提供 `exportId`，可选伴随 `jumpInfo.extInfo.feedNonceId`；搜索结果不直接提供媒体文件。

来源：[视频号视频搜索官方文档](https://docs.tikhub.io/475716919e0)、[微信综合搜索响应路径](https://docs.tikhub.io/472974860e0)、[TikHub OpenAPI](https://api.tikhub.io/openapi.json)

### 2. 用搜索结果查视频详情

`POST /api/v1/wechat_channels/v2/fetch_video_detail`

JSON body 可传：

- `object_id`：作品 objectId，最高优先级；
- `export_id`：搜索结果的 `exportId`，以 `export/` 开头、会过期，应尽快使用；
- `object_nonce_id`：搜索结果的 `feedNonceId`，可选，用于提高命中率；
- `share_url`：`https://weixin.qq.com/sph/...` 分享链接，仅在前两者为空时使用；
- `raw`。

入参优先级是 `object_id > export_id > share_url`。从关键词搜索衔接时，传：

```json
{
  "export_id": "<$.data.items[N].exportId>",
  "object_nonce_id": "<$.data.items[N].jumpInfo.extInfo.feedNonceId>",
  "raw": false
}
```

`raw=false` 的关键响应路径：

- finder username：`$.data.username`
- 作品 objectId：`$.data.id`
- 媒体：`$.data.media.url`、`url_token`、`full_url`、`decode_key`

`raw=true` 时关键对象为 `$.data.objects[0]`，命中回执为 `$.data.objectResponses[0].objectId` / `.exportId`。

来源：[视频号作品详情官方文档](https://docs.tikhub.io/472974842e0)、[TikHub OpenAPI](https://api.tikhub.io/openapi.json)

### 3. 用 finder username 拉账号作品

`POST /api/v1/wechat_channels/v2/fetch_user_videos`

JSON body：

- 必填：`username`，格式 `v2_...@finder`，直接使用上一步 `$.data.username`
- 可选：`last_buffer`、`raw`
- 首页 `last_buffer` 留空；当 `$.data.up_continue` 为真，下一页原样回传 `$.data.last_buffer`

建议显式传 `raw=false`。关键响应路径：

- 账号：`$.data.username`、`$.data.nickname`
- 视频数组：`$.data.videos[]`
- 作品 ID：`$.data.videos[N].id`
- 分页：`$.data.up_continue`、`$.data.last_buffer`

注意：`id`、`object_nonce_id`、`feedNonceId` 等 64 位 ID 必须作为字符串保存，不能经过 JavaScript `Number`。

来源：[视频号用户作品官方文档](https://docs.tikhub.io/472974841e0)、[TikHub OpenAPI](https://api.tikhub.io/openapi.json)

### 4. 已知 `sph...` 视频号 ID 的备用入口

`POST /api/v1/wechat_channels/v2/fetch_channel_id_to_username`

body：`channel_id`、`raw`。建议显式传 `raw=false`，结果为：

- `$.data.username`：finder username
- `$.data.nickname`
- `$.data.desc`
- 未命中时 `$.data.username` 为 `null`，原因在 `$.data.error`

官方说明文字称 `raw` 默认 `True`，但当前公开 OpenAPI 的请求模型把默认值列为 `false`；这是官方资料内部的不一致。实现时不要依赖默认值，应始终显式传 `raw=false`。

来源：[视频号 ID 转 username 官方文档](https://docs.tikhub.io/472974840e0)、[TikHub OpenAPI](https://api.tikhub.io/openapi.json)

## 小红书：搜索账号 → 固定 user_id → 用户笔记

### 1. 搜用户（比从笔记猜作者 ID 更直接）

`GET /api/v1/xiaohongshu/app_v2/search_users`

Query：`keyword`（必填）、`page`（默认 1）、`search_id`（翻页时回传首次搜索值）、`source`（默认 `explore_feed`）。每页 20 个用户。

官方文档只说响应“包含用户列表和分页信息”，成功示例却是通用的 `data: null`；公开 OpenAPI 的 200 响应也只引用通用 `ResponseModel`。因此，**官方资料没有承诺用户数组、`user_id`、`search_id` 的精确 JSON Path**。

来源：[小红书搜索用户官方文档](https://docs.tikhub.io/420136399e0)、[TikHub OpenAPI](https://api.tikhub.io/openapi.json)

### 2. 可选：先验证 user_id

`GET /api/v1/xiaohongshu/app_v2/get_user_info`

Query 二选一：`user_id` 或 `share_text`，二者同时传时 `user_id` 优先。TikHub 特别提示：错误 ID 也可能 HTTP/业务外层正常返回，但 `data` 内是上游“服务异常”，而且仍计费。因此不能仅以 HTTP 200 判断 ID 有效。

来源：[小红书用户信息官方文档](https://docs.tikhub.io/420136395e0)

### 3. 按稳定 user_id 拉用户笔记

`GET /api/v1/xiaohongshu/app_v2/get_user_posted_notes`

Query：

- `user_id` 或 `share_text` 二选一；同时传时 `user_id` 优先；
- `cursor`：首页留空，下一页传上一页返回值。

官方唯一明确给出的列表路径是 `$.data.data.notes[]`；下一页游标示例为 `$.data.data.notes[-1].cursor`（通常是最后一条笔记的 `note_id`）。同样要检查 `data` 内是否为上游“服务异常”，不能只看 HTTP 200。

来源：[小红书用户笔记官方文档](https://docs.tikhub.io/420136396e0)、[TikHub OpenAPI](https://api.tikhub.io/openapi.json)

### 4. `search_notes` 不能单靠官方文档形成稳定 user_id 链路

`GET /api/v1/xiaohongshu/app_v2/search_notes`

Query：`keyword`、`page`、`sort_type`、`note_type`、`time_filter`、`search_id`、`search_session_id`、`source`、`ai_mode`。翻页需回传首次搜索的 `search_id` 和 `search_session_id`。

但官方文档没有给出笔记列表、作者对象或作者 `user_id` 的 JSON Path。因此当前可确认的是“搜索笔记可用”，不能仅凭官方契约确认“从搜索笔记稳定提取作者 user_id”。更稳妥的产品链路是优先 `search_users`，再把已验证的 `user_id` 固化为信源主键。

来源：[小红书搜索笔记官方文档](https://docs.tikhub.io/420136398e0)、[TikHub OpenAPI](https://api.tikhub.io/openapi.json)

## #16 脱敏真实验证结果

2026-09-14 使用本机私有凭据完成最小真实请求，没有保存原始响应或请求头：

- `search_users("iTechTokAI")` 返回 20 个用户，目标账号位于 `$.data.users[0]`；实际稳定身份字段是 `userid`，值与随后账号信息和笔记列表请求一致。
- `get_user_info(user_id)` 返回相同账号身份。
- `get_user_posted_notes(user_id)` 返回 22 条真实笔记。
- 视频号“张张AI视界”经搜索、详情、账号作品链路取得 finder username，并返回 15 条真实作品。

这些实际路径用于当前适配准备，但 TikHub 官方 OpenAPI 没有承诺小红书搜索响应的内部字段；正式适配器仍需做契约校验，并把字段缺失当作供应商失败。
