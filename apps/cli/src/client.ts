import type { AppType } from "@freecode/server";
import { hc } from "hono/client";

export const client = hc<AppType>("http://localhost:3000");
