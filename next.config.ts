import type { NextConfig } from "next";

// CSP 里几个必须放宽的地方，都是真实约束逼出来的，不是偷懒：
// - script-src/style-src 'unsafe-inline'：Next.js 自己会注入内联
//   <script>（RSC/hydration 数据流，如 `self.__next_f.push(...)`），
//   我们自己也有一段内联主题闪烁防护脚本（app/layout.tsx）；要去掉
//   'unsafe-inline' 需要接入 Next 的 nonce 机制并让它贯穿 RSC 内部
//   注入的脚本，工作量远超这次安全收尾的范围，先记录为已知取舍。
//   style-src 同理：Monaco 编辑器会动态注入内联 <style>，且我们有
//   多处用 style="" 内联样式（如热力图网格的 grid-column）。
// - worker-src 'self' blob:：Monaco AMD 版的 worker 引导会经过 blob:。
// - frame-src *：连接区功能需要把管理员在设置页填的任意地址嵌入
//   iframe，这个地址在构建期未知，也无法在 edge 运行时的中间件里
//   读取 settings.json（跑在 edge runtime，没有 fs 访问权限）按请求
//   动态收紧——这里选择静态放开 frame-src，把"信任这个地址"的判断
//   留给配置它的管理员；frame-ancestors 'none' 才是防止本应用被
//   别人嵌入的关键防线，不受这个放宽影响。
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "frame-src *",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
