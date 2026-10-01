import { z } from "zod";

/** 首页与聊天页共用的用户提示词输入边界。 */
export const promptSchema = z.string().trim().min(1);

export const promptRouteStateSchema = z.object({ prompt: promptSchema });
