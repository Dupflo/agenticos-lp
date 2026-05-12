// agent-sim.jsx — tiny force-directed layout + traffic pulse generator

const { useRef, useEffect, useState, useMemo, useCallback } = React;

// Run a few seeded ticks before mount so the graph appears settled, then keep
// ticking gently to give the mesh life.
function useForceLayout(agents, edges, opts = {}) {
  const { width = 1200, height = 700, charge = -2400, link = 180, gravity = 0.05 } = opts;

  // build mutable node array once per agents identity
  const nodes = useRef(null);
  const links = useRef(null);
  const [, force] = useState(0); // trigger render
  const tickRef = useRef(0);
  const draggingRef = useRef(null);

  if (!nodes.current || nodes.current.length !== agents.length) {
    // seed positions in a rough ring with kernel pinned at center
    const n = agents.length;
    nodes.current = agents.map((a, i) => {
      if (a.pinned) {
        return { id: a.id, x: width/2, y: height/2, vx: 0, vy: 0, fixed: true };
      }
      const ang = (i / n) * Math.PI * 2;
      const r = Math.min(width, height) * 0.32;
      return {
        id: a.id,
        x: width/2 + Math.cos(ang) * r + (Math.random()-0.5)*40,
        y: height/2 + Math.sin(ang) * r + (Math.random()-0.5)*40,
        vx: 0, vy: 0, fixed: false,
      };
    });
  }
  if (!links.current) {
    const idx = Object.fromEntries(agents.map((a,i)=>[a.id,i]));
    links.current = edges.map(([a,b,w]) => ({ s: idx[a], t: idx[b], w }));
  }

  // single tick
  const step = useCallback((dt = 1) => {
    const ns = nodes.current, ls = links.current;
    const cx = width / 2, cy = height / 2;
    // repulsion (O(n^2) — fine for ~20 nodes)
    for (let i=0;i<ns.length;i++){
      for (let j=i+1;j<ns.length;j++){
        const a = ns[i], b = ns[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx*dx + dy*dy;
        if (d2 < 0.01) { dx = Math.random()-0.5; dy = Math.random()-0.5; d2 = 1; }
        const d = Math.sqrt(d2);
        const f = charge / d2;
        const fx = (dx/d) * f, fy = (dy/d) * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    // spring links
    for (const l of ls) {
      const a = ns[l.s], b = ns[l.t];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const desired = link;
      const f = (d - desired) * 0.04 * (0.3 + l.w * 0.7);
      const fx = (dx/d) * f, fy = (dy/d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    // gravity to center
    for (const n of ns) {
      n.vx += (cx - n.x) * gravity * 0.02;
      n.vy += (cy - n.y) * gravity * 0.02;
    }
    // integrate + damp
    for (const n of ns) {
      if (n.fixed) { n.vx = n.vy = 0; n.x = cx; n.y = cy; continue; }
      if (draggingRef.current === n.id) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.78; n.vy *= 0.78;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
    }
    tickRef.current++;
  }, [width, height, charge, link, gravity]);

  // pre-settle once
  const seededRef = useRef(false);
  if (!seededRef.current) {
    for (let i=0;i<260;i++) step(1);
    seededRef.current = true;
  }

  // animation loop
  useEffect(() => {
    let raf;
    const loop = () => {
      step(0.6);
      force(t => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  return {
    nodes: nodes.current,
    links: links.current,
    setDrag: (id) => { draggingRef.current = id; },
    moveDrag: (id, x, y) => {
      const n = nodes.current.find(n => n.id === id);
      if (n) { n.x = x; n.y = y; n.vx = n.vy = 0; }
    },
  };
}

// Pulse generator — emits short "packets" traveling from src to tgt along a link.
// Pulses are stored in a ref + rendered on RAF for buttery motion.
function useTraffic(links, agents, agentMap, opts = {}) {
  const { rate = 1.6, speed = 0.0009 } = opts; // packets/sec, progress/ms
  const pulses = useRef([]); // { linkIdx, t, lvl }
  const [, force] = useState(0);
  const lastSpawn = useRef(performance.now());

  useEffect(() => {
    let raf;
    const tick = () => {
      const now = performance.now();
      // spawn
      const interval = 1000 / rate;
      while (now - lastSpawn.current > interval) {
        lastSpawn.current += interval;
        // pick a link weighted by its weight × source-agent activity
        const candidates = links.map((l, i) => {
          const src = agents[l.s];
          const a = agentMap[src.id];
          const mult = a.status === "active" ? 1 : a.status === "waiting" ? 0.2 : a.status === "err" ? 0.1 : 0;
          return { i, w: l.w * mult };
        });
        const total = candidates.reduce((s,c)=>s+c.w, 0);
        if (total <= 0) break;
        let r = Math.random() * total;
        let pick = candidates[0];
        for (const c of candidates) { r -= c.w; if (r <= 0) { pick = c; break; } }
        const lvls = ["info","info","info","tool","ok","ok","warn","err"];
        const a = agentMap[agents[links[pick.i].s].id];
        const lvl = a.status === "err" ? "err" : lvls[Math.floor(Math.random()*lvls.length)];
        pulses.current.push({ linkIdx: pick.i, t: 0, lvl, born: now });
        if (pulses.current.length > 80) pulses.current.shift();
      }
      // advance
      const dt = 16; // assume ~60fps
      pulses.current = pulses.current.filter(p => {
        p.t += speed * dt;
        return p.t < 1.02;
      });
      force(t => t + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [links, agents, agentMap, rate, speed]);

  return pulses.current;
}

// Rolling event ticker — appends synthetic events on a cadence
function useEventStream(seed, agents, agentMap, opts = {}) {
  const { rate = 1.4 } = opts; // events / sec
  const [events, setEvents] = useState(seed);
  const nextId = useRef(seed.length);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      // pick an agent that's active or waiting
      const active = agents.filter(a => {
        const s = agentMap[a.id].status;
        return s === "active" || s === "waiting" || s === "err";
      });
      const target = active[Math.floor(Math.random()*active.length)];
      const ev = makeEvent(nextId.current++, target?.id);
      setEvents(es => {
        const next = [...es, ev];
        return next.length > 220 ? next.slice(next.length - 220) : next;
      });
      const jitter = (0.5 + Math.random()) * (1000 / rate);
      setTimeout(tick, jitter);
    };
    const id = setTimeout(tick, 1000 / rate);
    return () => { alive = false; clearTimeout(id); };
  }, [agents, agentMap, rate]);

  return events;
}

Object.assign(window, { useForceLayout, useTraffic, useEventStream });
