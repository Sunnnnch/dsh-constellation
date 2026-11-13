import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * Tool outputs must be lossless JSON, so `undefined` fields (an unset port, a
 * missing OS version) have to disappear rather than serialize as holes.
 */
function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

/** Format one exec result as compact terminal-style text. */
function renderExec(value) {
  const lines = [`$ ${value.command}`, `# host=${value.host} exit=${value.exitCode ?? 'null'} ${value.durationMs}ms`]
  if (value.stdout) lines.push(value.stdout.replace(/\s+$/, ''))
  if (value.stderr) lines.push(`[stderr] ${value.stderr.replace(/\s+$/, '')}`)
  if (value.truncated) lines.push('[输出被截断：提高 maxOutputBytes 或改用更精确的命令]')
  if (value.timedOut) lines.push(`[超时：${value.timeoutMsHint || '命令未在时限内结束，已发 SIGINT'} ]`)
  return [{ type: 'text', text: lines.join('\n') }]
}

/** Format the host table. */
function renderHosts(value) {
  if (!value.hosts?.length) return [{ type: 'text', text: '库存为空。用 vps_host_import 导入 ~/.ssh/config，或 vps_host_add 添加一台。' }]
  const rows = value.hosts.map((host) => {
    const bits = [`${host.id}`, `${host.user}@${host.host}:${host.port}`, host.label !== host.id ? `(${host.label})` : '', host.readonly ? '[只读]' : '', host.tags?.length ? `#${host.tags.join(' #')}` : '', host.reachable === false ? '[不可达]' : host.reachable === true ? `[${host.latencyMs}ms]` : '']
    return bits.filter(Boolean).join(' ')
  })
  return [{ type: 'text', text: rows.join('\n') }]
}

/** Human summary of a batch run. */
function renderBatch(value) {
  const rows = [`$ ${value.command}`, `# ${value.results.length} 台，并发 ${value.concurrency}`]
  for (const row of value.results) {
    if (row.ok) {
      rows.push(`✓ ${row.host} exit=0 ${row.durationMs}ms`)
      if (row.stdout) rows.push(row.stdout.replace(/\s+$/, ''))
      if (row.stderr) rows.push(`[stderr] ${row.stderr.replace(/\s+$/, '')}`)
      continue
    }
    const tag = row.error ? `error: ${row.error}` : `exit=${row.exitCode ?? 'null'}${row.timedOut ? ' timeout' : ''}`
    rows.push(`✗ ${row.host} ${tag} ${row.durationMs}ms`)
    if (row.stderr) rows.push(`[stderr] ${row.stderr.replace(/\s+$/, '')}`)
  }
  return [{ type: 'text', text: rows.join('\n') }]
}

/** Human summary of one host's metric history. */
function renderHistory(value) {
  if (!value.samples) {
    return [{ type: 'text', text: `${value.host} · 最近 ${value.minutes} 分钟还没有采样。采样器默认每 30s 一轮，装好插件后等一会儿再查。` }]
  }
  const line = (label, stats, spark) => {
    if (!stats) return `${label.padEnd(5)} ${spark || '（无数据）'}`
    return `${label.padEnd(5)} ${spark}\n      min ${stats.min} · avg ${stats.avg} · max ${stats.max}`
  }
  return [
    {
      type: 'text',
      text: [
        `${value.host} · 最近 ${value.minutes} 分钟 · ${value.samples} 个采样${value.offline ? ` · ${value.offline} 次不可达` : ''}`,
        line('CPU', value.summary.cpu, value.sparklines.cpu),
        line('MEM', value.summary.mem, value.sparklines.mem),
        line('DISK', value.summary.disk, value.sparklines.disk),
      ].join('\n'),
    },
  ]
}

/** Human summary of configured external monitoring sources. */
function renderMonitors(value) {
  if (!value.monitors || !value.monitors.length) {
    return [{ type: 'text', text: '没有配置外部监控源。在插件配置里加 monitors: [{ name, kind: komari|nezha, baseUrl, tokenRef }]。' }]
  }
  const lines = []
  for (const source of value.monitors) {
    lines.push(`${source.name} (${source.kind}) · ${source.ok ? `${source.nodes.length} 个节点` : `失败：${source.error}`}`)
    for (const node of (source.nodes || []).slice(0, 20)) {
      const bits = [
        node.online === true ? '在线' : node.online === false ? '离线' : '状态未知',
        node.cpu != null ? `CPU ${node.cpu}%` : '',
        node.mem != null ? `MEM ${node.mem}%` : '',
        node.onlineRate != null ? `在线率 ${node.onlineRate}%` : '',
        node.expiresAt ? `到期 ${node.expiresAt}` : '',
      ]
      lines.push(`  - ${node.name} · ${bits.filter(Boolean).join(' · ')}`)
    }
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/** Format one status object. */
function renderStatus(value) {
  const load = value.cpu
  const mem = value.mem
  const lines = [
    `${value.host} (${value.label}) — ${value.os?.name || 'unknown'}${value.os?.kernel ? ` / ${value.os.kernel}` : ''}`,
    `CPU: ${load?.cores ?? '?'} 核  load ${load?.load1 ?? '?'} ${load?.load5 ?? '?'} ${load?.load15 ?? '?'}`,
    `MEM: ${mem?.usedMb ?? '?'}/${mem?.totalMb ?? '?'} MB (${mem?.usedPct ?? '?'}%)`,
  ]
  for (const disk of value.disk || []) lines.push(`DISK ${disk.mount}: ${disk.usedGb}/${disk.totalGb} GB (${disk.usedPct}%)`)
  if (value.services?.failedUnits?.length) lines.push(`FAILED: ${value.services.failedUnits.join(', ')}`)
  if (value.docker) lines.push(`DOCKER running: ${value.docker.running}`)
  if (value.warnings?.length) lines.push(`WARN: ${value.warnings.join('; ')}`)
  return [{ type: 'text', text: lines.join('\n') }]
}

/** Human summary of a transfer. */
function renderTransfer(value) {
  return [{ type: 'text', text: `${value.host}: ${value.localPath ?? ''} ${value.remotePath ?? ''} ok (${value.durationMs}ms)` }]
}

/** Human summary of a persistent shell operation. */
function renderShell(value) {
  if (value.sessions) {
    return [{ type: 'text', text: value.sessions.length ? value.sessions.map((entry) => `${entry.sessionId} ${entry.host} ${entry.status.kind}`).join('\n') : '没有打开的持久会话。' }]
  }
  if (value.output !== undefined) return [{ type: 'text', text: `[${value.sessionId} ${value.waitReason}]\n${value.output}` }]
  if (value.text !== undefined) return [{ type: 'text', text: value.text }]
  if (value.state === 'closed') return [{ type: 'text', text: `${value.sessionId} 已关闭` }]
  return [{ type: 'text', text: `sessionId=${value.sessionId} (${value.host})${value.motd ? `\n${String(value.motd).slice(0, 600)}` : ''}` }]
}

/** Human summary of a tunnel operation. */
function renderTunnel(value) {
  if (value.tunnels) return [{ type: 'text', text: value.tunnels.length ? value.tunnels.map((t) => `${t.tunnelId} ${t.kind} ${t.listen} -> ${t.target} [${t.state}]`).join('\n') : '没有打开的隧道。' }]
  return [{ type: 'text', text: `${value.tunnelId || ''} ${value.kind || ''} ${value.listen || ''} -> ${value.target || ''} [${value.state}]` }]
}

/**
 * Register every model-facing tool on `ctx.tools`.
 * @param {object} ctx - host Context providing `tools`
 * @param {import('./service.js').VpsService} service
 * @param {object} config - plugin configuration
 * @returns {Array<() => void>} disposers
 */
export function registerTools(ctx, service, config) {
  const disposers = []
  const register = (definition) => {
    disposers.push(ctx.tools.register(definition))
  }

  register(
    defineTool({
      name: 'vps_list',
      description:
        '列出已登记的所有 VPS/服务器（id、地址、用户、标签、是否只读）。任何服务器操作前先用它拿到准确的主机 id；其它 vps_* 工具的 host 参数都接受这里的 id。verbose=true 会逐台建立 SSH 连接测延迟（较慢）。',
      parameters: {
        tag: { type: 'string', description: '只看带这个标签的主机' },
        verbose: { type: 'boolean', description: '是否实际连接探测可达性与延迟' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderHosts(value) },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const hosts = service
          .hosts()
          .filter((host) => !args.tag || host.tags.includes(args.tag))
          .map((host) => ({ id: host.id, label: host.label, host: host.host, port: host.port, user: host.user, tags: host.tags, readonly: host.readonly }))
        if (args.verbose) {
          await Promise.all(
            hosts.map(async (host) => {
              const started = Date.now()
              try {
                await service.connect(host.id, exec.signal)
                host.reachable = true
                host.latencyMs = Date.now() - started
              } catch {
                host.reachable = false
              }
            }),
          )
        }
        return jsonSafe({ hosts })
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_exec',
      description:
        '在一台远端服务器上执行一条 shell 命令，返回 stdout、stderr、退出码。适合一次性、有明确结束的命令（ls、systemctl status、docker ps、tail 日志、df）。需要保持 cwd/环境/长任务时改用 terminal_open（type 为 ssh:<id>）。输出默认截断 64KiB，命令默认 30s 超时。',
      parameters: {
        host: { type: 'string', required: true, description: 'vps_list 返回的主机 id' },
        command: { type: 'string', required: true, description: '要执行的 shell 命令' },
        cwd: { type: 'string', description: '执行前进入的目录' },
        sudo: { type: 'boolean', description: '用 sudo -n 执行（需要免密 sudo）' },
        timeoutMs: { type: 'integer', description: '超时毫秒数，默认 30000' },
        maxOutputBytes: { type: 'integer', description: 'stdout+stderr 合计最大字节数，默认 65536' },
        env: { type: 'object', additionalProperties: true, description: '附加环境变量' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderExec(value) },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        return jsonSafe(
          await service.exec(args.host, args.command, {
            cwd: args.cwd,
            sudo: args.sudo,
            timeoutMs: args.timeoutMs,
            maxOutputBytes: args.maxOutputBytes,
            env: args.env,
            signal: exec.signal,
          }),
        )
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_batch',
      description:
        '在**多台**服务器上并行执行同一条命令，返回逐台结果（退出码、stdout、stderr、耗时）。hosts 与 tag 二选一：hosts 是主机 id 数组，tag 是按标签挑选。并发默认 4、上限 8；单台失败不影响其它主机，失败原因写在该行的 error 里。适合"检查所有机器的磁盘/nginx 状态/系统负载"这类巡检。',
      parameters: {
        hosts: { type: 'array', items: { type: 'string' }, description: '主机 id 列表（与 tag 二选一）' },
        tag: { type: 'string', description: '按标签选择主机（与 hosts 二选一）' },
        command: { type: 'string', required: true, description: '要执行的 shell 命令' },
        concurrency: { type: 'integer', description: '并发数，默认 4，上限 8' },
        timeoutMs: { type: 'integer', description: '单台超时毫秒数，默认 30000' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderBatch(value) },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const ids = Array.isArray(args.hosts) && args.hosts.length
          ? args.hosts
          : args.tag
            ? service.hosts().filter((host) => host.tags.includes(args.tag)).map((host) => host.id)
            : []
        if (!ids.length) throw new Error('vps_batch 需要 hosts（id 数组）或 tag；先用 vps_list 看有哪些主机')
        return jsonSafe(await service.batch(ids, args.command, { concurrency: args.concurrency, timeoutMs: args.timeoutMs, signal: exec.signal }))
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_status',
      description:
        '读取服务器健康状态：发行版与内核、运行时长、CPU 核数与 load1/5/15、内存用量、各挂载点磁盘用量、累计网络流量、失败的 systemd 单元、运行中的容器数。一次 SSH 往返取全部，只读。用户问"机器怎么样/负载高不高/磁盘满没满/内存够不够"时用它。',
      parameters: {
        host: { type: 'string', required: true, description: 'vps_list 返回的主机 id' },
        timeoutMs: { type: 'integer', description: '探测超时毫秒数，默认 20000' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderStatus(value) },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return jsonSafe(await service.status(args.host, { timeoutMs: args.timeoutMs, signal: exec.signal }))
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_history',
      description:
        '读取一台主机的指标历史（默认最近 60 分钟）：CPU 负载、内存、磁盘占比的 min/avg/max、不可达次数，以及一行 sparkline。用来回答"最近一小时内存有没有涨""是不是一直在抖动""刚才有没有掉线"。采样器默认每 30 秒一轮，历史保存在 storages/vps/metrics/。',
      parameters: {
        host: { type: 'string', required: true, description: 'vps_list 返回的主机 id' },
        minutes: { type: 'integer', description: '回看多少分钟，默认 60' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderHistory(value) },
      isConcurrencySafe: () => true,
      async execute(args) {
        return jsonSafe(service.history(args.host, { minutes: args.minutes }))
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_monitors',
      description:
        '列出配置的外部监控面板（Komari / 哪吒 V2）及其节点：在线状态、CPU/内存百分比、在线率、到期时间。用于"我所有机器里哪台离线了""哪吒上那几台的情况"。没有配置时返回空列表。',
      parameters: {
        refresh: { type: 'boolean', description: '跳过 60 秒缓存，立即重新拉取' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderMonitors(value) },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return jsonSafe({ monitors: await service.listMonitors({ refresh: args.refresh === true, signal: exec.signal }) })
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_three_net',
      description:
        '从**服务器出网方向**测三网延迟：分别 ping 电信 / 联通 / 移动的测试 IP（各 3 次），返回平均延迟与丢包。用于回答"这台机器的三网线路怎么样"。需要服务器允许 ICMP。',
      parameters: {
        host: { type: 'string', required: true, description: 'vps_list 返回的主机 id' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: (value.rows || []).map((row) => `${row.label} ${row.avgMs == null ? '不可达' : `${row.avgMs}ms`} · 丢包 ${row.lossPct}%`).join('\n') }],
      },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        return jsonSafe(await service.threeNet(args.host, { signal: exec.signal }))
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_key_deploy',
      description:
        '为一台服务器生成 ed25519 密钥对（私钥存到 storages/vps/keys/），把公钥追加到远端 ~/.ssh/authorized_keys，并把清单切换到这把新密钥。用于新机器首次接入；前提是当前认证方式已经能登录。',
      parameters: {
        host: { type: 'string', required: true, description: 'vps_list 返回的主机 id' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: `已部署到 ${value.host}：${value.keyPath}\n${value.publicKey}` }],
      },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        return jsonSafe(await service.deployKey(args.host, { signal: exec.signal }))
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_upload',
      description: '把本地文件上传到服务器（SFTP）。localPath 必须在当前工作区内或用户目录下。',
      parameters: {
        host: { type: 'string', required: true, description: '主机 id' },
        localPath: { type: 'string', required: true, description: '本地文件绝对路径' },
        remotePath: { type: 'string', required: true, description: '远端目标路径（含文件名）' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderTransfer(value) },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        return service.upload(args.host, args.localPath, args.remotePath, { signal: exec.signal })
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_download',
      description: '从服务器下载文件到本地（SFTP）。localPath 必须是当前工作区内的绝对路径。',
      parameters: {
        host: { type: 'string', required: true, description: '主机 id' },
        remotePath: { type: 'string', required: true, description: '远端文件路径' },
        localPath: { type: 'string', required: true, description: '本地保存路径' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderTransfer(value) },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        return service.download(args.host, args.remotePath, args.localPath, { signal: exec.signal })
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_tunnel',
      description:
        '管理 SSH 端口转发：kind=local 把本地端口转到远端服务（例如把远端 5432 映射到本地 15432），kind=remote 把远端端口转回本地，kind=dynamic 开一个 SOCKS5 代理。action=open 建立，list 查看，close 关闭。默认只监听 127.0.0.1。',
      parameters: {
        action: { type: 'string', required: true, enum: ['open', 'list', 'close'], description: 'open | list | close' },
        host: { type: 'string', description: 'action=open 时的主机 id' },
        kind: { type: 'string', enum: ['local', 'remote', 'dynamic'], description: '隧道类型，默认 local' },
        localPort: { type: 'integer', description: '本地监听端口（local/dynamic）或本地目标端口（remote）' },
        remoteHost: { type: 'string', description: '远端目标地址（local）或远端监听地址（remote），默认 127.0.0.1' },
        remotePort: { type: 'integer', description: '远端目标端口（local）或远端监听端口（remote）' },
        tunnelId: { type: 'string', description: 'action=close 时的隧道 id' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => renderTunnel(value) },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        if (args.action === 'list') return { tunnels: service.listTunnels() }
        if (args.action === 'close') {
          if (!args.tunnelId) throw new Error('close 需要 tunnelId')
          return service.closeTunnel(args.tunnelId)
        }
        if (!args.host) throw new Error('open 需要 host')
        if (!args.localPort) throw new Error('open 需要 localPort')
        if ((args.kind || 'local') === 'local' && !args.remotePort) throw new Error('kind=local 需要 remotePort')
        if (args.kind === 'remote' && !args.remotePort) throw new Error('kind=remote 需要 remotePort')
        return service.openTunnel({ ...args, signal: exec.signal })
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_host_import',
      description: '把 ~/.ssh/config 里的主机导入清单（已存在的 id 跳过），返回新增的 id。第一次用这个插件时先跑一次。',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: `新增 ${value.added.length} 台：${value.added.join(', ') || '（无）'}；清单共 ${value.total} 台` }] },
      isConcurrencySafe: () => false,
      async execute() {
        return service.importConfig()
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_host_add',
      description:
        '在清单里新增或修改一台服务器。认证方式：authKind=key（私钥，默认）/ password（密码）/ agent（ssh-agent）。' +
        '密码与私钥口令的“值”永远不经过工具参数：这里只登记凭据 key 名（默认 DSH_VPS_<ID>_PASSWORD / _PASSPHRASE），' +
        '由用户在面板「添加主机」里填密码，或到 DSH 凭据管理器写入该 key。',
      parameters: {
        id: { type: 'string', required: true, description: '稳定主机 id，后续工具都用它' },
        host: { type: 'string', description: 'IP 或域名，默认同 id' },
        port: { type: 'integer', description: 'SSH 端口，默认 22' },
        user: { type: 'string', description: '登录用户，默认 root' },
        label: { type: 'string', description: '显示名' },
        authKind: { type: 'string', enum: ['key', 'password', 'agent'], description: '认证方式：key（私钥，默认）/ password（密码，值存 DSH 凭据）/ agent（ssh-agent）' },
        keyPath: { type: 'string', description: '认证方式为 key 时的私钥文件路径（默认 ~/.ssh/id_ed25519）' },
        passphraseRef: { type: 'string', description: '私钥口令的凭据 key 名（不是口令本身）' },
        passwordRef: { type: 'string', description: '认证方式为 password 时的凭据 key 名（不是密码本身）' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签' },
        readonly: { type: 'boolean', description: '标记为只读：变更类命令会被拒绝' },
        notes: { type: 'string', description: '备注' },
        expiresAt: { type: 'string', description: '到期日（YYYY-MM-DD），用于面板上的「剩余天数」' },
        price: { type: 'number', description: '续费价格（只做展示，不参与计费）' },
        priceUnit: { type: 'string', enum: ['month', 'year'], description: '价格周期：month 或 year' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: `已登记 ${value.id} → ${value.user}@${value.host}:${value.port}` }] },
      isConcurrencySafe: () => false,
      async execute(args) {
        const auth = {}
        if (args.authKind) auth.kind = args.authKind
        if (args.keyPath) auth.keyPath = args.keyPath
        if (args.passphraseRef) auth.passphraseRef = args.passphraseRef
        if (args.passwordRef) auth.passwordRef = args.passwordRef
        if (!Object.keys(auth).length) auth.kind = 'key'
        return jsonSafe(
          service.upsertHost({
            id: args.id,
            host: args.host,
            port: args.port,
            user: args.user,
            label: args.label,
            tags: args.tags,
            readonly: args.readonly,
            notes: args.notes,
            expiresAt: args.expiresAt,
            price: args.price,
            priceUnit: args.priceUnit,
            auth,
          }),
        )
      },
    }),
  )

  register(
    defineTool({
      name: 'vps_shell',
      description:
        '在远端服务器上维护持久 shell 会话：action=open 开一个（返回 sessionId），send 发一条命令并等提示符/静默后取回输出，read 读回滚，list 看已有会话，close 关闭。适合需要保留工作目录、环境变量或前台长任务（编译、tail -f、交互式命令）的场景；一次性命令用 vps_exec 更省 token。',
      parameters: {
        action: { type: 'string', required: true, enum: ['open', 'send', 'read', 'close', 'list'], description: 'open | send | read | close | list' },
        host: { type: 'string', description: 'action=open 时的主机 id' },
        sessionId: { type: 'string', description: 'action=send/read/close 时的会话 id' },
        text: { type: 'string', description: 'action=send 时写入的命令' },
        submit: { type: 'boolean', description: '是否补回车，默认 true' },
        offset: { type: 'integer', description: 'action=read 时从最新行往前跳过的行数' },
        count: { type: 'integer', description: 'action=read 时读取的行数，默认 200' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: renderShell(value) }] },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        if (args.action === 'list') return jsonSafe({ sessions: service.shellList() })
        if (args.action === 'open') {
          if (!args.host) throw new Error('open 需要 host')
          return jsonSafe(await service.shellOpen(args.host, { signal: exec.signal }))
        }
        if (!args.sessionId) throw new Error(`${args.action} 需要 sessionId`)
        if (args.action === 'send') {
          if (!args.text) throw new Error('send 需要 text')
          return jsonSafe(await service.shellSend(args.sessionId, args.text, { submit: args.submit, signal: exec.signal }))
        }
        if (args.action === 'read') return jsonSafe(service.shellRead(args.sessionId, { offset: args.offset, count: args.count }))
        return jsonSafe(service.shellClose(args.sessionId))
      },
    }),
  )

  return disposers
}

/**
 * Register the persistent-shell tool. Split out because it can only be created
 * once the terminal service exists (it may load after this plugin's `apply`).
 * @param {object} ctx - Context owning `tools`
 * @param {import('./service.js').VpsService} service
 * @param {object} terminals - `ctx.terminals`
 * @returns {() => void} disposer
 */
export function registerTerminalTool(ctx, service, terminals) {
  return ctx.tools.register(
    defineTool({
      name: 'vps_terminal_open',
      description:
        '在远端服务器上打开一个持久的交互式 SSH 会话，返回 sessionId。之后用 terminal_send 发命令并等输出、terminal_read 读回滚、terminal_close 关闭。适合需要保持工作目录/环境变量/前台长任务（编译、tail -f、debugger）的场景；一次性命令仍用 vps_exec 更省 token。',
      parameters: {
        host: { type: 'string', required: true, description: 'vps_list 返回的主机 id' },
        name: { type: 'string', description: '会话显示名，默认用主机 id' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: `sessionId=${value.sessionId} (${value.type})${value.motd ? `\n${String(value.motd).slice(0, 800)}` : ''}` }] },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const host = service.host(args.host)
        const session = await terminals.spawn(exec.agent, { type: `ssh:${host.id}`, name: args.name || host.id }, exec.signal)
        return { sessionId: session.sessionId, type: session.type, pid: session.pid, motd: session.motd }
      },
    }),
  )
}
