# FreeCode CLI

`@freecode/cli` 是 FreeCode 的终端客户端：在 TUI 中创建对话、与代理流式聊天，并浏览历史对话。
本包是 monorepo 中的一个应用包（对应 `apps/cli`），通过 `workspace:*` 依赖复用 `@freecode/contracts` 的共享 schema 与 `@freecode/server` 的类型。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 运行时 | Bun（`type: module`，ESM） |
| 语言 | TypeScript + React 19（`jsxImportSource: @opentui/react`） |
| 终端 UI | `@opentui/core`、`@opentui/react` |
| 路由 | `react-router`（`MemoryRouter`） |
| 聊天协议 | Vercel AI SDK（`ai`、`@ai-sdk/react`） |
| 后端调用 | `hono/client` 的类型安全 RPC（`hc<AppType>`） |
| 校验 | `zod` 4 |

## 目录结构

```
src/
├── index.tsx                     # 入口：启动本地后端 → 初始化 RPC → 渲染 App
├── app/
│   ├── App.tsx                   # 应用外壳：全局退出快捷键 + MemoryRouter
│   └── routes.tsx                # 路由表与模式（AgentMode）切换
├── features/
│   ├── home/                     # 首页：欢迎标题、提示词输入、服务状态
│   └── chat/                     # 聊天：消息流、工具详情、输入区、历史列表
└── lib/                          # 基础设施：RPC、本地后端、API、主题、输入校验
```

## 启动流程

1. `src/index.tsx` 以启动目录作为工作区，调用 `startLocalServer()` 拉起本地后端进程。
2. `localServer.ts` 生成一次性访问令牌，仅向子进程传递可信环境变量（`PATH`、`HOME`、容器相关等），
   不转发用户项目自动加载的业务配置；子进程在 stdout 输出 `{"type":"ready","url":...}` 就绪协议，
   并要求地址为 `127.0.0.1` 的 HTTP。
3. `initializeRpc()` 用后端地址与 `Bearer` 令牌构造 Hono 客户端。
4. 动态导入 `App` 并创建 OpenTUI 渲染器，挂载路由。
5. 收到 `SIGINT`/`SIGTERM`、按下退出键或后端意外退出时，`shutdown()` 统一卸载界面、停止子进程并退出。

## 功能页面

- **首页 `/`**：ASCII 标题、提示词输入框、后端 `/health` 状态；提交后创建对话并跳转到聊天页。`F2` 或点击进入历史。
- **聊天页 `/chat/:id`**：加载指定持久化对话，支持流式输出、推理与工具调用展示；后端仍在生成而本地未在流式时，会轮询同步已保存内容。
- **历史页 `/history`**：展示最近 50 条对话，可选择并打开。

### 快捷键

| 场景 | 按键 |
| --- | --- |
| 全局退出 | `Q`（输入框未聚焦时）/ `Esc` / `Ctrl+C` |
| 切换代理模式 | `Tab`（首页与聊天页） |
| 发送 / 换行 | `Enter` / `Shift`（或 `Meta`）+ `Enter` |
| 历史列表 | `↑`/`↓` 选择、`Enter` 打开、`Backspace` 返回 |
| 消息记录区 | `Shift+Tab` 切换焦点、`j`/`k` 选择详情、`Enter` 展开或收起 |

## 模块职责

- `lib/localServer.ts` — 后端子进程生命周期与就绪握手。
- `lib/rpc.ts` — Hono RPC 客户端与认证头；测试环境默认指向 `127.0.0.1:3000`。
- `lib/conversationApi.ts` — 对话的创建、读取、列表三个 API，使用 contracts 的 schema 校验响应。
- `features/chat/transport.ts` — 扩展 AI SDK 传输层，拦截 `abort` 与未正常 `finish` 的流并报错。
- `features/chat/chatActivity.ts` — 由消息与连接状态派生当前阶段（连接 / 等待 / 推理 / 生成 / 工具 / 失败）。
- `features/chat/chatLabels.ts` — 工具状态与角色、活动状态的中文文案与配色映射。
- `lib/theme.ts` — 统一的终端配色常量。

## 脚本

```bash
bun run dev        # 监听模式启动（--no-env-file）
bun run start      # 直接启动
bun run typecheck  # tsc --noEmit
```

测试文件使用 `bun:test` 与 `@opentui/react/test-utils`，可用 `bun test` 运行。

> 备注：本包未在 devDependencies 中声明 `typescript`，当前依赖安装下 `bun run typecheck` 会因找不到 `tsc` 而失败，需先安装 TypeScript 后使用。

## 环境变量

CLI 以 `--no-env-file` 启动，不会读取工作区 `.env`；模型与数据库等后端配置位于 `apps/server/.env`。

| 变量 | 说明 |
| --- | --- |
| `FREECODE_SERVER_LOG_TO_TERMINAL` | 设为 `1` 时把后端 stderr 输出到终端，默认关闭 |
