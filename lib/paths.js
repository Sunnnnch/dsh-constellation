import { homedir } from 'node:os'
import { join } from 'node:path'

/** DSH home directory, matching the launcher's own resolution. */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** Directory holding this plugin's durable state. */
export function vpsDir() {
  return join(dshHome(), 'storages', 'vps')
}

/** Inventory file path. */
export function inventoryPath() {
  return join(vpsDir(), 'inventory.json')
}

/** Audit log path. */
export function auditPath() {
  return join(vpsDir(), 'audit.jsonl')
}

/** Saved command snippets. */
export function snippetsPath() {
  return join(vpsDir(), 'snippets.json')
}

/** Per-host metric history directory. */
export function metricsDir() {
  return join(vpsDir(), 'metrics')
}

/** Tunnel definitions, so they can be restored after a restart. */
export function tunnelsPath() {
  return join(vpsDir(), 'tunnels.json')
}

/** Panel-editable settings that override the composition defaults. */
export function settingsPath() {
  return join(vpsDir(), 'settings.json')
}

/** OpenSSH client configuration path. */
export function sshConfigPath() {
  return join(homedir(), '.ssh', 'config')
}
