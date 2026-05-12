// agent-ui.jsx — overlays: top bar, stats, detail panel, console, commander

const { useState: useStateU, useMemo: useMemoU, useEffect: useEffectU, useRef: useRefU } = React;

function Topbar({ stats }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div>
          <div className="brand-name">MOS <span className="brand-sub mono">0.42.1</span></div>
        </div>
      </div>
      <div className="tabs">
        <div className="tab active"><span className="dot"></span>Mesh</div>
        <div className="tab">Traces</div>
        <div className="tab">Policies</div>
        <div className="tab">Budget</div>
        <div className="tab">Settings</div>
      </div>
      <div className="topbar-right">
        <div className="top-stat mono">trace.id <b>run_4f2a91</b></div>
        <div className="top-stat">latency <b className="mono">{stats.latency}ms</b></div>
        <div className="top-stat">tokens/s <b className="mono">{stats.tps.toLocaleString()}</b></div>
        <div className="pill"><span className="pulse"></span><span>local · airgapped</span></div>
      </div>
    </div>
  );
}

function LeftRail({ active, onPick }) {
  const items = [
    { id: "mesh",    label: "Mesh",     icon: "graph" },
    { id: "traces",  label: "Traces",   icon: "trace" },
    { id: "tools",   label: "Tools",    icon: "tool" },
    { id: "memory",  label: "Memory",   icon: "mem" },
    { id: "policy",  label: "Policies", icon: "lock" },
  ];
  const settings = [
    { id: "settings", label: "Settings", icon: "cog" },
  ];
  const renderIcon = (k) => {
    switch (k) {
      case "graph": return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="4" cy="6" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="15" r="2"/>
        <path d="M6 6h8M5 8l4 6M15 8l-4 6"/></svg>;
      case "trace": return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M3 5h14M3 10h10M3 15h14"/></svg>;
      case "tool": return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M13 3l4 4-6 6-4 1 1-4z"/><path d="M7 11l-4 4 2 2 4-4"/></svg>;
      case "mem": return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="3" y="5" width="14" height="10" rx="1.5"/><path d="M6 5v10M14 5v10M3 10h14"/></svg>;
      case "lock": return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="4" y="9" width="12" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 016 0v3"/></svg>;
      case "cog": return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="10" cy="10" r="2.5"/>
        <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.5 1.5M13.5 13.5L15 15M5 15l1.5-1.5M13.5 6.5L15 5"/></svg>;
    }
  };
  const Btn = ({ it }) => (
    <div className={"rail-btn" + (active === it.id ? " active" : "")} onClick={() => onPick(it.id)}>
      {renderIcon(it.icon)}
      <span className="tip">{it.label}</span>
    </div>
  );
  return (
    <div className="leftrail">
      {items.map(it => <Btn key={it.id} it={it} />)}
      <div className="rail-divider"></div>
      {settings.map(it => <Btn key={it.id} it={it} />)}
    </div>
  );
}

function StatOverlay({ stats }) {
  return (
    <div className="stat-overlay">
      <div className="stat-card">
        <div className="lbl">Active agents</div>
        <div className="val">{stats.active}<small>/{stats.total}</small></div>
      </div>
      <div className="stat-card">
        <div className="lbl">Tokens · session</div>
        <div className="val mono">{(stats.tokens/1000).toFixed(1)}<small>k</small></div>
        <div className="spark">
          {stats.spark.map((v, i) =>
            <span key={i} style={{ height: `${4 + v*20}px`, opacity: 0.35 + v*0.55 }} />)}
        </div>
      </div>
      <div className="stat-card">
        <div className="lbl">Cost · hour</div>
        <div className="val mono">${stats.cost.toFixed(2)}<small> / $25.00</small></div>
        <div className="spark" style={{ height: 6, marginTop: 8 }}>
          <span style={{
            flex: stats.cost / 25, height: 4, background: "#E07A5F", opacity: 0.85, borderRadius: 2
          }} />
          <span style={{
            flex: 1 - stats.cost / 25, height: 4, background: "rgba(255,255,255,0.06)", opacity: 1, borderRadius: 2
          }} />
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <div className="row"><div className="sw" style={{ background: "#8be38b" }}></div>active</div>
      <div className="row"><div className="sw" style={{ background: "#e6b85c" }}></div>waiting</div>
      <div className="row"><div className="sw" style={{ background: "#e26d6d" }}></div>error</div>
      <div className="row"><div className="ln"></div>delegation</div>
      <div className="row"><div className="ln dashed"></div>idle link</div>
    </div>
  );
}

function ZoomControls() {
  return (
    <div className="zoom">
      <button onClick={() => window.__zoom?.in()}>+</button>
      <button onClick={() => window.__zoom?.out()}>−</button>
      <button onClick={() => window.__zoom?.home()} style={{ fontSize: 11 }}>⊙</button>
    </div>
  );
}

function Commander({ onSubmit }) {
  const [val, setVal] = useStateU("");
  const ref = useRefU(null);
  useEffectU(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="commander">
      <span className="prompt">›</span>
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
             placeholder="spawn an agent — e.g. retriever://github.com/acme/billing"
             onKeyDown={e => {
               if (e.key === "Enter" && val.trim()) {
                 onSubmit(val.trim());
                 setVal("");
               }
             }} />
      <div className="hint"><span className="kbd">⌘K</span><span>focus</span></div>
    </div>
  );
}

function DetailPanel({ agent, agentMap, agents, edges, onSelect, onClose }) {
  if (!agent) {
    return (
      <aside className="detail">
        <div className="detail-empty">
          <div className="ico">∅</div>
          <p>Select an agent to inspect its task, tools, and traffic.</p>
          <small>Tap a node, or use ⌘K to spawn a new one.</small>
        </div>
      </aside>
    );
  }
  const live = agentMap[agent.id];
  const role = AGENT_ROLES[agent.role];
  const neighbors = useMemoU(() => {
    const out = [], inc = [];
    for (const [a, b, w] of edges) {
      if (a === agent.id) {
        const ag = agents.find(x => x.id === b);
        if (ag) out.push({ ag, w });
      } else if (b === agent.id) {
        const ag = agents.find(x => x.id === a);
        if (ag) inc.push({ ag, w });
      }
    }
    return { out, inc };
  }, [agent.id, edges, agents]);

  return (
    <aside className="detail">
      <div className="detail-hd">
        <div className="detail-hd-row">
          <div className="agent-glyph mono"
               style={{ color: role.color, borderColor: "rgba(255,255,255,0.18)" }}>
            {agent.glyph}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="mono">{agent.name}</h3>
            <div className="role">{role.label} · {agent.model}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}>×</button>
        </div>
        <div className="status-row">
          <span className={"status-chip " + live.status}>
            <span className="d"></span>{live.status}
          </span>
          <span className="status-chip">runtime <span className="mono" style={{ marginLeft: 4 }}>{live.runtime}</span></span>
          <span className="status-chip">pid <span className="mono" style={{ marginLeft: 4 }}>2481{agent.id.length}</span></span>
        </div>
      </div>

      <div className="detail-body">
        <div className="section">
          <div className="section-hd"><div className="section-title">Current task</div></div>
          <div className="task">
            <div className="t-head"><span className="dot"></span>step {Math.floor(live.progress * 5) + 1} / 5</div>
            <p>{live.task}</p>
            {live.progress > 0 && (
              <div className="progress"><div style={{ width: `${live.progress*100}%` }}></div></div>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-hd"><div className="section-title">Resources</div></div>
          <dl className="kv">
            <dt>Tokens</dt><dd className="mono">{live.tokens.toLocaleString()}</dd>
            <dt>Cost</dt><dd className="mono">${live.cost.toFixed(2)}</dd>
            <dt>Model</dt><dd className="mono">{agent.model}</dd>
            <dt>Memory</dt><dd className="mono">{(12 + agent.id.length * 3.2).toFixed(1)} MB</dd>
            <dt>Trust</dt><dd className="mono">{agent.role === "sentinel" ? "system" : "user · scoped"}</dd>
          </dl>
        </div>

        <div className="section">
          <div className="section-hd"><div className="section-title">Tools · {agent.tools.length}</div></div>
          <div className="tools">
            {agent.tools.map(t => <span key={t} className="tool-chip mono">{t}</span>)}
          </div>
        </div>

        <div className="section">
          <div className="section-hd"><div className="section-title">Delegates to · {neighbors.out.length}</div></div>
          <div className="neighbors">
            {neighbors.out.length === 0 && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>— none —</div>}
            {neighbors.out.map(({ ag, w }) => (
              <div key={ag.id} className="neighbor" onClick={() => onSelect(ag.id)}>
                <span className="agent-glyph mono" style={{
                  width: 22, height: 22, fontSize: 11,
                  color: AGENT_ROLES[ag.role].color
                }}>{ag.glyph}</span>
                <span className="nm mono">{ag.name}</span>
                <span className="role">{AGENT_ROLES[ag.role].label}</span>
                <span className="arrow mono">w={w.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-hd"><div className="section-title">Receives from · {neighbors.inc.length}</div></div>
          <div className="neighbors">
            {neighbors.inc.length === 0 && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>— none —</div>}
            {neighbors.inc.map(({ ag, w }) => (
              <div key={ag.id} className="neighbor" onClick={() => onSelect(ag.id)}>
                <span className="agent-glyph mono" style={{
                  width: 22, height: 22, fontSize: 11,
                  color: AGENT_ROLES[ag.role].color
                }}>{ag.glyph}</span>
                <span className="nm mono">{ag.name}</span>
                <span className="role">{AGENT_ROLES[ag.role].label}</span>
                <span className="arrow mono">w={w.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Console({ events, filter, setFilter, focusAgent, onPickAgent }) {
  const bodyRef = useRefU(null);
  const [autoscroll, setAutoscroll] = useStateU(true);

  // counts
  const counts = useMemoU(() => {
    const c = { all: events.length, info: 0, ok: 0, warn: 0, err: 0, tool: 0 };
    for (const e of events) if (c[e.lvl] !== undefined) c[e.lvl]++;
    return c;
  }, [events]);

  const filtered = useMemoU(() => {
    let evs = events;
    if (filter !== "all") evs = evs.filter(e => e.lvl === filter);
    if (focusAgent) evs = evs.filter(e => e.agent === focusAgent);
    return evs.slice(-160);
  }, [events, filter, focusAgent]);

  useEffectU(() => {
    if (autoscroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [filtered, autoscroll]);

  return (
    <div className="console">
      <div className="console-hd">
        <div className="title"><span className="d"></span>kernel.events</div>
        <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>
          streaming → ~/.mos/runs/2026-05-11T14-22.jsonl
        </span>
        {focusAgent && (
          <span className="pill" style={{ marginLeft: 12 }}>
            <span style={{ color: "var(--text-faint)" }}>focus:</span>
            <span className="mono">{focusAgent}</span>
            <span onClick={() => onPickAgent(null)} style={{ cursor: "default", marginLeft: 4 }}>×</span>
          </span>
        )}
        <div className="filter-tabs">
          {["all","info","ok","warn","err","tool"].map(k => (
            <div key={k} className={"ftab" + (filter === k ? " active" : "")}
                 onClick={() => setFilter(k)}>
              <span>{k}</span><span className="c">{counts[k] ?? 0}</span>
            </div>
          ))}
          <label className="ftab" style={{ cursor: "default", marginLeft: 6 }}>
            <input type="checkbox" checked={autoscroll}
                   onChange={e => setAutoscroll(e.target.checked)}
                   style={{ accentColor: "#E07A5F", width: 11, height: 11 }} />
            auto-scroll
          </label>
        </div>
      </div>
      <div className="console-body" ref={bodyRef}>
        {filtered.map(e => (
          <div key={e.id} className={"evt " + e.lvl}>
            <span className="ts mono">{e.ts}</span>
            <span className="agent mono"
                  onClick={() => onPickAgent(e.agent)}
                  style={{ cursor: "default" }}>
              <span className="lvl">{e.lvl.toUpperCase().padEnd(4," ")}</span>{e.agent}
            </span>
            <span className="msg">
              {e.boot
                ? <span className="arg mono">{e.parts[0]}</span>
                : e.parts.map((p, i) => (
                    <span key={i}>
                      {i > 0 && <span className="arrow"> </span>}
                      <span className={i === 0 ? "mono" : i === 1 ? "arg mono" : "mono"}
                            style={i === 0 ? { color: "var(--text)" }
                                  : i === 1 ? { color: "var(--accent)" }
                                  : { color: "var(--text-dim)" }}>
                        {p}
                      </span>
                    </span>
                  ))
              }
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  Topbar, LeftRail, StatOverlay, Legend, ZoomControls, Commander, DetailPanel, Console,
});
