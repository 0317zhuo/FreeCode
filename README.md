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

可以复制 `apps/server/.env.example` 为 `apps/server/.env` 修改端口，Bun 会自动加载该文件；也可以通过环境变量指定端口：

```bash
PORT=4000 bun run dev:server
```

在另一个终端打开欢迎屏幕：

```bash
bun run dev:cli
```

CLI 开发模式使用 `bun --hot`，保存已导入的 `.ts`、`.tsx` 文件后自动更新界面，无需手动重启。按 `Q`、`Esc` 或 `Ctrl+C` 退出并恢复终端。

`src/index.tsx` 在 `globalThis` 中保存终端渲染器和 React root。热重载时先卸载旧组件树、清理 effects，并销毁旧渲染器，再创建新的渲染器和 React root。这样可以适配 Bun 重新加载模块后的 React 上下文，避免重复接管终端或累积键盘监听器。`--no-clear-screen` 防止 Bun 自行清屏干扰终端渲染。退出时清除缓存。这是 Bun 的进程内热重载，未集成 React Fast Refresh；每次重载都会重新挂载组件，React 局部状态会重置。

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
