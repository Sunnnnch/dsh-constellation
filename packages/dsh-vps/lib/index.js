import { VpsService } from './service.js'
import { registerTerminalTool, registerTools } from './tools.js'
import { registerTerminalBackends } from './terminal.js'
import { registerRoutes } from './routes.js'
import { configure as configureSsh } from './ssh.js'
import { analyzeToolCall } from './policy.js'

/** Cordis plugin name. */
export const name = 'dsh-vps'

/**
 * Cordis takes an array of service names (or a name→config map), so only the
 * hard requirement is declared here. `terminals` and `connection` attach later
 * through `ctx.inject` in {@link whenService}, because they are optional.
 */
export const inject = ['tools']

/** Credential key used when a host record leaves it unset. */
function passwordRefFor(hostId) {
  return `DSH_VPS_${hostId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PASSWORD`
}

/** Credential key used for a private-key passphrase when the record leaves it unset. */
function passphraseRefFor(hostId) {
  return `DSH_VPS_${hostId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PASSPHRASE`
}

/**
 * Run `fn` once a service is available. Optional injections call `apply`
 * before the provider loads, so a plain `ctx.get` at apply time would miss the
 * terminal registry and the connection service entirely.
 * @param {object} ctx - host Context
 * @param {string} name - service name
 * @param {(service: unknown, scope: object) => void} fn
 */
function whenService(ctx, name, fn) {
  if (typeof ctx.inject === 'function') {
    ctx.inject([name], (scope) => {
      fn(scope.get?.(name) ?? scope[name], scope)
    })
    return
  }
  const service = ctx.get?.(name) ?? ctx[name]
  if (service) fn(service, ctx)
}

/**
 * Mount the VPS capability: inventory, tools, and (when present) the SSH
 * terminal backend plus the browser routes.
 * @param {object} ctx - host Cordis Context
 * @param {object} config - plugin configuration
 */
export function apply(ctx, config = {}) {
  const service = new VpsService(ctx, config)
  service.startMetrics()

  configureSsh({
    resolveSecret: async (ref) => {
      const credentials = ctx.get?.('credentials') ?? ctx.credentials
      if (!credentials) return process.env[ref]
      try {
        const hit = await credentials.resolve(ref)
        return hit?.value
      } catch {
        return process.env[ref]
      }
    },
    rememberFingerprint: (id, fingerprint) => service.pinFingerprint(id, fingerprint),
  })

  ctx.effect(() => {
    const disposers = registerTools(ctx, service, config)
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {}
      }
    }
  }, 'dsh-vps: model tools')

  // Dangerous-command gate: the waterfall turns an obvious "this wipes the box"
  // command into an approval request. Missing approval support fails closed.
  if (config.guardDangerous !== false && typeof ctx.on === 'function') {
    ctx.effect(
      () =>
        ctx.on('tools/pre-execute', async (exec, next) => {
          const decision = await next()
          if (!decision || decision.kind !== 'allow') return decision
          const finding = analyzeToolCall(exec)
          if (!finding) return decision
          try {
            service.audit({ action: 'guard-ask', tool: exec.name, rule: finding.rule, command: String(finding.command).slice(0, 500) })
          } catch {}
          return {
            kind: 'ask',
            reason: `危险命令（${finding.rule}）：${finding.why}。命令：${String(finding.command).slice(0, 300)}`,
            displayReason: {
              zh: `危险操作需确认：${finding.why}`,
              en: `Confirm dangerous operation: ${finding.why}`,
            },
          }
        }),
      'dsh-vps: dangerous-command gate',
    )
  }

  whenService(ctx, 'terminals', (terminals, scope) => {
    if (!terminals || typeof terminals.registerBackend !== 'function') return
    scope.effect(() => registerTerminalBackends(terminals, service, config), 'dsh-vps: ssh terminal backends')
    scope.effect(() => registerTerminalTool(scope, service, terminals), 'dsh-vps: terminal tool')
  })

  whenService(ctx, 'connection', (connection, scope) => {
    if (!connection || typeof connection.fetch?.register !== 'function') return
    scope.effect(() => registerRoutes(connection, service, config), 'dsh-vps: browser routes')
  })

  ctx.effect(() => () => service.dispose(), 'dsh-vps: connections and tunnels')
}

export { VpsService }
