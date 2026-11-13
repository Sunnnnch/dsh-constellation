import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { homedir } from 'node:os'
import { inventoryPath, sshConfigPath, vpsDir } from './paths.js'

/** Drop undefined entries so a patch never erases a field it did not mention. */
export function definedOnly(value) {
  const out = {}
  for (const [key, item] of Object.entries(value || {})) {
    if (item !== undefined) out[key] = item
  }
  return out
}

/**
 * Inventory record shape (version 1). Secrets never live here: `auth.keyPath`
 * is a path, and `auth.passphraseRef` / `auth.passwordRef` name credential keys.
 */
const EMPTY = { version: 1, hosts: [] }

/** Normalize one host record and fill defaults. */
export function normalizeHost(raw, index) {
  const host = String(raw.host || '').trim()
  if (!host) return undefined
  const id = String(raw.id || host).trim().replace(/[^A-Za-z0-9._-]/g, '-') || `host-${index}`
  const auth = raw.auth || {}
  return {
    id,
    label: String(raw.label || id),
    host,
    port: Number(raw.port) > 0 ? Number(raw.port) : 22,
    user: String(raw.user || 'root'),
    auth: {
      kind: auth.kind === 'password' ? 'password' : auth.kind === 'agent' ? 'agent' : 'key',
      keyPath: auth.keyPath ? String(auth.keyPath) : undefined,
      passwordRef: auth.passwordRef ? String(auth.passwordRef) : undefined,
      passphraseRef: auth.passphraseRef ? String(auth.passphraseRef) : undefined,
    },
    jump: Array.isArray(raw.jump) ? raw.jump.map(String) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    readonly: raw.readonly === true,
    hostKey: raw.hostKey && raw.hostKey.fingerprint ? raw.hostKey : undefined,
    expiresAt: raw.expiresAt ? String(raw.expiresAt) : undefined,
    price: Number.isFinite(Number(raw.price)) && raw.price !== '' && raw.price != null ? Number(raw.price) : undefined,
    priceUnit: raw.priceUnit === 'month' || raw.priceUnit === 'year' ? raw.priceUnit : undefined,
    defaults: {
      cwd: raw.defaults?.cwd ? String(raw.defaults.cwd) : undefined,
      sudo: raw.defaults?.sudo === true,
    },
    notes: raw.notes ? String(raw.notes) : undefined,
    source: raw.source ? String(raw.source) : 'manual',
  }
}

/**
 * Parse `~/.ssh/config` into candidate host records. Only the fields this
 * plugin can honor are read; `Match`/`Include` and wildcard blocks are skipped.
 * @returns {Array<object>} unnormalized records
 */
export function parseSshConfig(text) {
  const records = []
  let current
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(\w+)\s+(.*)$/.exec(line)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim().replace(/^"(.*)"$/, '$1')
    if (key === 'host') {
      current = undefined
      const aliases = value.split(/\s+/).filter((alias) => alias && !/[*?!]/.test(alias))
      if (!aliases.length) continue
      current = { id: aliases[0], label: aliases[0], host: aliases[0], port: 22, user: undefined, auth: { kind: 'key' }, tags: [], source: 'ssh-config' }
      records.push(current)
      continue
    }
    if (!current) continue
    if (key === 'hostname') current.host = value
    else if (key === 'user') current.user = value
    else if (key === 'port') current.port = Number(value) || 22
    else if (key === 'identityfile') current.auth.keyPath = expandHome(value)
    else if (key === 'proxyjump') current.jump = value.split(',').map((part) => part.trim()).filter(Boolean)
  }
  return records.filter((record) => record.host)
}

/** Expand a leading `~` in a configured path. */
export function expandHome(value) {
  if (!value) return value
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return `${homedir()}/${value.slice(2)}`
  return value
}

/** Load the inventory, importing `~/.ssh/config` on first run. */
export function loadInventory() {
  const path = inventoryPath()
  if (!existsSync(path)) {
    const imported = importSshConfig()
    const inventory = { version: 1, hosts: imported }
    if (imported.length) saveInventory(inventory)
    return inventory
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    const hosts = Array.isArray(parsed.hosts) ? parsed.hosts.map(normalizeHost).filter(Boolean) : []
    return { version: 1, hosts }
  } catch {
    return { ...EMPTY, hosts: [] }
  }
}

/** Import `~/.ssh/config` without touching the stored inventory. */
export function importSshConfig() {
  const path = sshConfigPath()
  if (!existsSync(path)) return []
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  return parseSshConfig(text).map(normalizeHost).filter(Boolean)
}

/** Persist the inventory atomically. */
export function saveInventory(inventory) {
  mkdirSync(vpsDir(), { recursive: true })
  const path = inventoryPath()
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
}

/** Resolve a host by id first, then by exact label, then by unique host name. */
export function resolveHost(hosts, ref) {
  if (!ref) return undefined
  const wanted = String(ref).trim()
  const byId = hosts.find((host) => host.id === wanted)
  if (byId) return byId
  const byLabel = hosts.find((host) => host.label === wanted)
  if (byLabel) return byLabel
  const byHost = hosts.filter((host) => host.host === wanted)
  return byHost.length === 1 ? byHost[0] : undefined
}

export { dirname }
