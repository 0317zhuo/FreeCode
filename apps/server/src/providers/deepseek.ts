import { deepSeek } from "@ai-sdk/deepseek";
import { APICallError, RetryError, StreamProviderError } from "ai";

/** 把 DeepSeek 的失败原因映射成可以直接展示给用户的中文提示。 */
function describeError(error: unknown) {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)) {
    if (cause.statusCode === 401 || cause.statusCode === 403)
      return "DeepSeek 鉴权失败，请检查服务端 API 密钥。";
    if (cause.statusCode === 402) return "DeepSeek 余额不足，请检查账户余额。";
    if (cause.statusCode === 429) return "DeepSeek 请求过于频繁，请稍后重试。";
  }

  return "模型生成失败，请检查服务端配置或稍后重试。";
}

/** 服务端日志只记录错误名称和状态码，避免把密钥或请求内容写进日志。 */
function logError(error: unknown) {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  console.error("DeepSeek 流式生成失败", {
    name: cause instanceof Error ? cause.name : "UnknownError",
    status:
      APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)
        ? cause.statusCode
        : undefined,
  });
}

export function createDeepSeekProvider() {
  const identity = { provider: "deepseek", model: "deepseek-flash" };
  return {
    identity,
    model: deepSeek(identity.model),
    configurationError: () =>
      process.env.DEEPSEEK_API_KEY?.trim()
        ? undefined
        : "服务端未配置 DEEPSEEK_API_KEY，请填写 apps/server/.env 并重启服务。",
    describeError,
    logError,
  };
}
