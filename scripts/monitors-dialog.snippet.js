    /** Configure external Komari / Nezha panels as a simple form. */
    function MonitorsDialog({ onDone }) {
      const [config, setConfig] = useState([])
      const [sources, setSources] = useState(undefined)
      const [form, setForm] = useState({ name: '', kind: 'komari', baseUrl: '', tokenRef: '' })
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const load = useCallback(async (refresh) => {
        try {
          const [cfg, live] = await Promise.all([rpc({ op: 'monitorsConfig' }), rpc({ op: 'monitors', refresh: refresh === true })])
          setConfig(cfg.sources || [])
          setSources(live.monitors || [])
          setError(undefined)
        } catch (err) {
          setError(err.message)
        }
      }, [])
      useEffect(() => {
        load(false)
      }, [load])
      const save = async (list) => {
        setBusy(true)
        try {
          const payload = await rpc({ op: 'monitorsSave', sources: list })
          setConfig(payload.sources || [])
          setSources(undefined)
          await load(true)
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }
      const add = () => {
        if (!form.baseUrl.trim()) {
          setError('地址不能为空')
          return
        }
        save([...config, { ...form, name: form.name.trim() || form.baseUrl.trim() }])
        setForm({ name: '', kind: form.kind, baseUrl: '', tokenRef: '' })
      }
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
      const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: C.muted }

      return el(
        'div',
        { style: styles.overlay, onMouseDown: (event) => { if (event.target === event.currentTarget) onDone() } },
        el(
          'div',
          { style: { ...styles.dialog, width: 720 } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            el('span', { style: styles.title }, '外部监控'),
            el('span', { style: { ...styles.muted, fontSize: 11 } }, '只读：拉取节点状态，不写回对方'),
            el('span', { style: { flex: 1 } }),
            el('button', { style: styles.button(false), onClick: () => load(true), disabled: busy }, '刷新')),
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 110px 1.6fr 1fr auto', gap: 8, alignItems: 'end' } },
            el('label', { style: field }, '名称', el('input', { style: styles.input, value: form.name, placeholder: 'komari', onChange: set('name') })),
            el('label', { style: field }, '类型', el('select', { style: styles.input, value: form.kind, onChange: set('kind') },
              el('option', { value: 'komari' }, 'Komari'),
              el('option', { value: 'nezha' }, '哪吒'))),
            el('label', { style: field }, '地址', el('input', { style: styles.input, value: form.baseUrl, placeholder: 'https://komari.example.com', onChange: set('baseUrl') })),
            el('label', { style: field }, 'Token 凭据名', el('input', { style: styles.input, value: form.tokenRef, placeholder: 'DSH_VPS_KOMARI_TOKEN', onChange: set('tokenRef') })),
            el('button', { style: styles.button(true), onClick: add, disabled: busy }, '添加')),
          el('div', { style: { ...styles.muted, fontSize: 11, lineHeight: 1.7 } },
            'Token 的值不要填这里：到 DSH 凭据管理器写入同名 key 即可；地址如果是公开面板，可以留空 Token。'),
          error ? el('div', { style: styles.err }, error) : null,
          el('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflow: 'auto' } },
            ...(sources || []).map((source) =>
              el('div', { key: source.name, style: styles.card },
                el('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                  el('span', { style: styles.dot(source.ok ? 'ok' : 'bad') }),
                  el('span', { style: { fontWeight: 600 } }, source.name),
                  el('span', { style: styles.badge }, source.kind),
                  el('span', { style: { flex: 1 } }),
                  source.ok ? el('span', { style: styles.muted }, `${(source.nodes || []).length} 个节点`) : el('span', { style: styles.err }, source.error),
                  el('button', {
                    style: { ...styles.button(false), color: C.bad },
                    onClick: () => save(config.filter((item) => (item.name || item.baseUrl) !== source.name)),
                  }, '删除')),
                source.ok
                  ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                      ...(source.nodes || []).map((node) =>
                        el('div', { key: node.id, style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 } },
                          el('span', { style: styles.dot(node.online === true ? 'ok' : node.online === false ? 'bad' : 'idle') }),
                          el('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, node.name),
                          node.cpu != null ? el('span', { style: styles.muted }, `CPU ${node.cpu}%`) : null,
                          node.mem != null ? el('span', { style: styles.muted }, `MEM ${node.mem}%`) : null)))
                  : null)),
            sources && sources.length === 0 ? el('div', { style: styles.muted }, '还没有配置。填上面的表单点「添加」。') : null),
          el('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
            el('button', { style: styles.button(false), onClick: onDone }, '关闭')),
        ),
      )
    }

