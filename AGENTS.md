# Repository Guidelines

## 项目结构与模块边界

本项目是 Bun workspaces 管理的 TypeScript monorepo，可运行应用位于 `apps/`：

- `apps/server/src/app.ts` 定义 Hono 路由；`src/index.ts` 启动 HTTP 服务。保持应用定义与监听入口分离。
- `apps/cli/src/App.tsx` 定义 OpenTUI React 界面；`src/index.tsx` 管理渲染器、热重载与退出清理。
- 根目录的 `tsconfig.base.json`、`biome.json`、`.editorconfig` 提供公共规则；`bun.lock` 是唯一锁文件。

当前没有共享包、独立测试目录或静态资源目录；仅在实际需要时新增。

## 安装、开发与检查命令

使用 Bun 1.4.2 或更高版本，在仓库根目录执行：

| 命令 | 用途 |
| --- | --- |
| `bun install` | 安装所有 workspace 依赖 |
| `bun run dev:server` | 热重载启动服务，默认端口 3000 |
| `bun run dev:cli` | 在交互式终端中启动支持热重载的 CLI |
| `bun run start:server` / `bun run start:cli` | 普通启动，不监听文件变化 |
| `bun run check` | 执行 Biome 与所有 workspace 的类型检查 |
| `bun run lint` | 检查格式、导入顺序和代码规则 |
| `bun run format` | 写入格式化结果 |
| `bun run typecheck` | 逐个 workspace 检查 TypeScript 类型 |

应用直接执行 TypeScript，当前没有独立构建脚本。

## 代码风格与命名

使用两空格缩进、UTF-8、LF 换行和文件末尾换行；Biome 行宽为 100。遵循现有双引号、分号风格及 TypeScript 严格检查。React 组件使用 PascalCase（如 `App.tsx`），变量和函数使用 camelCase，workspace 包名使用 `@freecode/*`。

CLI 的 JSX 设置仅放在 `apps/cli/tsconfig.json`，保留 `@opentui/react` JSX 来源和 `DOM` 类型。

运行依赖声明在所属应用，例如 `bun add --cwd apps/server hono`；公共开发工具放在根目录。跨包依赖使用 `workspace:*`。修改依赖后同步提交根目录 `bun.lock`。

## 测试与验证

当前没有测试文件、`test` 脚本或覆盖率门槛。新增自动化测试建议使用 `bun:test`，命名为 `*.test.ts` 并与源码相邻，从根目录运行 `bun test`。服务测试导入 `app.ts`，避免启动监听。

提交前运行 `bun run check`。服务变更验证相关路由及 `/health`；CLI 变更在交互式终端验证显示、热重载和 `Q`、`Esc`、`Ctrl+C` 退出后的终端恢复。

## 提交与 Pull Request

当前工作副本不含 Git 元数据，无法确认历史提交惯例。建议采用 `feat(cli): ...`、`fix(server): ...`、`docs: ...` 等明确描述类型和范围的消息，每次提交聚焦单一改动。

PR 说明问题、改动与验证命令及结果，关联适用的 issue。终端界面变更附截图或录屏；行为、脚本或配置变化同步更新 `README.md`。

## 配置与协作约定

服务端口通过 `PORT` 设置，例如 `PORT=4000 bun run dev:server`。本地配置使用 `apps/server/.env`；仅提交 `.env.example`，不要提交凭据、依赖目录或生成产物。可复现安装使用 `bun install --frozen-lockfile`。

沟通与说明使用简体中文。仅修改任务所需内容，遵循现有风格，不顺带重构；清理本次改动产生的未使用代码。
