// agent-app.jsx — root app, wires data + UI + tweaks

const { useState: useStateA, useMemo: useMemoA, useEffect: useEffectA, useRef: useRefA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showLabels": true,
  "edgeMode": "curved",
  "eventRate": 1.6,
  "pulseRate": 2.6,
  "density": "regular",
  "accent": "#E07A5F"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // live agent state (status / progress / tokens drift over time)
  const [agentMap, setAgentMap] = useStateA(() => {
    const m = {};
    for (const a of AGENTS) m[a.id] = { ...a };
    return m;
  });

  const agents = useMemoA(() => AGENTS, []);
  const [selected, setSelected] = useStateA("loom");
  const [filter, setFilter] = useStateA("all");
  const [consoleFocus, setConsoleFocus] = useStateA(null);
  const [activeRail, setActiveRail] = useStateA("mesh");

  // dims for the svg (use container size)
  const [dims, setDims] = useStateA({ width: 1400, height: 800 });
  useEffectA(() => {
    const onR = () => setDims({ width: window.innerWidth, height: window.innerHeight });
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // drift agent state — tokens climb, progress wraps, statuses occasionally flip
  useEffectA(() => {
    const id = setInterval(() => {
      setAgentMap(prev => {
        const next = { ...prev };
        for (const a of agents) {
          const cur = { ...next[a.id] };
          if (cur.status === "active") {
            cur.progress = Math.min(1, cur.progress + (0.005 + Math.random() * 0.012));
            cur.tokens += Math.floor(40 + Math.random() * 220);
            cur.cost += Math.random() * 0.004 * (cur.role === "reasoner" ? 5 : 1);
            // occasionally roll over progress + change task subtly
            if (cur.progress >= 0.999) {
              cur.progress = 0.05 + Math.random() * 0.2;
            }
          } else if (cur.status === "waiting") {
            cur.tokens += Math.floor(Math.random() * 30);
          }
          next[a.id] = cur;
        }
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [agents]);

  // derived stats
  const stats = useMemoA(() => {
    const vals = Object.values(agentMap);
    const active = vals.filter(v => v.status === "active").length;
    const tokens = vals.reduce((s,v) => s + v.tokens, 0);
    const cost = vals.reduce((s,v) => s + v.cost, 0);
    return {
      total: vals.length,
      active,
      tokens,
      cost,
      tps: 1280 + Math.floor(Math.sin(Date.now()/4000) * 220 + Math.random()*120),
      latency: 180 + Math.floor(Math.sin(Date.now()/3000) * 40 + Math.random()*30),
      spark: Array.from({length: 28}, (_, i) =>
        0.4 + 0.5 * Math.sin(i * 0.6 + Date.now()/2200) + Math.random() * 0.15),
    };
  }, [agentMap]);

  // event stream
  const events = useEventStream(SEED_EVENTS, agents, agentMap, { rate: t.eventRate });

  const selectedAgent = agents.find(a => a.id === selected) || null;

  const onCommanderSubmit = (text) => {
    // append a synthetic kernel event
    const ev = {
      id: Date.now(),
      ts: fmtTs(0),
      lvl: "info",
      agent: "kernel",
      parts: ["spawn", "→", text],
    };
    // we don't actually mutate events from outside the hook; just nudge stat
    // (kept minimal — a real OS would dispatch)
    console.log("commander:", ev);
  };

  // apply tweaks → CSS vars
  useEffectA(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
    document.documentElement.style.setProperty("--accent-soft", t.accent + "29");
  }, [t.accent]);

  return (
    <>
      <AgentGraph
        agents={agents}
        agentMap={agentMap}
        edges={EDGES}
        selected={selected}
        onSelect={(id) => setSelected(s => s === id ? null : id)}
        dims={dims}
        showLabels={t.showLabels}
        edgeMode={t.edgeMode}
      />

      <div className="frame">
        <Topbar stats={stats} />
        <LeftRail active={activeRail} onPick={setActiveRail} />
        <StatOverlay stats={stats} />
        <Legend />
        <ZoomControls />
        <Commander onSubmit={onCommanderSubmit} />
        <DetailPanel
          agent={selectedAgent}
          agentMap={agentMap}
          agents={agents}
          edges={EDGES}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
        <Console
          events={events}
          filter={filter}
          setFilter={setFilter}
          focusAgent={consoleFocus}
          onPickAgent={setConsoleFocus}
        />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Display" />
        <TweakToggle label="Node labels" value={t.showLabels}
                     onChange={v => setTweak("showLabels", v)} />
        <TweakRadio  label="Edges" value={t.edgeMode}
                     options={["curved","straight"]}
                     onChange={v => setTweak("edgeMode", v)} />
        <TweakColor  label="Accent" value={t.accent}
                     options={["#E07A5F","#7ec5ff","#8be38b","#c89cff","#e6b85c"]}
                     onChange={v => setTweak("accent", v)} />
        <TweakSection label="Simulation" />
        <TweakSlider label="Event rate"  value={t.eventRate}
                     min={0.2} max={6} step={0.1} unit="/s"
                     onChange={v => setTweak("eventRate", v)} />
        <TweakSlider label="Pulse rate"  value={t.pulseRate}
                     min={0.5} max={8} step={0.1} unit="/s"
                     onChange={v => setTweak("pulseRate", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
