    /** Dashboard: headline cards, ring meters, trend panel, disk/facts panels. */
    function StatusView({ record, compact }) {
      const [status, setStatus] = useState(undefined)
      const [error, setError] = useState(undefined)
      const [latency, setLatency] = useState(undefined)
      const [latencyError, setLatencyError] = useState(undefined)
      const [history, setHistory] = useState(undefined)
      const loadingRef = useRef(false)
      const probeRef = useRef(false)
      const historyRef = useRef(false)

      const load = useCallback(async () => {
        if (loadingRef.current) return
        loadingRef.current = true
        try {
          const payload = await rpc({ op: 'status', host: record.id })
          setStatus(payload.status)
          setError(undefined)
        } catch (err) {
          setError(err.message)
        } finally {
          loadingRef.current = false
        }
      }, [record.id])

      const probe = useCallback(async () => {
        if (probeRef.current) return
        probeRef.current = true
        try {
          const payload = await rpc({ op: 'latency', host: record.id, options: { attempts: 3, timeoutMs: 2000 } })
          setLatency(payload.latency)
          setLatencyError(undefined)
        } catch (err) {
          setLatencyError(err.message)
        } finally {
          probeRef.current = false
        }
      }, [record.id])

      const loadHistory = useCallback(async () => {
        if (historyRef.current) return
        historyRef.current = true
        try {
          const payload = await rpc({ op: 'history', host: record.id, minutes: 60 })
          setHistory(payload)
        } catch {
        } finally {
          historyRef.current = false
        }
      }, [record.id])

      useEffect(() => {
        let cancelled = false
        const tick = async () => {
          if (!cancelled) await load()
        }
        tick()
        const timer = setInterval(tick, 5000)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [load])

      useEffect(() => {
        let cancelled = false
        const tick = async () => {
          if (!cancelled) await probe()
        }
        tick()
        const timer = setInterval(tick, 20000)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [probe])

      useEffect(() => {
        let cancelled = false
        const tick = async () => {
          if (!cancelled) await loadHistory()
        }
        tick()
        const timer = setInterval(tick, 60000)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [loadHistory])

      if (error && !status) {
        return el('div', { className: 'v-card', style: { borderColor: C.bad } },
          el('div', { className: 'v-label', style: { color: C.bad } }, '连接失败'),
          el('div', { style: styles.err, marginTop: 6 }, error),
          el('div', { className: 'v-sub' }, '检查主机地址/端口、私钥路径与凭据名，或确认这台机器在线。'))
      }
      if (!status) return el('div', { style: styles.muted }, '读取状态…')

      const memPct = status.mem && status.mem.usedPct != null ? status.mem.usedPct : 0
      const cores = status.cpu && status.cpu.cores ? status.cpu.cores : 0
      const load1 = status.cpu && status.cpu.load1 != null ? status.cpu.load1 : undefined
      const loadPct = cores && load1 != null ? Math.round((load1 / cores) * 100) : 0
      const disks = status.disk || []
      const root = disks.find((disk) => disk.mount === '/') || disks[0]
      const net = status.net || {}
      const failed = status.services && status.services.failedUnits ? status.services.failedUnits : []
      const totalTraffic = (Number(net.rxBytes) || 0) + (Number(net.txBytes) || 0)
      const avgMs = latency && latency.avgMs != null ? latency.avgMs : undefined
      const lossPct = latency ? latency.lossPct : undefined
      const days = daysUntil(record.expiresAt)
      const series = (history && history.series) || []
      const tone = (pct) => (pct >= 90 ? C.bad : pct >= 70 ? C.warn : C.accent)
      const ring = (pct, color) => {
        const offset = 201 * (1 - Math.min(100, Math.max(0, pct || 0)) / 100)
        return el('div', { className: 'v-ring' },
          el('svg', { width: 78, height: 78, viewBox: '0 0 78 78', style: { transform: 'rotate(-90deg)' } },
            el('circle', { cx: 39, cy: 39, r: 32, fill: 'none', stroke: 'rgba(127,127,127,.18)', strokeWidth: 7 }),
            el('circle', { cx: 39, cy: 39, r: 32, fill: 'none', stroke: color, strokeWidth: 7, strokeLinecap: 'round', strokeDasharray: 201, strokeDashoffset: offset })),
          el('b', null, String(Math.round(pct || 0)), el('small', null, '%')))
      }
      const trend = (key, color) => {
        const values = series.map((row) => row[key]).filter((value) => typeof value === 'number')
        const stats = history && history.summary ? history.summary[key] : undefined
        if (values.length < 2) return el('div', { className: 'v-sub', style: { marginTop: 6 } }, '采样中…')
        const step = 240 / (values.length - 1)
        const points = values.map((value, index) => `${(index * step).toFixed(1)} ${(52 - Math.min(100, Math.max(0, value)) / 100 * 46).toFixed(1)}`).join(' L')
        return el('div', { className: 't-head' },
            el('span', null, key === 'cpu' ? 'CPU' : key === 'mem' ? '内存' : '磁盘'),
            el('b', null, stats ? `avg ${stats.avg}% · max ${stats.max}%` : '')),
          el('svg', { viewBox: '0 0 240 52', preserveAspectRatio: 'none', style: { width: '100%', height: 52, display: 'block' } },
            el('path', { d: `M${points} L240 52 L0 52 Z`, fill: `color-mix(in srgb, ${color} 9%, transparent)` }),
            el('path', { d: `M${points}`, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'round' }))
      }
      const hero = (label, icon, value, unit, pill, left, right) =>
        el('div', { className: 'v-card' },
          el('div', { className: 'v-label' }, el(Icon, { name: icon, size: 13 }), label),
          el('div', { className: 'v-hero' }, el('b', null, value), unit ? el('small', null, unit) : null, pill ? el('span', { className: 'v-pill' }, pill) : null),
          left || right ? el('div', { className: 'v-sub' }, el('span', null, left || ''), el('span', null, right || '')) : null)

      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        failed.length
          ? el('div', { className: 'v-alert' },
              el(Icon, { name: 'system', size: 15 }),
              el('b', null, failed[0].split(' ')[0]),
              el('span', null, `等 ${failed.length} 个 systemd 单元处于 failed 状态`))
          : null,
        el('div', { className: 'v-grid4', style: compact ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 } : null },
          hero('延迟', 'test', avgMs == null ? '—' : avgMs, avgMs == null ? '' : 'ms',
            avgMs == null ? null : avgMs < 80 ? '稳定' : avgMs < 180 ? '偏高' : '很差',
            latency ? `最低 ${latency.minMs ?? '—'} · 最高 ${latency.maxMs ?? '—'}` : latencyError || '测量中…',
            latency ? `波动 ${latency.jitterMs ?? '—'}` : ''),
          hero('丢包', 'external', lossPct == null ? '—' : lossPct, lossPct == null ? '' : '%',
            latency ? `${latency.samples.length}/${latency.attempts} 成功` : null,
            '3 次 TCP 握手', latency ? '20s 前' : ''),
          hero('在线时长', 'audit', fmtUptime(status.uptimeSeconds).split('天')[0] || '—', status.uptimeSeconds != null ? (fmtUptime(status.uptimeSeconds).includes('天') ? '天 ' + fmtUptime(status.uptimeSeconds).split('天')[1] : '') : '',
            status.docker && status.docker.running != null ? `${status.docker.running} 容器` : null,
            status.os && status.os.kernel ? status.os.kernel : '', ''),
          hero('到期 / 价格', 'key', days == null ? '—' : Math.abs(days), days == null ? '' : days < 0 ? '已过期' : '天',
            record.price != null ? `¥${record.price}/${record.priceUnit === 'month' ? '月' : '年'}` : null,
            record.expiresAt || '未填写', days == null ? '' : days < 0 ? '需要续费' : `剩 ${days} 天`),
        ),
        el('div', { className: 'v-grid3', style: compact ? { gridTemplateColumns: '1fr', gap: 10 } : null },
          el('div', { className: 'v-card v-ringcard' }, ring(loadPct, tone(loadPct)),
            el('div', { className: 'v-ringtext' },
              el('div', { className: 'k' }, 'CPU 负载'),
              el('div', { className: 'v' }, `${load1 != null ? load1.toFixed(2) : '?'} / ${cores || '?'} 核`),
              el('div', { className: 'h' }, `5 分钟 ${status.cpu && status.cpu.load5 != null ? status.cpu.load5.toFixed(2) : '?'} · 15 分钟 ${status.cpu && status.cpu.load15 != null ? status.cpu.load15.toFixed(2) : '?'}`))),
          el('div', { className: 'v-card v-ringcard' }, ring(memPct, tone(memPct)),
            el('div', null,
              el('div', { className: 'k' }, '内存'),
              el('div', { className: 'v' }, `${status.mem && status.mem.usedMb != null ? status.mem.usedMb : '?'} / ${status.mem && status.mem.totalMb != null ? status.mem.totalMb : '?'} MB`),
              el('div', { className: 'h' }, status.mem && status.mem.availableMb != null ? `可用 ${status.mem.availableMb} MB` : ''))),
          el('div', { className: 'v-card v-ringcard' }, ring(root ? root.usedPct : 0, tone(root ? root.usedPct : 0)),
            el('div', null,
              el('div', { className: 'k' }, root ? `磁盘 ${root.mount}` : '磁盘'),
              el('div', { className: 'v' }, root ? `${root.usedGb} / ${root.totalGb} GB` : '—'),
              el('div', { className: 'h' }, root ? `剩余 ${root.availableGb} GB` : '未读取到分区'))),
        ),
        el('div', { className: 'v-panel' },
          el('div', { className: 'v-panel-head' },
            el('h3', null, '最近 1 小时'),
            el('span', { className: 'meta' }, history ? `${history.samples} 个采样 · 每 30 秒` : '采样中…'),
            el('div', { className: 'v-spacer' })),
          el('div', { className: 'v-trend', style: compact ? { gridTemplateColumns: '1fr', gap: 12 } : null },
            el('div', { key: 'cpu' }, trend('cpu', C.accent)),
            el('div', { key: 'mem' }, trend('mem', C.warn)),
            el('div', { key: 'disk' }, trend('disk', C.ok)))),
        el('div', { className: 'v-grid3', style: compact ? { gridTemplateColumns: '1fr', gap: 10 } : { gridTemplateColumns: '1.35fr 1fr 1fr' } },
          el('div', { className: 'v-panel', style: { padding: 16 } },
            el('div', { className: 'v-label' }, '磁盘分区'),
            ...disks.map((disk, index) =>
              el('div', { key: `disk-${index}`, style: { marginTop: index ? 12 : 10 } },
                el('div', { className: 'v-sub', style: { marginTop: 0, marginBottom: 5 } },
                  el('span', { style: { fontFamily: 'var(--v-mono)', color: C.text, fontWeight: 600 } }, disk.mount),
                  el('span', null, `${disk.usedGb} / ${disk.totalGb} GB · ${disk.usedPct}%`)),
                el('div', { style: { height: 6, borderRadius: 3, background: 'rgba(127,127,127,.18)', overflow: 'hidden' } },
                  el('div', { style: { width: `${disk.usedPct}%`, height: '100%', borderRadius: 3, background: tone(disk.usedPct) } }))))),
          el('div', { className: 'v-panel', style: { padding: 16 } },
            el('div', { className: 'v-label' }, '网络与运行'),
            el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 } },
              ...[['接收', fmtBytes(net.rxBytes)], ['发送', fmtBytes(net.txBytes)], ['容器', status.docker && status.docker.running != null ? status.docker.running : '—'], ['失败单元', failed.length]]
                .map(([label, value], index) =>
                  el('div', { key: index },
                    el('div', { className: 'v-sub', style: { marginTop: 0 } }, label),
                    el('div', { style: { fontSize: 15, fontWeight: 650, marginTop: 3 } }, String(value))))),
            record.notes ? el('div', { className: 'v-sub', style: { marginTop: 14, borderTop: `1px dashed ${C.border}`, paddingTop: 12, lineHeight: 1.7, color: C.muted } }, record.notes) : null),
          el('div', { className: 'v-panel', style: { padding: 16 } },
            el('div', { className: 'v-label' }, '连接'),
            el('div', { className: 'v-sub', style: { marginTop: 0, marginBottom: 5 } }, el('span', null, '认证'), el('span', null, AUTH_LABELS[(record.auth && record.auth.kind) || 'key'])),
            el('div', { className: 'v-sub', style: { marginTop: 0 } }, el('span', null, '指纹'), el('span', { style: { fontFamily: 'var(--v-mono)' } }, record.hostKey && record.hostKey.fingerprint ? String(record.hostKey.fingerprint).slice(0, 20) : '首次连接时固定'))),
        ),
      )
    }

