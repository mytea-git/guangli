import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // `next lint`（已弃用，见 package.json 的 lint 脚本改为直接跑
    // `eslint .`）内置了一些默认忽略规则；直接用 ESLint CLI 后这些
    // 不再自动生效，必须显式列出——尤其是 public/monaco/**，那是
    // scripts/copy-monaco-assets.mjs 从 node_modules 拷贝过来的
    // 第三方压缩产物（自托管 Monaco 编辑器资源），不是仓库自己的源码，
    // 不应该被 lint（也解释了为什么 .gitignore 里这个目录不进版本库）。
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "public/monaco/**"],
  },
];

export default eslintConfig;
