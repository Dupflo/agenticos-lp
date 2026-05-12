// agent-graph.jsx — SVG force graph view: nodes, edges, pulses

const { useRef: useRefG, useEffect: useEffectG, useState: useStateG, useMemo: useMemoG } = React;

function AgentGraph({ agents, agentMap, edges, selected, onSelect, dims, showLabels = true, edgeMode = "curved" }) {
  const { width, height } = dims;
  const { nodes, links, setDrag, moveDrag } = useForceLayout(agents, edges, { width, height });
  const pulses = useTraffic(links, agents, agentMap, { rate: 2.6, speed: 0.0011 });

  const svgRef = useRefG(null);
  const [hover, setHover] = useStateG(null);
  const [dragging, setDragging] = useStateG(null);
  const [view, setView] = useStateG({ x: 0, y: 0, k: 1 }); // pan/zoom
  const panState = useRefG(null);

  // helper: screen px → svg coord (account for pan/zoom)
  const toSvg = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    const sx = (clientX - r.left);
    const sy = (clientY - r.top);
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  };

  // node drag
  const onNodeDown = (e, id) => {
    e.stopPropagation();
    setDragging(id);
    setDrag(id);
  };
  useEffectG(() => {
    if (!dragging && !panState.current) return;
    const onMove = (e) => {
      if (dragging) {
        const p = toSvg(e.clientX, e.clientY);
        moveDrag(dragging, p.x, p.y);
      } else if (panState.current) {
        const dx = e.clientX - panState.current.x0;
        const dy = e.clientY - panState.current.y0;
        setView(v => ({ ...v, x: panState.current.vx0 + dx, y: panState.current.vy0 + dy }));
      }
    };
    const onUp = () => {
      if (dragging) { setDrag(null); setDragging(null); }
      panState.current = null;
      if (svgRef.current) svgRef.current.classList.remove("dragging");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  const onBgDown = (e) => {
    panState.current = { x0: e.clientX, y0: e.clientY, vx0: view.x, vy0: view.y };
    if (svgRef.current) svgRef.current.classList.add("dragging");
  };
  const onWheel = (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView(v => {
      const k2 = Math.max(0.4, Math.min(2.4, v.k * factor));
      const r = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      // zoom toward cursor
      const x = mx - (mx - v.x) * (k2 / v.k);
      const y = my - (my - v.y) * (k2 / v.k);
      return { x, y, k: k2 };
    });
  };
  // expose zoom controls
  useEffectG(() => {
    window.__zoom = {
      in:   () => setView(v => ({ ...v, k: Math.min(2.4, v.k * 1.2) })),
      out:  () => setView(v => ({ ...v, k: Math.max(0.4, v.k / 1.2) })),
      home: () => setView({ x: 0, y: 0, k: 1 }),
    };
  }, []);

  // selected neighborhood (1-hop) for emphasis
  const highlighted = useMemoG(() => {
    if (!selected && !hover) return null;
    const id = selected || hover;
    const set = new Set([id]);
    for (const [a,b] of edges) {
      if (a === id) set.add(b);
      if (b === id) set.add(a);
    }
    return set;
  }, [selected, hover, edges]);

  // ── render helpers
  const linkPath = (a, b) => {
    if (edgeMode === "straight") return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    // perpendicular offset for slight curve
    const off = Math.min(40, len * 0.12);
    const px = mx - (dy/len) * off;
    const py = my + (dx/len) * off;
    return `M ${a.x} ${a.y} Q ${px} ${py} ${b.x} ${b.y}`;
  };
  const linkPoint = (a, b, t) => {
    if (edgeMode === "straight") {
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const off = Math.min(40, len * 0.12);
    const px = mx - (dy/len) * off;
    const py = my + (dx/len) * off;
    const u = 1 - t;
    return {
      x: u*u*a.x + 2*u*t*px + t*t*b.x,
      y: u*u*a.y + 2*u*t*py + t*t*b.y,
    };
  };

  const pulseColor = (lvl) => ({
    info: "#7ec5ff", ok: "#8be38b", warn: "#e6b85c", err: "#e26d6d", tool: "#c89cff",
  }[lvl] || "#e8e8e6");

  return (
    <div className="stage">
      <div className="bg-grid"></div>
      <div className="vignette"></div>
      <svg ref={svgRef}
           viewBox={`0 0 ${width} ${height}`}
           preserveAspectRatio="xMidYMid slice"
           onMouseDown={onBgDown}
           onWheel={onWheel}>
        <defs>
          <radialGradient id="nodeGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(224,122,95,0.55)" />
            <stop offset="60%" stopColor="rgba(224,122,95,0.08)" />
            <stop offset="100%" stopColor="rgba(224,122,95,0)" />
          </radialGradient>
          <radialGradient id="nodeGlowKernel" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(224,122,95,0.85)" />
            <stop offset="50%" stopColor="rgba(224,122,95,0.18)" />
            <stop offset="100%" stopColor="rgba(224,122,95,0)" />
          </radialGradient>
          <filter id="pulseBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* concentric guide rings — pure decoration */}
          <g opacity="0.18" pointerEvents="none">
            {[180, 320, 460].map((r,i) =>
              <circle key={i} cx={width/2} cy={height/2} r={r} fill="none"
                      stroke="rgba(255,255,255,0.08)" strokeDasharray="2 6" />)}
          </g>

          {/* edges */}
          <g>
            {links.map((l, i) => {
              const a = nodes[l.s], b = nodes[l.t];
              const aId = agents[l.s].id, bId = agents[l.t].id;
              const dim = highlighted && !(highlighted.has(aId) && highlighted.has(bId));
              return (
                <path key={i}
                      d={linkPath(a, b)}
                      fill="none"
                      stroke={dim ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)"}
                      strokeWidth={0.6 + l.w * 0.9}
                      strokeDasharray={agentMap[aId].status === "idle" || agentMap[bId].status === "idle" ? "3 5" : ""}
                />
              );
            })}
          </g>

          {/* pulses — small dots traveling along edges */}
          <g pointerEvents="none">
            {pulses.map((p, i) => {
              const l = links[p.linkIdx];
              const a = nodes[l.s], b = nodes[l.t];
              const pt = linkPoint(a, b, Math.min(1, p.t));
              const c = pulseColor(p.lvl);
              return (
                <g key={i} transform={`translate(${pt.x} ${pt.y})`}>
                  <circle r={4} fill={c} opacity="0.18" filter="url(#pulseBlur)" />
                  <circle r={1.8} fill={c} />
                </g>
              );
            })}
          </g>

          {/* nodes */}
          <g>
            {agents.map((a, i) => {
              const n = nodes[i];
              const isSel = selected === a.id;
              const isHov = hover === a.id;
              const dim = highlighted && !highlighted.has(a.id);
              const isKernel = a.id === "kernel";
              const r = isKernel ? 26 : 18;
              const status = agentMap[a.id].status;
              const statusColor = status === "active" ? "#8be38b"
                                : status === "waiting" ? "#e6b85c"
                                : status === "err"    ? "#e26d6d"
                                : "rgba(255,255,255,0.25)";
              return (
                <g key={a.id} transform={`translate(${n.x} ${n.y})`}
                   onMouseDown={(e) => onNodeDown(e, a.id)}
                   onMouseEnter={() => setHover(a.id)}
                   onMouseLeave={() => setHover(null)}
                   onClick={(e) => { e.stopPropagation(); onSelect(a.id); }}
                   style={{ cursor: "default", opacity: dim ? 0.35 : 1, transition: "opacity .2s" }}>
                  {/* glow */}
                  <circle r={r * 2.4} fill={`url(#${isKernel ? "nodeGlowKernel" : "nodeGlow"})`}
                          opacity={status === "active" ? 1 : 0.35} />
                  {/* halo if selected */}
                  {(isSel || isHov) && (
                    <circle r={r + 6} fill="none" stroke="rgba(224,122,95,0.9)"
                            strokeWidth="1" strokeDasharray="2 3" />
                  )}
                  {/* body */}
                  <circle r={r} fill={isKernel ? "#1a1410" : "#141414"}
                          stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
                  <circle r={r} fill="none" stroke={statusColor}
                          strokeWidth={isKernel ? "1.2" : "1"}
                          strokeOpacity={status === "idle" ? 0.4 : 0.8}
                          strokeDasharray={status === "waiting" ? "4 4" : ""} />
                  {/* progress arc for active agents */}
                  {status === "active" && agentMap[a.id].progress > 0 && (() => {
                    const prog = agentMap[a.id].progress;
                    const R = r + 3;
                    const ang = prog * Math.PI * 2;
                    const x1 = 0, y1 = -R;
                    const x2 = Math.sin(ang) * R, y2 = -Math.cos(ang) * R;
                    const large = ang > Math.PI ? 1 : 0;
                    return <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`}
                                 fill="none" stroke="#E07A5F" strokeWidth="1.5"
                                 strokeLinecap="round" opacity="0.85" />;
                  })()}
                  {/* glyph */}
                  <text textAnchor="middle" dominantBaseline="central" y="0.5"
                        fontFamily="'JetBrains Mono', monospace"
                        fontWeight="600"
                        fontSize={isKernel ? 14 : 12}
                        fill={isKernel ? "#E07A5F" : "#e8e8e6"}>
                    {a.glyph}
                  </text>
                  {/* status dot */}
                  <circle cx={r * 0.72} cy={-r * 0.72} r={3.2}
                          fill={statusColor}
                          stroke="#0a0a0a" strokeWidth="1.5" />
                  {/* label */}
                  {showLabels && (
                    <g transform={`translate(0 ${r + 16})`}>
                      <text textAnchor="middle"
                            fontFamily="'JetBrains Mono', monospace"
                            fontSize="11" fill="#e8e8e6" opacity="0.92"
                            style={{ paintOrder: "stroke", stroke: "#0a0a0a", strokeWidth: 3 }}>
                        {a.name}
                      </text>
                      <text textAnchor="middle" y="13"
                            fontFamily="'Inter', sans-serif"
                            fontSize="9.5" fill="#5a5a55"
                            style={{ paintOrder: "stroke", stroke: "#0a0a0a", strokeWidth: 3 }}>
                        {AGENT_ROLES[a.role].label.toLowerCase()}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

Object.assign(window, { AgentGraph });
