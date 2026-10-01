import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client";

config({ path: resolve(import.meta.dir, "../../.env"), quiet: true });
const shared = globalThis as typeof globalThis & { freecodeDb?: PrismaClient };

/** 热重载复用连接池；CLI 不直接依赖此模块。 */
export function getDb() {
  if (!shared.freecodeDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("请先运行 bun run db:up，配置 DATABASE_URL。");
    shared.freecodeDb = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return shared.freecodeDb;
}

export async function closeDb() {
  await shared.freecodeDb?.$disconnect();
  delete shared.freecodeDb;
}
