# FreeCode

使用 Bun workspaces 管理的轻量级 TypeScript monorepo：`apps/server` 提供 Hono HTTP 服务，`apps/cli` 使用 OpenTUI React 开发终端界面。

## 环境要求

- Bun 1.4.2 或更高版本；仓库的 `packageManager` 固定为 `bun@1.4.2`。
- CLI 需要交互式终端。
- PostgreSQL 通过 Docker Desktop 或已启动的 Podman machine 运行。

## 安装与启动

在仓库根目录安装所有 workspace 的依赖：

```bash
bun install
bun run db:up
bun run db:generate
bun run db:migrate
```

启动服务器，支持热重载：

```bash
bun run dev:server
```

默认监听 `http://localhost:3000`：

| 路由 | 响应 |
| --- | --- |
| `GET /` | `Hello from Hono + Bun!` |
| `GET /health` | `{"status":"ok"}` |
| `POST /conversations` | 创建对话，返回对话 ID |
| `GET /conversations` | 按最后活动时间返回最近 50 条对话 |
| `GET /conversations/:id` | 恢复消息、工具记录和生成状态/错误 |
| `POST /ai` | 接收 `{ conversationId, requestId, message }`，保存新输入并返回 AI SDK 标准 SSE 流 |

可以复制 `apps/server/.env.example` 为 `apps/server/.env` 修改端口，Bun 会自动加载该文件；也可以通过环境变量指定端口：

```bash
PORT=4000 bun run dev:server
```

测试 AI SDK + DeepSeek 时，复制 `apps/server/.env.example` 为 `apps/server/.env`，填写
`DEEPSEEK_API_KEY`，然后运行 `bun run dev:server`。
聊天页面使用 AI SDK React 的 `useChat` 管理流式展示，消息持久化到 PostgreSQL。
`POST /ai` 只接收一条新的用户文本消息，服务端读取历史，经 Zod 和 AI SDK 消息校验后
使用 `convertToModelMessages` 传给 `streamText`。每约一秒保存包含推理、工具调用及结果的
完整消息快照；完成或取消时保存最终内容。失败、取消和中断的部分 AI 回答可以恢复展示，
下一轮模型上下文仅包含用户输入和已完成的 AI 回答。同一对话一次只允许一个生成请求，
重复 requestId 或忙碌的对话返回 HTTP 409。
也可以这样手动调用聊天端点：

```bash
# 先 POST /conversations 获取 id，再填入下面的 conversationId。
curl -N -X POST http://localhost:3000/ai \
  -H 'Content-Type: application/json' \
  --data '{"conversationId":"替换为对话UUID","requestId":"user-1","message":{"id":"user-1","role":"user","parts":[{"type":"text","text":"请用中文写一首小诗。"}]}}'
```

`POST /ai` 调用 `deepseek-flash`，通过 `reasoning: "high"` 开启思考模式，
通过 `toUIMessageStream({ stream: result.stream })` 和 `createUIMessageStreamResponse` 返回 SSE。
通过校验且配置了密钥的请求都会调用 DeepSeek API，不提供固定回复或演示工具。
修改密钥后重启服务。
缺少密钥时返回 HTTP 500 和配置提示；流中的鉴权失败、余额不足、限流及其他生成错误
通过错误事件传给客户端，服务端只记录错误名称和状态码。生成总超时为 60 秒，客户端断开会中止生成。

服务端通过 AI SDK 的 `tool` 注册 `addNumbers` 工具，并随对话历史一起传给模型。
该工具在服务端真实计算两个整数的和，参数 `a`、`b` 各限制在 -10 亿到 10 亿，返回 `{ "result": ... }`。
工具参数与结果使用 Zod schema 校验；模型调用工具后，SDK 把结果传回模型继续生成回答，最多进行 3 步。
普通问题由模型正常回答，只有模型实际调用工具时才出现工具记录。

检查真实工具调用的渲染时，可在聊天页面输入：

```text
请调用 addNumbers 工具计算 123 + 456，并根据工具结果回答。
```

页面会随真实事件显示 `[工具: addNumbers]` 的参数准备、等待结果和完成状态。
按 `Tab` 切换到记录区，再按 `Enter` 展开详情，可查看输入 `{ "a": 123, "b": 456 }`
与输出 `{ "result": 579 }`；继续输入“再调用工具把刚才的结果加上 21”可检查后续对话。
工具执行很快，中间状态可能只短暂出现。以上操作会实际调用 DeepSeek API。

服务端按“路由边界”和“功能实现”分层：`src/routes/` 只负责路径、方法和请求校验，链式定义各自的
子路由；`src/features/<feature>/` 放该功能的业务实现；`src/app.ts` 用 `app.route()` 把子路由挂到应用上。
Hono 的 `route()` 会合并子路由类型，因此挂载后仍能从 `@freecode/server` 导出完整的 `AppType`。
CLI 的 `apps/cli/src/lib/rpc.ts` 使用 `import type` 导入该类型，通过 `hc<AppType>()` 创建请求客户端：

```ts
// 在 src/features/<feature>/ 下的任意文件中，按相对路径导入或经过 hooks 使用
const response = await rpc.health.$get();
const data = await response.json(); // 自动推导为 { status: string }
```

客户端默认连接 `http://localhost:3000`；服务端使用其他端口时，复制 `apps/cli/.env.example`
为 `apps/cli/.env` 并设置 `FREECODE_SERVER_URL`，无需修改源码。

在另一个终端打开欢迎屏幕：

```bash
bun run dev:cli
```

首页通过 `useServerStatus` hook 使用 RPC 客户端请求 `/health`，显示 `Server: ok`；服务未启动或请求失败时显示 `Server: unavailable`。

在首页输入非空提示词后按无修饰键的 `Enter` 进入聊天页；`Shift+Enter` 可在提示词中换行。提示词通过 Zod 校验并去除首尾空白，带其他修饰键的 Enter 不会提交。
首页先创建数据库对话，成功后统一进入 `/chat/:id`，再加载该对话并发送首条提示词。
创建期间阻止重复提交；失败时保留输入供重试，离开首页会取消创建请求。历史对话也使用同一路由。
聊天页在收到首页的提示词后自动请求模型，逐步以单色 Markdown 显示回复；角色标签统一使用紫色，
正文使用白色，推理以灰色直接显示，工具调用默认显示一行状态摘要，失败或拒绝使用红色提示。
可继续输入消息，按 `Enter` 发送，
按 `Shift+Enter` 换行，按 `Tab` 在输入框与消息记录区之间切换。记录区用方向键或翻页键滚动；
出现工具片段时，可用 `j/k` 选择、`Enter` 逐项展开或收起输入输出，也可点击该片段切换详情。
状态行区分连接、等待内容、生成和失败，请求失败时保留已收到的内容。当前模型开启推理，并注册了加法工具，
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
连接池；正常退出会取消生成并保存部分消息，强制终止后失去心跳超过 90 秒的生成记录会在
下次访问时标记为中断。具体表结构和一致性约束见 [对话持久化设计](docs/conversation-storage.md)。

CLI 开发模式使用 `bun --watch`，保存已导入的 `.ts`、`.tsx` 文件后自动重启并回到首页，无需手动重启。重新启动进程会刷新依赖解析和终端状态，避免 `--hot` 在安装新依赖后继续使用旧的解析结果。输入框未聚焦时按 `Q`，或按 `Esc`、`Ctrl+C` 可退出并恢复终端。修改依赖或 `package.json` 后，请完成 `bun install` 并重新运行 `bun run dev:cli`。

`src/index.tsx` 负责创建终端渲染器和 React root。开发模式每次保存都会重新启动进程，React 局部状态会重置。`--no-clear-screen` 防止 Bun 自行清屏干扰终端渲染。

Bun 的开发监听会保留进程，因此键盘退出动作会先卸载 React、调用 `renderer.destroy()` 完成终端清理，再结束进程。组件通过 `onQuit` 回调请求退出，资源清理由入口统一负责。

普通启动模式不监听文件变化，无需编译，直接使用 Bun 执行 TypeScript：

```bash
bun run start:server
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

## 仓库结构

```text
.
├── package.json          # workspaces、Bun 版本、统一开发脚本与检查工具
├── bun.lock              # 唯一依赖锁文件
├── bunfig.toml           # 隔离安装，约束 workspace 依赖边界
├── tsconfig.base.json    # 公共 TypeScript 严格配置，不包含应用源码路径
├── biome.json            # 全仓库代码检查与格式化规则
├── .editorconfig         # 编码、缩进与换行规范
├── .gitignore            # 依赖、构建产物与本地环境文件
└── apps/                 # 可运行应用
    ├── server/
    │   ├── package.json  # @freecode/server；Hono 及服务开发工具
    │   ├── tsconfig.json # 继承公共配置，仅检查自己的源码
    │   ├── .env.example
    │   ├── prisma.config.ts # Prisma CLI 配置，读取 DATABASE_URL
    │   ├── prisma/       # schema、迁移及本地初始化 SQL
    │   └── src/
    │       ├── app.ts    # 组合根：挂载子路由、导出 AppType，导入时不会启动监听
    │       ├── index.ts  # Bun HTTP 服务入口
    │       ├── db/       # 服务端 Prisma Client 与连接池
    │       ├── routes/   # HTTP 边界：路径、方法与请求校验
    │       │   ├── system.ts # GET / 与 GET /health
    │       │   ├── ai.ts     # POST /ai
    │       │   └── conversations.ts # 对话创建与历史读取
    │       └── features/ # 按功能放置业务实现
    │           └── ai/
    │               ├── chatRequestSchema.ts # 请求体 Zod schema
    │               ├── chatTools.ts         # 模型可调用的加法工具
    │               └── streamCompletion.ts  # DeepSeek 流式生成与错误映射
    └── cli/
        ├── package.json  # @freecode/cli；OpenTUI Core、React 绑定及 React
        ├── tsconfig.json # CLI 专属 JSX 和 DOM 类型配置
        ├── .env.example  # FREECODE_SERVER_URL
        └── src/
            ├── index.tsx         # 终端、React root 与退出清理由入口统一管理
            ├── app/
            │   ├── App.tsx       # 应用外壳：全局退出快捷键 + MemoryRouter
            │   └── routes.tsx    # 路由表与路由状态校验
            ├── lib/              # 跨功能共享层
            │   ├── rpc.ts        # Hono RPC 客户端
            │   ├── promptSchema.ts # 提示词输入边界
            │   ├── textareaKeys.ts # 输入框按键契约与提交校验
            │   └── theme.ts      # 统一终端配色
            └── features/         # 按功能组织，页面与专属组件、hook 就近放置
                ├── chat/
                │   ├── ChatScreen.tsx
                │   ├── HistoryScreen.tsx
                │   ├── chatParts.ts
                │   ├── chatLabels.ts
                │   ├── components/
                │   └── hooks/
                └── home/
                    ├── HomeScreen.tsx
                    ├── components/
                    └── hooks/
```

服务端的依赖方向同样是单向的：`routes/*` 可以依赖 `features/*`，`features/*` 不依赖任何路由，
feature 之间不互相引用；入口 `index.ts` 只负责监听和运行时相关的连接策略。新增接口时先在
`features/<feature>/` 实现业务，再在 `routes/` 里暴露路径，最后在 `app.ts` 挂载。

CLI 的依赖方向是单向的：`features/*` 可以依赖 `lib/`，`lib/` 不依赖任何 feature；
feature 之间不互相引用，跨功能复用的 schema、配色和按键映射一律放在 `lib/`。

根目录直接放应用也符合 Bun workspaces 的规则，并没有必须使用某个目录名的限制。本项目将可运行应用放入 `apps/`，使用 `apps/*` 声明 workspaces。将来出现共享 UI、类型或业务库时，再创建 `packages/<包名>/` 并把 `packages/*` 加入 workspaces；当前无需创建空的共享包。

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
- 子包之间需要依赖时，使用 `workspace:*`，并在 `package.json` 中显式声明。
- CLI 启动脚本使用 `--cwd` 直接运行，保留交互式终端输入输出。
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
bunx --bun hono request /health src/app.ts --runtime bun
```

CLI 的应用入口为 `src/app.ts`；更多命令以 `agent-context` 输出为准。调整路由后可以先执行 `hono routes`
对比路径与方法，再用 `hono request` 逐个确认响应，无需启动 HTTP 服务。

## 参考

- [Bun workspaces](https://bun.sh/docs/pm/workspaces)
- [Bun 隔离安装](https://bun.sh/docs/pm/isolated-installs)
- [Hono 的 Bun 运行方式](https://hono.dev/docs/getting-started/bun)
- [OpenTUI React 和 TypeScript 配置](https://github.com/anomalyco/opentui/blob/main/packages/react/README.md#typescript-configuration)
- [Bun 热重载](https://bun.sh/docs/runtime/watch-mode#hot-mode)
- [Biome monorepo 配置](https://biomejs.dev/guides/big-projects/)
