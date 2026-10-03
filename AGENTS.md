# Repository Guidelines

## 项目结构与模块边界

本项目是 Bun workspaces 管理的 TypeScript monorepo，可运行应用位于 `apps/`：

- `apps/server/src/app.ts` 是 Hono 应用组合根，只挂载 `src/routes/` 下的子路由并导出 `AppType`；`src/index.ts` 启动 HTTP 服务。保持应用定义与监听入口分离；`src/routes/` 只放路径、方法与请求校验，业务实现放 `src/features/<feature>/`，依赖方向为 `routes/* -> features/*`，feature 之间不互相引用。新增接口时先在 `features/` 实现业务，再在 `routes/` 暴露路径，最后在 `app.ts` 挂载。
- `apps/cli/src/index.tsx` 管理渲染器、热重载与退出清理；CLI 源码按三层组织：`src/app/` 放应用外壳与路由，`src/features/<feature>/` 放页面、专属组件与专属 hook，`src/lib/` 放跨功能共享的 schema、客户端、配色和按键契约。依赖方向单向：`features/*` 可依赖 `lib/`，`lib/` 不依赖任何 feature，feature 之间不互相引用。
- 根目录的 `tsconfig.base.json`、`biome.json`、`.editorconfig` 提供公共规则；`bun.lock` 是唯一锁文件。

共享能力位于 `packages/agent`，两端的会话契约位于 `packages/contracts`。Agent 根入口只导出纯工具契约，`/server` 提供 Agent 工厂，`/sandbox` 提供容器执行器；包不得反向依赖 `apps/`。每个工具的 `schema.ts` 与容器内 `runtime.ts` 放在同一工具目录，分别在 `tools/schemas.ts`、`tools/runners.ts` 和 SDK 适配处注册。

服务端 `src/runtime.ts` 组合工作区、鉴权、供应商配置与 Agent；`src/providers/` 持有模型身份、密钥检查和供应商错误映射。会话存储与生成编排位于 `features/conversations/`，HTTP 响应仍由路由负责。CLI 的跨功能会话请求位于 `lib/conversationApi.ts`，聊天传输协议位于 `features/chat/transport.ts`。

当前没有独立测试目录或静态资源目录；仅在实际需要时新增。测试文件与源码相邻存放，不单独建目录。

## 安装、开发与检查命令

使用 Bun 1.4.2 或更高版本，在仓库根目录执行：

| 命令 | 用途 |
| --- | --- |
| `bun install` | 安装所有 workspace 依赖 |
| `bun run dev:server` | 热重载启动服务，默认端口 3000 |
| `bun run dev:cli` | 在交互式终端中启动支持热重载的 CLI |
| `bun run start:server` / `bun run start:cli` | 普通启动，不监听文件变化 |
| `bun run test` | 运行所有 `*.test.ts` / `*.test.tsx`（`bun test`） |
| `bun run check` | 执行 Biome、所有 workspace 的类型检查与测试 |
| `bun run lint` | 检查格式、导入顺序和代码规则 |
| `bun run format` | 写入格式化结果 |
| `bun run typecheck` | 逐个 workspace 检查 TypeScript 类型 |

应用直接执行 TypeScript，当前没有独立构建脚本。

## 代码风格与命名

使用两空格缩进、UTF-8、LF 换行和文件末尾换行；Biome 行宽为 100。遵循现有双引号、分号风格及 TypeScript 严格检查。React 组件使用 PascalCase（如 `App.tsx`），变量和函数使用 camelCase，workspace 包名使用 `@freecode/*`。

CLI 的 JSX 设置仅放在 `apps/cli/tsconfig.json`，保留 `@opentui/react` JSX 来源和 `DOM` 类型。

运行依赖声明在所属应用，例如 `bun add --cwd apps/server hono`；公共开发工具放在根目录。跨包依赖使用 `workspace:*`。修改依赖后同步提交根目录 `bun.lock`。

## 页面开发与状态管理

后续新增或修改 CLI 页面及其 hook 时，必须遵循以下项目约定：

- 页面组件负责布局、状态展示和用户交互；业务行为是否提取为 custom hook，按下方“Custom hook 提取判据”判断，不以代码行数作为唯一标准。
- Hook 使用表达具体用途的 `useXxx` 命名，与页面放在同一个 `src/features/<feature>/` 目录，只返回页面实际需要的状态和操作。仅在多个功能实际复用时抽取共享 hook，不提前引入全局状态库或通用请求框架。
- 状态由最近的实际使用者持有，可由现有状态计算的值直接派生，避免重复保存。Custom hook 的每次调用拥有独立状态；多个组件需要共享同一请求或状态时，提升到共同父组件或按实际需要使用 Context，不能通过重复调用 hook 假定状态共享。
- 保持组件渲染和 hook 调用过程纯净，不在渲染过程中请求接口或更新状态。Hooks 只能在组件或 custom hook 的顶层调用；Effect 用于同步外部系统，依赖必须完整，用户主动触发的操作由事件处理函数发起。
- 异步请求必须处理等待、成功、空结果和错误等实际可能的状态，在卸载或依赖变化时使用 `AbortController` 取消旧请求，并清理订阅和计时器。避免取消后或旧请求晚到时覆盖当前状态；主动离开页面导致的取消不显示为请求失败。
- 流式页面逐步展示收到的内容，失败时保留已生成内容并显示独立错误提示。使用 AI SDK 时优先使用当前安装版本的公开流读取工具和协议 schema，不能将网络字节块直接当作完整 JSON。使用 UIMessage 协议时，必须区分完成、错误、取消及意外断流，以完成事件判断正常结束，不能只依赖连接关闭。
- OpenTUI 页面使用终端组件及其事件 API，长内容需要换行和滚动，输入与滚动区域按需管理焦点。终端渲染器、React root、进程监听和退出清理由 `src/index.tsx` 统一管理，页面和功能 hook 不自行创建渲染器或直接结束进程。
- 页面或 hook 行为变更后，验证加载、增量更新、错误显示和离开页面时的清理等相关场景；遵循下文的 CLI 交互验证要求。异步行为验证优先使用模拟响应，避免为了测试界面而依赖真实模型调用。
- CLI 可提交的用户业务输入使用功能专属的 Zod schema 在提交边界通过 `safeParse` 校验、规范化；导航只传递解析成功后的 `data`。接收路由状态等未知数据时也用同一 schema 校验，不能只依赖 TypeScript 类型或手写 `trim()` 与真假值判断。客户端校验不能替代服务端 API 校验。
- 固定按键映射定义在使用它的组件附近、JSX 之外；只有多个功能实际共用时才抽取共享配置。静态映射不需要 custom hook；提交快捷键须区分无修饰键与 Shift、Meta 等组合，并用交互测试覆盖。

### Custom hook 提取判据

新增或修改页面逻辑时，依次判断：

1. **有独立的业务过程时提取。** 当逻辑需要协调请求或流读取与加载、错误、取消、清理等状态，管理订阅或计时器的生命周期，或让多个事件处理和状态转换共同完成一个行为时，提取功能专属 hook；即使目前只被一个页面使用也可以提取。`HomeScreen` 的健康检查使用 `useServerStatus`，`AiTestScreen` 的流读取使用 `useAiTest`。页面应能通过 hook 返回值看出“显示什么、能执行什么”，不必读异步控制流才能理解布局。
2. **复用有状态逻辑时提取。** 两个实际使用处需要相同的状态变化和副作用生命周期时，抽取 hook；先放在所属功能目录，确实跨功能复用时再移到共享目录。Hook 复用的是逻辑，不会共享同一份状态；需要共享状态时提升到共同父组件或按实际需要使用 Context。
3. **没有独立生命周期或状态协作时保留在原处。** 单个 `useState`、简单事件处理函数、纯计算或校验函数、静态按键映射、简短路由守卫，以及仍容易阅读的简单 Effect，不要为了“解耦”单独包装成 hook。纯逻辑需要复用时抽取普通函数或 schema，固定配置抽取常量。
4. **提取后检查边界。** Hook 只负责一个可命名的用途，只暴露页面需要的状态和操作，不返回布局组件，也不接管终端渲染器或进程生命周期；若调用方仍需理解 hook 内部状态转换才能正确使用它，应重新调整职责。拆分前后验证页面行为和 Effect 清理一致。

参考：[React custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)、[React Effect 生命周期](https://react.dev/learn/lifecycle-of-reactive-effects)、[AI SDK 终端 UI 流读取](https://ai-sdk.dev/docs/ai-sdk-ui/reading-ui-message-streams)。

## API 数据校验

- 后续新增或修改的 API 端点必须使用 Zod 对实际接收和使用的外部数据进行运行时校验，包括请求体、查询参数、路径参数和业务相关请求头。TypeScript 和 Hono RPC 类型不能替代运行时校验。
- Hono 请求输入优先通过 `@hono/zod-validator` 的 `zValidator` 校验，并在处理函数中使用 `c.req.valid()` 读取校验后的数据。Schema 应明确字段类型、必填项以及业务需要的长度或取值限制；校验失败返回明确的 HTTP 400 响应，校验通过后再执行业务逻辑或调用模型。
- 使用第三方或模型返回的结构化数据时，在进入业务逻辑前使用 Zod 或 SDK 已有的 Zod schema 校验；不要重复定义 SDK 已提供的协议 schema。自由文本输出无需套用对象 schema。
- 没有外部业务输入的端点（如健康检查、固定提示词测试）无需添加空 schema；开始接收外部输入时必须补上校验。

## 测试与验证

自动化测试使用 `bun:test`，命名为 `*.test.ts` 或 `*.test.tsx` 并与源码相邻，从根目录运行 `bun run test`（已接入 `bun run check`）。服务测试导入 `app.ts`，避免启动监听；CLI 交互测试使用 `@opentui/react/test-utils` 的 `testRender`，用模拟按键覆盖提交、修饰键和退出等行为，不依赖真实模型调用。当前没有覆盖率门槛。

提交前运行 `bun run check`。服务变更验证相关路由及 `/health`；CLI 变更在交互式终端验证显示、热重载和 `Q`、`Esc`、`Ctrl+C` 退出后的终端恢复。CLI 自动启动仅监听 `127.0.0.1` 随机端口的本地后端，通过每次启动的令牌访问；`FREECODE_SERVER_URL` 不用于代理启动。聊天接口仅调用真实模型；推理与工具调用的渲染通过自动化测试中的模拟消息验证。

## 提交与 Pull Request

当前工作副本不含 Git 元数据，无法确认历史提交惯例。建议采用 `feat(cli): ...`、`fix(server): ...`、`docs: ...` 等明确描述类型和范围的消息，每次提交聚焦单一改动。

PR 说明问题、改动与验证命令及结果，关联适用的 issue。终端界面变更附截图或录屏；行为、脚本或配置变化同步更新 `README.md`。

## 配置与协作约定

本地后端端口由 CLI 启动时自动分配，工作区和令牌由可信启动入口注入。配置在服务端监听入口从 `apps/server/.env` 加载，公共包和数据库模块导入时不加载配置；仅提交 `.env.example`，不要提交凭据、依赖目录或生成产物。可复现安装使用 `bun install --frozen-lockfile`。

沟通与说明使用简体中文。仅修改任务所需内容，遵循现有风格，不顺带重构；清理本次改动产生的未使用代码。
