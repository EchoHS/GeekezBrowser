# 更新日志

## 1.5.5

- 将浏览器环境数据从单个 `profiles.json` 改为 SQLite 存储，降低高频 REST API 调用时文件被并发写坏或变成 0 字节的风险。
- 保留旧数据迁移能力，首次启动时可从原 `profiles.json` 迁移到新的 `profiles.sqlite`。
- 新增单环境导出 REST API：`/api/export/one`，支持按环境 ID 直接导出 `.geekez` 备份文件。
- 修复打包后主进程找不到 `profile-store` 模块导致软件无法启动的问题。
- 更新版本号到 `1.5.5`，并重新生成 Windows x64 portable zip 包。
