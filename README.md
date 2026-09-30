# FreeCode

使用 Bun workspaces 管理的轻量级 TypeScript monorepo：`apps/server` 提供 Hono HTTP 服务，`apps/cli` 使用 OpenTUI React 开发终端界面。

## 环境要求

- Bun 1.4.2 或更高版本；仓库的 `packageManager` 固定为 `bun@1.4.2`。
- CLI 需要交互式终端。

## 安装与启动

在仓库根目录安装所有 workspace 的依赖：

```bash
bun install
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
| `GET /ai` | 使用固定测试提示词的 AI SDK 标准 SSE 流 |
| `POST /ai` | 接收 `{ "prompt": "..." }` 并返回 AI SDK 标准 SSE 流 |

可以复制 `apps/server/.env.example` 为 `apps/server/.env` 修改端口，Bun 会自动加载该文件；也可以通过环境变量指定端口：

```bash
PORT=4000 bun run dev:server
```

测试 AI SDK + DeepSeek 时，复制 `apps/server/.env.example` 为 `apps/server/.env`，填写
`DEEPSEEK_API_KEY`，然后运行 `bun run dev:server`。使用 CLI 的“大模型测试”页面查看逐步生成的文本，
也可以运行 `curl -N http://localhost:3000/ai` 查看固定提示词的原始 SSE 事件。
聊天页面使用 AI SDK React 的 `useCompletion`，通过 Hono RPC 客户端向 `POST /ai` 发送首页提交的提示词；
请求体经 Zod 校验后传给 `streamText`，逐步返回模型文本。也可以这样手动调用动态端点：

```bash
curl -N -X POST http://localhost:3000/ai \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"请用中文写一首小诗。"}'
```

`GET /ai` 保留给“大模型测试”页面，使用固定提示词；两个端点都调用 `deepseek-flash`，关闭思考模式，
通过 `toUIMessageStream({ stream: result.stream })` 和 `createUIMessageStreamResponse` 返回 SSE。
每次请求都会调用 DeepSeek API。修改密钥后重启服务。
缺少密钥时返回 HTTP 500 和配置提示；流中的鉴权失败、余额不足、限流及其他生成错误
通过错误事件传给客户端，服务端只记录错误名称和状态码。生成总超时为 60 秒，客户端断开会中止生成。

服务端通过链式路由保留 RPC 类型，并从 `@freecode/server` 导出 `AppType`。CLI 的 `apps/cli/src/client.ts` 使用 `import type` 导入该类型，通过 `hc<AppType>()` 创建请求客户端：

```ts
import { client } from "./client";

const response = await client.health.$get();
const data = await response.json(); // 自动推导为 { status: string }
```

客户端默认连接 `http://localhost:3000`；修改服务端端口时，同步修改 `client.ts` 中的地址。

在另一个终端打开欢迎屏幕：

```bash
bun run dev:cli
```

首页通过 `useServerStatus` hook 使用 RPC 客户端请求 `/health`，显示 `Server: ok`；服务未启动或请求失败时显示 `Server: unavailable`。

在首页输入非空提示词后按无修饰键的 `Enter` 进入聊天页；`Shift+Enter` 可在提示词中换行。提示词通过 Zod 校验并去除首尾空白，带其他修饰键的 Enter 不会提交。
聊天页在收到首页的提示词后自动请求模型，逐步显示回复；请求失败时保留已收到的内容并显示错误，离开聊天页会取消请求。
点击“返回首页”可离开聊天页；首页其他导航入口不会进入聊天页。

点击首页的“大模型测试”进入测试页面，页面会自动请求服务端 `/ai`，显示加载提示，
随后随流更新模型返回的文本；请求或流读取失败时保留已收到的文本并显示错误。
页面会识别超时、中断、无效流数据和空输出。内容支持方向键和鼠标滚轮滚动，
点击“返回首页”即可离开。每次进入页面都会发起一次新的生成请求，离开页面会取消客户端请求。
使用前请先配置服务端 `DEEPSEEK_API_KEY` 并运行 `bun run dev:server`。

大模型测试功能的请求、流解析、内容和错误状态、取消逻辑集中在 `useAiTest` hook 中；`AiTestScreen` 负责界面渲染和返回首页交互。

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
bun run check       # Biome 检查和所有 workspace 的 TypeScript 类型检查
bun run lint        # 检查格式、导入顺序和代码规则
bun run format      # 统一格式化
bun run typecheck   # 逐个 workspace 检查类型
```

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
    │   └── src/
    │       ├── app.ts    # Hono 应用，导入时不会启动监听
    │       └── index.ts  # Bun HTTP 服务入口
    └── cli/
        ├── package.json  # @freecode/cli；OpenTUI Core、React 绑定及 React
        ├── tsconfig.json # CLI 专属 JSX 和 DOM 类型配置
        └── src/
            ├── App.tsx   # React 欢迎组件与键盘退出
            └── index.tsx # 终端、React root 与热重载入口
```

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
- CI 使用 `bun install --frozen-lockfile` 安装，再运行 `bun run check`。
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

CLI 的应用入口为 `src/app.ts`；更多命令以 `agent-context` 输出为准。

## 参考

- [Bun workspaces](https://bun.sh/docs/pm/workspaces)
- [Bun 隔离安装](https://bun.sh/docs/pm/isolated-installs)
- [Hono 的 Bun 运行方式](https://hono.dev/docs/getting-started/bun)
- [OpenTUI React 和 TypeScript 配置](https://github.com/anomalyco/opentui/blob/main/packages/react/README.md#typescript-configuration)
- [Bun 热重载](https://bun.sh/docs/runtime/watch-mode#hot-mode)
- [Biome monorepo 配置](https://biomejs.dev/guides/big-projects/)
