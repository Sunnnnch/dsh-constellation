window.__ModuleLoader__.load({
  id: '@sunrise/dsh-vps',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const el = react.createElement
    const { useState, useEffect, useRef, useCallback } = react

    /** Locale namespace and the id shared by the sidebar entry and its page. */
    const NS = 'dshVps'
    const PANEL_ID = '@sunrise/dsh-vps'

    /** Same-origin RPC endpoints, document-relative like every shipped plugin. */
    const RPC_PATH = '/api/vps.rpc'.slice(1)
    const UPLOAD_PATH = '/api/vps.upload'.slice(1)
    const DOWNLOAD_PATH = '/api/vps.download'.slice(1)
    const TERM_PATH = '/api/vps.term'.slice(1)

    /** Glass theme palette: fixed light surface with indigo/pink accents. */
    const C = {
      border: 'rgba(255,255,255,.8)',
      borderStrong: 'rgba(148,163,184,.5)',
      text: '#1e293b',
      muted: '#64748b',
      card: 'rgba(255,255,255,.62)',
      layer2: 'rgba(255,255,255,.42)',
      overlay: 'rgba(255,255,255,.92)',
      accent: 'var(--v-accent, #2563eb)',
      ok: '#059669',
      bad: '#dc2626',
      warn: '#d97706',
      idle: 'rgba(100,116,139,.5)',
      track: 'rgba(30,41,59,.1)',
    }

    /** Global interaction styles: hover/press/focus states that inline styles cannot express. */
    const CSS = `
.dshvps { font-variant-numeric: tabular-nums; }
.dshvps button { transition: filter .12s ease, transform .08s ease, box-shadow .12s ease; }
.dshvps button:hover:not(:disabled) { filter: brightness(.97); }
.dshvps button:active:not(:disabled) { transform: translateY(1px); filter: brightness(.94); }
.dshvps button:focus-visible { outline: 2px solid var(--v-accent, #2563eb); outline-offset: 2px; }
.dshvps button:disabled { opacity: .45; cursor: not-allowed; }
.dshvps input, .dshvps select, .dshvps textarea { transition: border-color .12s ease, box-shadow .12s ease; }
.dshvps input:focus, .dshvps select:focus, .dshvps textarea:focus { border-color: rgba(127,127,127,.55); box-shadow: 0 0 0 3px rgba(127,127,127,.13); }
.dshvps .vps-row { transition: background-color .1s ease, box-shadow .1s ease; }
.dshvps .vps-row:hover { background-color: rgba(127,127,127,.07); }
.dshvps .vps-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.dshvps .vps-scroll::-webkit-scrollbar-thumb { background: rgba(127,127,127,.25); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
.dshvps .vps-scroll::-webkit-scrollbar-thumb:hover { background: rgba(127,127,127,.4); background-clip: padding-box; border: 2px solid transparent; }
`

    /** Dashboard visual language (scoped under `.dshvps`). */
    const DASH_CSS = `
.dshvps{
  --v-surface: rgba(255,255,255,.62);
  --v-surface-2: rgba(255,255,255,.42);
  --v-border: rgba(255,255,255,.8);
  --v-border-strong: rgba(148,163,184,.45);
  --v-text:#1e293b;
  --v-muted:#64748b;
  --v-faint: rgba(100,116,139,.66);
  --v-accent:#2563eb;
  --v-accent-2:#38bdf8;
  --v-primary:linear-gradient(135deg,#2563eb,#38bdf8);
  --v-bg:linear-gradient(145deg,#eef3f9,#e2ebf7 60%,#e8f1fb);
  --v-ok:#059669; --v-warn:#d97706; --v-bad:#dc2626;
  --v-radius:16px;
  --v-shadow:0 8px 26px rgba(51,65,85,.09);
  --v-mono:ui-monospace,SFMono-Regular,Consolas,monospace;
  background: var(--v-bg);
  color: var(--v-text);
}
.dshvps[data-palette="slate"]{
  --v-accent:#334155;
  --v-accent-2:#64748b;
  --v-primary:linear-gradient(135deg,#334155,#64748b);
  --v-bg:linear-gradient(145deg,#f5f6f8,#e8ebef 60%,#f1f3f6);
}
.dshvps[data-palette="blue"]{
  --v-accent:#2563eb;
  --v-accent-2:#38bdf8;
  --v-primary:linear-gradient(135deg,#2563eb,#38bdf8);
  --v-bg:linear-gradient(145deg,#eef3f9,#e2ebf7 60%,#e8f1fb);
}
.dshvps .v-card,.dshvps .v-top,.dshvps .v-rail,.dshvps .v-tabs{
  backdrop-filter: blur(16px) saturate(1.08);
  -webkit-backdrop-filter: blur(16px) saturate(1.08);
}
.dshvps .v-btn.primary{background:var(--v-accent);border-color:transparent;color:#fff;box-shadow:none}
.dshvps .v-top{display:flex;align-items:center;gap:12px;padding:14px 20px;background:var(--v-surface);border-bottom:1px solid var(--v-border)}
.dshvps .v-brand{display:flex;align-items:center;gap:10px}
.dshvps .v-glyph{width:30px;height:30px;border-radius:9px;background:var(--v-text);color:var(--v-surface);display:grid;place-items:center;flex:none}
.dshvps .v-brand h1{margin:0;font-size:15px;font-weight:650;letter-spacing:-.01em}
.dshvps .v-brand p{margin:1px 0 0;font-size:11px;color:var(--v-muted)}
.dshvps .v-spacer{flex:1}
.dshvps .v-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;border:1px solid var(--v-border);background:var(--v-surface);color:var(--v-text);font:inherit;font-size:12px;font-weight:550;cursor:pointer;white-space:nowrap}
.dshvps .v-btn:not(.primary):hover{border-color:var(--v-border-strong);background:var(--v-surface-2)}
.dshvps .v-btn.primary:hover{background:var(--v-accent);filter:brightness(.96)}
.dshvps .v-btn.ghost{border-color:transparent;background:transparent;color:var(--v-muted)}
.dshvps .v-btn.ghost:hover{background:var(--v-surface-2);color:var(--v-text)}
.dshvps .v-shell{display:flex;flex:1;min-height:0}
.dshvps .v-rail{width:284px;flex:none;background:var(--v-surface);border-right:1px solid var(--v-border);display:flex;flex-direction:column;min-height:0}
.dshvps .v-rail-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--v-border)}
.dshvps .v-rail-head .count{font-size:11px;color:var(--v-muted)}
.dshvps .v-search{margin:12px 12px 6px;display:flex;align-items:center;gap:7px;height:32px;padding:0 10px;border:1px solid var(--v-border);border-radius:9px;background:var(--v-surface-2)}
.dshvps .v-search input{flex:1;border:0;background:transparent;outline:none;color:var(--v-text);font:inherit;font-size:12px}
.dshvps .v-hosts{padding:6px 10px 12px;overflow:auto;display:flex;flex-direction:column;gap:4px}
.dshvps .v-host{position:relative;display:flex;flex-direction:column;gap:5px;padding:10px 11px;border-radius:11px;cursor:pointer;border:1px solid transparent}
.dshvps .v-group{display:flex;align-items:center;gap:6px;margin:8px 10px 2px;padding:6px 9px;border-radius:8px;background:var(--v-surface-2);font-size:11.5px;font-weight:650;color:var(--v-text);cursor:pointer;user-select:none;letter-spacing:.02em}
.dshvps .v-group:hover{background:color-mix(in srgb, var(--v-accent) 7%, var(--v-surface-2))}
.dshvps .v-group .chev{color:var(--v-muted);font-size:10px;width:10px;text-align:center}
.dshvps .v-group .count{margin-left:auto;font-weight:500;color:var(--v-muted);font-size:10.5px;background:var(--v-surface);border:1px solid var(--v-border);border-radius:999px;padding:0 6px;line-height:16px}
.dshvps .v-host:hover{background:var(--v-surface-2)}
.dshvps .v-audit-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--v-border);font-size:11.5px;color:var(--v-text)}
.dshvps .v-audit-row:first-child{border-top:0}
.dshvps .v-audit-row:hover{background:var(--v-surface-2)}
.dshvps .v-host.active{background:color-mix(in srgb, var(--v-accent) 8%, transparent);border-color:color-mix(in srgb, var(--v-accent) 28%, transparent)}
.dshvps .v-host.active::before{content:"";position:absolute;left:-10px;top:12px;bottom:12px;width:3px;border-radius:3px;background:var(--v-accent)}
.dshvps .v-host-top{display:flex;align-items:center;gap:8px}
.dshvps .v-name{font-weight:600;font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshvps .v-meta{font-family:var(--v-mono);font-size:10.5px;color:var(--v-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshvps .v-identity{display:flex;align-items:center;gap:10px;padding:14px 20px;background:var(--v-surface);border-bottom:1px solid var(--v-border);flex-wrap:wrap}
.dshvps .v-identity h2{margin:0;font-size:17px;font-weight:650;letter-spacing:-.015em}
.dshvps .v-addr{font-family:var(--v-mono);font-size:11px;color:var(--v-muted)}
.dshvps .v-badge{font-size:10.5px;padding:2px 7px;border-radius:6px;border:1px solid var(--v-border);color:var(--v-muted);background:var(--v-surface-2);white-space:nowrap}
.dshvps .v-badge.ok{color:#0f7a37;border-color:#bbe6c8;background:#f0fbf3}
.dshvps .v-tabs{display:flex;gap:2px;padding:0 16px;background:var(--v-surface);border-bottom:1px solid var(--v-border);overflow-x:auto;box-shadow:inset 0 -1px 0 var(--v-border)}
.dshvps .v-tab{position:relative;height:40px;padding:0 14px;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--v-muted);cursor:pointer;background:none;border:0;font-family:inherit;white-space:nowrap;border-radius:9px 9px 0 0;transition:background-color .12s ease,color .12s ease}
.dshvps .v-tab svg{opacity:.75}
.dshvps .v-tab:hover{background:var(--v-surface-2);color:var(--v-text)}
.dshvps .v-tab.active{color:var(--v-accent);font-weight:650;background:color-mix(in srgb, var(--v-accent) 9%, transparent)}
.dshvps .v-tab.active svg{opacity:1}
.dshvps .v-tab.active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px 2px 0 0;background:var(--v-accent)}
.dshvps .v-content{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:16px}
.dshvps .v-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.dshvps .v-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.dshvps .v-card{background:var(--v-surface);border:1px solid var(--v-border);border-radius:var(--v-radius);box-shadow:var(--v-shadow);padding:16px;min-width:0}
.dshvps .v-label{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--v-muted);font-weight:550}
.dshvps .v-hero{display:flex;align-items:flex-end;gap:6px;margin-top:10px}
.dshvps .v-hero b{font-size:28px;line-height:1;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.dshvps .v-hero small{font-size:11px;color:var(--v-muted);padding-bottom:2px}
.dshvps .v-pill{margin-left:auto;font-size:10.5px;font-weight:600;padding:2px 6px;border-radius:5px;background:color-mix(in srgb, var(--v-ok) 12%, transparent);color:var(--v-ok)}
.dshvps .v-sub{margin-top:8px;font-size:10.5px;color:var(--v-faint);display:flex;justify-content:space-between;gap:8px}
.dshvps .v-ringcard{display:flex;align-items:center;gap:16px}
.dshvps .v-ring{position:relative;width:78px;height:78px;flex:none}
.dshvps .v-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}
.dshvps .v-ring b small{font-size:9px;font-weight:500;color:var(--v-faint);margin-left:1px}
.dshvps .v-ring .k{font-size:11px;color:var(--v-muted);font-weight:550}
.dshvps .v-ring .v{font-size:13px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.dshvps .v-ring .h{font-size:10.5px;color:var(--v-faint);margin-top:3px}
.dshvps .v-ringtext .k{font-size:11px;color:var(--v-muted);font-weight:550}
.dshvps .v-ringtext .v{font-size:13px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums}
.dshvps .v-ringtext .h{font-size:10.5px;color:var(--v-faint);margin-top:3px}
.dshvps .v-panel{background:var(--v-surface);border:1px solid var(--v-border);border-radius:var(--v-radius);box-shadow:var(--v-shadow);padding:16px 18px}
.dshvps .v-panel-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.dshvps .v-panel-head h3{margin:0;font-size:13px;font-weight:650}
.dshvps .v-panel-head .meta{font-size:10.5px;color:var(--v-faint)}
.dshvps .v-trend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.dshvps .v-trend .t-head{display:flex;justify-content:space-between;font-size:10.5px;color:var(--v-muted);margin-bottom:6px}
.dshvps .v-trend .t-head b{color:var(--v-text);font-weight:600}
.dshvps .v-alert{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:12px;background:color-mix(in srgb, var(--v-warn) 10%, transparent);border:1px solid color-mix(in srgb, var(--v-warn) 35%, transparent);color:var(--v-warn);font-size:12px}
.dshvps .v-alert b{font-weight:650}
.dshvps .v-hostcard{transition:box-shadow .15s ease, transform .15s ease, border-color .15s ease}
.dshvps .v-hostcard:hover{box-shadow:0 6px 20px rgba(16,24,40,.09);transform:translateY(-2px);border-color:var(--v-border-strong)}
@media (prefers-reduced-motion: reduce){.dshvps .v-hostcard:hover{transform:none}}
.dshvps [data-vrow]{transition:background-color .1s ease}
.dshvps [data-vrow]:hover{background:var(--v-surface-2)}
@media (max-width: 1180px){ .dshvps .v-grid4{grid-template-columns:repeat(2,minmax(0,1fr))} }
`

    /** 16px stroke icons used by the shell and tabs. */
    const ICONS = {
      constellation: [
        'M2.5 10L5.5 5.5L8.5 8.5L11 4',
        'M8.5 8.5L13.5 8',
        'M8.5 8.5L9 13',
        'M2.5 10h.01',
        'M5.5 5.5h.01',
        'M8.5 8.5h.01',
        'M11 4h.01',
        'M13.5 8h.01',
        'M9 13h.01',
      ],
      host: ['M2.2 2.6h11.6v4.5H2.2z', 'M2.2 8.9h11.6v4.5H2.2z', 'M4.4 4.9h.01', 'M4.4 11.2h.01'],
      plus: ['M8 3v10', 'M3 8h10'],
      batch: ['M3 8h10', 'M9 4l4 4-4 4'],
      external: ['M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2', 'M8 6.6a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z'],
      test: ['M2 8h2l1.5-3.5L8 12l1.5-4L11 8h3'],
      terminal: ['M2 3.5h12v9H2z', 'M4.5 7l2 1.5-2 1.5'],
      files: ['M2 4.5A1.5 1.5 0 013.5 3h3L8 5h4.5A1.5 1.5 0 0114 6.5v5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5z'],
      tunnels: ['M3 5h10', 'M3 8h10', 'M3 11h6'],
      system: ['M2.5 2.5h11v11h-11z', 'M5.5 6h5', 'M5.5 9h3'],
      audit: ['M8 3.2a4.8 4.8 0 100 9.6 4.8 4.8 0 000-9.6z', 'M8 5.6v2.8l1.8 1'],
      search: ['M7 3a4 4 0 100 8 4 4 0 000-8z', 'M10.2 10.2L14 14'],
      refresh: ['M13 8a5 5 0 11-1.6-3.7', 'M13 2.6V5h-2.4'],
      edit: ['M11.5 2.8l1.7 1.7-8 8L3 13l.5-2.2z'],
      import: ['M8 2v8', 'M5 7l3 3 3-3', 'M3 13h10'],
      key: ['M9.5 6.5a2.5 2.5 0 10-3.4 2.3L3 12v1.5h1.5l.8-.8h1.2v-1.2l.8-.8', 'M10.8 4.8h.01'],
    }

    /** Small line icon. */
    function Icon({ name, size }) {
      const paths = ICONS[name] || []
      return el('svg', { width: size || 15, height: size || 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        ...paths.map((d, index) => el('path', { key: index, d })))
    }

    const styles = {
      root: { display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0, color: C.text, fontSize: 12 },
      header: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: 'rgba(255,255,255,.5)' },
      title: { fontSize: 15, fontWeight: 650, letterSpacing: '-.01em' },
      subtitle: { fontSize: 11, color: C.muted },
      body: { display: 'flex', flex: 1, minHeight: 0 },
      hostList: { width: 284, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minWidth: 0, flexShrink: 0, background: 'rgba(255,255,255,.42)' },
      hostListCompact: { borderRight: 'none', borderBottom: `1px solid ${C.border}`, width: '100%', maxHeight: 200, flexShrink: 0 },
      search: { margin: '0 10px 8px', padding: '6px 9px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.6)', color: C.text, fontSize: 12, outline: 'none' },
      list: { overflow: 'auto', flex: 1, minHeight: 0, padding: '0 8px 8px' },
      row: (active) => ({
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderRadius: 9, marginBottom: 2,
        background: active ? 'color-mix(in srgb, var(--v-accent) 12%, transparent)' : 'transparent',
        boxShadow: active ? `inset 0 0 0 1px ${C.borderStrong}` : 'none',
      }),
      rowTitle: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 2 },
      rowName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
      rowMeta: { color: C.muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, Consolas, monospace' },
      dot: (state) => ({ width: 7, height: 7, borderRadius: 7, flexShrink: 0, background: state === 'ok' ? C.ok : state === 'bad' ? C.bad : C.idle }),
      main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 },
      detailHead: { padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 },
      detailTitleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      address: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, color: C.muted },
      tabs: { display: 'flex', gap: 4 },
      tab: (active) => ({
        padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, letterSpacing: '.01em',
        border: `1px solid ${active ? 'transparent' : C.border}`,
        background: active ? 'color-mix(in srgb, var(--v-accent) 12%, transparent)' : 'transparent',
        color: active ? C.accent : 'inherit',
        fontWeight: active ? 600 : 450,
        boxShadow: active ? '0 1px 3px rgba(0,0,0,.14)' : 'none',
      }),
      content: { flex: 1, minHeight: 0, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
      contentFlush: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 12, gap: 10 },
      empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, textAlign: 'center', padding: 24, lineHeight: 1.7 },
      statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
      metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
      card: {
        border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', background: C.card, minWidth: 0, boxSizing: 'border-box',
        boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 1px 1px rgba(0,0,0,.02)',
      },
      cardLabel: { color: C.muted, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 },
      statValue: { fontSize: 20, fontWeight: 650, lineHeight: 1.15, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      statUnit: { fontSize: 11, fontWeight: 500, color: C.muted, marginLeft: 2 },
      cardHint: { color: C.muted, fontSize: 11, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      metricHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
      metricValue: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      meter: { height: 4, borderRadius: 4, background: C.track, marginTop: 8, overflow: 'hidden' },
      meterFill: (pct) => ({ width: `${Math.min(100, Math.max(0, pct || 0))}%`, height: '100%', borderRadius: 4, background: pct >= 90 ? C.bad : pct >= 70 ? C.warn : C.ok }),
      segments: { display: 'flex', gap: 3, marginTop: 9 },
      segment: (on, tone) => ({ flex: 1, height: 4, borderRadius: 2, background: on ? tone : C.track }),
      sectionTitle: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 },
      diskRow: { display: 'flex', flexDirection: 'column', gap: 0 },
      term: {
        flex: 1, minHeight: 160, background: 'rgba(0,0,0,.55)', color: '#d6d6d6', fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 12, lineHeight: 1.45, padding: 10, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderRadius: 10, margin: 0,
      },
      input: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, padding: '7px 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.66)', color: C.text, outline: 'none', minWidth: 0 },
      field: { display: 'flex', flexDirection: 'column', gap: 5 },
      fieldLabel: { fontSize: 11, color: C.muted },
      button: (primary) => ({
        padding: '6px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 11.5, whiteSpace: 'nowrap',
        border: `1px solid ${primary ? 'transparent' : C.border}`,
        background: primary ? 'var(--v-accent)' : 'rgba(255,255,255,.55)',
        color: primary ? '#fff' : C.text,
        fontWeight: primary ? 550 : 500,
        boxShadow: 'none',
      }),
      toolbar: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
      table: { display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' },
      tableRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${C.border}` },
      err: { color: C.bad, fontSize: 11, wordBreak: 'break-word' },
      alertBar: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '6px 14px', borderBottom: `1px solid ${C.border}`, background: 'rgba(224,85,85,.12)', fontSize: 11 },
      sparkCard: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
      sparkMeta: { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10, color: C.muted },
      muted: { color: C.muted },
      badge: { fontSize: 10, padding: '1px 7px', borderRadius: 999, border: `1px solid ${C.border}`, color: C.muted, whiteSpace: 'nowrap' },
      badgeTone: (tone) => ({ fontSize: 10, padding: '1px 7px', borderRadius: 999, border: `1px solid ${tone}`, color: tone, whiteSpace: 'nowrap' }),
      overlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: 20 },
      dialog: { width: 460, maxWidth: '100%', maxHeight: '100%', overflow: 'auto', background: C.overlay, border: `1px solid ${C.borderStrong}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 24px 60px rgba(30,41,59,.22)', backdropFilter: 'blur(24px)' },
      dialogGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 },
    }

    /** Strip ANSI so a plain <pre> stays readable. */
    function stripAnsi(value) {
      return String(value)
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        .replace(/\r/g, '')
    }

    /** One JSON RPC round-trip; throws the host's message on `ok: false`. */
    async function rpc(body) {
      const response = await fetch(RPC_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      if (!payload.ok) throw new Error(payload.error || 'request failed')
      return payload
    }

    /** Country flag image (Windows has no flag-emoji glyphs, so use CDN images). */
    function Flag({ code }) {
      if (!code || !/^[A-Za-z]{2}$/.test(String(code))) return null
      return el('img', {
        src: `https://flagcdn.com/20x15/${String(code).toLowerCase()}.png`,
        width: 16,
        height: 12,
        alt: String(code).toUpperCase(),
        loading: 'lazy',
        style: { borderRadius: 2, objectFit: 'cover', verticalAlign: '-2px', marginRight: 4, flex: 'none' },
        onError: (event) => {
          event.target.style.display = 'none'
        },
      })
    }

    /** Human-readable byte count. */
    function fmtBytes(value) {
      const bytes = Number(value) || 0
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    /** Human-readable age from seconds. */
    function fmtUptime(seconds) {
      if (!seconds && seconds !== 0) return '—'
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      if (days > 0) return `${days}天${hours}小时`
      const minutes = Math.floor((seconds % 3600) / 60)
      return hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分`
    }

    /** Parse `YYYY-MM-DD` as a local date and return whole days from today. */
    function daysUntil(value) {
      if (!value) return undefined
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
      if (!match) return undefined
      const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      if (Number.isNaN(target.getTime())) return undefined
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      return Math.round((target.getTime() - start.getTime()) / 86400000)
    }

    /** Tone for a remaining-days count. */
    function expiryTone(days) {
      if (days === undefined) return C.muted
      if (days < 0) return C.bad
      if (days <= 14) return C.bad
      if (days <= 30) return C.warn
      return C.ok
    }

    /** Constellation glyph for the left rail: stars joined by faint edges. */
    function ServerGlyph({ size }) {
      const edge = size || 18
      const stars = [[2.5, 10.5], [5.6, 5.4], [8.6, 8.6], [11.2, 3.8], [13.6, 8.2], [9.1, 13.2]]
      return el(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.15,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        el('path', { d: 'M2.5 10.5L5.6 5.4L8.6 8.6L11.2 3.8', opacity: 0.55 }),
        el('path', { d: 'M8.6 8.6L13.6 8.2', opacity: 0.55 }),
        el('path', { d: 'M8.6 8.6L9.1 13.2', opacity: 0.55 }),
        ...stars.map(([x, y], index) => el('circle', { key: index, cx: x, cy: y, r: index === 2 ? 1.35 : 1.05, fill: 'currentColor', stroke: 'none' })),
      )
    }

    /** A Komari-style segmented bar: filled segments carry the severity tone. */
    function Segments({ ratio, tone, count }) {
      const total = count || 12
      const filled = Math.round(Math.max(0, Math.min(1, ratio == null ? 0 : ratio)) * total)
      return el(
        'div',
        { style: styles.segments },
        ...Array.from({ length: total }, (_, index) => el('span', { key: index, style: styles.segment(index < filled, tone) })),
      )
    }

    /** Small headline figure: the three numbers Komari leads with. */
    function StatCard({ label, value, unit, hint, tone, children }) {
      return el(
        'div',
        { style: styles.card },
        el('div', { style: styles.cardLabel }, label),
        el('div', { style: { ...styles.statValue, color: tone || C.text } },
          String(value),
          unit ? el('span', { style: styles.statUnit }, unit) : null),
        children || null,
        hint ? el('div', { style: styles.cardHint }, hint) : null,
      )
    }

    /** Usage metric with a thin meter, the workhorse card of the panel. */
    function Metric({ label, value, pct, hint, tone }) {
      return el(
        'div',
        { style: styles.card },
        el('div', { style: styles.metricHead },
          el('span', { style: { ...styles.cardLabel, marginBottom: 0 } }, label),
          pct != null ? el('span', { style: { ...styles.muted, fontSize: 11, fontWeight: 600 } }, `${pct}%`) : null),
        el('div', { style: styles.metricValue, title: value }, value),
        pct != null ? el('div', { style: styles.meter }, el('div', { style: styles.meterFill(pct) })) : null,
        hint ? el('div', { style: styles.cardHint, title: hint }, hint) : null,
      )
    }

    /** One normalized (0–100) sparkline over the sampled window. */
    function Spark({ values, tone }) {
      const points = (values || []).filter((value) => typeof value === 'number' && Number.isFinite(value))
      if (points.length < 2) return el('div', { style: { ...styles.muted, fontSize: 11, padding: '6px 0' } }, '采样中…')
      const step = 100 / (points.length - 1)
      const path = points
        .map((value, index) => `${(index * step).toFixed(2)},${(100 - Math.min(100, Math.max(0, value))).toFixed(2)}`)
        .join(' ')
      return el(
        'svg',
        { viewBox: '0 0 100 100', preserveAspectRatio: 'none', style: { width: '100%', height: 30, display: 'block' } },
        el('polyline', { points: path, fill: 'none', stroke: tone, strokeWidth: 2, vectorEffect: 'non-scaling-stroke' }),
      )
    }

    /** Three sparklines for the last hour, fed by the background sampler. */
    function HistoryCards({ host }) {
      const [history, setHistory] = useState(undefined)
      const busyRef = useRef(false)
      useEffect(() => {
        let cancelled = false
        const load = async () => {
          if (busyRef.current) return
          busyRef.current = true
          try {
            const payload = await rpc({ op: 'history', host, minutes: 60 })
            if (!cancelled) setHistory(payload)
          } catch {
          } finally {
            busyRef.current = false
          }
        }
        load()
        const timer = setInterval(load, 60000)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [host])

      if (!history) return null
      const rows = [
        ['CPU', 'cpu', C.accent],
        ['内存', 'mem', C.warn],
        ['磁盘', 'disk', C.ok],
      ]
      return el(
        'div',
        { style: styles.card },
        el(
          'div',
          { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 } },
          el('span', { style: styles.cardLabel }, '最近 1 小时'),
          el('span', { style: { ...styles.muted, fontSize: 10 } }, history.samples ? `${history.samples} 个采样${history.offline ? ` · ${history.offline} 次不可达` : ''}` : '采样器每 30s 一轮，稍等'),
        ),
        el(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 } },
          ...rows.map(([label, key, tone]) =>
            el(
              'div',
              { key, style: styles.sparkCard },
              el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11 } },
                el('span', null, label),
                el('span', { style: styles.muted }, history.summary && history.summary[key] ? `avg ${history.summary[key].avg}%` : '—')),
              el(Spark, { values: (history.series || []).map((row) => row[key]), tone }),
              history.summary && history.summary[key]
                ? el('div', { style: styles.sparkMeta },
                    el('span', null, `min ${history.summary[key].min}`),
                    el('span', null, `max ${history.summary[key].max}`))
                : null,
            )),
        ),
      )
    }

    /** Newest audit records for one host. */
    function AuditView({ host }) {
      const [records, setRecords] = useState([])
      const [error, setError] = useState(undefined)
      const load = useCallback(async () => {
        try {
          const payload = await rpc({ op: 'audit', host, limit: 200 })
          setRecords(payload.records || [])
          setError(undefined)
        } catch (err) {
          setError(err.message)
        }
      }, [host])
      useEffect(() => {
        load()
      }, [load])
      const describe = (row) => row.command || row.message || row.remotePath || row.localPath || row.tunnelId || row.sessionId || ''
      return el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 } },
        el('div', { style: styles.toolbar },
          el('span', { style: styles.muted }, `${records.length} 条记录（审计文件轮转上限 2 MiB）`),
          el('span', { style: { flex: 1 } }),
          el('button', { style: styles.button(false), onClick: load }, '刷新')),
        error ? el('div', { style: styles.err }, error) : null,
        el('div', { className: 'v-card', style: { padding: 0, overflow: 'auto', flex: 1, minHeight: 0 } },
          records.length === 0
            ? el('div', { style: { padding: 12, ...styles.muted } }, '还没有记录。')
            : records.map((row, index) =>
                el('div', { key: `${row.ts}-${index}`, className: 'v-audit-row' },
                  el('span', { style: { ...styles.muted, width: 140, flexShrink: 0 } }, new Date(row.ts).toLocaleString()),
                  el('span', { className: 'v-badge', style: { flexShrink: 0 } }, row.action),
                  el('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11 }, title: describe(row) }, describe(row)),
                  row.exitCode != null
                    ? el('span', { className: 'v-badge', style: { flexShrink: 0, color: row.exitCode === 0 ? C.ok : C.bad } }, `exit ${row.exitCode}`)
                    : null,
                )),
        ),
      )
    }

    /** Host list plus search; shared by the page and the compact side panel. */
    function HostList({ hosts, selected, onSelect, onOverview, showOverview, t, compact, countries, onAdd, onImport, onImportJson, onExport, onRefresh, onError, busy }) {
      const [query, setQuery] = useState('')
      const [menuOpen, setMenuOpen] = useState(false)
      const [collapsed, setCollapsed] = useState([])
      const fileRef = useRef(undefined)
      const menuItem = (label, run) =>
        el('button', {
          style: { textAlign: 'left', padding: '7px 10px', border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 12, borderRadius: 7, fontFamily: 'inherit' },
          onClick: () => {
            setMenuOpen(false)
            run()
          },
        }, label)
      const needle = query.trim().toLowerCase()
      const visible = needle
        ? hosts.filter((host) => `${host.label} ${host.id} ${host.host} ${(host.tags || []).join(' ')}`.toLowerCase().includes(needle))
        : hosts
      const ordered = visible
        .slice()
        .sort((left, right) => ((left.tags && left.tags[0]) || '~').localeCompare((right.tags && right.tags[0]) || '~'))
      return el(
        'div',
        { style: Object.assign({}, styles.hostList, compact ? styles.hostListCompact : null) },
        el(
          'div',
          { style: Object.assign({}, styles.toolbar, { padding: compact ? '6px 8px' : '8px 10px' }) },
          el('span', { style: styles.subtitle }, `${hosts.length} 台`),
          el('span', { style: { flex: 1 } }),
          el('button', { style: styles.button(true), onClick: onAdd, title: t('addHost') }, '添加'),
          el('div', { style: { position: 'relative' } },
            el('button', {
              style: styles.button(false),
              onClick: () => setMenuOpen((value) => !value),
              title: '更多操作',
              'aria-label': '更多操作',
              'aria-haspopup': 'menu',
              'aria-expanded': menuOpen ? 'true' : 'false',
            }, '⋯'),
            menuOpen
              ? el('div', {
                  style: {
                    position: 'absolute', right: 0, top: '115%', zIndex: 30, minWidth: 176, background: C.overlay,
                    border: `1px solid ${C.borderStrong}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.3)', padding: 4,
                    display: 'flex', flexDirection: 'column',
                  },
                },
                  el('div', { style: { padding: '5px 10px 3px', fontSize: 10, color: C.muted, letterSpacing: '.04em' } }, '清单'),
                  menuItem('导入 SSH 配置', onImport),
                  onImportJson ? menuItem('导入清单 JSON', () => fileRef.current && fileRef.current.click()) : null,
                  onExport ? menuItem('导出清单', onExport) : null)
              : null,
            el('input', {
              ref: fileRef, type: 'file', accept: '.json', style: { display: 'none' },
              onChange: async (event) => {
                const file = event.target.files && event.target.files[0]
                if (!file) return
                try {
                  onImportJson(JSON.parse(await file.text()))
                } catch (err) {
                  if (onError) onError(err.message)
                } finally {
                  event.target.value = ''
                }
              },
            })),
          el('button', { style: styles.button(false), onClick: onRefresh, disabled: busy, title: t('refresh') }, '刷新'),
        ),
        el('input', {
          style: styles.search,
          value: query,
          placeholder: t('search'),
          onChange: (event) => setQuery(event.target.value),
        }),
        onOverview
          ? el('div', {
              className: `v-host${showOverview ? ' active' : ''}`,
              onClick: onOverview,
              style: { margin: '0 10px 4px' },
            },
              el('span', { style: { width: 7, height: 7, borderRadius: 7, flex: 'none', background: C.accent } }),
              el('span', { className: 'v-name' }, '总览'),
              el('span', { className: 'v-badge' }, `${hosts.length} 台`))
          : null,
        el(
          'div',
          { style: styles.list },
          visible.length === 0
            ? el('div', { style: { padding: 12, color: C.muted, lineHeight: 1.7 } }, hosts.length ? '没有匹配的主机' : t('empty'))
            : ordered.flatMap((host, index) => {
                const days = daysUntil(host.expiresAt)
                const tag = (host.tags && host.tags[0]) || '未分组'
                const previousTag = index > 0 ? ((ordered[index - 1].tags && ordered[index - 1].tags[0]) || '未分组') : undefined
                const header = tag !== previousTag
                  ? el('div', {
                      key: `group-${tag}`,
                      className: 'v-group',
                      onClick: () => setCollapsed((list) => (list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag])),
                    },
                      el('span', { className: 'chev' }, collapsed.includes(tag) ? '▸' : '▾'),
                      el('span', null, tag),
                      el('span', { className: 'count' }, String(ordered.filter((item) => ((item.tags && item.tags[0]) || '未分组') === tag).length)))
                  : null
                if (collapsed.includes(tag)) return header ? [header] : []
                return [
                  header,
                  el(
                  'div',
                  { key: host.id, className: `v-host${host.id === selected ? ' active' : ''}`, onClick: () => onSelect(host.id) },
                  el('span', { style: styles.dot('idle') }),
                  el(
                    'span',
                    { style: styles.rowTitle },
                    el('span', { style: styles.rowName },
                      countries && countries[host.id] ? el(Flag, { code: countries[host.id] }) : null,
                      host.label || host.id),
                    el('span', { style: styles.rowMeta }, `${host.user || 'root'}@${host.host}${host.port && host.port !== 22 ? `:${host.port}` : ''}`),
                    (host.tags || []).length
                      ? el('span', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 } },
                          ...(host.tags || []).slice(0, 3).map((tag) => el('span', { key: tag, className: 'v-badge', style: { fontSize: 9.5, padding: '0 5px' } }, tag)))
                      : null,
                  ),
                  host.readonly ? el('span', { style: styles.badge }, t('readonly')) : null,
                  days !== undefined && days <= 30
                    ? el('span', { style: styles.badgeTone(expiryTone(days)) }, days < 0 ? '已过期' : `${days}天`)
                    : null,
                ),
                ]
              }),
        ),
      )
    }

    /** Dashboard: headline cards, ring meters, trend panel, disk/facts panels. */
    function StatusView({ record, compact, live }) {
      const [status, setStatus] = useState(undefined)
      const [error, setError] = useState(undefined)
      const [latency, setLatency] = useState(undefined)
      const [latencyError, setLatencyError] = useState(undefined)
      const [history, setHistory] = useState(undefined)
      const [three, setThree] = useState(undefined)
      const [probeTick, setProbeTick] = useState(0)
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

      useEffect(() => {
        let cancelled = false
        const load = async () => {
          try {
            const payload = await rpc({ op: 'threeNet', host: record.id })
            if (!cancelled) setThree(payload)
          } catch {}
        }
        if (probeTick > 0) load()
        return () => {
          cancelled = true
        }
      }, [record.id, probeTick])

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
      const loopback = /^(127\.|localhost$|::1$)/i.test(String(record.host || ''))
      const proxied = avgMs != null && avgMs < 3 && !loopback
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
          hero('延迟', 'test', proxied ? '—' : avgMs == null ? '—' : avgMs, proxied || avgMs == null ? '' : 'ms',
            avgMs == null ? null : proxied ? '经本地代理' : avgMs < 80 ? '稳定' : avgMs < 180 ? '偏高' : '很差',
            proxied ? '本机流量经代理，真实 RTT 请看下方「三网」' : latency ? `最低 ${latency.minMs ?? '—'} · 最高 ${latency.maxMs ?? '—'}` : latencyError || '测量中…',
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
                el('div', { className: 'v-panel' },
          el('div', { className: 'v-panel-head' },
            el(Icon, { name: 'external', size: 14 }),
            el('h3', null, '三网延迟'),
            el('span', { className: 'meta' }, '服务器出网 · 后台每 5 分钟'),
            el('div', { className: 'v-spacer' }),
            el('button', { className: 'v-btn', onClick: () => setProbeTick((value) => value + 1) }, '立即探测')),
          el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 } },
            ...(three && three.rows && three.rows.length && three.host === record.id
              ? three.rows
              : live && live.three && live.three.length
                ? live.three
                : [
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
              ...[['累计流量', live && live.traffic ? fmtBytes(live.traffic.total) : '—'], ['接收', fmtBytes(net.rxBytes)], ['发送', fmtBytes(net.txBytes)], ['容器', status.docker && status.docker.running != null ? status.docker.running : '—'], ['失败单元', failed.length]]
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

    /** Lazily loaded xterm chunk; the entry stays small until a terminal opens. */
    let LazyTerminalBody
    function getTerminalBody() {
      if (!LazyTerminalBody) {
        if (typeof react.lazy !== 'function' || typeof require.async !== 'function') {
          throw new Error('当前客户端不支持懒加载终端模块')
        }
        LazyTerminalBody = react.lazy(async () => ({ default: (await require.async('./client.terminal.js')).TerminalBody }))
      }
      return LazyTerminalBody
    }

    /** Keeps a failed lazy chunk from blanking the whole panel. */
    class TerminalBoundary extends react.Component {
      constructor(props) {
        super(props)
        this.state = { error: undefined }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      render() {
        if (this.state.error) return el('div', { style: styles.err, padding: 12 }, `终端加载失败：${this.state.error.message}`)
        return this.props.children
      }
    }

    /** Terminal tab: real xterm emulation, loaded on demand. */
    function TerminalView({ host }) {
      let Body
      try {
        Body = getTerminalBody()
      } catch (err) {
        return el('div', { style: styles.err }, `终端模块不可用：${err.message}`)
      }
      return el(
        TerminalBoundary,
        null,
        el(
          react.Suspense,
          { fallback: el('div', { style: { ...styles.muted, padding: 12 } }, '加载终端…') },
          el(Body, { host }),
        ),
      )
    }

    /** Remote directory browser with upload and download. */
    function FilesView({ host }) {
      const [path, setPath] = useState('.')
      const [entries, setEntries] = useState([])
      const [error, setError] = useState(undefined)
      const [busy, setBusy] = useState(false)
      const [editing, setEditing] = useState(undefined)
      const fileRef = useRef(undefined)

      const load = useCallback(async (target) => {
        setBusy(true)
        try {
          const payload = await rpc({ op: 'listDir', host, path: target })
          const sorted = (payload.entries || []).slice().sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || String(a.name).localeCompare(String(b.name)))
          setEntries(sorted)
          setPath(target)
          setError(undefined)
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }, [host])

      useEffect(() => {
        load('.')
      }, [load])

      const join = (name) => (path.endsWith('/') ? `${path}${name}` : `${path}/${name}`)
      const parent = () => {
        const trimmed = path.replace(/\/+$/, '')
        const cut = trimmed.lastIndexOf('/')
        return cut <= 0 ? '/' : trimmed.slice(0, cut)
      }
      const upload = async (file) => {
        if (!file) return
        setBusy(true)
        try {
          const target = join(file.name)
          const response = await fetch(`${UPLOAD_PATH}?host=${encodeURIComponent(host)}&path=${encodeURIComponent(target)}`, { method: 'POST', body: file })
          const payload = await response.json()
          if (!payload.ok) throw new Error(payload.error)
          await load(path)
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
          if (fileRef.current) fileRef.current.value = ''
        }
      }

      const openEdit = async (entry) => {
        const target = join(entry.name)
        try {
          const payload = await rpc({ op: 'readFile', host, path: target })
          setEditing({ path: target, text: payload.text })
        } catch (err) {
          setError(err.message)
        }
      }
      const saveEdit = async () => {
        if (!editing) return
        try {
          await rpc({ op: 'writeFile', host, path: editing.path, text: editing.text })
          setEditing(undefined)
          await load(path)
        } catch (err) {
          setError(err.message)
        }
      }
      const rename = async (entry) => {
        const next = window.prompt(`把 ${entry.name} 改名为：`, entry.name)
        if (!next || next === entry.name) return
        try {
          await rpc({ op: 'renameFile', host, from: join(entry.name), to: join(next) })
          await load(path)
        } catch (err) {
          setError(err.message)
        }
      }
      const remove = async (entry) => {
        if (!window.confirm(`删除 ${entry.name}？${entry.isDirectory ? '（仅空目录）' : ''}`)) return
        try {
          await rpc({ op: 'removeFile', host, path: join(entry.name) })
          await load(path)
        } catch (err) {
          setError(err.message)
        }
      }
      const chmod = async (entry) => {
        const mode = window.prompt('权限（八进制，例如 644）', '644')
        if (!mode) return
        try {
          await rpc({ op: 'chmodFile', host, path: join(entry.name), mode: parseInt(mode, 8) })
          await load(path)
        } catch (err) {
          setError(err.message)
        }
      }

      return el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 } },
        el(
          'div',
          { style: styles.toolbar },
          el('button', { style: styles.button(false), onClick: parent }, '上级'),
          el('span', { style: { ...styles.address, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, path),
          el('button', { style: styles.button(false), onClick: () => load(path), disabled: busy }, '刷新'),
          el('button', { style: styles.button(true), onClick: () => fileRef.current?.click(), disabled: busy }, '上传'),
          el('input', { ref: fileRef, type: 'file', style: { display: 'none' }, onChange: (event) => upload(event.target.files && event.target.files[0]) }),
        ),
        error ? el('div', { style: styles.err }, error) : null,
        el(
          'div',
          { style: { ...styles.table, overflow: 'auto', flex: 1, minHeight: 0 } },
          entries.length === 0
            ? el('div', { style: { padding: 12, ...styles.muted } }, busy ? '读取中…' : '空目录')
            : entries.map((entry) =>
                el(
                  'div',
                  { key: entry.name, className: 'vps-row', style: styles.tableRow },
                  el('span', { style: { width: 18 } }, entry.isDirectory ? '📁' : '📄'),
                  el('span', {
                    style: { flex: 1, cursor: entry.isDirectory ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                    onClick: () => entry.isDirectory && load(join(entry.name)),
                    title: entry.name,
                  }, entry.name),
                  el('span', { style: { ...styles.muted, flexShrink: 0 } }, entry.isDirectory ? '' : fmtBytes(entry.size)),
                  entry.isDirectory ? null : el('button', { style: styles.button(false), onClick: () => openEdit(entry) }, '编辑'),
                  el('button', { style: styles.button(false), onClick: () => rename(entry) }, '改名'),
                  el('button', { style: styles.button(false), onClick: () => chmod(entry) }, '权限'),
                  el('button', { style: styles.button(false), onClick: () => remove(entry) }, '删除'),
                  entry.isDirectory
                    ? null
                    : el('a', {
                        style: { flexShrink: 0, color: C.accent, textDecoration: 'none' },
                        href: `${DOWNLOAD_PATH}?host=${encodeURIComponent(host)}&path=${encodeURIComponent(join(entry.name))}`,
                      }, '下载'),
                ),
              ),
        ),
        editing
          ? el(
              'div',
              { style: styles.overlay },
              el(
                'div',
                { style: { ...styles.dialog, width: 640 } },
                el('div', { style: styles.title }, `编辑 ${editing.path}`),
                el('textarea', {
                  style: { ...styles.input, minHeight: 260, fontFamily: 'ui-monospace, Consolas, monospace', resize: 'vertical' },
                  value: editing.text,
                  onChange: (event) => setEditing({ ...editing, text: event.target.value }),
                }),
                el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 6 } },
                  el('button', { style: styles.button(false), onClick: () => setEditing(undefined) }, '取消'),
                  el('button', { style: styles.button(true), onClick: saveEdit }, '保存')),
              ),
            )
          : null,
      )
    }

    /** Fixed read-only system probes: services, containers, sockets, inodes. */
    function InspectView({ host }) {
      const [what, setWhat] = useState('services')
      const [data, setData] = useState(undefined)
      const [error, setError] = useState(undefined)
      const load = useCallback(async (kind) => {
        setWhat(kind)
        setData(undefined)
        try {
          const payload = await rpc({ op: 'inspect', host, what: kind })
          setData(payload)
          setError(undefined)
        } catch (err) {
          setError(err.message)
        }
      }, [host])
      useEffect(() => {
        load('services')
      }, [load])
      const tabs = [
        ['services', '服务'],
        ['docker', '容器'],
        ['ports', '端口'],
        ['inode', 'inode'],
      ]
      return el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 } },
        el('div', { style: styles.toolbar },
          ...tabs.map(([key, label]) => el('button', { key, style: styles.tab(what === key), onClick: () => load(key) }, label)),
          el('span', { style: { flex: 1 } }),
          el('button', { style: styles.button(false), onClick: () => load(what) }, '刷新')),
        error ? el('div', { style: styles.err }, error) : null,
        el('pre', { style: { ...styles.term, flex: 1, minHeight: 0 } }, data ? data.text : '读取中…'),
      )
    }

    /** Tunnel table with open/close. */
    function TunnelsView({ host }) {
      const [tunnels, setTunnels] = useState([])
      const [error, setError] = useState(undefined)
      const [restore, setRestore] = useState(undefined)
      const [kind, setKind] = useState('local')
      const [localPort, setLocalPort] = useState('')
      const [remotePort, setRemotePort] = useState('')
      const [remoteHost, setRemoteHost] = useState('127.0.0.1')

      const load = useCallback(async () => {
        try {
          const payload = await rpc({ op: 'tunnels' })
          setTunnels(payload.tunnels || [])
          setError(undefined)
        } catch (err) {
          setError(err.message)
        }
      }, [])

      useEffect(() => {
        load()
        const timer = setInterval(load, 4000)
        return () => clearInterval(timer)
      }, [load])

      const open = async () => {
        try {
          const options = { host, kind, localPort: Number(localPort) }
          if (kind !== 'dynamic') {
            options.remoteHost = remoteHost || '127.0.0.1'
            options.remotePort = Number(remotePort)
          }
          if (kind === 'remote') {
            options.remotePort = Number(remotePort)
            options.localPort = Number(localPort)
          }
          await rpc({ op: 'tunnelOpen', options })
          setLocalPort('')
          setRemotePort('')
          await load()
        } catch (err) {
          setError(err.message)
        }
      }

      return el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 } },
        el(
          'div',
          { style: styles.toolbar },
          el('select', {
            style: { ...styles.input, width: 130 },
            value: kind,
            onChange: (event) => setKind(event.target.value),
          },
            el('option', { value: 'local' }, '本地转发'),
            el('option', { value: 'remote' }, '远程转发'),
            el('option', { value: 'dynamic' }, 'SOCKS5'),
          ),
          el('input', { style: { ...styles.input, width: 96 }, placeholder: '本地端口', value: localPort, inputMode: 'numeric', onChange: (event) => setLocalPort(event.target.value) }),
          el('span', { style: styles.muted }, '→'),
          kind === 'dynamic'
            ? el('span', { style: styles.muted }, 'SOCKS5')
            : el('input', { style: { ...styles.input, width: 150 }, placeholder: '远端地址:端口', value: remoteHost, onChange: (event) => setRemoteHost(event.target.value) }),
          kind === 'dynamic'
            ? null
            : el('input', { style: { ...styles.input, width: 80 }, placeholder: '端口', value: remotePort, inputMode: 'numeric', onChange: (event) => setRemotePort(event.target.value) }),
          el('button', { style: styles.button(true), onClick: open, disabled: !localPort || (kind !== 'dynamic' && !remotePort) }, '建立'),
          el('button', {
            style: styles.button(false),
            onClick: async () => {
              try {
                const payload = await rpc({ op: 'tunnelsRestore' })
                setRestore(payload)
                await load()
              } catch (err) {
                setError(err.message)
              }
            },
          }, '恢复上次'),
        ),
        restore
          ? el('div', { style: styles.muted },
              `恢复 ${restore.attempted} 条：成功 ${restore.results.filter((row) => row.ok).length}，失败 ${restore.results.filter((row) => !row.ok).length}`)
          : null,
        error ? el('div', { style: styles.err }, error) : null,
        el(
          'div',
          { style: { ...styles.table, overflow: 'auto', flex: 1, minHeight: 0 } },
          tunnels.length === 0
            ? el('div', { style: { padding: 12, ...styles.muted } }, '还没有隧道。上面的表单只会监听 127.0.0.1。')
            : tunnels.map((tunnel) =>
                el(
                  'div',
                  { key: tunnel.tunnelId, style: styles.tableRow },
                  el('span', { style: styles.dot('ok') }),
                  el('span', { style: { flex: 1, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    `${tunnel.listen} → ${tunnel.target}`),
                  el('span', { style: styles.muted }, tunnel.host),
                  el('button', {
                    style: styles.button(false),
                    onClick: async () => {
                      try {
                        await rpc({ op: 'tunnelClose', id: tunnel.tunnelId })
                        await load()
                      } catch (err) {
                        setError(err.message)
                      }
                    },
                  }, '关闭'),
                ),
              ),
        ),
      )
    }

    /** Saved command snippets, shared by the terminal and the batch dialog. */
    function useSnippets() {
      const [snippets, setSnippets] = useState([])
      const reload = useCallback(async () => {
        try {
          const payload = await rpc({ op: 'snippets' })
          setSnippets(payload.snippets || [])
        } catch {}
      }, [])
      useEffect(() => {
        reload()
      }, [reload])
      return { snippets, reload }
    }

    /** Snippet picker + inline save for one command box. */
    function SnippetBar({ command, onPick }) {
      const { snippets, reload } = useSnippets()
      const [selected, setSelected] = useState('')
      const [naming, setNaming] = useState(false)
      const [name, setName] = useState('')
      const [error, setError] = useState(undefined)

      const pick = (event) => {
        const id = event.target.value
        setSelected(id)
        const snippet = snippets.find((entry) => entry.id === id)
        if (snippet) onPick(snippet.command)
      }
      const save = async () => {
        const text = String(command || '').trim()
        if (!text) {
          setError('先输入命令再保存')
          return
        }
        try {
          await rpc({ op: 'snippetSave', snippet: { name: name.trim() || text.split('\n')[0].slice(0, 40), command: text } })
          setName('')
          setNaming(false)
          setError(undefined)
          await reload()
        } catch (err) {
          setError(err.message)
        }
      }
      const remove = async () => {
        if (!selected) return
        try {
          await rpc({ op: 'snippetRemove', id: selected })
          setSelected('')
          await reload()
        } catch (err) {
          setError(err.message)
        }
      }

      return el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        el(
          'div',
          { style: styles.toolbar },
          el('select', { style: { ...styles.input, width: 180 }, value: selected, onChange: pick },
            el('option', { value: '' }, snippets.length ? '片段…' : '还没有片段'),
            ...snippets.map((snippet) => el('option', { key: snippet.id, value: snippet.id }, snippet.name))),
          el('button', { style: styles.button(false), onClick: remove, disabled: !selected }, '删除片段'),
          el('span', { style: { flex: 1 } }),
          naming
            ? [
                el('input', { key: 'name', style: { ...styles.input, width: 160 }, value: name, placeholder: '片段名', onChange: (event) => setName(event.target.value) }),
                el('button', { key: 'ok', style: styles.button(true), onClick: save }, '保存'),
                el('button', { key: 'cancel', style: styles.button(false), onClick: () => { setNaming(false); setError(undefined) } }, '取消'),
              ]
            : el('button', { style: styles.button(false), onClick: () => setNaming(true) }, '存为片段'),
        ),
        error ? el('div', { style: styles.err }, error) : null,
      )
    }

    /** Run one command across several hosts and show per-host results. */
    function BatchDialog({ hosts, initialSelected, onDone }) {
      const [selected, setSelected] = useState(() => new Set(initialSelected && initialSelected.length ? initialSelected : hosts.map((host) => host.id)))
      const [command, setCommand] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const [result, setResult] = useState(undefined)
      const [concurrency, setConcurrency] = useState('4')
      const { snippets } = useSnippets()

      const tags = [...new Set(hosts.flatMap((host) => host.tags || []))]
      const toggle = (id) => {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelected(next)
      }
      const pickTag = (tag) => {
        setSelected(new Set(hosts.filter((host) => (host.tags || []).includes(tag)).map((host) => host.id)))
      }
      const run = async () => {
        if (!selected.size) {
          setError('至少选一台主机')
          return
        }
        if (!command.trim()) {
          setError('命令不能为空')
          return
        }
        setBusy(true)
        setError(undefined)
        try {
          const payload = await rpc({ op: 'batch', hosts: [...selected], command, options: { concurrency: Number(concurrency) || 4 } })
          setResult(payload)
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }

      return el(
        'div',
        { style: styles.overlay, onMouseDown: (event) => { if (event.target === event.currentTarget) onDone() } },
        el(
          'div',
          { style: { ...styles.dialog, width: 720 } },
          el('div', { style: styles.title }, '批量执行'),
          el('div', { style: styles.toolbar },
            el('span', { style: styles.fieldLabel }, `已选 ${selected.size}/${hosts.length}`),
            el('button', { style: styles.button(false), onClick: () => setSelected(new Set(hosts.map((host) => host.id))) }, '全选'),
            el('button', { style: styles.button(false), onClick: () => setSelected(new Set()) }, '清空'),
            ...tags.map((tag) => el('button', { key: tag, style: styles.button(false), onClick: () => pickTag(tag) }, `#${tag}`)),
          ),
          el('div', { style: { ...styles.table, maxHeight: 150, overflow: 'auto' } },
            ...hosts.map((host) =>
              el('label', { key: host.id, style: { ...styles.tableRow, cursor: 'pointer' } },
                el('input', { type: 'checkbox', checked: selected.has(host.id), onChange: () => toggle(host.id) }),
                el('span', { style: { flex: 1 } }, host.label || host.id),
                el('span', { style: { ...styles.muted, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11 } }, `${host.user}@${host.host}`),
                host.readonly ? el('span', { style: styles.badge }, '只读') : null)),
          ),
          el('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
            el('textarea', {
              style: { ...styles.input, flex: 1, minHeight: 64, resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace' },
              value: command,
              placeholder: '在选中的主机上并行执行的命令，例如 df -h / 或 systemctl is-active nginx',
              onChange: (event) => setCommand(event.target.value),
            }),
            el('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, width: 130 } },
              el('select', { style: styles.input, onChange: (event) => { const hit = snippets.find((s) => s.id === event.target.value); if (hit) setCommand(hit.command) } },
                el('option', { value: '' }, '插入片段…'),
                ...snippets.map((snippet) => el('option', { key: snippet.id, value: snippet.id }, snippet.name))),
              el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '并发'), el('input', { style: styles.input, value: concurrency, inputMode: 'numeric', onChange: (event) => setConcurrency(event.target.value) })),
              el('button', { style: styles.button(true), onClick: run, disabled: busy }, busy ? '执行中…' : '执行'))),
          error ? el('div', { style: styles.err }, error) : null,
          result
            ? el('div', { style: { ...styles.table, maxHeight: 260, overflow: 'auto' } },
                ...result.results.map((row) =>
                  el('div', { key: row.host, style: { ...styles.tableRow, flexDirection: 'column', alignItems: 'stretch', gap: 4 } },
                    el('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                      el('span', { style: styles.dot(row.ok ? 'ok' : 'bad') }),
                      el('span', { style: { fontWeight: 600 } }, row.host),
                      el('span', { style: styles.muted }, row.error ? 'error' : `exit=${row.exitCode} ${row.durationMs}ms`),
                      el('span', { style: { flex: 1 } }),
                      el('span', { style: { ...styles.muted, fontSize: 11 } }, row.timedOut ? '超时' : row.truncated ? '已截断' : '')),
                    row.error
                      ? el('div', { style: styles.err }, row.error)
                      : el('pre', { style: { ...styles.term, minHeight: 0, maxHeight: 140, margin: 0, padding: 6, fontSize: 11 } },
                          [row.stdout, row.stderr ? `[stderr] ${row.stderr}` : ''].filter(Boolean).join('\n') || '(无输出)'))))
            : null,
          el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 6 } },
            el('button', { style: styles.button(false), onClick: onDone }, '关闭')),
        ),
      )
    }

    /** Panel settings + inventory backup/restore. */
    function SettingsDialog({ onDone, onSaved, onOpenMonitors }) {
      const [form, setForm] = useState(undefined)
      const [error, setError] = useState(undefined)
      const [note, setNote] = useState(undefined)
      const [busy, setBusy] = useState(false)
      const fileRef = useRef(undefined)

      useEffect(() => {
        rpc({ op: 'settings' })
          .then((payload) => {
            const settings = payload.settings || {}
            const thresholds = settings.alertThresholds || {}
            setForm({
              metricsIntervalMs: String(settings.metricsIntervalMs ?? 30000),
              overviewRefreshMs: String(settings.overviewRefreshMs ?? 15000),
              palette: (settings.appearance && settings.appearance.palette) || 'blue',
              memPct: String(thresholds.memPct ?? 90),
              diskPct: String(thresholds.diskPct ?? 90),
              cpuPct: String(thresholds.cpuPct ?? 200),
              alertWebhook: settings.alertWebhook || '',
              guardDangerous: settings.guardDangerous !== false,
              teleOn: !(settings.threeNet?.carriers?.tele?.enabled === false),
              teleIp: settings.threeNet?.carriers?.tele?.target || '219.141.140.10',
              unicomOn: !(settings.threeNet?.carriers?.unicom?.enabled === false),
              unicomIp: settings.threeNet?.carriers?.unicom?.target || '210.22.97.1',
              mobileOn: !(settings.threeNet?.carriers?.mobile?.enabled === false),
              mobileIp: settings.threeNet?.carriers?.mobile?.target || '221.179.155.161',
            })
          })
          .catch((err) => setError(err.message))
      }, [])

      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
      const save = async () => {
        setBusy(true)
        try {
          await rpc({
            op: 'saveSettings',
            settings: {
              metricsIntervalMs: Number(form.metricsIntervalMs) || 0,
              overviewRefreshMs: Number(form.overviewRefreshMs) || 0,
              appearance: { palette: form.palette === 'slate' ? 'slate' : 'blue' },
              alertThresholds: { memPct: Number(form.memPct) || 90, diskPct: Number(form.diskPct) || 90, cpuPct: Number(form.cpuPct) || 200 },
              alertWebhook: form.alertWebhook.trim() || undefined,
              guardDangerous: form.guardDangerous,
              threeNet: {
                carriers: {
                  tele: { enabled: form.teleOn, target: form.teleIp.trim() },
                  unicom: { enabled: form.unicomOn, target: form.unicomIp.trim() },
                  mobile: { enabled: form.mobileOn, target: form.mobileIp.trim() },
                },
              },
            },
          })
          setNote('已保存')
          onSaved && onSaved({ palette: form.palette === 'slate' ? 'slate' : 'blue' })
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }
      const exportInventory = async () => {
        try {
          const payload = await rpc({ op: 'inventoryExport' })
          const blob = new Blob([JSON.stringify({ version: payload.version, hosts: payload.hosts }, null, 2)], { type: 'application/json' })
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = 'vps-inventory.json'
          link.click()
          URL.revokeObjectURL(link.href)
        } catch (err) {
          setError(err.message)
        }
      }
      const importInventory = async (file) => {
        if (!file) return
        try {
          const parsed = JSON.parse(await file.text())
          const payload = await rpc({ op: 'inventoryImport', inventory: parsed })
          setNote(`已合并 ${payload.added} 台，共 ${payload.total} 台`)
          onSaved && onSaved()
        } catch (err) {
          setError(err.message)
        } finally {
          if (fileRef.current) fileRef.current.value = ''
        }
      }

      return el(
        'div',
        { style: styles.overlay, onMouseDown: (event) => { if (event.target === event.currentTarget) onDone() } },
        el(
          'div',
          { style: styles.dialog },
          el('div', { style: styles.title }, '设置'),
          form === undefined
            ? el('div', { style: styles.muted }, error || '读取中…')
            : el(
                'div',
                { style: styles.dialogGrid },
                el('div', { style: { gridColumn: '1 / -1', fontSize: 11, fontWeight: 650, color: C.muted, letterSpacing: '.03em', marginBottom: -2 } }, '常规'),
                el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '采样间隔（毫秒，0 关闭）'), el('input', { style: styles.input, value: form.metricsIntervalMs, inputMode: 'numeric', onChange: set('metricsIntervalMs') })),
                el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '首页刷新（毫秒，0 手动）'), el('input', { style: styles.input, value: form.overviewRefreshMs, inputMode: 'numeric', onChange: set('overviewRefreshMs') })),
                el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '外观配色'),
                  el('select', { style: styles.input, value: form.palette, onChange: set('palette') },
                    el('option', { value: 'blue' }, '雾蓝'),
                    el('option', { value: 'slate' }, '石墨'))),
                el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, 'Webhook'), el('input', { style: styles.input, value: form.alertWebhook, placeholder: 'https://…', onChange: set('alertWebhook') })),
                el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '内存阈值 %'), el('input', { style: styles.input, value: form.memPct, inputMode: 'numeric', onChange: set('memPct') })),
                el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '磁盘阈值 %'), el('input', { style: styles.input, value: form.diskPct, inputMode: 'numeric', onChange: set('diskPct') })),
                el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '负载阈值 %'), el('input', { style: styles.input, value: form.cpuPct, inputMode: 'numeric', onChange: set('cpuPct') })),
                el('label', { style: { ...styles.field, justifyContent: 'flex-end' } },
                  el('span', { style: styles.fieldLabel }, '危险命令审批'),
                  el('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 } },
                    el('input', { type: 'checkbox', checked: form.guardDangerous, onChange: (event) => setForm((current) => ({ ...current, guardDangerous: event.target.checked })) }),
                    '启用')),
                el('div', { style: { gridColumn: '1 / -1', borderTop: `1px dashed ${C.border}`, paddingTop: 8, marginTop: 2 } },
                  el('div', { style: styles.fieldLabel }, '探针 · 三网（服务器出网 ping，可关/可换目标 IP）'),
                  ...['tele', 'unicom', 'mobile'].map((carrier) => {
                    const label = carrier === 'tele' ? '电信' : carrier === 'unicom' ? '联通' : '移动'
                    return el('div', { key: carrier, style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 } },
                      el('label', { style: { display: 'flex', alignItems: 'center', gap: 5, width: 64, fontSize: 11 } },
                        el('input', { type: 'checkbox', checked: Boolean(form[`${carrier}On`]), onChange: (event) => setForm((current) => ({ ...current, [`${carrier}On`]: event.target.checked })) }),
                        label),
                      el('input', { style: { ...styles.input, flex: 1, fontSize: 11 }, value: form[`${carrier}Ip`], onChange: (event) => setForm((current) => ({ ...current, [`${carrier}Ip`]: event.target.value })) }))
                  })),
              ),
          el('div', { style: { borderTop: `1px dashed ${C.border}`, paddingTop: 10, marginTop: 2 } },
            el('div', { style: { fontSize: 11, fontWeight: 600, marginBottom: 4 } }, '外部监控'),
            el('div', { style: { ...styles.muted, fontSize: 11, lineHeight: 1.7 } }, 'Komari / 哪吒 面板在「监控接入」里添加与删除；这里只放入口。'),
            el('button', { style: { ...styles.button(false), marginTop: 6 }, onClick: onOpenMonitors }, '打开监控接入')),
          el('div', { style: { borderTop: `1px dashed ${C.border}`, paddingTop: 10, marginTop: 6 } },
            el('div', { style: { fontSize: 11, fontWeight: 600, marginBottom: 4 } }, '凭据'),
            el('div', { style: { ...styles.muted, fontSize: 11, lineHeight: 1.7 } },
              '密码与私钥口令存在 DSH 凭据库，key 名为 DSH_VPS_<ID>_PASSWORD / _PASSPHRASE；清单只保存 key 名。密钥的生成与部署用 vps_key_deploy。')),
          note ? el('div', { style: { ...styles.muted, fontSize: 11 } }, note) : null,
          error ? el('div', { style: styles.err }, error) : null,
          el('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            el('span', { style: { flex: 1 } }),
            el('button', { style: styles.button(false), onClick: onDone }, '关闭'),
            form ? el('button', { style: styles.button(true), onClick: save, disabled: busy }, busy ? '保存中…' : '保存') : null),
        ),
      )
    }

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
            el('span', { style: styles.title }, '监控接入（Komari / 哪吒）'),
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

    /** Credential key names a host derives from its id (matches the host side). */
    function credentialRefsFor(host) {
      const id = String((host && host.id) || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
      const base = `DSH_VPS_${id}`
      return {
        password: (host && host.auth && host.auth.passwordRef) || `${base}_PASSWORD`,
        passphrase: (host && host.auth && host.auth.passphraseRef) || `${base}_PASSPHRASE`,
      }
    }

    const AUTH_LABELS = { key: '私钥', password: '密码', agent: 'SSH Agent' }

    /**
     * Add/edit host dialog. Secrets typed here are written straight into the
     * Host's credential store; the inventory keeps only the reference name.
     */
    function HostDialog({ t, initial, onCancel, onDone }) {
      const editing = Boolean(initial && initial.id)
      const [form, setForm] = useState({
        id: initial?.id || '',
        label: initial?.label || '',
        host: initial?.host || '',
        port: String(initial?.port || 22),
        user: initial?.user || 'root',
        authKind: (initial && initial.auth && initial.auth.kind) || 'key',
        keyPath: (initial && initial.auth && initial.auth.keyPath) || '',
        passwordRef: (initial && initial.auth && initial.auth.passwordRef) || '',
        passphraseRef: (initial && initial.auth && initial.auth.passphraseRef) || '',
        password: '',
        passphrase: '',
        readonly: Boolean(initial && initial.readonly),
        expiresAt: (initial && initial.expiresAt) || '',
        price: initial && initial.price != null ? String(initial.price) : '',
        priceUnit: (initial && initial.priceUnit) || 'year',
        notes: (initial && initial.notes) || '',
        tags: ((initial && initial.tags) || []).join(', '),
      })
      const [error, setError] = useState(undefined)
      const [busy, setBusy] = useState(false)
      const [secret, setSecret] = useState({})
      const set = (key) => (event) => setForm((current) => Object.assign({}, current, { [key]: event.target.value }))

      const base = `DSH_VPS_${form.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
      const passwordRef = form.passwordRef.trim() || `${base}_PASSWORD`
      const passphraseRef = form.passphraseRef.trim() || `${base}_PASSPHRASE`
      const passwordReady = Boolean(secret[passwordRef] && secret[passwordRef].configured)
      const passphraseReady = Boolean(secret[passphraseRef] && secret[passphraseRef].configured)

      // In edit mode, report which references already hold a secret.
      useEffect(() => {
        if (!editing) return undefined
        let cancelled = false
        const refs = credentialRefsFor(initial)
        rpc({ op: 'secretStatus', refs: [refs.password, refs.passphrase] })
          .then((payload) => {
            if (!cancelled) setSecret(payload.status || {})
          })
          .catch(() => {})
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [editing])

      const submit = async () => {
        if (!form.id.trim()) {
          setError('主机 id 不能为空（它会成为工具参数里的 host）')
          return
        }
        if (form.authKind === 'password' && !form.password.trim() && !passwordReady) {
          setError('请输入密码。密码会写进 DSH 凭据库，清单里只留引用名。')
          return
        }
        setBusy(true)
        try {
          if (form.password.trim()) await rpc({ op: 'secretSet', ref: passwordRef, value: form.password })
          if (form.passphrase.trim()) await rpc({ op: 'secretSet', ref: passphraseRef, value: form.passphrase })
          const patch = {
            id: form.id.trim(),
            readonly: form.readonly === true,
            expiresAt: form.expiresAt.trim(),
            price: form.price.trim(),
            priceUnit: form.priceUnit,
            notes: form.notes.trim(),
            tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          }
          if (form.label.trim()) patch.label = form.label.trim()
          if (form.host.trim()) patch.host = form.host.trim()
          if (form.port.trim()) patch.port = Number(form.port) || 22
          if (form.user.trim()) patch.user = form.user.trim()
          const auth = { kind: form.authKind }
          if (form.authKind === 'key') {
            // An empty key path means "keep the stored one".
            if (form.keyPath.trim()) auth.keyPath = form.keyPath.trim()
            if (form.passphrase.trim() || form.passphraseRef.trim()) auth.passphraseRef = passphraseRef
          } else if (form.authKind === 'password') {
            auth.passwordRef = passwordRef
          }
          patch.auth = auth
          await rpc({ op: 'hostsAdd', host: patch })
          await onDone()
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }

      const authFields = (() => {
        if (form.authKind === 'password') {
          return [
            el('label', { key: 'password', style: styles.field },
              el('span', { style: styles.fieldLabel }, passwordReady && !form.password ? '密码（已保存，留空则不修改）' : '密码 *'),
              el('input', {
                style: styles.input,
                type: 'password',
                value: form.password,
                placeholder: passwordReady ? '••••••••（已保存）' : '输入登录密码',
                autoComplete: 'new-password',
                onChange: set('password'),
              })),
            el('div', { key: 'ref', style: { ...styles.muted, fontSize: 11, lineHeight: 1.6 } },
              '凭据名 ',
              el('code', null, passwordRef),
              passwordReady ? '（已配置）' : '（未配置）',
              '；清单里只会有这个名字。'),
          ]
        }
        if (form.authKind === 'agent') {
          return [
            el('div', { key: 'agent', style: { ...styles.muted, fontSize: 11, lineHeight: 1.7 } },
              '使用本机 SSH Agent（环境变量 SSH_AUTH_SOCK）。需要在启动 DSH 前把私钥加进 agent：ssh-add ~/.ssh/id_ed25519。'),
          ]
        }
        return [
          el('label', { key: 'key', style: styles.field },
            el('span', { style: styles.fieldLabel }, '私钥路径'),
            el('input', { style: styles.input, value: form.keyPath, placeholder: editing ? '留空则不修改（默认 ~/.ssh/id_ed25519）' : '~/.ssh/id_ed25519', onChange: set('keyPath') })),
          el('label', { key: 'pass', style: styles.field },
            el('span', { style: styles.fieldLabel }, passphraseReady && !form.passphrase ? '私钥口令（已保存，留空则不修改）' : '私钥口令（可选）'),
            el('input', {
              style: styles.input,
              type: 'password',
              value: form.passphrase,
              placeholder: passphraseReady ? '••••••••（已保存）' : '私钥没有口令就留空',
              autoComplete: 'new-password',
              onChange: set('passphrase'),
            })),
          el('div', { key: 'ref', style: { ...styles.muted, fontSize: 11, lineHeight: 1.6 } },
            '凭据名 ',
            el('code', null, passphraseRef),
            passphraseReady ? '（已配置）' : '（未配置）',
            '；私钥文件本身不会被复制。'),
        ]
      })()

      return el(
        'div',
        { style: styles.overlay, onMouseDown: (event) => { if (event.target === event.currentTarget) onCancel() } },
        el(
          'div',
          { style: styles.dialog },
          el('div', { style: styles.title }, editing ? `编辑 ${initial.id}` : t('addHost')),
          el('div', { style: styles.dialogGrid },
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '主机 id *'),
              el('input', { style: { ...styles.input, opacity: editing ? 0.7 : 1 }, value: form.id, placeholder: 'hk-1', disabled: editing, onChange: set('id') })),
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '显示名'), el('input', { style: styles.input, value: form.label, placeholder: '香港-落地', onChange: set('label') })),
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '地址'), el('input', { style: styles.input, value: form.host, placeholder: '1.2.3.4 或域名', onChange: set('host') })),
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '端口'), el('input', { style: styles.input, value: form.port, inputMode: 'numeric', onChange: set('port') })),
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '用户'), el('input', { style: styles.input, value: form.user, onChange: set('user') })),
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '认证方式'),
              el('select', { style: styles.input, value: form.authKind, onChange: set('authKind') },
                el('option', { value: 'key' }, '私钥'),
                el('option', { value: 'password' }, '密码'),
                el('option', { value: 'agent' }, 'SSH Agent'))),
          ),
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 } }, ...authFields),
          el('label', { style: styles.field },
            el('span', { style: styles.fieldLabel }, '标签（逗号分隔，显示在主页与左栏）'),
            el('input', { style: styles.input, value: form.tags, placeholder: 'prod, hk, nginx', onChange: set('tags') })),
          el('div', { style: styles.dialogGrid },
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '到期日'), el('input', { style: styles.input, type: 'date', value: form.expiresAt, onChange: set('expiresAt') })),
            el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '价格'),
              el('div', { style: { display: 'flex', gap: 6 } },
                el('input', { style: { ...styles.input, flex: 1 }, value: form.price, placeholder: '199', inputMode: 'decimal', onChange: set('price') }),
                el('select', { style: { ...styles.input, width: 72 }, value: form.priceUnit, onChange: set('priceUnit') },
                  el('option', { value: 'year' }, '/ 年'),
                  el('option', { value: 'month' }, '/ 月')))),
          ),
          el('label', { style: styles.field }, el('span', { style: styles.fieldLabel }, '备注'), el('input', { style: styles.input, value: form.notes, placeholder: 'nginx + pg，供应商…', onChange: set('notes') })),
          el('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted } },
            el('input', { type: 'checkbox', checked: form.readonly, onChange: (event) => setForm((current) => Object.assign({}, current, { readonly: event.target.checked })) }),
            '标记为只读（拒绝变更类命令）'),
          error ? el('div', { style: styles.err }, error) : null,
          el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 6 } },
            el('button', { style: styles.button(false), onClick: onCancel }, '取消'),
            el('button', { style: styles.button(true), onClick: submit, disabled: busy }, busy ? '保存中…' : '保存')),
        ),
      )
    }

    /** The views a selected host exposes, shared by page and side panel. */
    function HostViews({ record, view, compact, live }) {
      if (view === 'terminal') return el(TerminalView, { host: record.id })
      if (view === 'files') return el(FilesView, { host: record.id })
      if (view === 'tunnels') return el(TunnelsView, { host: record.id })
      if (view === 'audit') return el(AuditView, { host: record.id })
      if (view === 'inspect') return el(InspectView, { host: record.id })
      return el(StatusView, { record, compact, live })
    }

    const VIEW_ICONS = { status: 'test', terminal: 'terminal', files: 'files', tunnels: 'tunnels', inspect: 'system', audit: 'audit' }

    const VIEWS = [
      ['status', '状态'],
      ['terminal', '终端'],
      ['files', '文件'],
      ['tunnels', '隧道'],
      ['inspect', '系统'],
      ['audit', '审计'],
    ]

    /** Detailed three-carrier view for one host. */
    function ThreeNetDialog({ host, history, thresholds, onDone }) {
      const [live, setLive] = useState(undefined)
      const [error, setError] = useState(undefined)
      const load = useCallback(async () => {
        try {
          const payload = await rpc({ op: 'threeNet', host: host.id })
          setLive(payload)
          setError(undefined)
        } catch (err) {
          setError(err.message)
        }
      }, [host.id])
      useEffect(() => {
        load()
      }, [load])
      const rows = (live && live.rows) || (history[0] && history[0].rows) || []
      const seriesFor = (carrier) =>
        history
          .map((entry) => (entry.rows || []).find((row) => row.carrier === carrier))
          .filter((row) => row && typeof row.avgMs === 'number')
          .map((row) => row.avgMs)
      const statsOf = (values) =>
        values.length
          ? { min: Math.round(Math.min(...values)), max: Math.round(Math.max(...values)), avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) }
          : undefined
      return el('div', { style: styles.overlay, onMouseDown: (event) => { if (event.target === event.currentTarget) onDone() } },
        el('div', { style: { ...styles.dialog, width: 640 } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            el('span', { style: styles.title }, `三网延迟 · ${host.label || host.id}`),
            el('span', { style: { flex: 1 } }),
            el('button', { style: styles.button(false), onClick: load }, '重新探测')),
          error ? el('div', { style: styles.err }, error) : null,
          ...['tele', 'unicom', 'mobile'].map((carrier) => {
            const row = rows.find((item) => item.carrier === carrier) || { carrier, label: carrier === 'tele' ? '电信' : carrier === 'unicom' ? '联通' : '移动' }
            const series = seriesFor(carrier)
            const stats = statsOf(series)
            const limits = (thresholds && thresholds[carrier]) || { good: 80, warn: 180 }
            const color = row.avgMs == null ? C.muted : row.avgMs < limits.good ? C.ok : row.avgMs < limits.warn ? C.warn : C.bad
            const points = series.length > 1
              ? series.map((value, index) => `${(index * (240 / (series.length - 1))).toFixed(1)} ${(36 - (Math.min(300, value) / 300) * 30).toFixed(1)}`).join(' L')
              : ''
            return el('div', { key: carrier, style: styles.card },
              el('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10 } },
                el('span', { style: { fontWeight: 600 } }, row.label),
                el('span', { style: { fontSize: 22, fontWeight: 650, color } }, row.avgMs == null ? '—' : `${Math.round(row.avgMs)}ms`),
                el('span', { style: { ...styles.muted, fontSize: 11 } }, row.avgMs == null ? '不可达' : `丢包 ${row.lossPct}%`),
                el('span', { style: { flex: 1 } }),
                stats ? el('span', { style: { ...styles.muted, fontSize: 11 } }, `min ${stats.min} · avg ${stats.avg} · max ${stats.max}`) : null),
              el('svg', { viewBox: '0 0 240 36', preserveAspectRatio: 'none', style: { width: '100%', height: 36, display: 'block', marginTop: 8 } },
                el('path', { d: 'M0 18 L240 18', stroke: 'rgba(127,127,127,.18)', strokeWidth: 1, fill: 'none' }),
                points ? el('path', { d: `M${points}`, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'round' }) : null),
              el('div', { style: { display: 'flex', gap: 2, marginTop: 6 } },
                ...history.slice(-48).map((entry, index) => {
                  const hit = (entry.rows || []).find((item) => item.carrier === carrier)
                  const loss = hit ? hit.lossPct : 100
                  return el('span', {
                    key: index,
                    title: hit ? `丢包 ${loss}%` : '不可达',
                    style: {
                      flex: 1, height: 6, borderRadius: 2,
                      background: loss >= 50 ? C.bad : loss > 0 ? C.warn : C.ok,
                      opacity: hit && hit.avgMs != null ? 1 : 0.35,
                    },
                  })
                })),
              el('div', { style: { ...styles.muted, fontSize: 10.5, marginTop: 4 } }, series.length > 1 ? `${series.length} 轮记录` : '只有当前一轮，趋势要等下一轮探测'))
          }),
          el('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
            el('button', { style: styles.button(false), onClick: onDone }, '关闭'))))
    }

    /** Landing view: every host as a card, with quick actions. */
    function Overview({ hosts, overview, probes, probing, thresholds, onProbeAll, onRefresh, onOpen, onDelete, onAdd, onBatch }) {
      const [picked, setPicked] = useState([])
      const [tests, setTests] = useState({})
      const [filter, setFilter] = useState('all')
      const [threeDetail, setThreeDetail] = useState(undefined)
      const run = async (host) => {
        setTests((current) => ({ ...current, [host.id]: { busy: true } }))
        try {
          const payload = await rpc({ op: 'test', host: host.id })
          setTests((current) => ({ ...current, [host.id]: payload.result }))
        } catch (err) {
          setTests((current) => ({ ...current, [host.id]: { ok: false, error: err.message } }))
        }
      }
      const expiring = hosts.filter((host) => {
        const days = daysUntil(host.expiresAt)
        return days != null && days <= 30
      }).length
      const readonly = hosts.filter((host) => host.readonly).length
      const okCount = Object.values(tests).filter((test) => test && test.ok).length
      const live = overview || {}
      const rows = hosts.map((host) => live[host.id] || {})
      const known = rows.filter((row) => row.up !== undefined)
      const upCount = known.filter((row) => row.up).length
      const cpuRows = rows.filter((row) => typeof row.cpu === 'number')
      const avgCpu = cpuRows.length ? Math.round(cpuRows.reduce((sum, row) => sum + row.cpu, 0) / cpuRows.length) : undefined
      const bar = (value, color, fixed) =>
        el('div', { style: { height: 4, borderRadius: 3, background: 'rgba(127,127,127,.18)', marginTop: 4, overflow: 'hidden' } },
          el('div', { style: { width: `${Math.min(100, Math.max(0, value || 0))}%`, height: '100%', borderRadius: 3, background: fixed ? color : value >= 90 ? C.bad : value >= 70 ? C.warn : color } }))
      const offline = rows.filter((row) => row.up === false).length
      const visible = hosts.filter((host) => {
        if (filter === 'offline') return live[host.id] && live[host.id].up === false
        if (filter === 'expiring') {
          const left = daysUntil(host.expiresAt)
          return left != null && left <= 30
        }
        return true
      })
      const filters = [['all', '全部', hosts.length], ['offline', '离线', offline], ['expiring', '即将到期', expiring]]
      const stat = (label, value, hint, pct) =>
        el('div', { className: 'v-card' },
          el('div', { className: 'v-label' }, label),
          el('div', { className: 'v-hero' }, el('b', null, String(value)), hint ? el('small', null, hint) : null),
          pct != null ? bar(pct, C.accent, true) : null)

      if (!hosts.length) {
        return el('div', { className: 'v-content' },
          el('div', { className: 'v-card', style: { textAlign: 'center', padding: 40 } },
            el('div', { style: { fontSize: 15, fontWeight: 650, marginBottom: 6 } }, '还没有主机'),
            el('div', { className: 'v-sub', style: { justifyContent: 'center', marginBottom: 14 } }, '添加一台，或让 DS 用 vps_host_import 导入 ~/.ssh/config'),
            el('button', { className: 'v-btn primary', onClick: onAdd }, '添加主机')))
      }

      return el('div', { className: 'v-content' },
        el('div', { className: 'v-tabs', style: { padding: 0, border: 'none', background: 'transparent' } },
          ...filters.map(([key, label, count]) =>
            el('button', { key, className: `v-tab${filter === key ? ' active' : ''}`, onClick: () => setFilter(key) },
              label,
              el('span', { className: 'v-badge', style: { marginLeft: 4 } }, String(count)))),
          el('div', { className: 'v-spacer' }),
          onBatch ? el('button', { className: 'v-btn', disabled: !picked.length, onClick: () => onBatch(picked) }, `批量 ${picked.length || ''}`) : null,
          onRefresh ? el('button', { className: 'v-btn', onClick: onRefresh }, '刷新') : null,
          el('button', { className: 'v-btn', onClick: onProbeAll, disabled: probing }, probing ? '探测中…' : '探测全部')),
        el('div', { className: 'v-grid4', style: { gridTemplateColumns: 'repeat(3, minmax(0,1fr))' } },
          stat('主机', hosts.length, '台'),
          stat('在线', `${upCount}/${hosts.length}`, '台', known.length ? Math.round((upCount / Math.max(1, known.length)) * 100) : 0),
          stat('即将到期', expiring, '台', Math.min(100, expiring * 20))),
        el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 } },
          ...visible.map((host) => {
            const test = tests[host.id]
            const days = daysUntil(host.expiresAt)
            return el('div', { key: host.id, className: 'v-card v-hostcard', onClick: () => onOpen(host.id), style: { display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', paddingTop: 0, overflow: 'hidden' } },
              el('div', { style: { height: 3, margin: '0 -16px 8px', background: live[host.id] && live[host.id].up === false ? C.bad : live[host.id] && live[host.id].up ? C.ok : 'rgba(127,127,127,.3)' } }),
              el('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                onBatch
                  ? el('input', {
                      type: 'checkbox',
                      checked: picked.includes(host.id),
                      onClick: (event) => event.stopPropagation(),
                      onChange: () => setPicked((list) => (list.includes(host.id) ? list.filter((id) => id !== host.id) : [...list, host.id])),
                      style: { margin: 0 },
                    })
                  : null,
                el('span', { style: { width: 7, height: 7, borderRadius: 7, flex: 'none', background: test ? (test.ok ? C.ok : C.bad) : 'rgba(127,127,127,.45)' } }),
                el('span', { style: { fontWeight: 650, fontSize: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' } },
                  el(Flag, { code: live[host.id] && live[host.id].country }),
                  host.label || host.id),
                el('span', { className: 'v-badge', style: { color: live[host.id] && live[host.id].up === false ? C.bad : live[host.id] && live[host.id].up ? C.ok : C.muted } },
                  live[host.id] && live[host.id].up === false ? '离线' : live[host.id] && live[host.id].up ? '在线' : '未采样'),
                probes[host.id]
                  ? (() => {
                      const loopback = /^(127\.|localhost$|::1$)/i.test(String(host.host || ''))
                      const proxied = probes[host.id].avgMs != null && probes[host.id].avgMs < 3 && !loopback
                      return el('span', {
                        className: 'v-badge',
                        title: proxied ? '经本地代理应答，非真实 RTT' : 'TCP 探针延迟（本机 → 端口）',
                        style: proxied
                          ? { color: C.muted, borderStyle: 'dashed' }
                          : { color: probes[host.id].avgMs == null ? C.bad : C.ok, borderColor: probes[host.id].avgMs == null ? C.bad : C.ok },
                      }, probes[host.id].avgMs == null ? '不可达' : `${probes[host.id].avgMs}ms${proxied ? '*' : ''}`)
                    })()
                  : probing
                    ? el('span', { className: 'v-badge' }, '探测中…')
                    : null,
                host.readonly ? el('span', { className: 'v-badge' }, '只读') : null),
              el('div', { className: 'v-meta' }, `${host.user || 'root'}@${host.host}:${host.port || 22}`),
              el('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                ...(host.tags || []).map((tag) => el('span', { key: tag, className: 'v-badge' }, tag)),
                days != null ? el('span', { className: 'v-badge', style: { color: expiryTone(days), borderColor: expiryTone(days) } }, days < 0 ? '已过期' : `${days} 天到期`) : null,
                live[host.id] && live[host.id].uptime ? el('span', { className: 'v-badge' }, `运行 ${fmtUptime(live[host.id].uptime)}`) : null),
              el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 } },
                el('div', null,
                  el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted } }, el('span', null, 'CPU'), el('span', null, typeof (live[host.id] || {}).cpu === 'number' ? `${live[host.id].cpu}%` : '—')),
                  bar((live[host.id] || {}).cpu, C.accent)),
                el('div', null,
                  el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted } }, el('span', null, '内存'), el('span', null, typeof (live[host.id] || {}).mem === 'number' ? `${live[host.id].mem}%` : '—')),
                  bar((live[host.id] || {}).mem, C.accent)),
                el('div', null,
                  el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted } }, el('span', null, '磁盘'), el('span', null, typeof (live[host.id] || {}).disk === 'number' ? `${live[host.id].disk}%` : '—')),
                  bar((live[host.id] || {}).disk, C.accent)),
                (() => {
                  const traffic = live[host.id] && live[host.id].traffic
                  const rx = traffic ? traffic.rx : 0
                  const tx = traffic ? traffic.tx : 0
                  const sum = rx + tx
                  return el('div', null,
                    el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted } },
                      el('span', null, '流量'),
                      el('span', null, traffic ? fmtBytes(sum) : '—')),
                    el('div', { style: { height: 4, borderRadius: 3, background: 'rgba(127,127,127,.18)', marginTop: 4, overflow: 'hidden', display: 'flex' } },
                      el('div', { style: { width: `${sum ? (rx / sum) * 100 : 0}%`, height: '100%', background: C.accent } }),
                      el('div', { style: { width: `${sum ? (tx / sum) * 100 : 0}%`, height: '100%', background: C.warn } })))
                })()),
              el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: C.muted } },
                el('span', null, `↓ ${fmtBytes((live[host.id] || {}).rx)} · ↑ ${fmtBytes((live[host.id] || {}).tx)}${live[host.id] && live[host.id].traffic ? ` · 累计 ${fmtBytes(live[host.id].traffic.total)}` : ''}`),
                el('button', { className: 'v-btn ghost', style: { height: 18, padding: '0 6px', fontSize: 10.5 }, onClick: (event) => { event.stopPropagation(); setThreeDetail(host) } }, '三网详情 →')),
              ...((live[host.id] && live[host.id].three && live[host.id].three.length)
                ? live[host.id].three
                : [{ carrier: 'tele', label: '电信' }, { carrier: 'unicom', label: '联通' }, { carrier: 'mobile', label: '移动' }]).map((row) => {
                const history = (live[host.id] && live[host.id].threeHistory) || []
                const series = history
                  .map((entry) => {
                    const hit = (entry.rows || []).find((item) => item.carrier === row.carrier)
                    return hit && typeof hit.avgMs === 'number' ? hit.avgMs : undefined
                  })
                  .filter((value) => typeof value === 'number')
                const color = row.avgMs == null ? C.muted : row.avgMs < 80 ? C.ok : row.avgMs < 180 ? C.warn : C.bad
                const points = series.length > 1
                  ? series.map((value, index) => `${(index * (72 / (series.length - 1))).toFixed(1)} ${(14 - (Math.min(300, value) / 300) * 12).toFixed(1)}`).join(' L')
                  : ''
                return el('div', { key: row.carrier, style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 } },
                  el('span', { style: { width: 26, color: C.muted } }, row.label),
                  el('svg', { viewBox: '0 0 72 16', preserveAspectRatio: 'none', style: { flex: 1, height: 16, minWidth: 40 } },
                    el('path', { d: 'M0 8 L72 8', stroke: 'rgba(127,127,127,.2)', strokeWidth: 1, fill: 'none' }),
                    points ? el('path', { d: `M${points}`, fill: 'none', stroke: color, strokeWidth: 1.5, strokeLinejoin: 'round' }) : null),
                  el('b', { style: { color, fontWeight: 650, width: 46, textAlign: 'right' } }, row.avgMs == null ? '—' : `${Math.round(row.avgMs)}ms`),
                  el('span', { style: { width: 40, textAlign: 'right', color: row.avgMs == null ? C.muted : row.lossPct > 0 ? C.warn : C.ok } },
                    row.avgMs == null ? '' : `丢包 ${row.lossPct}%`))
              }),
              test
                ? el('div', { style: { fontSize: 11, color: test.busy ? C.muted : test.ok ? C.ok : C.bad } },
                    test.busy ? '测试中…' : test.ok ? `✓ ${test.latencyMs}ms · ${AUTH_LABELS[test.authKind] || test.authKind}` : `✗ ${test.error || '连接失败'}`)
                : null,
              el('div', { style: { display: 'flex', gap: 6, marginTop: 'auto' } },
                el('button', { className: 'v-btn primary', onClick: (event) => { event.stopPropagation(); onOpen(host.id) } }, '打开'),
                el('button', { className: 'v-btn', onClick: (event) => { event.stopPropagation(); run(host) } }, test && test.busy ? '测试中…' : '测试'),
                el('button', { className: 'v-btn ghost', style: { marginLeft: 'auto', color: C.bad }, onClick: (event) => { event.stopPropagation(); onDelete(host) } }, '删除')))
          })),
        threeDetail
          ? el(ThreeNetDialog, {
              host: threeDetail,
              history: (live[threeDetail.id] && live[threeDetail.id].threeHistory) || [],
              thresholds,
              onDone: () => setThreeDetail(undefined),
            })
          : null,
      )
    }

    /** Sidebar page: host rail on the left, the selected host's workspace on the right. */
    function VpsPage(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [hosts, setHosts] = useState([])
      const [error, setError] = useState(undefined)
      const [selected, setSelected] = useState(undefined)
      const [view, setView] = useState('status')
      const [adding, setAdding] = useState(false)
      const [editing, setEditing] = useState(undefined)
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(undefined)
      const [batchOpen, setBatchOpen] = useState(false)
      const [batchInitial, setBatchInitial] = useState(undefined)
      const [test, setTest] = useState(undefined)
      const [testing, setTesting] = useState(false)
      const [alerts, setAlerts] = useState([])
      const [overview, setOverview] = useState({})
      const [refreshMs, setRefreshMs] = useState(15000)
      const [palette, setPalette] = useState('blue')
      const [overviewTick, setOverviewTick] = useState(0)
      useEffect(() => {
        rpc({ op: 'settings' })
          .then((payload) => {
            const value = Number(payload.settings && payload.settings.overviewRefreshMs)
            if (Number.isFinite(value)) setRefreshMs(value)
            const savedPalette = payload.settings && payload.settings.appearance && payload.settings.appearance.palette
            if (savedPalette === 'blue' || savedPalette === 'slate') setPalette(savedPalette)
          })
          .catch(() => {})
      }, [])
      const [probes, setProbes] = useState({})
      const [thresholds, setThresholds] = useState(undefined)
      const [probing, setProbing] = useState(false)
      const [monitorsOpen, setMonitorsOpen] = useState(false)
      const [settingsOpen, setSettingsOpen] = useState(false)

      useEffect(() => {
        let cancelled = false
        const load = async () => {
          try {
            const payload = await rpc({ op: 'alerts' })
            if (!cancelled) setAlerts(payload.alerts || [])
          } catch {}
        }
        load()
        const timer = setInterval(load, 30000)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [])

      const reload = useCallback(async () => {
        setBusy(true)
        try {
          const payload = await rpc({ op: 'hosts' })
          setHosts(payload.hosts || [])
          setError(undefined)
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => {
        reload()
      }, [reload])

      const current = hosts.find((host) => host.id === selected)
      useEffect(() => {
        if (selected && !hosts.some((host) => host.id === selected)) setSelected(undefined)
      }, [hosts, selected])

      const removeHost = async (host) => {
        if (!window.confirm(`删除主机 ${host.id}（${host.label || host.host}）？\n清单记录和缓存的连接会被移除，远端机器不受影响。`)) return
        try {
          await rpc({ op: 'hostsRemove', id: host.id })
          if (selected === host.id) setSelected(undefined)
          setNotice(`已删除 ${host.id}`)
          await reload()
        } catch (err) {
          setError(err.message)
        }
      }

      const importConfig = async () => {
        setBusy(true)
        try {
          const payload = await rpc({ op: 'hostsImport' })
          await reload()
          setNotice(payload.added && payload.added.length ? `已导入 ${payload.added.length} 台：${payload.added.join(', ')}` : '没有新的主机可导入')
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(false)
        }
      }

      useEffect(() => {
        let cancelled = false
        let timer
        const load = async () => {
          try {
            const payload = await rpc({ op: 'overview' })
            if (!cancelled) {
              const map = {}
              for (const host of payload.hosts || []) map[host.id] = host
              setOverview(map)
              if (payload.thresholds) setThresholds(payload.thresholds)
            }
          } catch {}
          if (!cancelled && refreshMs > 0) timer = setTimeout(load, Math.max(5000, refreshMs))
        }
        load()
        return () => {
          cancelled = true
          if (timer) clearTimeout(timer)
        }
      }, [refreshMs, overviewTick])

      const runProbeAll = useCallback(async () => {
        setProbing(true)
        try {
          const payload = await rpc({ op: 'probeAll' })
          setProbes(payload.results || {})
        } catch {
        } finally {
          setProbing(false)
        }
      }, [])

      useEffect(() => {
        const timer = setTimeout(() => {
          runProbeAll().catch(() => {})
        }, 1500)
        return () => clearTimeout(timer)
      }, [runProbeAll])

      const exportInventory = async () => {
        try {
          const payload = await rpc({ op: 'inventoryExport' })
          const blob = new Blob([JSON.stringify({ version: payload.version, hosts: payload.hosts }, null, 2)], { type: 'application/json' })
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = 'vps-inventory.json'
          link.click()
          URL.revokeObjectURL(link.href)
        } catch (err) {
          setError(err.message)
        }
      }

      const runTest = async (id) => {
        setTesting(true)
        setTest(undefined)
        try {
          const payload = await rpc({ op: 'test', host: id })
          setTest(payload.result)
        } catch (err) {
          setTest({ ok: false, error: err.message })
        } finally {
          setTesting(false)
        }
      }

      const forgetHostKey = async (id) => {
        try {
          await rpc({ op: 'hostForgetKey', host: id })
          setNotice('已清除主机指纹，正在重新连接…')
          await runTest(id)
        } catch (err) {
          setTest({ ok: false, error: err.message })
        }
      }

      return el(
        'div',
        { style: { ...styles.root, position: 'relative' }, className: 'dshvps', 'data-palette': palette },
        el(
          'div',
          { className: 'v-top' },
          el('div', { className: 'v-brand' },
            el('div', { className: 'v-glyph' }, el(Icon, { name: 'constellation', size: 18 })),
            el('div', null,
              el('h1', null, t('title')),
              el('p', null, `${hosts.length} 台 · ${hosts.filter((host) => host.readonly).length} 只读 · ${hosts.filter((host) => { const left = daysUntil(host.expiresAt); return left != null && left <= 30 }).length} 即将到期`))),
          el('div', { className: 'v-spacer' }),
          notice ? el('span', { style: { fontSize: 11, color: C.muted } }, notice) : null,
          el('button', { className: 'v-btn', onClick: () => setSettingsOpen(true) }, '设置'),
          el('button', { className: 'v-btn', onClick: () => setMonitorsOpen(true) }, el(Icon, { name: 'external', size: 14 }), '监控接入'),
        ),
        alerts.length
          ? el(
              'div',
              { style: styles.alertBar },
              el('span', { style: { fontWeight: 600, color: C.bad } }, `⚠ ${alerts.length} 个告警`),
              ...alerts.slice(0, 3).map((alert) => el('span', { key: `${alert.host}:${alert.kind}` }, `${alert.host} · ${alert.message}`)),
              alerts.length > 3 ? el('span', { style: styles.muted }, `+${alerts.length - 3}`) : null,
            )
          : null,
        error ? el('div', { style: { ...styles.err, padding: '6px 14px' } }, error) : null,
        el(
          'div',
          { style: styles.body },
          el(HostList, {
            hosts,
            selected,
            showOverview: !selected,
            onOverview: () => { setSelected(undefined); setTest(undefined) },
            countries: Object.fromEntries(Object.entries(overview).map(([id, row]) => [id, row.country])),
            onSelect: (id) => { setSelected(id); setNotice(undefined); setTest(undefined) },
            t,
            compact: false,
            onAdd: () => setAdding(true),
            onImport: importConfig,
            onExport: exportInventory,
            onImportJson: async (payload) => {
              try {
                const result = await rpc({ op: 'inventoryImport', inventory: payload })
                setNotice(`已合并 ${result.added} 台，共 ${result.total} 台`)
                await reload()
              } catch (err) {
                setError(err.message)
              }
            },
            onError: setError,
            onRefresh: reload,
            busy,
          }),
          el(
            'div',
            { style: styles.main },
            current
              ? el(
                  'div',
                  { style: styles.detailHead },
                  el(
                    'div',
                    { style: styles.detailTitleRow },
                    el('button', { className: 'v-btn ghost', onClick: () => setSelected(undefined) }, '← 总览'),
                    el('span', { style: { fontSize: 14, fontWeight: 600 } }, current.label || current.id),
                    el('span', { style: styles.address }, `${current.user || 'root'}@${current.host}:${current.port || 22}`),
                    el('span', { style: styles.muted }, current.id),
                    el('span', { style: styles.badge }, AUTH_LABELS[(current.auth && current.auth.kind) || 'key']),
                    current.readonly ? el('span', { style: styles.badge }, '只读') : null,
                    ...(current.tags || []).map((tag) => el('span', { key: tag, style: styles.badge }, tag)),
                    el('div', { style: { display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' } },
                      el('button', { style: styles.button(false), onClick: () => runTest(current.id), disabled: testing }, testing ? '测试中…' : '测试连接'),
                      el('button', { style: styles.button(false), onClick: () => setBatchOpen(true) }, '批量'),
                      el('button', { style: styles.button(false), onClick: () => setEditing(current) }, '编辑'),
                      el('button', { className: 'v-btn ghost', style: { color: C.bad }, onClick: () => removeHost(current) }, '删除')),
                  ),
                  test
                    ? el('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11 } },
                        el('span', { style: { color: test.ok ? C.ok : C.bad, fontWeight: 600 } }, test.ok ? '✓ 连接正常' : '✗ 连接失败'),
                        test.ok
                          ? el('span', { style: styles.muted }, `${test.latencyMs}ms · ${AUTH_LABELS[test.authKind] || test.authKind} · ${String(test.fingerprint || '').slice(0, 24)}`)
                          : el('span', { style: styles.err }, test.error || '未知错误'),
                        !test.ok && /指纹|host key|verification/i.test(String(test.error || ''))
                          ? el('button', { style: styles.button(false), onClick: () => forgetHostKey(current.id) }, '信任新指纹并重试')
                          : null)
                    : null,
                  el('div', { className: 'v-tabs' },
                    ...VIEWS.map(([key, label]) =>
                      el('button', { key, className: `v-tab${view === key ? ' active' : ''}`, onClick: () => setView(key) },
                        el(Icon, { name: VIEW_ICONS[key], size: 14 }), label))),
                )
              : null,
            current
              ? el('div', { key: `${current.id}:${view}`, style: view === 'status' ? styles.content : styles.contentFlush },
                  el(HostViews, { record: current, view, compact: false, live: overview[current.id] }))
              : el(Overview, { hosts, overview, probes, probing, thresholds, onProbeAll: runProbeAll, onRefresh: () => setOverviewTick((value) => value + 1), onBatch: (ids) => { setBatchInitial(ids); setBatchOpen(true) }, onOpen: setSelected, onDelete: removeHost, onAdd: () => setAdding(true) }),
          ),
        ),
        adding
          ? el(HostDialog, {
              t,
              onCancel: () => setAdding(false),
              onDone: async () => {
                setAdding(false)
                await reload()
                setNotice('主机已保存')
              },
            })
          : null,
        editing
          ? el(HostDialog, {
              t,
              initial: editing,
              onCancel: () => setEditing(undefined),
              onDone: async () => {
                setEditing(undefined)
                await reload()
                setNotice('已保存')
              },
            })
          : null,
        batchOpen
          ? el(BatchDialog, {
              hosts,
              initialSelected: batchInitial || (current ? [current.id] : []),
              onDone: () => {
                setBatchOpen(false)
                setBatchInitial(undefined)
              },
            })
          : null,
        monitorsOpen ? el(MonitorsDialog, { onDone: () => setMonitorsOpen(false) }) : null,
        settingsOpen
          ? el(SettingsDialog, {
              onDone: () => setSettingsOpen(false),
              onOpenMonitors: () => {
                setSettingsOpen(false)
                setMonitorsOpen(true)
              },
              onSaved: (saved) => {
                if (saved && saved.palette) setPalette(saved.palette)
                setNotice('设置已保存')
                reload()
              },
            })
          : null,
      )
    }

    /** Compact right-panel body: host list above the selected host's views. */
    function VpsSidePanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [hosts, setHosts] = useState([])
      const [error, setError] = useState(undefined)
      const [selected, setSelected] = useState(undefined)
      const [view, setView] = useState('status')
      const [adding, setAdding] = useState(false)
      const [palette, setPalette] = useState('blue')
      useEffect(() => {
        rpc({ op: 'settings' })
          .then((payload) => {
            const saved = payload.settings && payload.settings.appearance && payload.settings.appearance.palette
            if (saved === 'blue' || saved === 'slate') setPalette(saved)
          })
          .catch(() => {})
      }, [])

      const reload = useCallback(async () => {
        try {
          const payload = await rpc({ op: 'hosts' })
          setHosts(payload.hosts || [])
          setError(undefined)
        } catch (err) {
          setError(err.message)
        }
      }, [])

      useEffect(() => {
        reload()
      }, [reload])

      const current = hosts.find((host) => host.id === selected)
      useEffect(() => {
        if (hosts.length === 0) return
        if (!selected || !hosts.some((host) => host.id === selected)) setSelected(hosts[0].id)
      }, [hosts, selected])

      return el(
        'div',
        { style: { ...styles.root, position: 'relative' }, className: 'dshvps', 'data-palette': palette },
        el(HostList, {
          hosts,
          selected,
          onSelect: setSelected,
          t,
          compact: true,
          onAdd: () => setAdding(true),
          onImport: async () => {
            try {
              await rpc({ op: 'hostsImport' })
              await reload()
            } catch (err) {
              setError(err.message)
            }
          },
          onRefresh: reload,
        }),
        error ? el('div', { style: { ...styles.err, padding: '4px 8px' } }, error) : null,
        current
          ? el('div', { className: 'v-tabs', style: { padding: '0 8px' } },
              ...VIEWS.map(([key, label]) => el('button', { key, className: `v-tab${view === key ? ' active' : ''}`, onClick: () => setView(key) }, el(Icon, { name: VIEW_ICONS[key], size: 14 }), label)))
          : null,
        current
          ? el('div', { key: `${current.id}:${view}`, style: view === 'status' ? { ...styles.content, padding: 8 } : { ...styles.contentFlush, padding: 8 } },
              el(HostViews, { record: current, view, compact: true }))
          : el('div', { style: styles.empty }, '选择一台主机。'),
        adding
          ? el(HostDialog, {
              t,
              onCancel: () => setAdding(false),
              onDone: async () => {
                setAdding(false)
                await reload()
              },
            })
          : null,
      )
    }

    const dictionaries = {
      zh: {
        title: 'Constellation',
        description: '主机星图：状态、终端、文件、隧道',
        addHost: '添加主机',
        import: '导入 SSH 配置',
        refresh: '刷新',
        search: '搜索主机',
        readonly: '只读',
        empty: '清单为空。点上方「添加」，或导入 ~/.ssh/config。',
      },
      en: {
        title: 'Constellation',
        description: 'A star map of your hosts: status, terminal, files, tunnels',
        addHost: 'Add host',
        import: 'Import SSH config',
        refresh: 'Refresh',
        search: 'Search hosts',
        readonly: 'read-only',
        empty: 'No hosts yet. Add one above, or import ~/.ssh/config.',
      },
    }

    /**
     * Browser plugin: a left-rail entry that opens the VPS page, plus the same
     * workspace as a compact tab in the right sidebar.
     */
    const inject = ['slots', 'locale', 'layout', 'sidebarRight', 'sidebarRightTabs']

    /** Render a registered component with the namespace-bound translator. */
    function withLocale(component, t) {
      return (props) => el(component, Object.assign({}, props, { t }))
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-vps: dictionaries')
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const style = document.createElement('style')
        style.dataset.dshVps = '1'
        style.textContent = `${CSS}\n${DASH_CSS}`
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-vps: interaction styles')

      // 1. Left rail icon. The shipped sidebar renders it and selects its id.
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              { name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => t('title'), locale: NS },
              ServerGlyph,
            ),
          ),
        'dsh-vps: sidebar entry',
      )

      // 2. The page that entry opens: same id, registered in the layout's `main` slot.
      ctx.effect(
        () =>
          ctx.slots.inject('main', () =>
            ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, withLocale(VpsPage, t)),
          ),
        'dsh-vps: main page',
      )

      // 3. The same workspace as a compact right-sidebar tab.
      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: PANEL_ID,
            kind: 'vps',
            priority: 'builtin',
            title: () => t('title'),
            guide: [
              {
                id: 'servers',
                order: 30,
                title: () => t('title'),
                description: () => t('description'),
              },
            ],
          }),
        'dsh-vps: sidebar type',
      )
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              { name: 'sidebar.right.pane.tab', key: PANEL_ID, locale: NS },
              withLocale(VpsSidePanel, t),
            ),
          ),
        'dsh-vps: sidebar body',
      )
    }

    exports.NS = NS
    exports.PANEL_ID = PANEL_ID
    exports.apply = apply
    exports.inject = inject
    // Internal components exposed for the client smoke test only.
    exports.__components = { Spark, HistoryCards, BatchDialog, MonitorsDialog, SettingsDialog, HostDialog, StatusView }
    return module.exports
  },
})
