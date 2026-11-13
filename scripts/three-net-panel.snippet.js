        el('div', { className: 'v-panel' },
          el('div', { className: 'v-panel-head' },
            el(Icon, { name: 'external', size: 14 }),
            el('h3', null, '三网延迟'),
            el('span', { className: 'meta' }, '服务器出网 · 60 秒刷新'),
            el('div', { className: 'v-spacer' }),
            el('button', { className: 'v-btn', onClick: () => setProbeTick((value) => value + 1) }, '立即探测')),
          el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 } },
            ...(three && three.rows ? three.rows : [
              { carrier: 'tele', label: '电信' },
              { carrier: 'unicom', label: '联通' },
              { carrier: 'mobile', label: '移动' },
            ]).map((row) => {
              const pct = row.avgMs == null ? 0 : Math.min(100, (row.avgMs / 300) * 100)
              const color = row.avgMs == null ? C.bad : row.avgMs < 80 ? C.ok : row.avgMs < 180 ? C.warn : C.bad
              return el('div', { key: row.carrier },
                el('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  el('span', { style: { width: 7, height: 7, borderRadius: 7, flex: 'none', background: color } }),
                  el('span', { className: 'v-label' }, row.label),
                  el('span', { className: 'v-spacer' }),
                  el('span', { style: { fontSize: 18, fontWeight: 650, fontVariantNumeric: 'tabular-nums' } },
                    row.avgMs == null ? '—' : String(Math.round(row.avgMs)),
                    row.avgMs == null ? null : el('span', { style: { fontSize: 10, color: C.muted, marginLeft: 2 } }, 'ms'))),
                el('div', { style: { height: 4, borderRadius: 3, background: 'rgba(127,127,127,.18)', marginTop: 6, overflow: 'hidden' } },
                  el('div', { style: { width: `${pct}%`, height: '100%', borderRadius: 3, background: color } })),
                el('div', { className: 'v-sub', style: { marginTop: 5 } },
                  row.avgMs == null ? (row.error ? '超时 / 不可达' : '探测中…') : `丢包 ${row.lossPct}%`))
            }))),
