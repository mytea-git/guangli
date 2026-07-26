/**
 * 上游模型 API 返回的、可以安全展示给管理员的错误（HTTP 状态码 + 对方
 * 响应体摘要，不含我们服务器自己的文件路径/堆栈）。聊天路由据此区分：
 * 这类错误可以把 message 原样透给客户端；其它未预期的错误一律用
 * 通用文案，避免不小心把内部路径带出去。
 */
export class ProviderApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderApiError";
  }
}
