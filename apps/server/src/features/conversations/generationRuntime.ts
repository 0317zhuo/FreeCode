type ActiveGeneration = { controller: AbortController; finished: Promise<void> };
const shared = globalThis as typeof globalThis & {
  freecodeGenerations?: Map<string, ActiveGeneration>;
};
shared.freecodeGenerations ??= new Map();
export const activeGenerations = shared.freecodeGenerations;

export async function cancelActiveGenerations() {
  const active = [...activeGenerations.values()];
  for (const run of active) run.controller.abort();
  await Promise.allSettled(active.map((run) => run.finished));
}
