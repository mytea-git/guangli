# TOOLS

智能体可调用的工具清单（演示用途，非真实执行）。

- `list_files(path)` — 列出目录内容
- `read_file(path)` — 读取文件内容
- `write_file(path, content)` — 写入文件内容（受路径沙箱保护，写前自动快照）
- `list_versions(path)` — 查看某文件的历史版本
- `restore_version(path, versionId)` — 回滚到指定历史版本
- `get_agents_status()` — 获取当前多智能体工作流状态
- `get_settings()` — 读取系统设置（敏感字段打码）
