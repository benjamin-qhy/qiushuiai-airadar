# AI Radar

AI Radar 的正式 TypeScript 工程。Web 外壳以 `satnaing/shadcn-admin` v2.2.1（MIT）为固定源码基座，已移除登录、Clerk 和模板演示业务。

## 开发环境

- Node.js 24.21.0 LTS
- pnpm 10.34.1

```bash
pnpm install
pnpm check
pnpm dev              # Web
pnpm dev:cli status   # CLI
pnpm dev:service      # 后台服务
```

工作区边界：

- `apps/cli`：本机命令入口
- `apps/service`：后台 HTTP 服务外壳
- `apps/web`：不接触密钥的 Web 界面
- `packages/domain`：领域契约
- `packages/config`：本机密钥读取及安全状态
- `packages/source-adapters`：供应商适配接口
- `packages/runtime`：Markdown 主存储、可重建 SQLite 索引、任务调度与恢复

密钥默认放在 `~/.airadar/secrets.env`，macOS 文件权限必须为 `600`；也可用 `AIRADAR_SECRET_FILE` 指向其他本机文件。CLI 和 Web 只输出是否已配置及掩码，不输出原值。

业务数据默认保存在 `~/.airadar/data`，也可通过 `AIRADAR_DATA_ROOT` 指定独立目录。`contents`、`discoveries`、`tasks`、`parameters`、`progress` 和 `audits` 下的 Markdown 是权威记录；`.index/runtime.sqlite` 使用 WAL，仅是启动时可从 Markdown 重建的辅助索引。`.raw-responses` 只保存已脱敏、到期可删除的供应商原始响应。

Web 经局域网或 Tailscale 访问时，用逗号分隔的 `AIRADAR_WEB_ORIGINS` 明确列出可信 Origin（含协议和端口）；未列出的跨站写请求会被拒绝。无平台字幕的视频可通过 `AIRADAR_TRANSCRIBER_URL` 接入 HTTPS（或本机回环）转写服务，接口接收内容地址并返回 `{ "text": "完整转写" }`。
