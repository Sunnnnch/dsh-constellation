Constellation v0.2.0 — 给 DeepSeek Harness 的服务器管理插件。

## 亮点

- **15 个模型工具**：列主机、执行、多机批量、系统状态、历史指标、三网探测、SFTP 上传下载、端口转发、持久 SSH 终端、导入 SSH 配置、新增主机。
- **左侧栏面板**：主机卡片（国旗、标签、CPU/内存/磁盘/流量、三网走势）、Komari 风状态页、终端、文件、隧道、审计。
- **玻璃主题**：半透明卡片 + 背景模糊；设置里可切换 **雾蓝** / **石墨** 两套配色。
- **后台采样**：30 秒一轮，指标与三网历史都只保留 24 小时，自动裁剪；累计流量持久化。
- **安全默认**：危险命令拦截、只读主机、TOFU 主机指纹、凭据只存 key 名、全量操作审计。

## 安装

```bash
pnpm add github:Sunnnnch/dsh-constellation
```

在 DSH profile 里把 `@sunrise/dsh-vps` 加进 `dsh.profile.bundles`，重装并重启。

## 要求

- DeepSeek Harness ≥ 0.2.2-rc.1
- 目前只在 Windows 桌面版实测

## 已知限制

- 本机延迟探针走 TCP 握手，本机挂代理时会标「经本地代理」；线路质量请看服务器侧的「三网」。
- 终端走 SSE（DSH 的流式 RPC 归一方独占）。
- 跳板机只支持链上第一台。

Full changelog: https://github.com/Sunnnnch/dsh-constellation/commits/main
