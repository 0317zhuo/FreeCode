import type { CodingToolName } from "../tools/schemas";

export interface Sandbox {
  execute(name: CodingToolName, input: unknown, signal?: AbortSignal): Promise<unknown>;
}
