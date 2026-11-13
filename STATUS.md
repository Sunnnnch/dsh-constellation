# 进度（对照 `../vps-plugin-plan.md` 与 `../vps-plugin-gap.md`）

更新：2026-11-13（A/D/B/C 四项）

## 已完成

| 项 | 状态 | 证据 |
|---|---|---|
| P0.2 工具注册 | ✅ 独立验证 | `test/harness.mjs`：12 个工具注册成功，schema 可投影 |
| P0.3 ssh2 连通 | ✅ 独立验证 | 真实握手 + exec，stdout/stderr/exit code 分离 |
| P1 主机资产 | ✅ | inventory.json、`~/.ssh/config` 解析导入、TOFU 指纹、readonly 围栏 |
| P1 工具集 | ✅ | `vps_list` / `vps_exec` / `vps_batch` / `vps_status` / `vps_history` / `vps_monitors` / `vps_upload` / `vps_download` / `vps_tunnel` / `vps_host_import` / `vps_host_add` / `vps_shell` |
| P2 终端后端 | ✅ 独立验证 | `ssh:<id>` 后端注册，send/read/close 契约通过 |
| P3 隧道 | ✅ 独立验证 | local 转发实测穿透 HTTP；remote/dynamic 已实现 |
| **左侧栏入口** | ✅ **运行时验证** | 运行中的 GUI：`sidebar.panellist` 占用 `@sunrise/dsh-vps`（order 40） |
| **主面板页面** | ✅ **运行时验证** | 运行中的 GUI：`main` 键 `@sunrise/dsh-vps` 占用（与入口同 id） |
| **状态页 Komari 风** | ✅ | 延迟/丢包（TCP 握手 ×3）/在线时长三卡 + CPU/内存/磁盘/流量四卡 + 分段条 + 到期/价格/备注 |
| **主机元数据** | ✅ 独立验证 | `expiresAt` / `price` / `priceUnit` / `notes`；patch 不丢 keyPath，空值可清除 |
| **三种认证方式** | ✅ 独立验证 | 面板可选 私钥 / 密码 / SSH Agent；密码经 `secretSet` 写 DSH 凭据，清单断言不含明文 |
| **危险命令闸门** | ✅ **运行时验证** | `tools/pre-execute` 返回 ask；本会话无审批 → 真机上 `reboot` / `rm -rf /` 均被拒绝 |
| **连接测试 + 指纹重置** | ✅ 独立验证 | `test` RPC 返回耗时/认证方式/指纹；`hostForgetKey` 供人显式重信任 |
| **批量执行** | ✅ **运行时验证** | `vps_batch` 工具 + 面板批量对话框（按 tag/勾选，逐台结果） |
| **命令片段** | ✅ 独立验证 | `storages/vps/snippets.json` + RPC + 终端/批量两处入口 |
| **xterm 终端** | ✅ 链路验证（像素效果待你眼睛） | chunk 经 Host 真实路由返回 200（297 KiB）；`test/terminal-chunk.mjs` 验证注册协议 + xterm UMD 求值 + 导出 |
| **指标历史** | ✅ **运行时验证** | 30s 采样落 `metrics/<host>.jsonl`；真机 `vps_history` 返回 min/avg/max + sparkline |
| **阈值告警** | ✅ 独立验证 | 内存/磁盘/负载 + 连续两次不可达；页面横幅 + 审计 + 可选 webhook |
| **设置与清单迁移** | ✅ 独立验证 | 面板「设置」写 `settings.json`（阈值/间隔/webhook/闸门），导入导出主机清单；`test/all.mjs` 一键跑三套件 |
| **结构化只读视图** | ✅ 独立验证 | 「系统」页签四条固定探测：服务/容器/端口/inode，不做自由命令 |
| **隧道持久化** | ✅ 代码完成 | 打开/关闭写 `tunnels.json`，重启后「恢复上次」逐条重开并报告失败 |
| **文件管理增强** | ✅ 独立验证 | 编辑/改名/权限/删除（目录仅空）；SFTP 层实测 RENAME、SETSTAT |
| **跳板机** | ✅ 独立验证 | `jump:["bastion"]` 经跳板 forwardOut 建连；harness 用同机转发实测 exec |
| **密钥部署** | ✅ 部分验证 | `vps_key_deploy` 生成 ed25519（OpenSSH 格式）并写远端 authorized_keys；生成已测，远端部署需真机 |
| **安全一致性** | ✅ 独立验证 | `secretSet` 仅 `DSH_VPS_*`；上传/下载工作区围栏；审计 2 MiB 轮转 + 面板「审计」页签；告警 10 分钟冷却 |
| **稳定性** | ✅ | 采样抖动（同轮不齐发）、空闲连接 10 分钟回收、面板请求在途去重、终端输入 25ms 合批 + SSE `since` 自动续传 |
| **外部监控接入** | ✅ 独立验证 | Komari `/api/nodes`+`/api/recent`；哪吒 `/api/v1/server`+`online-history`；面板「外部」对话框 |

## 验证方式

```bash
cd dsh-vps
node test/client-smoke.mjs   # 28 项：注册 + 组件深渲染
node test/harness.mjs        # 66 项 Host 侧：握手/exec/SFTP/转发/TOFU/终端契约/延迟/RPC/密码/批量/片段/策略/指标/监控/跳板/密钥/文件操作/系统视图
node test/terminal-chunk.mjs # 6 项：chunk 协议 + xterm UMD + 导出 TerminalBody
```

改完 `lib/client.js` 后让页面拿到新 bundle：
`plugin_manager set_plugin include:vps enabled:false` → 再 `enabled:true`（会重启 Loader entry 并重新发布 client bundle，无需重启应用）。
改 `package.json` 的 `dsh.client.inject` 必须走这一步：manifest 只在 entry 启动时读取。

### 踩到的坑：Host 的 CJS 互操作会拍平类导出

`ssh2` 的 `lib/client.js` 是 `module.exports = Client`（裸类导出）。DSH Host 自己的模块管线会浅拷贝 CJS 导出，类被拷成 `{}`，症状是 `new Client()` 抛 `Client is not a constructor` —— 而同样的代码在 `node test/harness.mjs`（原生 ESM）里一切正常，所以只在真机暴露。

解法：`lib/cjs.js` 是一个最小 CJS 求值器，只对 `ssh2/lib/client.js` 用它读取，保留真实 `module.exports`；内置模块、`.node`、JSON 仍走 Node 自己的 loader。以后引入任何「入口即类/函数」的 CJS 依赖，都要先按这个方式验证。

### 踩到的坑：PowerShell 读写中文文件

`Get-Content -Raw | Set-Content -Encoding utf8` 在 Windows PowerShell 下会按 ANSI 解码 UTF-8，中文变乱码且换行被吃掉。改 Markdown/JSON 一律用编辑工具，不要用 PowerShell 管道回写。

## 未做（后续）

- 跳板机 `jump` 链
- 文件管理增强（改名/删除/权限/文本编辑/双栏互传）
- 审计视图（JSONL 已有，缺界面）
- 结构化只读视图：systemd 单元 / Docker 容器 / 端口占用 / inode
- 隧道持久化 + 自动重连
- 密钥导入、英文 i18n 完整化
