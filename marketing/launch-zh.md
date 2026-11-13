# 发布文案（中文）

## 标题备选

1. Constellation：让 AI 和你共用一份 VPS 清单
2. 我给 DeepSeek Harness 写了个 VPS 插件，模型能直接帮你重启服务
3. 受够了对着一堆 SSH 窗口？试试把 VPS 变成一张星图

## 正文（V2EX / 即刻 / 少数派 通用）

用 DSH（DeepSeek Harness）一段时间后发现一个问题：模型能写代码、能跑本地命令，但**碰不到我的服务器**。每次要「看看 UK 那台的磁盘」就得自己 SSH 进去贴输出，来回搬运。

所以我写了 **Constellation**——一个 DSH 插件，把 VPS 变成模型和人共用的一份资产。

### 它做什么

- **模型侧**：15 个工具。列主机、跑命令、多机批量、SFTP 上传下载、端口转发、持久终端、读系统状态和历史指标。
- **人侧**：左侧栏一个入口，打开是完整的运维面板——主机卡片、Komari 风状态页、终端、文件、隧道、审计。
- **同一份清单**：模型看到的和你在面板里看到的是同一份 `inventory.json`，不存在两边不同步。

### 几个我比较在意的点

**默认收着来。** 危险命令（`rm -rf /`、`mkfs`、改 `/etc/passwd`）会被拦截；主机可以标成只读；SSH 主机指纹 TOFU 固定；密码和私钥口令只存 key 名，真实值走 DSH 凭据库——插件自己永远拿不到明文。

**所有操作留痕。** 模型执行的每条命令都进审计，带时间、命令、退出码，面板里可查。

**三网延迟是服务器自己测的。** 不是「你的电脑到服务器」，而是 SSH 上去 ping 电信/联通/移动的测试 IP，所以本机挂代理也不会失真——这点在做的时候踩过坑，面板会明确标「经本地代理」。

### 安装

```bash
pnpm add github:Sunnnnch/dsh-constellation
```

然后在 DSH profile 的 `dsh.profile.bundles` 里加上 `@sunrise/dsh-vps`，重装、重启。

仓库（MIT）：https://github.com/Sunnnnch/dsh-constellation

### 一点说明

- 需要 DSH ≥ 0.2.2-rc.1，目前只在 Windows + 桌面版实测过；
- 终端走 SSE 而不是 WebSocket，是插件侧的公开能力限制，不是偷懒；
- 英文界面只覆盖了标题和入口，其余中文——明确取舍，欢迎 PR。

如果你也在用 DSH 管服务器，欢迎试试，issue / PR 都欢迎。

---

## 短版（X / 即刻，280 字内）

给 DeepSeek Harness 写了个 VPS 插件：Constellation。

模型能直接列主机、跑命令、批量、传文件、开隧道；人从左栏打开同一个面板看状态、终端、文件。共用一份清单，所有操作进审计，危险命令默认拦截，凭据只存 key 名。

Komari 风状态页 + 三网延迟 + 24h 曲线。

MIT，`pnpm add github:Sunnnnch/dsh-constellation`

github.com/Sunnnnch/dsh-constellation

#DeepSeekHarness #VPS #运维
