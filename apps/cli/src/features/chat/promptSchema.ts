import { z } from "zod";

export const chatPromptSchema = z.string().trim().min(1);

export const chatRouteStateSchema = z.object({ prompt: chatPromptSchema });
