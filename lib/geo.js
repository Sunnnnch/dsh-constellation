/**
 * Country lookup for host flags. Results are cached in storages/vps/geo.json so
 * a restart never re-asks for the same address. Offline or rate-limited lookups
 * simply return undefined and the UI shows no flag.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { vpsDir } from './paths.js'

function geoPath() {
  return join(vpsDir(), 'geo.json')
}

export function loadGeo() {
  try {
    const parsed = JSON.parse(readFileSync(geoPath(), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveGeo(map) {
  try {
    mkdirSync(dirname(geoPath()), { recursive: true })
    writeFileSync(geoPath(), `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  } catch {}
}

/** IPv4 only; hostnames are skipped rather than resolved. */
export async function lookupCountry(ip, timeoutMs = 4000) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip || ''))) return undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, { signal: controller.signal })
    if (!response.ok) return undefined
    const payload = await response.json()
    const code = payload && payload.countryCode
    return typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? code : undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}
