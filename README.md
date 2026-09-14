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

## 安装与后台服务

先在源码目录生成独立安装包：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @airadar/cli pack --pack-destination ./release
npm install -g ./release/airadar-cli-0.1.0.tgz
```

macOS 使用当前用户的 launchd，Windows 使用 WinSW 注册 Windows Service。Windows 安装和卸载服务时请在管理员 PowerShell 中运行。需要通过 Tailscale 从手机访问时，把监听地址设为 `0.0.0.0`；仅本机使用时保留默认的 `127.0.0.1`。

```bash
airadar service install --host 0.0.0.0 --port 43110
airadar service status
airadar service stop
airadar service start
airadar service restart
airadar service uninstall
```

安装新版本时，先用 `npm install -g <新安装包>` 替换程序，再执行 `airadar service install` 刷新服务定义。程序位于 npm 的全局安装目录，业务数据仍位于 `~/.airadar/data`，升级不会覆盖业务数据。macOS 服务定义位于 `~/Library/LaunchAgents/ai.qiushuiai.airadar.plist`；Windows 服务名为 `QiushuiAIAIRadar`，WinSW 包装器首次安装时会从官方发布页下载固定的 2.12.0 版本并校验 SHA-256。

密钥默认放在 `~/.airadar/secrets.env`，macOS 文件权限必须为 `600`；也可用 `AIRADAR_SECRET_FILE` 指向其他本机文件。CLI 和 Web 只输出是否已配置及掩码，不输出原值。

业务数据默认保存在 `~/.airadar/data`，也可通过 `AIRADAR_DATA_ROOT` 指定独立目录。`contents`、`discoveries`、`tasks`、`parameters`、`progress` 和 `audits` 下的 Markdown 是权威记录；`.index/runtime.sqlite` 使用 WAL，仅是启动时可从 Markdown 重建的辅助索引。`.raw-responses` 只保存已脱敏、到期可删除的供应商原始响应。

Web 经局域网或 Tailscale 访问时，用逗号分隔的 `AIRADAR_WEB_ORIGINS` 明确列出可信 Origin（含协议和端口）；未列出的跨站写请求会被拒绝。无平台字幕的视频可通过 `AIRADAR_TRANSCRIBER_URL` 接入 HTTPS（或本机回环）转写服务，接口接收内容地址并返回 `{ "text": "完整转写" }`。
