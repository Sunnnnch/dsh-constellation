# Launch copy (English)

## One-liner

**Constellation** — an SSH/VPS fleet plugin for DeepSeek Harness. The model and you share one host inventory: it can exec, batch, upload, tunnel; you get a dashboard, terminal and audit log.

## X / Twitter thread

1/ I built a VPS plugin for DeepSeek Harness called Constellation.

The idea: your AI assistant should be able to *touch* the servers, not just talk about them.

2/ 15 model-facing tools:
list · exec · batch · status · history · SFTP up/down · tunnels · persistent shell · three-carrier probes · import SSH config.

3/ The human side is a real panel, not a chat log:
- left rail = inventory
- Komari-style dashboard (CPU/mem/disk rings, 24h trends)
- terminal, files, tunnels, audit
All backed by the same inventory.json the model reads.

4/ Safety is the default, not a setting:
- dangerous-command guard (rm -rf /, mkfs, …)
- read-only hosts
- TOFU host-key pinning
- credentials live in the harness store; the plugin only keeps key names
- every exec is audited

5/ Latency, honestly measured: the three-carrier panel pings 电信/联通/移动 *from the server*, so a local proxy can't fake the numbers. If your box is behind a proxy, the panel says "经本地代理" and shows no fake RTT.

6/ MIT, install straight from GitHub:

pnpm add github:Sunnnnch/dsh-constellation

https://github.com/Sunnnnch/dsh-constellation

Requires DSH ≥ 0.2.2-rc.1. Issues and PRs welcome.

## Reddit r/selfhosted

**Title:** I built a VPS fleet plugin for DeepSeek Harness — model and human share one inventory

I run a few boxes and got tired of copy-pasting `df -h` into chat. So I wrote Constellation: a plugin that gives the agent tools (exec, batch, SFTP, tunnels, persistent shell) and gives me a dashboard in the same app.

What's inside:
- Left-sidebar panel: inventory with tags/flags, Komari-style status page, terminal, file browser, port-forwarding UI, audit log.
- Background sampler: 24h metrics with automatic trimming, threshold alerts, optional webhook.
- Three-carrier latency (China Telecom/Unicom/Mobile) measured **from the server**, with packet-loss history persisted for 24h.
- Safety: 16 dangerous-command rules, read-only hosts, TOFU host-key pinning, credentials only by reference.

Install: `pnpm add github:Sunnnnch/dsh-constellation` (MIT).

Happy to answer questions about the SSH layer (ssh2 + a custom CJS interop shim, because the harness's ESM import of a bare-class CJS module is lossy) or the SSE-based terminal.

## Hacker News (Show HN)

**Show HN: Constellation – SSH/VPS fleet management for DeepSeek Harness**

Hi HN, I built a plugin that gives an LLM agent first-class access to a fleet of VPSes, and a human a normal dashboard on the same data.

Design notes worth discussing:
- Tools and UI share one inventory file; no second source of truth.
- Probes are executed on the remote host over SSH, so client-side VPN/proxy can't distort the latency chart.
- All exec calls are audited with exit codes; dangerous patterns are gated before they reach the shell.
- The terminal is SSE rather than WebSocket because the harness reserves its stream RPC for first-party plugins.

Repo: https://github.com/Sunnnnch/dsh-constellation (MIT)
