/**
 * Best-effort risk analysis for shell commands that arrive through model tools.
 *
 * This is a *tripwire*, not a sandbox: quoting, variables, base64, and scripts
 * written to disk can all evade a pattern list. Its job is to turn the obvious
 * "this wipes the box" cases into an approval prompt instead of a silent run.
 * Read-only hosts are enforced separately and structurally in the service.
 */

/** Rules are matched against a lowercased, whitespace-collapsed command. */
const RULES = [
  { id: 'rm-root', why: '删除根目录', pattern: /\brm\s+(?:-[a-z]+\s+)*\/(?:\s|$|\*)/ },
  { id: 'dd-device', why: '直接写块设备', pattern: /\bdd\b[^\n]*\bof=\/dev\// },
  { id: 'mkfs', why: '格式化文件系统', pattern: /\bmkfs(?:\.\w+)?\b/ },
  { id: 'power', why: '关机 / 重启', pattern: /\b(?:reboot|shutdown|poweroff|halt)\b|\binit\s+[06]\b/ },
  { id: 'firewall-flush', why: '清空防火墙规则', pattern: /\biptables\s+-(?:f|x)\b|\bnft\s+flush\s+ruleset\b|\bufw\s+disable\b/ },
  { id: 'docker-prune', why: '批量清理 Docker 资源', pattern: /\bdocker\s+(?:system|volume|image|container)\s+prune\b/ },
  { id: 'fork-bomb', why: 'fork 炸弹', pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
  { id: 'chmod-root', why: '递归改根目录权限', pattern: /\bchmod\s+-r\s+777\s+\/(?:\s|$)/ },
  { id: 'chown-root', why: '递归改根目录属主', pattern: /\bchown\s+-r\s+\S+\s+\/(?:\s|$)/ },
  { id: 'overwrite-device', why: '覆盖磁盘设备', pattern: />\s*\/dev\/(?:sd|nvme|vd|xvd)/ },
  { id: 'pipe-to-shell', why: '把网络脚本直接交给 shell', pattern: /\b(?:curl|wget)\b[^|;]*\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/ },
  { id: 'root-account', why: '改 root 账号或 sudoers', pattern: /\b(?:userdel\s+root|passwd\s+root|visudo)\b/ },
  { id: 'ssh-lockout', why: '禁用 SSH 服务（可能锁死自己）', pattern: /\bsystemctl\s+(?:disable|mask)\s+(?:ssh|sshd)\b/ },
  { id: 'truncate-root', why: '清空根分区文件', pattern: /\btruncate\s+-s\s*0\s+\/(?:\s|$)/ },
  { id: 'mv-etc', why: '移动 /etc（可能破坏系统）', pattern: /\bmv\s+\/etc(?:\s|$|\/)/ },
  { id: 'crontab-wipe', why: '清空所有定时任务', pattern: /\bcrontab\s+-r\b/ },
]

/**
 * Classify one shell command.
 * @param {string} command
 * @returns {{level:'danger', rule:string, why:string, command:string} | undefined}
 */
export function analyzeCommand(command) {
  const text = String(command || '')
  if (!text.trim()) return undefined
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return { level: 'danger', rule: rule.id, why: rule.why, command: text }
  }
  return undefined
}

/** Tools whose arguments carry a shell command this gate understands. */
const COMMAND_ARGUMENTS = {
  vps_exec: (args) => args.command,
  vps_batch: (args) => args.command,
  vps_shell: (args) => (args.action === 'send' ? args.text : undefined),
}

/**
 * Classify one pending tool call. Returns `undefined` for tools this gate does
 * not police (including non-vps tools).
 * @param {{name?: string, arguments?: unknown}} execution
 */
export function analyzeToolCall(execution) {
  const pick = COMMAND_ARGUMENTS[execution?.name]
  if (!pick) return undefined
  const args = execution.arguments
  if (!args || typeof args !== 'object') return undefined
  return analyzeCommand(pick(args))
}

export { RULES }
