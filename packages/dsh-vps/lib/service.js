import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { auditPath, settingsPath, tunnelsPath, vpsDir } from './paths.js'
import { importSshConfig, loadInventory, normalizeHost, resolveHost, saveInventory, definedOnly } from './inventory.js'
import { loadSnippets, saveSnippets } from './snippets.js'
import { appendSample, appendThree, readLastSample, readSeries, readThree, sparkline, trimSeries, trimThree } from './metrics.js'
import { fetchMonitor } from './monitors.js'
import { loadGeo, lookupCountry, saveGeo } from './geo.js'
import * as ssh from './ssh.js'
import { SshTerminalSession } from './terminal.js'
import { PROBE_SCRIPT, parseProbe } from './probe.js'

const DEFAULTS = {
  maxOutputBytes: 65536,
  defaultTimeoutMs: 30000,
  maxTimeoutMs: 600000,
  tunnelAllowPublic: false,
  keepAliveMs: 600000,
  metricsIntervalMs: 30000,
  metricsTimeoutMs: 15000,
  alertThresholds: { memPct: 90, diskPct: 90, cpuPct: 200 },
  alertWebhook: undefined,
}

/** Owner of the inventory, the connection pool, tunnels, and audit trail. */
export class VpsService {
  constructor(ctx, config = {}) {
    this.ctx = ctx
    this.baseConfig = { ...DEFAULTS, ...config }
    this.config = { ...this.baseConfig, ...this.readSettings() }
    this.state = undefined
    this.tunnels = new Map()
    this.nextTunnelId = 1
    this.shells = new Map()
    this.nextShellId = 1
    this.alerts = new Map()
    this.alertNotified = new Map()
    this.failures = new Map()
    this.sampler = undefined
    this.sampling = false
    this.monitorCache = new Map()
    this.latest = new Map()
    this.three = new Map()
    this.threeRunning = false
    this.geo = loadGeo()
    this.trendCache = new Map()
    this.trafficDirty = false
    this.trafficFlushedAt = 0
    this.traffic = (() => {
      try {
        return JSON.parse(readFileSync(join(vpsDir(), 'traffic.json'), 'utf8')) || {}
      } catch {
        return {}
      }
    })()
  }

  /** Lazily loaded inventory; the first read imports `~/.ssh/config` when empty. */
  inventory() {
    if (!this.state) this.state = loadInventory()
    return this.state
  }

  /** All known hosts. */
  hosts() {
    return this.inventory().hosts
  }

  /** Resolve one host reference or throw an actionable error. */
  host(ref) {
    const found = resolveHost(this.hosts(), ref)
    if (found) return found
    const known = this.hosts().map((host) => host.id).join(', ') || '（库存为空）'
    throw new Error(`没有找到主机 "${ref}"。已知主机：${known}。先用 vps_list 查看，或用 vps_host_add 添加。`)
  }

  /** Persist the inventory and drop connections for removed hosts. */
  save() {
    saveInventory(this.inventory())
  }

  /** Whether a command looks mutating; used to fence read-only hosts. */
  static isMutating(command) {
    return /\b(rm|mv|cp|dd|mkfs\w*|shutdown|reboot|halt|poweroff|systemctl|service|kill|pkill|apt|apt-get|yum|dnf|apk|pacman|pip|npm|yarn|docker|podman|crontab|chmod|chown|sed\s+-i|truncate|mount|umount|iptables|nft|ufw|useradd|userdel|passwd)\b/.test(
      String(command),
    )
  }

  /** Reject mutating work on a read-only host. */
  assertWritable(host, command) {
    if (host.readonly && VpsService.isMutating(command)) {
      throw new Error(`主机 ${host.id} 被标记为只读，拒绝执行变更类命令。若确实需要，请先在主机清单里清除 readonly。`)
    }
  }

  /** Append one audit record; failures never break the operation. */
  audit(entry) {
    try {
      mkdirSync(dirname(auditPath()), { recursive: true })
      // Keep one rotated predecessor so the file cannot grow without bound.
      try {
        if (statSync(auditPath()).size > 2 * 1024 * 1024) renameSync(auditPath(), `${auditPath()}.1`)
      } catch {}
      appendFileSync(auditPath(), `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, 'utf8')
    } catch {}
  }

  /** Newest audit records, optionally narrowed to one host. */
  readAudit(options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit) || 200, 1000))
    const records = []
    for (const path of [auditPath(), `${auditPath()}.1`]) {
      let text = ''
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (!line) continue
        try {
          const row = JSON.parse(line)
          if (options.host && row.host !== options.host) continue
          records.push(row)
        } catch {}
      }
    }
    return records.slice(-limit).reverse()
  }

  /** Fail closed unless a local transfer path is inside the workspace or home. */
  assertLocalPath(localPath, action) {
    const target = resolve(String(localPath || ''))
    const roots = [resolve(this.config.workspaceRoot || process.cwd()), resolve(homedir())]
    const allowed = roots.some((root) => target === root || target.startsWith(`${root}${sep}`))
    if (!allowed) throw new Error(`${action}的本地路径必须在工作区或用户目录内：${target}`)
    return target
  }

  /** Generate an ed25519 keypair for one host and store it under storages/vps/keys. */
  generateKey(id) {
    const host = this.host(id)
    const pair = ssh.generateKeyPair()
    const directory = join(vpsDir(), 'keys')
    mkdirSync(directory, { recursive: true })
    const safe = host.id.replace(/[^A-Za-z0-9._-]/g, '_')
    const keyPath = join(directory, `${safe}_ed25519`)
    writeFileSync(keyPath, pair.privateKey, { mode: 0o600 })
    writeFileSync(`${keyPath}.pub`, `${pair.publicKey}\n`, 'utf8')
    this.audit({ host: host.id, action: 'key-generate', keyPath })
    return { host: host.id, keyPath, publicKey: pair.publicKey.trim() }
  }

  /**
   * Generate a key and append its public half to the host's authorized_keys,
   * then switch the inventory record to that key.
   */
  async deployKey(id, options = {}) {
    const key = this.generateKey(id)
    const { host, client } = await this.connect(id, options.signal)
    const pub = key.publicKey.replace(/'/g, `'\\''`)
    const command =
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && ` +
      `(grep -qxF '${pub}' ~/.ssh/authorized_keys 2>/dev/null || echo '${pub}' >> ~/.ssh/authorized_keys)`
    const result = await ssh.execOn(client, command, { timeoutMs: 15000, signal: options.signal })
    if (result.exitCode !== 0) {
      throw new Error(`部署公钥失败：${(result.stderr || `exit ${result.exitCode}`).slice(0, 300)}`)
    }
    host.auth = { kind: 'key', keyPath: key.keyPath }
    this.state = this.inventory()
    this.save()
    ssh.release(host.id)
    this.audit({ host: host.id, action: 'key-deploy', keyPath: key.keyPath })
    return { host: host.id, keyPath: key.keyPath, publicKey: key.publicKey, applied: true }
  }

  /** Settings written by the panel; they override the composition defaults. */
  readSettings() {
    try {
      return JSON.parse(readFileSync(settingsPath(), 'utf8')) || {}
    } catch {
      return {}
    }
  }

  /** Merge, persist and apply a settings patch (sampler restarts when its interval changes). */
  saveSettings(patch = {}) {
    const next = { ...this.readSettings(), ...definedOnly(patch) }
    mkdirSync(dirname(settingsPath()), { recursive: true })
    writeFileSync(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    this.config = { ...this.baseConfig, ...next }
    if (this.sampler) {
      clearInterval(this.sampler)
      this.sampler = undefined
      this.startMetrics()
    }
    return next
  }

  /** Inventory snapshot for backup or migration. */
  exportInventory() {
    return { version: 1, exportedAt: new Date().toISOString(), hosts: this.hosts() }
  }

  /** Merge another snapshot; existing ids are kept and malformed rows are skipped. */
  importInventory(payload) {
    const incoming = Array.isArray(payload) ? payload : Array.isArray(payload?.hosts) ? payload.hosts : []
    const inventory = this.inventory()
    const existing = new Set(inventory.hosts.map((host) => host.id))
    let added = 0
    for (const raw of incoming) {
      if (!raw || !raw.host) continue
      const normalized = normalizeHost(raw, inventory.hosts.length)
      if (!normalized || existing.has(normalized.id)) continue
      inventory.hosts.push(normalized)
      existing.add(normalized.id)
      added += 1
    }
    this.state = inventory
    this.save()
    return { added, total: inventory.hosts.length }
  }

  /** Reuse or open the SSH connection for a host reference (via its jump host). */
  async connect(ref, signal) {
    const host = this.host(ref)
    if (Array.isArray(host.jump) && host.jump.length) {
      const jumpHost = this.host(host.jump[0])
      const client = await ssh.acquireViaJump(jumpHost, host, signal)
      return { host, client }
    }
    const client = await ssh.acquire(host, { signal })
    return { host, client }
  }

  /** One-shot command execution with bounded output. */
  async exec(ref, command, options = {}) {
    const { host, client } = await this.connect(ref, options.signal)
    this.assertWritable(host, command)
    const timeoutMs = Math.min(Number(options.timeoutMs) || this.config.defaultTimeoutMs, this.config.maxTimeoutMs)
    const wrapped = options.cwd ? `cd ${JSON.stringify(options.cwd)} && ${command}` : command
    const command2 = options.sudo ? `sudo -n ${wrapped}` : wrapped
    const result = await ssh.execOn(client, command2, {
      timeoutMs,
      signal: options.signal,
      maxOutputBytes: Math.min(Number(options.maxOutputBytes) || this.config.maxOutputBytes, this.config.maxOutputBytes),
      env: options.env,
      stdin: options.stdin,
    })
    this.audit({ host: host.id, action: 'exec', command, exitCode: result.exitCode, timedOut: result.timedOut })
    return { host: host.id, command, ...result }
  }

  /** Structured host status from a single probe round-trip. */
  async status(ref, options = {}) {
    const { host, client } = await this.connect(ref, options.signal)
    const result = await ssh.execOn(client, PROBE_SCRIPT, {
      timeoutMs: Math.min(Number(options.timeoutMs) || 20000, this.config.maxTimeoutMs),
      signal: options.signal,
      maxOutputBytes: 65536,
    })
    const parsed = parseProbe(result.stdout, { exitCode: result.exitCode, durationMs: result.durationMs })
    return { host: host.id, label: host.label, ...parsed }
  }

  /** Host key used for a secret the record leaves unnamed. */
  credentialRefs(host) {
    const base = `DSH_VPS_${String(host.id).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    return {
      password: host.auth?.passwordRef || `${base}_PASSWORD`,
      passphrase: host.auth?.passphraseRef || `${base}_PASSPHRASE`,
    }
  }

  /** Resolve the Host's credential provider, or explain why secrets cannot be written. */
  credentials() {
    const credentials = this.ctx.get?.('credentials') ?? this.ctx.credentials
    if (!credentials || typeof credentials.set !== 'function') {
      throw new Error('当前 Host 没有凭据服务，无法保存密码。请到 DSH 凭据管理器里手动写入对应 key。')
    }
    return credentials
  }

  /**
   * Store one secret in the Host credential store. The inventory keeps only the
   * key name, so `inventory.json` stays free of secret values.
   */
  async setSecret(ref, value) {
    const name = String(ref || '').trim()
    if (!/^DSH_VPS_[A-Z0-9_]+$/.test(name)) {
      throw new Error(`凭据名必须以 DSH_VPS_ 开头（收到 ${name}）。插件只管理自己的凭据命名空间。`)
    }
    if (typeof value !== 'string' || !value) throw new Error('密码不能为空')
    await this.credentials().set(name, value)
    return { ref: name, configured: true }
  }

  /** Report whether secrets exist, without ever returning a value. */
  async secretStatus(refs) {
    const out = {}
    const credentials = this.ctx.get?.('credentials') ?? this.ctx.credentials
    for (const ref of (Array.isArray(refs) ? refs : []).slice(0, 4)) {
      const name = String(ref || '').trim()
      if (!name) continue
      try {
        const info = credentials && typeof credentials.describe === 'function' ? await credentials.describe(name) : undefined
        out[name] = { configured: Boolean(info?.configured), writable: Boolean(info?.writable), source: info?.source }
      } catch {
        out[name] = { configured: false, writable: false }
      }
    }
    return out
  }

  /** Start the background sampler; a zero interval disables collection. */
  startMetrics() {
    for (const host of this.hosts()) {
      const history = readThree(host.id)
      if (history.length) {
        this.three.set(host.id, { rows: history[history.length - 1].rows, at: history[history.length - 1].ts, history: history.slice(-288) })
      }
    }
    const interval = Number(this.config.metricsIntervalMs)
    if (!interval || interval <= 0 || this.sampler) return
    const every = Math.max(10000, interval)
    this.sampler = setInterval(() => {
      this.sampleAll().catch(() => {})
    }, every)
    this.sampler.unref?.()
    // Reclaim SSH connections nobody has used for `keepAliveMs`.
    this.sweeper = setInterval(() => {
      try {
        ssh.sweepIdle(Number(this.config.keepAliveMs) || 600000)
      } catch {}
    }, 60000)
    this.sweeper.unref?.()
    // Three-carrier probe runs on its own cadence; the landing page reads the cache.
    this.threeTimer = setInterval(() => {
      this.refreshThreeNet().catch(() => {})
    }, Math.max(60000, Number(this.config.threeNetIntervalMs) || 300000))
    this.threeTimer.unref?.()
    const firstThree = setTimeout(() => {
      this.refreshThreeNet().catch(() => {})
      this.refreshGeo().catch(() => {})
    }, 8000)
    firstThree.unref?.()
    // First pass shortly after mount so the panel has a point to draw quickly.
    const first = setTimeout(() => {
      this.sampleAll().catch(() => {})
    }, 2500)
    first.unref?.()
  }

  /** Sample every monitored host with two workers so a slow host cannot block. */
  async sampleAll() {
    if (this.sampling) return
    this.sampling = true
    try {
      const hosts = this.hosts().filter((host) => host.monitor !== false)
      let cursor = 0
      const worker = async () => {
        while (cursor < hosts.length) {
          const host = hosts[cursor]
          cursor += 1
          // Spread the pass so a fleet does not open every SSH connection at once.
          if (hosts.length > 1) await new Promise((resolve) => setTimeout(resolve, Math.random() * 2500))
          try {
            await this.sampleHost(host.id)
          } catch {}
        }
      }
      await Promise.all([worker(), worker()])
      for (const host of hosts) {
        try {
          trimSeries(host.id)
        } catch {}
      }
    } finally {
      this.sampling = false
    }
  }

  /** Highest disk usage across mounts, for one-line samples. */
  worstDisk(disks) {
    let worst
    for (const disk of disks || []) {
      if (typeof disk.usedPct === 'number' && (worst === undefined || disk.usedPct > worst)) worst = disk.usedPct
    }
    return worst
  }

  /** One sample for one host. Failures are recorded as `up: false`, never thrown. */
  async sampleHost(ref, options = {}) {
    const started = Date.now()
    const id = this.host(ref).id
    try {
      const status = await this.status(id, { timeoutMs: Number(options.timeoutMs) || this.config.metricsTimeoutMs })
      const cpu = status.cpu || {}
      const sample = {
        ts: started,
        up: true,
        cpu: cpu.cores && cpu.load1 != null ? Number(((cpu.load1 / cpu.cores) * 100).toFixed(1)) : undefined,
        load1: cpu.load1,
        cores: cpu.cores,
        mem: status.mem && status.mem.usedPct != null ? status.mem.usedPct : undefined,
        disk: this.worstDisk(status.disk),
        uptime: status.uptimeSeconds,
        rx: status.net ? status.net.rxBytes : undefined,
        tx: status.net ? status.net.txBytes : undefined,
      }
      appendSample(id, sample)
      this.recordTraffic(id, sample)
      this.latest.set(id, sample)
      this.evaluateAlerts(id, sample)
      return sample
    } catch (error) {
      const sample = { ts: started, up: false, error: ssh.messageOf(error) }
      appendSample(id, sample)
      this.recordTraffic(id, sample)
      this.latest.set(id, sample)
      this.evaluateAlerts(id, sample)
      return sample
    }
  }

  /** One row per host for the landing page; reads the sampler's latest value. */
  overview() {
    return this.hosts().map((host) => {
      const sample = this.latest.get(host.id) || readLastSample(host.id)
      const days = host.expiresAt ? Math.round((Date.parse(host.expiresAt) - Date.now()) / 86400000) : undefined
      return {
        id: host.id,
        label: host.label,
        host: host.host,
        country: this.geo[host.host],
        port: host.port,
        user: host.user,
        tags: host.tags,
        readonly: host.readonly,
        expiresInDays: Number.isFinite(days) ? days : undefined,
        up: sample ? sample.up : undefined,
        cpu: sample ? sample.cpu : undefined,
        mem: sample ? sample.mem : undefined,
        disk: sample ? sample.disk : undefined,
        uptime: sample ? sample.uptime : undefined,
        rx: sample ? sample.rx : undefined,
        tx: sample ? sample.tx : undefined,
        trend: this.trendOf(host.id),
        three: this.three.get(host.id) ? this.three.get(host.id).rows : [],
        threeHistory: this.three.get(host.id) && this.three.get(host.id).history ? this.three.get(host.id).history.slice(-24) : [],
        traffic: this.traffic[host.id]
          ? {
              rx: this.traffic[host.id].rx,
              tx: this.traffic[host.id].tx,
              total: this.traffic[host.id].rx + this.traffic[host.id].tx,
              since: this.traffic[host.id].since,
            }
          : undefined,
        ts: sample ? sample.ts : undefined,
        alerts: [...this.alerts.values()].filter((alert) => alert.host === host.id).length,
      }
    })
  }

  /** Raise or clear threshold alerts from one sample. */
  evaluateAlerts(id, sample) {
    const thresholds = { ...DEFAULTS.alertThresholds, ...(this.config.alertThresholds || {}) }
    const raise = (kind, message, level, value) => {
      const key = `${id}:${kind}`
      const existing = this.alerts.get(key)
      if (existing) {
        existing.message = message
        existing.level = level
        existing.value = value
        existing.at = Date.now()
        return
      }
      const alert = { host: id, kind, level, message, value, since: Date.now(), at: Date.now() }
      this.alerts.set(key, alert)
      // Notify at most once per 10 minutes per (host, kind) so a flapping
      // threshold does not spam the webhook.
      const last = this.alertNotified.get(key) || 0
      if (Date.now() - last > 10 * 60 * 1000) {
        this.alertNotified.set(key, Date.now())
        this.notifyAlert(alert)
      }
    }
    const clear = (kind) => {
      this.alerts.delete(`${id}:${kind}`)
    }

    if (!sample.up) {
      const misses = (this.failures.get(id) || 0) + 1
      this.failures.set(id, misses)
      if (misses >= 2) raise('down', `连续 ${misses} 次采样不可达`, 'error', misses)
      return
    }
    this.failures.delete(id)
    clear('down')
    if (sample.mem != null && sample.mem >= thresholds.memPct) raise('mem', `内存 ${sample.mem}% ≥ ${thresholds.memPct}%`, 'warn', sample.mem)
    else clear('mem')
    if (sample.disk != null && sample.disk >= thresholds.diskPct) raise('disk', `磁盘 ${sample.disk}% ≥ ${thresholds.diskPct}%`, 'warn', sample.disk)
    else clear('disk')
    if (sample.cpu != null && sample.cpu >= thresholds.cpuPct) raise('cpu', `负载 ${sample.cpu}% ≥ ${thresholds.cpuPct}%`, 'warn', sample.cpu)
    else clear('cpu')
  }

  /** Deliver one new alert to the audit log and the optional webhook. */
  notifyAlert(alert) {
    this.audit({ host: alert.host, action: 'alert', kind: alert.kind, level: alert.level, message: alert.message })
    const url = this.config.alertWebhook
    if (!url) return
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'dsh-vps', text: `[${alert.host}] ${alert.message}`, ...alert }),
      }).catch(() => {})
    } catch {}
  }

  /** Active alerts, newest first. */
  listAlerts() {
    return [...this.alerts.values()].sort((left, right) => right.at - left.at)
  }

  /** One host's series plus sparklines for tool output. */
  history(ref, options = {}) {
    const id = this.host(ref).id
    const minutes = Math.max(1, Number(options.minutes) || 60)
    const series = readSeries(id, { minutes })
    const values = (key) => series.map((row) => row[key])
    const stats = (key) => {
      const nums = values(key).filter((value) => typeof value === 'number' && Number.isFinite(value))
      if (!nums.length) return undefined
      return {
        min: Math.min(...nums),
        max: Math.max(...nums),
        avg: Number((nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(1)),
      }
    }
    return {
      host: id,
      minutes,
      samples: series.length,
      offline: series.filter((row) => row.up === false).length,
      series,
      summary: { cpu: stats('cpu'), mem: stats('mem'), disk: stats('disk') },
      sparklines: { cpu: sparkline(values('cpu')), mem: sparkline(values('mem')), disk: sparkline(values('disk')) },
    }
  }

  /** Resolve one credential reference (monitor tokens use the same store). */
  async resolveSecret(ref) {
    const credentials = this.ctx.get?.('credentials') ?? this.ctx.credentials
    if (!credentials) return process.env[ref]
    try {
      const hit = await credentials.resolve(ref)
      return hit && hit.value
    } catch {
      return process.env[ref]
    }
  }

  /** Configured monitor sources (raw, including tokenRef names). */
  monitorsConfig() {
    return Array.isArray(this.config.monitors) ? this.config.monitors : []
  }

  /** Replace the monitor list and persist it into settings.json. */
  saveMonitors(sources) {
    const list = (Array.isArray(sources) ? sources : [])
      .filter((source) => source && source.baseUrl)
      .slice(0, 8)
      .map((source) => ({
        name: String(source.name || source.baseUrl),
        kind: source.kind === 'nezha' ? 'nezha' : 'komari',
        baseUrl: String(source.baseUrl).replace(/\/+$/, ''),
        ...(source.tokenRef ? { tokenRef: String(source.tokenRef) } : {}),
      }))
    this.saveSettings({ monitors: list })
    this.monitorCache.clear()
    return list
  }

  /** External monitoring sources, cached for a minute. */
  async listMonitors(options = {}) {
    const sources = Array.isArray(this.config.monitors) ? this.config.monitors.slice(0, 8) : []
    if (!sources.length) return []
    const out = []
    for (const source of sources) {
      const key = String(source.name || source.baseUrl)
      const cached = this.monitorCache.get(key)
      if (!options.refresh && cached && Date.now() - cached.at < 60000) {
        out.push(cached.value)
        continue
      }
      try {
        const token = source.tokenRef ? await this.resolveSecret(source.tokenRef) : undefined
        const value = await fetchMonitor(source, token, options.signal)
        this.monitorCache.set(key, { at: Date.now(), value })
        out.push(value)
      } catch (error) {
        out.push({
          name: key,
          kind: source.kind === 'nezha' ? 'nezha' : 'komari',
          baseUrl: source.baseUrl,
          ok: false,
          error: ssh.messageOf(error),
          nodes: [],
        })
      }
    }
    return out
  }

  /** Fill missing country codes for host flags (best effort, cached). */
  async refreshGeo() {
    let changed = false
    for (const host of this.hosts()) {
      if (this.geo[host.host]) continue
      const code = await lookupCountry(host.host)
      if (code) {
        this.geo[host.host] = code
        changed = true
      }
    }
    if (changed) saveGeo(this.geo)
  }

  /** Fold the latest counters into the persisted cumulative total. */
  recordTraffic(hostId, sample) {
    if (!sample.up) return
    const rx = Number(sample.rx)
    const tx = Number(sample.tx)
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) return
    const previous = this.traffic[hostId]
    if (previous && typeof previous.lastRx === 'number') {
      this.traffic[hostId] = {
        rx: previous.rx + Math.max(0, rx - previous.lastRx),
        tx: previous.tx + Math.max(0, tx - previous.lastTx),
        lastRx: rx,
        lastTx: tx,
        since: previous.since,
      }
    } else {
      this.traffic[hostId] = { rx: 0, tx: 0, lastRx: rx, lastTx: tx, since: Date.now() }
    }
    this.trafficDirty = true
    if (Date.now() - this.trafficFlushedAt >= 300000) this.flushTraffic()
  }

  /** Persist accumulated traffic at most every five minutes (and on dispose). */
  flushTraffic() {
    if (!this.trafficDirty) return
    try {
      mkdirSync(vpsDir(), { recursive: true })
      writeFileSync(join(vpsDir(), 'traffic.json'), `${JSON.stringify(this.traffic, null, 2)}\n`, 'utf8')
      this.trafficDirty = false
      this.trafficFlushedAt = Date.now()
    } catch {}
  }

  /** 24h CPU trend, cached for a minute so a 15s poll does not re-read files. */
  trendOf(hostId) {
    const now = Date.now()
    const cached = this.trendCache.get(hostId)
    if (cached && now - cached.at < 60000) return cached.value
    let value = []
    try {
      const series = readSeries(hostId, { minutes: 1440, limit: 144 })
      const step = Math.max(1, Math.floor(series.length / 24))
      value = series
        .filter((_row, index) => index % step === 0)
        .slice(-24)
        .map((row) => row.cpu)
        .filter((item) => typeof item === 'number')
    } catch {}
    this.trendCache.set(hostId, { at: now, value })
    return value
  }

  /** Background three-net pass; results are cached per host. */
  async refreshThreeNet() {
    if (this.threeRunning) return
    this.threeRunning = true
    this.refreshGeo().catch(() => {})
    try {
      const hosts = this.hosts()
      let cursor = 0
      const worker = async () => {
        while (cursor < hosts.length) {
          const host = hosts[cursor]
          cursor += 1
          try {
            const result = await this.threeNet(host.id)
            const entry = { ts: Date.now(), rows: result.rows }
            appendThree(host.id, entry)
            trimThree(host.id)
            const previous = this.three.get(host.id)
            const history = [...((previous && previous.history) || []), entry].slice(-288)
            this.three.set(host.id, { rows: result.rows, at: entry.ts, history })
          } catch {}
        }
      }
      await Promise.all([worker(), worker()])
    } finally {
      this.threeRunning = false
    }
  }

  /** Per-carrier latency thresholds (ms) for colouring; overridable in settings. */
  threeThresholds() {
    const defaults = { tele: { good: 120, warn: 220 }, unicom: { good: 80, warn: 180 }, mobile: { good: 80, warn: 180 } }
    const configured = (this.config.threeNet && this.config.threeNet.thresholds) || {}
    const out = {}
    for (const carrier of ['tele', 'unicom', 'mobile']) {
      out[carrier] = { ...defaults[carrier], ...(configured[carrier] || {}) }
    }
    return out
  }

  /** Three-carrier rows for every host (two at a time). */
  async threeNetAll(options = {}) {
    const hosts = this.hosts()
    const results = {}
    let cursor = 0
    const worker = async () => {
      while (cursor < hosts.length) {
        const host = hosts[cursor]
        cursor += 1
        try {
          results[host.id] = (await this.threeNet(host.id, options)).rows
        } catch {
          results[host.id] = []
        }
      }
    }
    await Promise.all([worker(), worker()])
    return results
  }

  /** Enabled carriers and their targets from settings (`threeNet.carriers`). */
  threeNetTargets() {
    const defaults = { tele: '219.141.140.10', unicom: '210.22.97.1', mobile: '221.179.155.161' }
    const configured = (this.config.threeNet && this.config.threeNet.carriers) || {}
    // Targets end up inside a remote shell command: only address-shaped values pass.
    const safe = (value, fallback) => (/^[A-Za-z0-9_.:-]{1,63}$/.test(String(value || '')) ? String(value) : fallback)
    return Object.entries(defaults)
      .map(([carrier, fallback]) => ({
        carrier,
        ip: safe(configured[carrier] && configured[carrier].target, fallback),
        enabled: !(configured[carrier] && configured[carrier].enabled === false),
      }))
      .filter((row) => row.enabled)
  }

  /** Server-side three-carrier latency: ping one test IP per carrier from the host. */
  async threeNet(ref, options = {}) {
    const targets = this.threeNetTargets()
    if (!targets.length) return { host: String(ref), rows: [], disabled: true }
    const script = targets
      .map(({ carrier, ip }) => `echo "@@${carrier}"; ping -c 3 -W 2 '${ip}' 2>&1 || true`)
      .join('; ')
    const result = await this.exec(ref, script, { timeoutMs: 20000, signal: options.signal })
    const sections = {}
    let current
    for (const line of String(result.stdout || '').split(/\r?\n/)) {
      const marker = /^@@([a-z]+)$/.exec(line.trim())
      if (marker) {
        current = marker[1]
        sections[current] = []
        continue
      }
      if (current) sections[current].push(line)
    }
    const rows = targets.map(({ carrier, ip }) => {
      const text = (sections[carrier] || []).join('\n')
      const rtt = /(?:rtt|round-trip)[^=]*=\s*[\d.]+\/([\d.]+)\//.exec(text)
      const loss = /(\d+(?:\.\d+)?)%\s*packet loss/.exec(text)
      const label = carrier === 'tele' ? '电信' : carrier === 'unicom' ? '联通' : '移动'
      if (!rtt) {
        return { carrier, label, ip, avgMs: null, lossPct: loss ? Number(loss[1]) : 100, error: text.split('\n')[0] || '无输出' }
      }
      return { carrier, label, ip, avgMs: Number(rtt[1]), lossPct: loss ? Number(loss[1]) : 0 }
    })
    return { host: result.host, rows, exitCode: result.exitCode }
  }

  /** Batch TCP probe for the landing page: latency + loss per host, no auth. */
  async probeHosts(refs, options = {}) {
    const hosts = Array.isArray(refs) && refs.length ? refs.map((ref) => this.host(ref)) : this.hosts()
    const results = {}
    let cursor = 0
    const worker = async () => {
      while (cursor < hosts.length) {
        const host = hosts[cursor]
        cursor += 1
        try {
          results[host.id] = await ssh.measureLatency(host, { attempts: 3, timeoutMs: 1500, signal: options.signal })
        } catch (error) {
          results[host.id] = { error: ssh.messageOf(error), avgMs: null, lossPct: 100 }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, hosts.length) }, worker))
    return results
  }

  /** Raw TCP reachability: connect-latency samples and packet loss. */
  async latency(ref, options = {}) {
    const host = this.host(ref)
    const result = await ssh.measureLatency(host, options)
    return { host: host.id, ...result }
  }

  /**
   * End-to-end connection test: TCP handshake, authentication, then one echo.
   * Returns the failure reason instead of throwing so the panel can show it.
   */
  async test(ref, options = {}) {
    const started = Date.now()
    try {
      const { host, client } = await this.connect(ref, options.signal)
      const result = await ssh.execOn(client, 'echo dsh-vps-ok', { timeoutMs: 8000, signal: options.signal })
      return {
        host: host.id,
        ok: result.exitCode === 0 && result.stdout.includes('dsh-vps-ok'),
        latencyMs: Date.now() - started,
        authKind: host.auth?.kind || 'key',
        fingerprint: host.hostKey?.fingerprint,
        error: result.exitCode === 0 ? undefined : `远端返回退出码 ${result.exitCode}: ${(result.stderr || '').slice(0, 300)}`,
      }
    } catch (error) {
      return { host: String(ref), ok: false, latencyMs: Date.now() - started, error: ssh.messageOf(error) }
    }
  }

  /**
   * Forget a pinned host key so the next connection trusts the current key
   * again. Only a person can trigger this (the panel asks first).
   */
  forgetFingerprint(id) {
    const host = this.host(id)
    const previous = host.hostKey?.fingerprint
    delete host.hostKey
    this.state = this.inventory()
    this.save()
    ssh.release(host.id)
    this.audit({ host: host.id, action: 'forget-host-key', previous })
    return { host: host.id, previous, cleared: true }
  }

  /**
   * Run one command on several hosts with bounded concurrency. A failure on one
   * host never rejects the batch; it becomes that row's `error`.
   */
  async batch(refs, command, options = {}) {
    const list = [...new Set((refs || []).map((ref) => String(ref).trim()).filter(Boolean))]
    if (!list.length) throw new Error('批量执行至少需要一台主机')
    if (!String(command || '').trim()) throw new Error('命令不能为空')
    const limit = Math.max(1, Math.min(Number(options.concurrency) || 4, 8))
    const results = new Array(list.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < list.length) {
        const index = cursor
        cursor += 1
        const ref = list[index]
        const started = Date.now()
        try {
          const result = await this.exec(ref, command, { timeoutMs: options.timeoutMs, signal: options.signal })
          results[index] = {
            host: result.host,
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            truncated: result.truncated,
            timedOut: result.timedOut,
            durationMs: Date.now() - started,
          }
        } catch (error) {
          results[index] = { host: ref, ok: false, error: ssh.messageOf(error), durationMs: Date.now() - started }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
    this.audit({ action: 'batch', hosts: list, command, ok: results.filter((row) => row.ok).length, total: list.length })
    return { command, concurrency: limit, results }
  }

  /** Every saved snippet. */
  snippets() {
    return loadSnippets().snippets
  }

  /** Create or replace one snippet. */
  saveSnippet(patch = {}) {
    const command = String(patch.command || '').trim()
    if (!command) throw new Error('片段命令不能为空')
    const name = String(patch.name || command.split('\n')[0]).trim().slice(0, 100) || command.slice(0, 60)
    const id =
      String(patch.id || name)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || `snippet-${Date.now().toString(36)}`
    const state = loadSnippets()
    const record = { id, name, command, tags: Array.isArray(patch.tags) ? patch.tags.map(String) : [] }
    const index = state.snippets.findIndex((snippet) => snippet.id === id)
    if (index >= 0) state.snippets[index] = record
    else state.snippets.push(record)
    saveSnippets(state)
    return record
  }

  /** Remove one snippet. */
  removeSnippet(id) {
    const state = loadSnippets()
    const index = state.snippets.findIndex((snippet) => snippet.id === id)
    if (index < 0) throw new Error(`没有片段 ${id}`)
    const [removed] = state.snippets.splice(index, 1)
    saveSnippets(state)
    return { removed: removed.id }
  }

  /** Rename or move one remote path. */
  async renameFile(ref, from, to, options = {}) {
    const { host, client } = await this.connect(ref, options.signal)
    this.assertWritable(host, `rename ${from}`)
    const sftp = await ssh.openSftp(client)
    const result = await ssh.renamePath(sftp, from, to)
    this.audit({ host: host.id, action: 'rename', from, to })
    return { host: host.id, ...result }
  }

  /** Delete one file or empty directory. */
  async removeFile(ref, target, options = {}) {
    const { host, client } = await this.connect(ref, options.signal)
    this.assertWritable(host, `remove ${target}`)
    const sftp = await ssh.openSftp(client)
    const result = await ssh.removePath(sftp, target)
    this.audit({ host: host.id, action: 'remove', target, directory: result.directory })
    return { host: host.id, ...result }
  }

  /** Change permission bits (octal string or number). */
  async chmodFile(ref, target, mode, options = {}) {
    const { host, client } = await this.connect(ref, options.signal)
    this.assertWritable(host, `chmod ${target}`)
    const sftp = await ssh.openSftp(client)
    const result = await ssh.chmodPath(sftp, target, mode)
    this.audit({ host: host.id, action: 'chmod', target, mode })
    return { host: host.id, ...result }
  }

  /** Fixed read-only probes for the "system" tab. */
  async inspect(ref, what, options = {}) {
    const commands = {
      services: 'systemctl list-units --type=service --state=failed,running --no-legend --no-pager 2>/dev/null | head -n 40',
      docker: "docker ps -a --format '{{.Names}} | {{.Status}} | {{.Image}}' 2>/dev/null | head -n 40",
      ports: '(ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null) | head -n 40',
      inode: 'df -i -P 2>/dev/null | head -n 20',
    }
    const command = commands[what]
    if (!command) throw new Error(`未知的检查项 ${what}（可选 services/docker/ports/inode）`)
    const result = await this.exec(ref, command, { timeoutMs: 15000, signal: options.signal })
    return { host: result.host, what, exitCode: result.exitCode, text: result.stdout || result.stderr || '（无输出）' }
  }

  /** Persist the open tunnel definitions (handles are runtime-only). */
  persistTunnels() {
    try {
      const definitions = [...this.tunnels.values()].map(({ tunnelId, host, kind, localHost, localPort, remoteHost, remotePort, listen, target }) => ({
        tunnelId,
        host,
        kind,
        localHost,
        localPort,
        remoteHost,
        remotePort,
        listen,
        target,
      }))
      mkdirSync(dirname(tunnelsPath()), { recursive: true })
      writeFileSync(tunnelsPath(), `${JSON.stringify({ version: 1, tunnels: definitions }, null, 2)}\n`, 'utf8')
    } catch {}
  }

  /** Definitions saved by the last run. */
  savedTunnels() {
    try {
      const parsed = JSON.parse(readFileSync(tunnelsPath(), 'utf8'))
      return Array.isArray(parsed.tunnels) ? parsed.tunnels : []
    } catch {
      return []
    }
  }

  /** Re-open every saved tunnel; per-definition failures are reported, not thrown. */
  async restoreTunnels(options = {}) {
    const saved = this.savedTunnels()
    const results = []
    for (const definition of saved) {
      try {
        const tunnel = await this.openTunnel({ ...definition, signal: options.signal })
        results.push({ ...tunnel, ok: true })
      } catch (error) {
        results.push({ host: definition.host, listen: definition.listen, ok: false, error: ssh.messageOf(error) })
      }
    }
    return { attempted: saved.length, results }
  }

  /** Upload a file. */
  async upload(ref, localPath, remotePath, options = {}) {
    const local = this.assertLocalPath(localPath, '上传')
    const { host, client } = await this.connect(ref, options.signal)
    this.assertWritable(host, `upload ${remotePath}`)
    const sftp = await ssh.openSftp(client)
    const started = Date.now()
    await ssh.uploadFile(sftp, local, remotePath)
    this.audit({ host: host.id, action: 'upload', localPath: local, remotePath })
    return { host: host.id, localPath: local, remotePath, durationMs: Date.now() - started }
  }

  /** Download a file. */
  async download(ref, remotePath, localPath, options = {}) {
    const local = this.assertLocalPath(localPath, '下载')
    const { host, client } = await this.connect(ref, options.signal)
    const sftp = await ssh.openSftp(client)
    const started = Date.now()
    await ssh.downloadFile(sftp, remotePath, local)
    this.audit({ host: host.id, action: 'download', remotePath, localPath: local })
    return { host: host.id, remotePath, localPath: local, durationMs: Date.now() - started }
  }

  /** List a remote directory. */
  async listDir(ref, remotePath, options = {}) {
    const { client } = await this.connect(ref, options.signal)
    const sftp = await ssh.openSftp(client)
    return ssh.listDir(sftp, remotePath)
  }

  /** Read a remote text file. */
  async readFile(ref, remotePath, options = {}) {
    const { client } = await this.connect(ref, options.signal)
    const sftp = await ssh.openSftp(client)
    return ssh.readRemoteFile(sftp, remotePath, Number(options.maxBytes) || this.config.maxOutputBytes)
  }

  /** Write a remote text file. */
  async writeFile(ref, remotePath, text, options = {}) {
    const { host, client } = await this.connect(ref, options.signal)
    this.assertWritable(host, `write ${remotePath}`)
    const sftp = await ssh.openSftp(client)
    const result = await ssh.writeRemoteFile(sftp, remotePath, text)
    this.audit({ host: host.id, action: 'write', remotePath })
    return { host: host.id, remotePath, ...result }
  }

  /** Open a port-forward tunnel and remember it. */
  async openTunnel(options) {
    const { host, client } = await this.connect(options.host, options.signal)
    const kind = options.kind || 'local'
    const localHost = options.localHost || '127.0.0.1'
    if (!this.config.tunnelAllowPublic && localHost !== '127.0.0.1' && localHost !== 'localhost') {
      throw new Error(`只允许监听 127.0.0.1（收到 ${localHost}）。要对外开放请先在插件配置里打开 tunnelAllowPublic。`)
    }
    const tunnelId = `tn${this.nextTunnelId++}`
    let handle
    let listen
    if (kind === 'remote') {
      handle = await ssh.startRemoteForward(client, {
        remoteHost: options.remoteHost || '127.0.0.1',
        remotePort: options.remotePort,
        localHost,
        localPort: options.localPort,
      })
      listen = `${options.remoteHost || '127.0.0.1'}:${options.remotePort}`
    } else if (kind === 'dynamic') {
      handle = await ssh.startLocalForward(client, { kind: 'dynamic', localHost, localPort: options.localPort })
      listen = `socks5://${localHost}:${options.localPort}`
    } else {
      handle = await ssh.startLocalForward(client, {
        kind: 'local',
        localHost,
        localPort: options.localPort,
        remoteHost: options.remoteHost || '127.0.0.1',
        remotePort: options.remotePort,
      })
      listen = `${localHost}:${options.localPort}`
    }
    const record = {
      tunnelId,
      host: host.id,
      kind,
      localHost,
      localPort: options.localPort,
      remoteHost: options.remoteHost || '127.0.0.1',
      remotePort: options.remotePort,
      listen,
      target: kind === 'remote' ? `${localHost}:${options.localPort}` : kind === 'dynamic' ? 'SOCKS5' : `${options.remoteHost || '127.0.0.1'}:${options.remotePort}`,
      state: 'open',
      since: new Date().toISOString(),
      handle,
    }
    this.tunnels.set(tunnelId, record)
    this.persistTunnels()
    this.audit({ host: host.id, action: 'tunnel-open', tunnelId, kind, listen, target: record.target })
    return { tunnelId, host: host.id, kind, listen, target: record.target, state: record.state }
  }

  /** Snapshot every tunnel, without handles. */
  listTunnels() {
    return [...this.tunnels.values()].map(({ handle, ...rest }) => rest)
  }

  /** Close one tunnel. */
  closeTunnel(tunnelId) {
    const record = this.tunnels.get(tunnelId)
    if (!record) throw new Error(`没有隧道 ${tunnelId}`)
    this.tunnels.delete(tunnelId)
    this.persistTunnels()
    try {
      if (typeof record.handle?.close === 'function') record.handle.close()
      else if (typeof record.handle?.stop === 'function') record.handle.stop()
    } catch {}
    this.audit({ host: record.host, action: 'tunnel-close', tunnelId })
    return { tunnelId, state: 'closed' }
  }

  /** Add or replace one host record. */
  upsertHost(patch) {
    const inventory = this.inventory()
    const id = String(patch.id || patch.host || '').trim()
    if (!id) throw new Error('新增主机需要 id 或 host')
    const existing = inventory.hosts.find((host) => host.id === id)
    if (existing) {
      Object.assign(existing, {
        label: patch.label ?? existing.label,
        host: patch.host ?? existing.host,
        port: patch.port ?? existing.port,
        user: patch.user ?? existing.user,
        readonly: patch.readonly ?? existing.readonly,
        notes: patch.notes ?? existing.notes,
        tags: patch.tags ?? existing.tags,
        expiresAt: patch.expiresAt === undefined ? existing.expiresAt : patch.expiresAt || undefined,
        price:
          patch.price === undefined
            ? existing.price
            : patch.price === '' || patch.price == null || !Number.isFinite(Number(patch.price))
              ? undefined
              : Number(patch.price),
        priceUnit: patch.priceUnit === undefined ? existing.priceUnit : patch.priceUnit,
        auth: { ...existing.auth, ...definedOnly(patch.auth) },
        jump: patch.jump ?? existing.jump,
      })
    } else {
      const authPatch = definedOnly(patch.auth)
      const authKind = authPatch.kind || (authPatch.passwordRef && !authPatch.keyPath ? 'password' : 'key')
      inventory.hosts.push({
        id,
        label: patch.label || id,
        host: patch.host || id,
        port: Number(patch.port) || 22,
        user: patch.user || 'root',
        auth: { kind: authKind, ...authPatch },
        jump: patch.jump || [],
        tags: patch.tags || [],
        readonly: patch.readonly === true,
        expiresAt: patch.expiresAt || undefined,
        price: Number.isFinite(Number(patch.price)) && patch.price !== '' && patch.price != null ? Number(patch.price) : undefined,
        priceUnit: patch.priceUnit === 'month' || patch.priceUnit === 'year' ? patch.priceUnit : undefined,
        notes: patch.notes,
        source: 'manual',
      })
    }
    this.state = inventory
    this.save()
    return this.host(id)
  }

  /** Remove one host and its cached connection. */
  removeHost(id) {
    const inventory = this.inventory()
    const index = inventory.hosts.findIndex((host) => host.id === id)
    if (index < 0) throw new Error(`没有主机 ${id}`)
    inventory.hosts.splice(index, 1)
    this.state = inventory
    this.save()
    ssh.release(id)
    return { removed: id }
  }

  /** Import `~/.ssh/config` into the inventory, skipping ids that already exist. */
  importConfig() {
    const inventory = this.inventory()
    const existing = new Set(inventory.hosts.map((host) => host.id))
    const added = importSshConfig().filter((host) => !existing.has(host.id))
    inventory.hosts.push(...added)
    this.state = inventory
    this.save()
    return { added: added.map((host) => host.id), total: inventory.hosts.length }
  }

  /** Open one persistent interactive shell and remember it by short id. */
  async shellOpen(ref, options = {}) {
    if (this.shells.size >= 8) throw new Error('已打开 8 个持久会话，请先 vps_shell close 掉不用的会话')
    const { host, client } = await this.connect(ref, options.signal)
    const channel = await new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols: options.cols || 120, rows: options.rows || 32 }, (error, stream) => {
        if (error) reject(new Error(`打开 SSH 会话失败：${ssh.messageOf(error)}`))
        else resolve(stream)
      })
    })
    const session = new SshTerminalSession(client, channel, {})
    const motd = await session.awaitReady()
    const sessionId = `sh${this.nextShellId++}`
    this.shells.set(sessionId, { sessionId, hostId: host.id, session, openedAt: Date.now() })
    this.audit({ host: host.id, action: 'shell-open', sessionId })
    return { sessionId, host: host.id, motd }
  }

  /** Resolve one persistent shell or throw an actionable error. */
  shell(sessionId) {
    const entry = this.shells.get(sessionId)
    if (!entry) {
      const open = [...this.shells.keys()].join(', ') || '（没有打开的会话）'
      throw new Error(`没有会话 ${sessionId}。当前会话：${open}`)
    }
    return entry
  }

  /** Send one command line into a persistent shell and wait for readiness. */
  async shellSend(sessionId, text, options = {}) {
    const entry = this.shell(sessionId)
    const operation = entry.session.startSend({ text, submit: options.submit !== false, signal: options.signal })
    const result = await operation.done
    this.audit({ host: entry.hostId, action: 'shell-send', sessionId, command: text })
    return { sessionId, output: result.viewport, waitReason: result.waitReason, status: result.sessionStatus, truncated: result.truncated }
  }

  /** Read a bounded page of the persistent shell's scrollback. */
  shellRead(sessionId, options = {}) {
    const entry = this.shell(sessionId)
    return { sessionId, ...entry.session.read({ offset: options.offset ?? 0, count: options.count ?? 200 }) }
  }

  /** Close one persistent shell. */
  shellClose(sessionId) {
    const entry = this.shell(sessionId)
    this.shells.delete(sessionId)
    Promise.resolve(entry.session.close(`closed by ${sessionId}`)).catch(() => {})
    this.audit({ host: entry.hostId, action: 'shell-close', sessionId })
    return { sessionId, state: 'closed' }
  }

  /** List persistent shells owned by this plugin instance. */
  shellList() {
    return [...this.shells.values()].map((entry) => ({ sessionId: entry.sessionId, host: entry.hostId, status: entry.session.status(), idleMs: Date.now() - entry.openedAt }))
  }

  /** Record a newly pinned host key fingerprint. */
  pinFingerprint(id, fingerprint) {
    const inventory = this.inventory()
    const host = inventory.hosts.find((entry) => entry.id === id)
    if (!host || host.hostKey?.fingerprint === fingerprint) return
    host.hostKey = { fingerprint, pinnedAt: new Date().toISOString() }
    this.state = inventory
    this.save()
  }

  /** Close tunnels and connections at disposal. */
  dispose() {
    this.flushTraffic()
    if (this.sampler) {
      clearInterval(this.sampler)
      this.sampler = undefined
    }
    if (this.sweeper) {
      clearInterval(this.sweeper)
      this.sweeper = undefined
    }
    if (this.threeTimer) {
      clearInterval(this.threeTimer)
      this.threeTimer = undefined
    }
    for (const sessionId of [...this.shells.keys()]) {
      try {
        this.shellClose(sessionId)
      } catch {}
    }
    for (const tunnelId of [...this.tunnels.keys()]) {
      try {
        this.closeTunnel(tunnelId)
      } catch {}
    }
    ssh.releaseAll()
  }
}
