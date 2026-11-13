/**
 * One round-trip host probe. The script prints a section per fact using a
 * marker line, so a single exec call fills the whole status object even on
 * minimal images (busybox/Alpine included): no awk/sed/systemd assumption is
 * fatal, each missing section simply degrades to a warning.
 */
const PROBE_SCRIPT = [
  'echo "@@OS"',
  'cat /etc/os-release 2>/dev/null || cat /etc/issue 2>/dev/null',
  'echo "@@UNAME"',
  'uname -srm 2>/dev/null',
  'echo "@@UPTIME"',
  'cat /proc/uptime 2>/dev/null',
  'echo "@@LOAD"',
  'cat /proc/loadavg 2>/dev/null',
  'echo "@@CORES"',
  '(nproc 2>/dev/null || grep -c "^processor" /proc/cpuinfo 2>/dev/null)',
  'echo "@@MEM"',
  'cat /proc/meminfo 2>/dev/null | head -n 6',
  'echo "@@DISK"',
  'df -Pk / 2>/dev/null',
  'df -Pk /var 2>/dev/null',
  'df -Pk /home 2>/dev/null',
  'echo "@@NET"',
  'cat /proc/net/dev 2>/dev/null',
  'echo "@@FAILED"',
  'systemctl --failed --no-legend --no-pager 2>/dev/null | head -n 8',
  'echo "@@DOCKER"',
  'docker ps -q 2>/dev/null | wc -l',
  'echo "@@END"',
].join('\n')

/** Split marker output into raw sections. */
function splitSections(text) {
  const sections = {}
  let current
  for (const line of String(text).split(/\r?\n/)) {
    const marker = /^@@([A-Z]+)$/.exec(line.trim())
    if (marker) {
      current = marker[1]
      sections[current] = []
      continue
    }
    if (current) sections[current].push(line)
  }
  return sections
}

/** Parse `NAME="value"` style os-release content. */
function parseOsRelease(lines) {
  const fields = {}
  for (const line of lines) {
    const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim())
    if (match) fields[match[1]] = match[2]
  }
  return {
    name: fields.PRETTY_NAME || fields.NAME || lines.find((line) => line.trim()) || 'unknown',
    id: fields.ID,
    version: fields.VERSION_ID,
  }
}

/** Parse `df -Pk` output into mount records, ignoring repeated mounts. */
function parseDf(lines) {
  const mounts = []
  const seen = new Set()
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) continue
    if (parts[0] === 'Filesystem') continue
    const [device, sizeKb, usedKb, availableKb, usedPct, ...rest] = parts
    const mount = rest.join(' ')
    if (!mount || seen.has(mount)) continue
    seen.add(mount)
    const totalKb = Number(sizeKb)
    const used = Number(usedKb)
    if (!Number.isFinite(totalKb) || totalKb <= 0) continue
    mounts.push({
      device,
      mount,
      totalGb: Number((totalKb / 1024 / 1024).toFixed(1)),
      usedGb: Number((used / 1024 / 1024).toFixed(1)),
      availableGb: Number((Number(availableKb) / 1024 / 1024).toFixed(1)),
      usedPct: Number(String(usedPct).replace('%', '')),
    })
  }
  return mounts
}

/** Sum receive/transmit bytes across every interface except loopback. */
function parseNet(lines) {
  let rxBytes = 0
  let txBytes = 0
  for (const line of lines) {
    const match = /^\s*([^:]+):\s*(.*)$/.exec(line)
    if (!match) continue
    const name = match[1].trim()
    if (name === 'lo') continue
    const numbers = match[2].trim().split(/\s+/).map(Number)
    if (numbers.length < 9) continue
    rxBytes += numbers[0]
    txBytes += numbers[8]
  }
  return { rxBytes, txBytes }
}

/**
 * Parse one probe result into the structured `vps_status` value.
 * @param {string} stdout - marker script output
 * @param {object} meta - exit code and duration from the exec call
 */
export function parseProbe(stdout, meta = {}) {
  const sections = splitSections(stdout)
  const warnings = []
  const os = parseOsRelease(sections.OS || [])
  const uname = (sections.UNAME || []).join(' ').trim()
  const uptimeSeconds = Number(String((sections.UPTIME || [])[0] || '').split(/\s+/)[0])
  const load = String((sections.LOAD || [])[0] || '').trim().split(/\s+/).slice(0, 3).map(Number)
  const cores = Number(String((sections.CORES || [])[0] || '').trim())
  const mem = {}
  for (const line of sections.MEM || []) {
    const match = /^(\w+):\s+(\d+)\s*kB/i.exec(line.trim())
    if (match) mem[match[1]] = Number(match[2])
  }
  const totalMb = mem.MemTotal ? Math.round(mem.MemTotal / 1024) : undefined
  const availableMb = mem.MemAvailable ? Math.round(mem.MemAvailable / 1024) : undefined
  const freeMb = mem.MemFree ? Math.round(mem.MemFree / 1024) : undefined
  const usedMb = totalMb !== undefined && (availableMb ?? freeMb) !== undefined ? totalMb - (availableMb ?? freeMb) : undefined
  const disk = parseDf(sections.DISK || [])
  const network = parseNet(sections.NET || [])
  const failedUnits = (sections.FAILED || []).map((line) => line.trim()).filter(Boolean)
  const dockerRunning = Number(String((sections.DOCKER || [])[0] || '').trim())

  if (!os.name || os.name === 'unknown') warnings.push('未识别发行版（/etc/os-release 缺失）')
  if (!Number.isFinite(load[0])) warnings.push('无法读取负载（/proc/loadavg 缺失）')
  if (totalMb === undefined) warnings.push('无法读取内存（/proc/meminfo 缺失）')
  if (!disk.length) warnings.push('无法读取磁盘（df 不可用）')
  // Failed units are reported structurally (`services.failedUnits`) and shown as
  // their own card; a warning line here would only duplicate them.
  if (disk.some((entry) => entry.usedPct >= 90)) warnings.push('存在分区使用率 ≥ 90%')
  if (totalMb && usedMb && usedMb / totalMb >= 0.9) warnings.push('内存使用率 ≥ 90%')

  return {
    os: { name: os.name, id: os.id, version: os.version, kernel: uname || undefined },
    uptimeSeconds: Number.isFinite(uptimeSeconds) ? Math.round(uptimeSeconds) : undefined,
    cpu: {
      cores: Number.isFinite(cores) && cores > 0 ? cores : undefined,
      load1: Number.isFinite(load[0]) ? load[0] : undefined,
      load5: Number.isFinite(load[1]) ? load[1] : undefined,
      load15: Number.isFinite(load[2]) ? load[2] : undefined,
    },
    mem: {
      totalMb,
      usedMb,
      availableMb,
      usedPct: totalMb && usedMb !== undefined ? Math.round((usedMb / totalMb) * 100) : undefined,
    },
    disk,
    net: network,
    services: failedUnits.length ? { failedUnits } : undefined,
    docker: Number.isFinite(dockerRunning) ? { running: dockerRunning } : undefined,
    warnings,
    exitCode: meta.exitCode ?? null,
    durationMs: meta.durationMs ?? undefined,
  }
}

export { PROBE_SCRIPT }
