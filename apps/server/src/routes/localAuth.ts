import { timingSafeEqual } from "node:crypto";
import { type Hook, zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { ServerEnv } from "../runtime";

const headerSchema = z.object({ authorization: z.string().max(512).optional() });
const validateAuth: Hook<z.infer<typeof headerSchema>, ServerEnv, "*", "header"> = (result, c) => {
  if (!result.success) return c.json({ error: "本地访问令牌无效。" }, 401);
  const runtime = c.env?.runtime;
  if (!runtime) return c.json({ error: "本地工作区尚未初始化。" }, 503);
  const supplied = Buffer.from(result.data.authorization ?? "");
  const expected = Buffer.from(`Bearer ${runtime.token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return c.json({ error: "本地访问令牌无效。" }, 401);
};

/** 运行时只能由本地入口注入，HTTP 请求不能提供工作区或容器参数。 */
export const localAuthRoutes = new Hono<ServerEnv>().use(
  "*",
  zValidator<typeof headerSchema, "header", ServerEnv, "*", typeof validateAuth>(
    "header",
    headerSchema,
    validateAuth,
  ),
);
