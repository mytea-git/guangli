#!/bin/sh
set -e

# 首次启动时，用镜像内置的演示工作区播种到挂载的 /workspace 卷
if [ -z "$(ls -A "$WORKSPACE_DIR" 2>/dev/null)" ]; then
  echo "[entrypoint] 初始化演示工作区到 $WORKSPACE_DIR ..."
  cp -R /app/workspace-demo/. "$WORKSPACE_DIR"/
fi

exec "$@"
