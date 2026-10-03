# FreeCode

使用 Bun workspaces 管理的轻量级 TypeScript monorepo：`apps/server` 提供 Hono HTTP 服务，`apps/cli` 使用 OpenTUI React 开发终端界面，`packages/agent` 提供编码代理与容器工具能力，`packages/contracts` 维护两端共用的会话契约。

## 环境要求

- Bun 1.4.2 或更高版本；仓库的 `packageManager` 固定为 `bun@1.4.2`。
- CLI 需要交互式终端。
- PostgreSQL 与工具沙箱需要 Docker Desktop 或已启动的 Podman machine。
- 首次启动会构建工具镜像，需要下载基础镜像和系统工具；之后的模型工具命令禁止联网。

## 安装与启动

在仓库根目录安装所有 workspace 的依赖：

```bash
bun install --backend=copyfile
bun run db:up
bun run db:generate
bun run db:migrate
```

在 `apps/server/.env` 中填写 `DEEPSEEK_API_KEY`，然后从仓库根目录启动：

```bash
bun run dev:cli
# 普通启动：bun run start:cli
```

CLI 捕获启动目录作为工作区，自动启动只监听 `127.0.0.1` 随机端口的本地后端。
每次启动使用独立访问令牌，RPC 和聊天请求自动携带鉴权信息，无需单独启动服务器。
后端数据库与模型配置来自应用安装位置的 `apps/server/.env`，不加载用户项目的服务配置。
旧 `dev:server` / `start:server` 命令不能独立启动代理；后端需要 CLI 提供工作区和令牌。

在任意项目目录运行源码入口，例如：

```bash
cd ~/projects/demo
bun --no-env-file /Users/zhuo/Desktop/FreeCode/apps/cli/src/index.tsx
# 开发监听：增加 --watch --no-clear-screen
```

工作区是 `demo`，与 FreeCode 的源码位置无关。`--no-env-file` 避免 Bun 将项目的 `.env`
自动加载为 CLI 配置；本期尚未发布 Homebrew 或 npm/npx 安装包。

| 路由 | 响应 |
| --- | --- |
| `GET /` | `Hello from Hono + Bun!` |
| `GET /health` | `{"status":"ok"}` |
| `POST /conversations` | 创建绑定当前工作区的对话，返回对话 ID |
| `GET /conversations` | 当前工作区最近 50 条对话 |
| `GET /conversations/:id` | 恢复当前工作区的消息、工具记录和生成状态 |
| `POST /ai` | 接收 `{ conversationId, requestId, message }` 并返回标准 SSE 流 |

所有路由要求 `Authorization: Bearer <本次启动令牌>`；客户端不能指定工作区。
不同工作区的对话读取及续聊返回 404。原有未绑定工作区的对话保留在数据库中，不自动分配工作区。

聊天使用 AI SDK React `useChat`，服务端使用 `ToolLoopAgent` 调用 `deepseek-flash`，
通过 `reasoning: "high"` 开启推理。历史经过 SDK 校验与 `convertToModelMessages` 转换后传给
`agent.stream()`，最多 20 步，最后一步用于总结；生成总超时为 180 秒。
每约一秒保存包含推理、工具调用和结果的消息快照，完成、失败或取消时保存最终内容。
下一轮模型上下文仅包含用户输入和已完成的 AI 回答。同一对话只允许一次生成，重复 requestId
或忙碌的对话返回 409。缺少密钥返回配置错误；鉴权、余额、限流等生成错误通过流展示。
验证通过且配置密钥的聊天会调用真实模型，自动化测试使用模拟模型响应。

## 编码工具与目录防护

工具组织在 `packages/agent/src/tools/<工具名>/`，每个工具的 `schema.ts` 和 `runtime.ts` 就近放置。
`tools/schemas.ts` 注册描述与输入/输出契约，`tools/runners.ts` 注册容器内实现，`server.ts` 将契约适配为 SDK 工具。
增加工具时同步维护这三个注册位置，并通过现有沙箱执行；不要让 CLI 或 SDK 工具直接操作宿主文件或启动宿主 shell。

| 工具 | 参数与结果 |
| --- | --- |
| `listDirectory` | `path` 默认 `.`，`offset` 默认 0，`limit` 默认/最大 200；返回名称、类型、总数和截断状态 |
| `readFile` | `path`、`startLine` 默认 1、`limit` 默认 200/最大 500；返回带行号文本、完整文件 SHA-256、总行数和截断状态 |
| `searchFiles` | `path` 默认 `.`，`query` 为非空、区分大小写的字面量；最多 100 条匹配，跳过 `.git`、`node_modules` 和符号链接 |
| `createFile` | `path`、`content`；创建父目录，已有文件拒绝覆盖，返回路径和哈希 |
| `editFile` | `path`、读取所得 `hash`、`oldText`、`newText`；内容哈希一致且旧文本只匹配一次才修改 |
| `bash` | `command`、`cwd` 默认 `.`、`timeoutMs` 默认 30000/最大 60000；返回 stdout、stderr、退出码、截断及超时状态 |

文件工具只处理不超过 1 MiB 的 UTF-8 文本，读取和搜索内容最多保留 64 KiB。
Bash 输出合计最多保留 64 KiB，截断后继续排空；支持真实 Bash 管道、重定向、Git、ripgrep、Bun 和基本系统命令。
在聊天中可输入“读取 README.md 并概括项目结构”验证工具展示；按 Tab 切换到记录区，Enter 展开工具参数和结果。

所有模型触发的操作在临时容器中执行，只将当前工作区非递归挂载到 `/workspace` 并直接写回原目录。
容器禁止网络、特权与宿主进程共享，移除 capabilities，启用 no-new-privileges，使用只读根文件系统与受限临时目录，
限制为 2 CPU、1 GiB 内存和 128 个进程。取消、超时和正常结束都会清理容器及后台进程；无沙箱时明确失败。

文件工具拒绝绝对路径、`..`、NUL 和越界符号链接；相对符号链接解析后仍在工作区内才可读取。
挂载前扫描并拒绝特殊文件、socket、多重硬链接及不同文件系统的嵌套目录，防止通过项目内入口访问外部资源。
若安装器或缓存创建了硬链接，启动会报告具体文件；将该文件改为独立副本后再启动。
安装依赖建议使用 `bun install --backend=copyfile`，避免与目录外缓存共享 inode。
工作区内 `.env` 允许访问，读取内容可能进入模型上下文与历史；容器不会继承宿主环境变量或服务端密钥。
权限边界针对宿主项目数据，容器运行库及临时文件可以使用；宿主及容器引擎必须可信且本地运行，
不考虑恶意宿主进程并发替换挂载内容。命令失败或取消不回滚已落盘的修改。

禁止联网意味着代理不能下载依赖或连接宿主数据库。容器只内置 Bun 等基础工具，项目测试需有现成兼容的依赖；
macOS/Windows 的原生依赖不能保证在 Linux 容器中复用。完整仓库测试由开发者在宿主运行。

服务端按“路由边界”和“功能实现”分层：`src/routes/` 只负责路径、方法和请求校验，链式定义各自的
子路由；`src/features/<feature>/` 放该功能的业务实现；`src/app.ts` 用 `app.route()` 把子路由挂到应用上。
Hono 的 `route()` 会合并子路由类型，因此挂载后仍能从 `@freecode/server` 导出完整的 `AppType`。
CLI 的 `apps/cli/src/lib/rpc.ts` 使用 `import type` 导入该类型，通过 `hc<AppType>()` 创建请求客户端：

```ts
// 在 src/features/<feature>/ 下的任意文件中，按相对路径导入或经过 hooks 使用
const response = await rpc.health.$get();
const data = await response.json(); // 自动推导为 { status: string }
```

客户端连接本次 CLI 启动的本地后端，`FREECODE_SERVER_URL` 不再用于代理启动。

首页通过 `useServerStatus` hook 使用 RPC 客户端请求 `/health`，显示 `Server: ok`；服务未启动或请求失败时显示 `Server: unavailable`。

在首页输入非空提示词后按无修饰键的 `Enter` 进入聊天页；`Shift+Enter` 可在提示词中换行。提示词通过 Zod 校验并去除首尾空白，带其他修饰键的 Enter 不会提交。
首页先创建数据库对话，成功后统一进入 `/chat/:id`，再加载该对话并发送首条提示词。
创建期间阻止重复提交；失败时保留输入供重试，离开首页会取消创建请求。历史对话也使用同一路由。
聊天页在收到首页的提示词后自动请求模型，逐步以单色 Markdown 显示回复；角色标签统一使用紫色，
正文使用白色，推理以灰色直接显示，工具调用默认显示一行状态摘要，失败或拒绝使用红色提示。
可继续输入消息，按 `Enter` 发送，
按 `Shift+Enter` 换行，按 `Tab` 在输入框与消息记录区之间切换。记录区用方向键或翻页键滚动；
出现工具片段时，可用 `j/k` 选择、`Enter` 逐项展开或收起输入输出，也可点击该片段切换详情。
状态行区分连接、等待内容、生成和失败，请求失败时保留已收到的内容。当前模型开启推理，并注册了编码工具，
因此只有实际收到相应事件时才显示推理或工具记录；离开聊天页会取消请求。
点击“返回首页”可离开聊天页。
首页按 `F2` 或点击“历史对话”打开记录，使用方向键选择、Enter 恢复，Backspace 返回首页。
恢复其他客户端仍在生成的对话时，CLI 定期同步已保存内容，并等待生成结束后允许继续发送。

## 本地数据库

数据库模块位于 `apps/server`，使用 Prisma 7.10 和 PostgreSQL adapter；CLI 不直连数据库。
`bun run db:up` 自动选择可用的 Docker 或 Podman，首次运行创建本地 `.env` 中的随机密码和
连接串，保留已有模型配置。默认端口 `127.0.0.1:54324`，可在启动前通过 `.env` 的
`POSTGRES_PORT` 调整。数据库使用命名卷；`bun run db:down` 停止服务并保留数据。

```bash
bun run db:up              # 启动并等待 PostgreSQL 健康
bun run db:generate        # 安装或修改 schema 后生成 Prisma Client
bun run db:migrate         # 开发时创建/应用迁移
bun run --cwd apps/server db:deploy  # 仅应用已提交迁移
bun run --cwd apps/server db:studio  # 查看本地数据库
bun run db:down            # 停止，不删除数据卷
```

Prisma Client 生成到 `apps/server/src/generated/prisma`，不提交生成文件。服务端热重载复用
连接池；正常退出会取消生成并保存部分消息，强制终止后失去心跳超过 210 秒的生成记录会在
下次访问时标记为中断。具体表结构和一致性约束见 [对话持久化设计](docs/conversation-storage.md)。

CLI 开发模式使用 `bun --watch`，保存已导入的 `.ts`、`.tsx` 文件后自动重启并回到首页，无需手动重启。重新启动进程会刷新依赖解析和终端状态，避免 `--hot` 在安装新依赖后继续使用旧的解析结果。输入框未聚焦时按 `Q`，或按 `Esc`、`Ctrl+C` 可退出并恢复终端。修改依赖或 `package.json` 后，请完成 `bun install` 并重新运行 `bun run dev:cli`。

`src/index.tsx` 负责创建终端渲染器和 React root。开发模式每次保存都会重新启动进程，React 局部状态会重置。`--no-clear-screen` 防止 Bun 自行清屏干扰终端渲染。

Bun 的开发监听会保留进程，因此键盘退出动作会先卸载 React、调用 `renderer.destroy()` 完成终端清理，再结束进程。组件通过 `onQuit` 回调请求退出，资源清理由入口统一负责。

普通启动模式不监听文件变化，无需编译，直接使用 Bun 执行 TypeScript：

```bash
bun run start:cli
```

## 代码检查

```bash
bun run check       # Biome 检查、所有 workspace 的类型检查，然后运行测试
bun run lint        # 检查格式、导入顺序和代码规则
bun run format      # 统一格式化
bun run typecheck   # 逐个 workspace 检查类型
bun run test        # 应用测试库迁移，再运行 bun test
```

测试与源码放在同一目录，命名为 `*.test.ts` 或 `*.test.tsx`。CLI 的交互测试使用
`@opentui/react/test-utils` 的 `testRender` 驱动按键，不需要真实模型调用。
测试需要先运行 `bun run db:up`，使用独立的 `freecode_test` 数据库，自动生成 Prisma Client
并应用迁移。也可配置 `TEST_DATABASE_URL` 指向已创建、名称以 `_test` 结尾的数据库；
测试不会清空开发库。直接 `bun test` 不能代替此初始化流程。
沙箱测试运行真实容器；本地后端生命周期测试只验证启动与健康检查，不写入开发对话。

## 仓库结构

```text
.
├── package.json              # apps/*、packages/* 与统一检查命令
├── bun.lock                  # 唯一依赖锁文件
├── bunfig.toml               # isolated linker
├── tsconfig.base.json        # 公共严格配置
├── biome.json
├── apps/
│   ├── server/src/
│   │   ├── app.ts            # 挂载路由、导出 AppType
│   │   ├── index.ts          # 配置加载、监听与进程清理
│   │   ├── runtime.ts        # 工作区、鉴权与 Agent 的应用组合
│   │   ├── providers/
│   │   │   └── deepseek.ts   # 模型身份、密钥检查与错误映射
│   │   ├── db/               # Prisma Client 与连接池
│   │   ├── routes/           # HTTP 校验、鉴权与 SSE 响应
│   │   └── features/conversations/
│   │       ├── store.ts      # 会话事务、历史与运行记录
│   │       ├── generation.ts # 模型生成与持久化编排，返回 SDK 流
│   │       ├── generationRuntime.ts # 热重载共享的活动生成记录
│   │       └── timing.ts     # 生成超时与失联回收阈值
│   └── cli/src/
│       ├── index.tsx         # 本地后端、终端与 React root 生命周期
│       ├── app/              # 应用外壳与路由
│       ├── lib/
│       │   ├── conversationApi.ts # 首页和聊天共用的会话请求
│       │   ├── localServer.ts
│       │   ├── rpc.ts
│       │   ├── promptSchema.ts
│       │   ├── textareaKeys.ts
│       │   └── theme.ts
│       └── features/
│           ├── home/         # 页面、专属组件与请求 hook
│           └── chat/
│               ├── ChatScreen.tsx
│               ├── HistoryScreen.tsx
│               ├── transport.ts # SSE 完成检查与新消息请求体
│               ├── chatActivity.ts
│               ├── chatLabels.ts
│               ├── chatParts.ts
│               ├── components/
│               └── hooks/
├── packages/
│   ├── agent/src/
│   │   ├── index.ts          # 共享工具契约入口，无文件系统或模型加载
│   │   ├── server.ts         # 模型注入、Agent 与 SDK 工具适配
│   │   ├── instructions.ts
│   │   ├── tools/
│   │   │   ├── schemas.ts    # 工具契约注册
│   │   │   ├── runners.ts    # 容器执行注册
│   │   │   ├── shared.ts     # 纯 schema 与大小限制
│   │   │   ├── runtime.ts    # 多个工具共用的文件读取与截断实现
│   │   │   └── <工具名>/     # schema.ts、runtime.ts
│   │   └── sandbox/
│   │       ├── index.ts
│   │       ├── interface.ts
│   │       ├── workspace.ts
│   │       ├── workspaceSandbox.ts
│   │       └── worker.ts     # 容器入口，只调用执行注册
│   └── contracts/src/
│       ├── index.ts
│       └── conversation.ts   # 请求、会话响应与生成状态的 Zod 契约
├── scripts/                  # 数据库和完整测试初始化
└── docs/                     # 持久化与结构决策说明
```

服务端的依赖方向同样是单向的：`routes/*` 可以依赖 `features/*`，`features/*` 不依赖任何路由，
feature 之间不互相引用；入口 `index.ts` 只负责监听和运行时相关的连接策略。新增接口时先在
`features/<feature>/` 实现业务，再在 `routes/` 里暴露路径，最后在 `app.ts` 挂载。

CLI 的依赖方向是单向的：`features/*` 可以依赖 `lib/`，`lib/` 不依赖任何 feature；
feature 之间不互相引用，跨功能复用的 schema、配色和按键映射一律放在 `lib/`。

可运行应用放在 `apps/`，能力与契约库放在 `packages/`，两个目录均已接入 workspaces。
`@freecode/agent` 的根入口只导出工具契约；`/server` 提供 Agent 工厂，`/sandbox` 提供 Bun 容器执行器。
共享入口不反向依赖应用，也不加载供应商、数据库或文件系统。`@freecode/contracts` 只依赖 Zod，
消息和流协议继续由 AI SDK 校验。数据库、HTTP、鉴权和终端展示各由所属应用维护。

完整评估、依赖边界与新增工具步骤见 [项目结构决策](docs/architecture.md)。

## OpenTUI React 配置

CLI 的 `tsconfig.json` 继承公共配置，并单独启用：

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react"
  }
}
```

`.tsx` 源码使用 `<box>`、`<text>` 等终端组件，入口通过 `createRoot(renderer).render(<App />)` 渲染。CLI 单独声明 `@opentui/core`、`@opentui/react`、`react` 和开发依赖 `@types/react`；JSX 配置不影响 Hono 服务。

## workspace 约定

- 根包和应用子包都设为 `private`，使用统一的 `@freecode/*` 包名。
- 根目录维护 TypeScript、Bun 类型和 Biome；应用运行依赖声明在所属 workspace。
- 检查工具通过 `bun run --bun` 执行，无需额外安装 Node.js。
- `bunfig.toml` 使用 `isolated` linker，应用只能直接导入自己声明的依赖。
- 在根目录执行安装并提交 `bun.lock`；不要为子包创建单独的锁文件。
- CI 使用 `bun install --frozen-lockfile` 安装，准备独立 PostgreSQL 测试库并配置
  `TEST_DATABASE_URL`，执行 `bun run db:generate` 后运行 `bun run check`（含测试）。
- 子包之间需要依赖时，使用 `workspace:*`，并在 `package.json` 中显式声明；公共包不得反向导入 `apps/`。
- CLI 启动脚本直接执行入口，保留用户启动目录及交互式终端输入输出。
- 本地 `.env` 不提交；可共享配置只提交 `.env.example`。

添加依赖时指定所属目录：

```bash
bun add --cwd apps/server hono
bun add --cwd apps/cli @opentui/react
bun add --dev --exact typescript   # 公共开发工具保留在根目录
```

## Hono CLI 验证

服务的开发依赖包含 Hono CLI，可直接检查应用，无需启动 HTTP 服务：

```bash
cd apps/server
bunx --bun hono agent-context
bunx --bun hono routes src/app.ts
bunx --bun hono request /health src/app.ts --runtime bun # 无运行时注入时返回 503
```

CLI 的应用入口为 `src/app.ts`；更多命令以 `agent-context` 输出为准。调整路由后可以先执行 `hono routes`
对比路径与方法。鉴权与业务测试通过 `app.request(..., { runtime })` 注入可信工作区和令牌，不启动监听。

## 参考

- [Bun workspaces](https://bun.sh/docs/pm/workspaces)
- [Bun 隔离安装](https://bun.sh/docs/pm/isolated-installs)
- [Hono 的 Bun 运行方式](https://hono.dev/docs/getting-started/bun)
- [OpenTUI React 和 TypeScript 配置](https://github.com/anomalyco/opentui/blob/main/packages/react/README.md#typescript-configuration)
- [Bun 热重载](https://bun.sh/docs/runtime/watch-mode#hot-mode)
- [Biome monorepo 配置](https://biomejs.dev/guides/big-projects/)
