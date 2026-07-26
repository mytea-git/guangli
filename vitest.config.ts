import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    // Next 的 standalone 输出追踪 `service.ts` 对 `./sandbox` 的导入时，
    // 会连带把 lib/files/ 下的 sandbox.test.ts 也复制进 .next/standalone
    // ——不影响运行时（server.js 不会执行未编译的 .ts），但会让
    // `npm test` 把这份产物里的副本也当成测试文件跑一遍，排除掉。
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
