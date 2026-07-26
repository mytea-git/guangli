# 光离（guangli）

面向"类 OpenClaw"AI 智能体后端的 Web 管理系统：多智能体工作流可视化、VSCode 风格的代码管理、可开关的 OpenClaw 网页嵌入、Soul 人格文件快捷编辑 + token 用量热力图、模型配置与快速切换、内置可调用工具的 AI 助手侧边栏，以及基于版本快照的灾难自动恢复。

## 功能概览

| 页面 | 说明 |
|---|---|
| 工作流 | 类 n8n 节点图，实时显示每个智能体当前状态（空闲/思考中/调用工具/等待/错误）与任务，边动态高亮 |
| 文件 | 文件树 + Monaco 编辑器（自托管，不依赖 CDN），支持多标签、右键菜单、Ctrl+S、未保存确认、版本历史面板 |
| 连接 | 可在设置中开关，开启后以 iframe 嵌入外部 OpenClaw 网页端 |
| Soul | 自动扫描 `SOUL.md` / `AGENTS.md` / `IDENTITY.md` 等人格文件供快捷编辑；GitHub 风格 token 用量热力图（近一月/一周切换） |
| 模型 | 读取类 OpenClaw 配置中的模型信息，支持联网获取模型目录、一键切换当前激活模型 |
| 设置 | 连接开关、工作区目录、主题、模拟引擎控制、AI 助手模型配置、密码修改、灾难恢复 |
| AI 助手侧边栏 | 独立于 OpenClaw 的内置智能体，可调用工具读写工作区文件、查看状态、回滚版本，支持多会话历史，用于快速排查/修复 OpenClaw 问题 |

页面为顶部导航 + 内容区的上下结构，响应式布局（窄屏导航折叠为汉堡菜单，文件页树/编辑器堆叠）。

## 技术栈

Next.js 15（App Router）+ React 19 + TypeScript + Tailwind CSS v4；`@xyflow/react`（工作流节点图）；`@monaco-editor/react`（自托管 AMD 版本，无 CDN 依赖）；`zustand`（客户端状态）；`zod`（全量 API 入参校验）；`jose`（JWT）+ Node `crypto` scrypt（密码哈希，无原生模块）；数据以 JSON 文件持久化（原子写 + 版本快照），无需数据库；Server-Sent Events 实现实时推送。

数据来源采用"模拟引擎 + Provider 适配层"架构：内置 mock 引擎模拟 6 个智能体的真实状态流转与 token 消耗，后续可替换为对接真实 OpenClaw Gateway 的 Provider 实现，前端与 API 层无需改动。

## 本地开发

```bash
npm install
cp .env.example .env   # 按需修改 AUTH_SECRET / ADMIN_PASSWORD
npm run dev
```

访问 http://localhost:3000，使用 `.env` 中配置的管理员密码登录（默认见 `.env.example`，首次登录后请到设置页修改）。

```bash
npm run lint   # ESLint
npm run build  # 生产构建（standalone 输出）
npm test       # vitest 单元测试（路径沙箱、助手工具错误脱敏等）
```

## 生产部署（Docker Compose + Caddy）

```bash
cd deploy
cp ../.env.example .env   # 编辑 AUTH_SECRET（必填）、ADMIN_PASSWORD、DOMAIN
docker compose up -d --build
```

- **自定义域名**：只需修改 `deploy/.env` 中的 `DOMAIN` 一行（例如 `DOMAIN=admin.example.com`），Caddy 会自动向 Let's Encrypt 申请并续期 HTTPS 证书。域名解析需提前指向部署服务器的公网 IP，且 80/443 端口可访问。本地/无域名场景可保留 `DOMAIN=localhost`。
- **数据持久化**：`guangli-data`（设置、密码哈希、用量统计、版本快照、助手会话历史）与 `guangli-workspace`（受管代码工作区）均为 Docker 具名 volume，容器重启/重建不丢数据；首次启动会自动用镜像内置的演示工作区（`workspace-demo/`，含示例 `SOUL.md` 等文件）播种空的 workspace volume。
- **环境变量**（完整列表见 `.env.example`）：

  | 变量 | 说明 |
  |---|---|
  | `AUTH_SECRET` | JWT 签名密钥，**必填且需 ≥32 字符**，建议 `openssl rand -base64 48` 生成；生产环境（`NODE_ENV=production`）下缺失或过短会导致服务拒绝签发/校验会话（而不是静默回退到不安全的默认值） |
  | `ADMIN_PASSWORD` | 首次启动写入的初始管理员密码；仍在使用该初始密码时，登录后的顶部会有持续提醒条，务必尽快在设置页修改 |
  | `DATA_DIR` | 运行时数据目录（容器内固定为 `/data`） |
  | `WORKSPACE_DIR` | 受管工作区根目录（容器内固定为 `/workspace`）；出于安全考虑不再支持通过设置页在运行时修改，只能通过这个环境变量在部署期确定 |
  | `DOMAIN` | Caddy 反向代理绑定的域名 |
  | `TRUST_PROXY` | 生产环境设为 `1`：启用 Secure cookie，且只有此时才会信任 Caddy 转发的 `x-forwarded-for` 头（取其最右一跳）用于按 IP 限流；未设置时限流退化为所有直连请求共享同一个桶，避免伪造该头绕过限流 |

- **镜像构建**：`deploy/Dockerfile` 为 `node:22-alpine` 多阶段构建，最终以非 root 用户（`node`）运行；`npm ci --ignore-scripts` 避免原生模块编译问题，Monaco 编辑器静态资源在构建阶段拷入镜像自托管（不依赖运行时联网 CDN）。

### 已知限制

当前沙箱环境的出网策略会拦截对 Docker Hub（`docker.io` / `production.cloudfront.docker.com`）的镜像拉取请求，因此 `deploy/Dockerfile` 未能在本仓库的开发环境内实际执行一次完整的 `docker build`。已通过以下方式交叉验证其正确性：本地 `next build` standalone 产物结构（`.next/standalone`、`.next/static`、`public/`）与 Dockerfile 的 `COPY` 指令逐项核对一致；多阶段构建遵循 Next.js 官方文档给出的标准模式。建议在可正常访问 Docker Hub 的环境中执行首次构建验证。

## 安全说明

- 所有 API 路由均在 middleware 之外再次调用 `requireAuth()` 做纵深防御；`requireAuth()` 除校验 JWT 签名/过期外，还会比对 token 里的版本号与 `auth.json` 当前记录的 `tokenVersion`——每次改密码该版本号都会递增，因此改密码会让所有设备上的旧会话立即失效，不必等 7 天自然过期。
- 登录限流 5 次/60 秒/IP，文件、助手对话、模型目录联网获取、设置保存、模拟引擎控制、会话增删等写操作/耗时端点均按端点分别限流；限流的 IP 提取只在 `TRUST_PROXY=1` 时信任反向代理转发的 `x-forwarded-for`（且只取其最右一跳），避免客户端伪造该头绕过限流。
- 文件相关全部端点经统一的 `resolveSafe()` 路径沙箱（`lib/files/sandbox.ts`），覆盖路径穿越、符号链接逃逸、NUL 字节等场景；沙箱根目录固定只从 `WORKSPACE_DIR` 环境变量读取、不可通过设置 API 在运行时改写（可写的沙箱根会让路径沙箱形同虚设）。工作区文件的写入/新建/删除/重命名均已序列化，避免并发请求互相踩踏。
- AI 助手工具（`list_files`/`read_file`/`write_file`）对未预期的文件系统错误统一返回脱敏文案，避免服务器内部路径通过工具结果泄露给外部 LLM API。
- 已配置 CSP、`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Strict-Transport-Security`（Caddy 层）等安全响应头，其中的必要放宽项（如 Monaco 内联样式所需的 `style-src 'unsafe-inline'`、连接区可配置 iframe 所需的 `frame-src *`）均在代码注释中说明原因。
- 模型 API Key 仅存于服务端数据目录，GET 接口一律打码返回，不进入客户端 bundle；写入版本历史的自动快照也会对 API Key 做脱敏处理，避免明文密钥在磁盘上多留一份历史副本。
- AI 助手 / 模型目录联网获取所使用的 OpenAI 兼容 Base URL 是管理员在设置页填写的任意地址，出网前会做 SSRF 防护：解析后的 IP 不能落在回环/内网/链路本地范围内，且不跟随 HTTP 跳转。
- `settings.json` 等运行时 JSON 数据的读改写通过按文件名串行化的队列保证原子性，避免并发写入互相覆盖丢更新；版本快照/恢复同样做了按文件序列化，避免临时文件命名冲突导致的历史记录损坏。
- 部署镜像构建配有 `.dockerignore`，避免宿主机的 `node_modules`、运行时 `data/` 目录等被意外拷入 Docker 构建上下文/烤进镜像层。
- `npm audit --production` 存在若干高危提示，均为 `next` 自身捆绑的间接依赖（`postcss`、`sharp`），已确认项目未使用 `next/image`（唯一会触发 `sharp` 的路径）；`postcss` 仅在构建期处理可信的第一方源码，不经手运行时/不可信输入。npm 建议的修复方案（降级到 `next@9.3.3`）属于依赖解析器的误导性建议，实际会移除远多于其修复的安全补丁（包括 `next` 中间件绕过漏洞 CVE-2025-29927 的修复），因此判定为可接受的已知风险，未采用。

## 目录结构简述

```
app/          Next.js App Router 页面与 API 路由
components/   按功能域拆分的 React 组件
lib/          认证、Provider 适配层、文件沙箱、版本快照、助手工具等核心逻辑
hooks/        客户端 hooks（SSE 订阅、主题等）
scripts/      构建/运维脚本（Monaco 资源拷贝、密码哈希工具等）
workspace-demo/  演示用受管工作区（示例 SOUL.md 等人格文件）
deploy/       Dockerfile、docker-compose.yml、Caddyfile
```
