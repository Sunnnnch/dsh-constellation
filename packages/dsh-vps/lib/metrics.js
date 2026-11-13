/**
 * Lightweight metric history: one JSON line per sample per host.
 *
 * Deliberately not a time-series database. The panel needs "the last hour" and
 * the model needs "what did it look like", both of which a bounded JSONL file
 * answers without a dependency. Samples are appended, trimmed to the newest
 * MAX_SAMPLES, and read back by time window.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { metricsDir } from './paths.js'

/** Keep at most 24 hours of history, regardless of the sampling interval. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Hard cap on lines per host, so a tiny interval cannot grow the file without bound. */
const MAX_SAMPLES = 10000
const BAR = '▁▂▃▄▅▆▇█'

/** One host's history file (id sanitized so it cannot escape the directory). */
export function metricsPath(hostId) {
  const safe = String(hostId).replace(/[^A-Za-z0-9._-]/g, '_')
  return join(metricsDir(), `${safe}.jsonl`)
}

/** Append one sample line. */
export function appendSample(hostId, sample) {
  mkdirSync(metricsDir(), { recursive: true })
  appendFileSync(metricsPath(hostId), `${JSON.stringify(sample)}\n`, 'utf8')
}

/** Read samples newer than `minutes`, newest last. */
export function readSeries(hostId, { minutes = 60, limit = MAX_SAMPLES } = {}) {
  const path = metricsPath(hostId)
  if (!existsSync(path)) return []
  const since = Date.now() - Math.max(1, minutes) * 60000
  const rows = []
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      const row = JSON.parse(line)
      if (typeof row.ts === 'number' && row.ts >= since) rows.push(row)
    } catch {}
  }
  return rows.slice(-limit)
}

/** Drop samples older than 24h and keep the file under the hard cap. */
export function trimSeries(hostId) {
  const path = metricsPath(hostId)
  if (!existsSync(path)) return false
  let lines = []
  try {
    lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  } catch {
    return false
  }
  if (lines.length <= MAX_SAMPLES) {
    // Cheap path: only rewrite when something is actually old.
    try {
      const oldest = JSON.parse(lines[0] || '{}')
      if (typeof oldest.ts === 'number' && Date.now() - oldest.ts < MAX_AGE_MS) return false
    } catch {
      return false
    }
  }
  const cutoff = Date.now() - MAX_AGE_MS
  const kept = lines
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return undefined
      }
    })
    .filter((row) => row && typeof row.ts === 'number' && row.ts >= cutoff)
    .slice(-MAX_SAMPLES)
  writeFileSync(`${path}.tmp`, `${kept.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
  renameSync(`${path}.tmp`, path)
  return true
}

/** Newest sample for one host, or undefined. */
export function readLastSample(hostId) {
  const path = metricsPath(hostId)
  if (!existsSync(path)) return undefined
  try {
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index])
      } catch {}
    }
  } catch {}
  return undefined
}

/** Three-net rounds file for one host. */
export function threePath(hostId) {
  const safe = String(hostId).replace(/[^A-Za-z0-9._-]/g, '_')
  return join(metricsDir(), `${safe}.three.jsonl`)
}

/** Append one three-net round. */
export function appendThree(hostId, entry) {
  mkdirSync(metricsDir(), { recursive: true })
  appendFileSync(threePath(hostId), `${JSON.stringify(entry)}\n`, 'utf8')
}

/** Rounds newer than `minutes`, oldest first. */
export function readThree(hostId, { minutes = 1440 } = {}) {
  const path = threePath(hostId)
  if (!existsSync(path)) return []
  const since = Date.now() - minutes * 60000
  const rows = []
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue
      try {
        const row = JSON.parse(line)
        if (typeof row.ts === 'number' && row.ts >= since) rows.push(row)
      } catch {}
    }
  } catch {}
  return rows
}

/** Drop three-net rounds older than 24h; cheap no-op otherwise. */
export function trimThree(hostId) {
  const path = threePath(hostId)
  if (!existsSync(path)) return false
  let lines = []
  try {
    lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  } catch {
    return false
  }
  if (lines.length < 2) return false
  try {
    const oldest = JSON.parse(lines[0])
    if (typeof oldest.ts === 'number' && Date.now() - oldest.ts < MAX_AGE_MS) return false
  } catch {
    return false
  }
  const cutoff = Date.now() - MAX_AGE_MS
  const kept = lines
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return undefined
      }
    })
    .filter((row) => row && typeof row.ts === 'number' && row.ts >= cutoff)
  writeFileSync(`${path}.tmp`, `${kept.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
  renameSync(`${path}.tmp`, path)
  return true
}

/** Render numbers as a one-line block sparkline (for tool output). */
export function sparkline(values) {
  const nums = (values || []).filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (!nums.length) return ''
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  return nums.map((value) => BAR[Math.min(BAR.length - 1, Math.max(0, Math.round(((value - min) / span) * (BAR.length - 1))))]).join('')
}

export { MAX_SAMPLES }
