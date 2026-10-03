# TODO：Agent 工具能力分类与模式权限约束

**状态：待评估，尚未授权实现。** 本文记录现状、候选方案、评估事项和未来验收条件。只有评估通过后，才开始修改实现代码。

## 目标

- 让工具声明自身所需能力，例如读取工作区、写入工作区、执行进程。
- 让每个 Agent mode 显式授予能力，并在 TypeScript 编译期拒绝不兼容的工具配置。例如，把 `createFile`、`editFile` 或 `bash` 加入只读模式应产生类型错误。
- 保持模型每轮实际可调用的工具、系统上下文中的工具声明和服务端历史消息处理一致。
- 在运行时执行边界落实权限。提示词约束和编译期类型不能替代沙箱限制。
- 避免为当前两个模式构建不必要的通用权限框架；若只需简单能力集合即可满足要求，应优先采用简单设计。

## 当前实现与已确认的缺口

- `packages/contracts/src/mode.ts` 定义 `AgentMode`、模式名称和默认模式。
- `packages/agent/src/tools/schemas.ts` 从 `toolSchemas` 推导 `CodingToolName`。
- `packages/agent/src/modes.ts` 为每个模式维护白名单，并通过 `satisfies Record<AgentMode, ...>` 检查 mode 和工具名是否存在。
- 当前工具列表的元素类型只有 `CodingToolName`，没有能力区分。因此，不存在的名称会类型报错，但已注册的写工具放进 `readOnly.tools` **目前不会因权限不匹配而报错**。
- `packages/agent/src/server.ts` 为 SDK 构造工具，并依据模式白名单返回工具集合。系统上下文中的“本轮可用工具”由实际工具对象键生成，避免另维护一份名称清单。
- `apps/server/src/features/conversations/generation.ts` 使用当前工具集合过滤历史中的未授权工具片段，并由 AI SDK 校验 UIMessage 和可用工具。
- 沙箱和容器 runner 是执行边界的一部分；后续设计需确认文件写入与 shell 执行是否在只读模式下也有独立的运行时限制，不能把提示词或类型检查视为安全隔离。

## 候选设计

### A. 能力声明

评估将能力放在工具定义旁，或使用单独但穷尽的工具能力映射。能力词汇建议先保持最小：

- `workspace:read`
- `workspace:write`
- `process:execute`
- 只有确有对应工具及独立执行策略时，才增加 `network:access` 等能力。

初始分类建议：

| 工具 | 最低能力建议 | 备注 |
| --- | --- | --- |
| `listDirectory` | `workspace:read` | 目录枚举 |
| `readFile` | `workspace:read` | 文件读取 |
| `searchFiles` | `workspace:read` | 工作区搜索 |
| `createFile` | `workspace:write` | 文件创建 |
| `editFile` | `workspace:write` | 文件修改 |
| `bash` | `process:execute`、`workspace:write` | 通用 shell 可以产生文件副作用；不得仅凭“不是文件工具”将它视为只读 |

评估时确认能力表达的是工具所需的全部权限，而非单一标签。多能力工具只有在模式授予其全部所需能力时才可用。当前 `bash` 还应结合网络限制和容器实际挂载规则复核。

### B. mode 授权及编译期检查

- 为每个 mode 声明获授能力集合。
- 从工具能力推导工具名集合，而不是额外手写一份“只读工具名称联合类型”，避免新增工具时两处清单失去同步。
- `readOnly` 仅授予读取能力；`build` 授予完成当前构建任务所需的读取、写入和执行能力。若新增 mode，类型结构应要求为它作出明确授权决定。
- 将 `modeDefinitions` 的工具数组约束为“该 mode 可以使用的工具名”。保留 `as const` 和 `satisfies` 的字面量检查，避免数组意外拓宽为普通 `string[]`。
- 能力声明必须穷尽当前工具名：新增工具而未声明能力时，类型检查应失败。
- 避免依赖宽泛的 `as` 类型断言绕过权限类型。复核 `Object.fromEntries` 及其现有断言是否需要调整，确保静态类型与运行时工具集合一致。

### C. 运行时防线与上下文

- 继续只把当前 mode 授权的工具传给模型；不要把全部工具交给模型后只在 system prompt 中要求它自我限制。
- 保持上下文中可用工具列表从最终工具集合派生，不建立另一份提示词专属工具清单。
- 保持历史工具片段依据当前允许集合过滤；覆盖从可写模式切换到只读模式后的历史消息情形。
- 确认只读 mode 的文件写入和 shell 调用在容器/沙箱边界无法成功。优先使用独立、可验证的运行时策略，而非依赖工具名称或模型判断。
- 如果未来引入审批，应将审批作为高影响操作的附加运行时流程，不替代 mode 授权或沙箱限制。

## 实施前需要评估的决策

- [ ] 能力模型采用独立映射还是附加在工具定义上？比较重复声明、循环依赖、SDK schema 类型推导和工具注册完整性。
- [ ] `bash` 是一个通用执行能力，还是需要拆分只读命令与可写命令？除非能可靠地对命令语义作限制，不应只靠分类标签允许只读模式运行通用 shell。
- [ ] `build` 的实际权限范围是什么？确认工作区写入、临时目录、网络和容器挂载约束，不因“构建模式”一词自动授予未需要的能力。
- [ ] 新增 mode 时是否必须逐项定义能力授权？建议默认要求显式选择，避免新模式默认为全部可用能力。
- [ ] Agent UIMessage 类型、已存历史、AI SDK 工具协议及 CLI 的模式切换是否会受影响？目标是在不改变 wire protocol 和工具名称的情况下完成类型约束。
- [ ] 是否存在不经过 `createCodingAgent` 的工具注册或执行路径？确认每条执行路径都服从相同的授权决策。
- [ ] 类型约束的错误体验是否清晰？验证 IDE 对“已知但权限不足的工具”和“未登记能力的新工具”都能定位到具体配置。

## 后续实施步骤（评估通过后）

1. **确定权限契约**：定稿能力名称、模式授权表、`bash` 分类及沙箱应执行的策略；在代码变更前记录范围和不支持的场景。
2. **增加穷尽能力声明**：确保所有 `CodingToolName` 均被声明，新增工具漏标时类型检查失败。
3. **建立按 mode 约束的工具名类型**：让只读 mode 接受只读能力工具，并要求新增 mode 明确配置权限。
4. **将类型授权用于工具装配**：静态 mode 配置与运行时实际构造出的工具对象保持同一来源；移除或收窄不必要的类型断言。
5. **核实运行时隔离**：追踪只读模式下所有写入及命令执行路径，确认沙箱拒绝越权副作用；修复仅在实现授权所必需的范围内进行。
6. **验证 AI 上下文和历史**：确保可用工具声明与传给模型的工具键一致，旧模式下的工具调用不会作为当前可执行调用进入模型上下文。
7. **补充针对性验证**：验证类型层拒绝只读模式加入已知写工具、拒绝能力未分类的新工具；运行时验证只读模式拒绝文件写入和 shell 副作用；验证两种 mode 发送给模型的工具集合和历史过滤。
8. **运行仓库检查**：按 `AGENTS.md` 运行 `bun run check`，并核对 diff 仅包含该权限目标所需内容。不要调用真实模型验证权限逻辑。

## 验收条件

- [ ] 未知工具名在 IDE/TypeScript 检查中报错。
- [ ] 已知但不符合只读授权的工具加入 `readOnly` 时在编译期报错。
- [ ] 新增工具未分类能力时编译期报错。
- [ ] 新增 mode 未显式定义权限时编译期报错。
- [ ] 每种 mode 传给模型的工具集合只包含获授权工具；系统上下文清单与该集合相符。
- [ ] 切换到只读模式时，之前模式产生的未授权工具历史片段不会形成可执行上下文。
- [ ] 即使模型试图调用写工具，或通过可用执行工具发起写操作，服务端执行边界也不会在只读权限下修改工作区。
- [ ] 现有工具输入输出 schema、工具名称、会话协议和数据库格式保持兼容，除非评估明确批准额外变更。
- [ ] 相关自动化验证及 `bun run check` 通过；执行结果如实记录。

## 不在本 TODO 范围内

- 不重命名或重写现有工具，不改变模型供应商、会话存储或 CLI 的模式交互。
- 不引入通用 RBAC/策略引擎、插件权限市场或新的审批 UI。
- 不把自然语言 system prompt 当作权限控制，也不把 TypeScript 编译期限制当作运行时沙箱。
- 未经后续评估通过，不进行上述实现修改。

## 参考资料

以下为 2026-10-03 调研时查看的公开资料，主要用于设计对照；上游 `main` 分支会继续变化：

- [OpenAI Codex 沙箱策略定义](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)：read-only、workspace-write 等执行环境权限。
- [OpenAI Agents SDK 工具配置](https://github.com/openai/openai-agents-python/blob/main/src/agents/agent.py)：运行时工具启用与工具集合构建。
- [OpenAI Agents SDK 人工审批](https://github.com/openai/openai-agents-python/blob/main/docs/human_in_the_loop.md)：副作用工具的执行前审批机制。
- [OpenHands SDK Security Analyzer](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/security/analyzer.py)：执行前 action 风险分析。
- [SWE-agent 工具配置](https://github.com/SWE-agent/SWE-agent/blob/main/docs/config/tools.md)：基于 tool bundle 的工具定义与扩展。
