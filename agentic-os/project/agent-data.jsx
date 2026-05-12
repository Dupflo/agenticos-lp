// agent-data.jsx — mock agent definitions, relationships, and event stream

const AGENT_ROLES = {
  orchestrator: { label: "Orchestrator", color: "#E07A5F" },
  retriever:    { label: "Retriever",    color: "#7ec5ff" },
  reasoner:     { label: "Reasoner",     color: "#c89cff" },
  executor:     { label: "Executor",     color: "#8be38b" },
  sentinel:     { label: "Sentinel",     color: "#e6b85c" },
  scribe:       { label: "Scribe",       color: "#9a9a93" },
};

// Seed roster — names lean monospace/codename to fit the OS aesthetic
const AGENTS = [
  { id: "kernel",     name: "kernel",     glyph: "K",  role: "orchestrator", status: "active",
    task: "Routing user request through capability graph",
    progress: 0.62, tokens: 184213, cost: 1.84, runtime: "00:14:22",
    model: "claude-opus-4.5", tools: ["dispatch", "trace", "budget"],
    pos: { x: 0, y: 0 }, pinned: true },

  { id: "atlas",      name: "atlas",      glyph: "A",  role: "retriever",   status: "active",
    task: "Crawling vector index • shard 3/8",
    progress: 0.41, tokens: 92110,  cost: 0.31, runtime: "00:08:11",
    model: "haiku-4.5", tools: ["search.web", "search.local", "embed"] },

  { id: "scout",      name: "scout",      glyph: "S",  role: "retriever",   status: "waiting",
    task: "Awaiting credentials for github://acme",
    progress: 0.18, tokens: 31002,  cost: 0.09, runtime: "00:02:48",
    model: "haiku-4.5", tools: ["github.read", "fs.read", "grep"] },

  { id: "loom",       name: "loom",       glyph: "L",  role: "reasoner",    status: "active",
    task: "Synthesizing draft response from 12 sources",
    progress: 0.74, tokens: 220488, cost: 2.15, runtime: "00:11:03",
    model: "claude-sonnet-4.5", tools: ["plan", "critique", "write"] },

  { id: "praxis",     name: "praxis",     glyph: "P",  role: "reasoner",    status: "active",
    task: "Evaluating tradeoffs across 4 strategies",
    progress: 0.55, tokens: 71290,  cost: 0.66, runtime: "00:05:31",
    model: "claude-sonnet-4.5", tools: ["plan", "score", "vote"] },

  { id: "forge",      name: "forge",      glyph: "F",  role: "executor",    status: "active",
    task: "Running test suite (pkg/auth) — 142/210",
    progress: 0.68, tokens: 11820,  cost: 0.04, runtime: "00:01:54",
    model: "haiku-4.5", tools: ["shell", "fs.write", "git"] },

  { id: "anvil",      name: "anvil",      glyph: "Λ",  role: "executor",    status: "idle",
    task: "—",
    progress: 0,    tokens: 0,      cost: 0,    runtime: "00:00:00",
    model: "haiku-4.5", tools: ["shell", "docker", "k8s"] },

  { id: "ledger",     name: "ledger",     glyph: "$",  role: "sentinel",    status: "active",
    task: "Enforcing $25/hr budget — 41% used",
    progress: 0.41, tokens: 4109,   cost: 0.01, runtime: "00:14:22",
    model: "haiku-4.5", tools: ["budget", "alert", "halt"] },

  { id: "warden",     name: "warden",     glyph: "W",  role: "sentinel",    status: "active",
    task: "Scanning tool calls for policy violations",
    progress: 0.99, tokens: 9012,   cost: 0.02, runtime: "00:14:22",
    model: "haiku-4.5", tools: ["policy", "approve", "deny"] },

  { id: "harbor",     name: "harbor",     glyph: "H",  role: "sentinel",    status: "err",
    task: "Rate limit hit on api.notion.com — backing off 28s",
    progress: 0.12, tokens: 220,    cost: 0.00, runtime: "00:00:34",
    model: "haiku-4.5", tools: ["http", "auth", "retry"] },

  { id: "echo",       name: "echo",       glyph: "E",  role: "scribe",      status: "active",
    task: "Streaming trace to ~/.mos/runs/2026-05-11T14-22.jsonl",
    progress: 0.81, tokens: 152340, cost: 0.05, runtime: "00:14:22",
    model: "haiku-4.5", tools: ["fs.write", "stream", "compress"] },

  { id: "mosaic",     name: "mosaic",     glyph: "M",  role: "scribe",      status: "waiting",
    task: "Holding rollup until kernel signals completion",
    progress: 0.20, tokens: 8420,   cost: 0.01, runtime: "00:14:22",
    model: "haiku-4.5", tools: ["summarize", "diff", "report"] },
];

// Directed edges = delegation / data flow. weight ~ traffic.
const EDGES = [
  // kernel orchestrates everything
  ["kernel", "atlas",   0.9],
  ["kernel", "scout",   0.4],
  ["kernel", "loom",    0.95],
  ["kernel", "praxis",  0.7],
  ["kernel", "forge",   0.8],
  ["kernel", "anvil",   0.1],
  ["kernel", "echo",    1.0],
  ["kernel", "ledger",  0.6],
  ["kernel", "warden",  0.6],
  // retrievers feed reasoners
  ["atlas",  "loom",    0.85],
  ["scout",  "loom",    0.3],
  ["atlas",  "praxis",  0.4],
  // reasoners hand off to executors
  ["loom",   "forge",   0.55],
  ["praxis", "forge",   0.45],
  ["praxis", "anvil",   0.15],
  // sentinels watch everyone
  ["warden", "forge",   0.3],
  ["warden", "anvil",   0.2],
  ["ledger", "loom",    0.25],
  ["ledger", "atlas",   0.2],
  // harbor mediates external
  ["harbor", "atlas",   0.4],
  ["harbor", "scout",   0.3],
  // scribes collect
  ["loom",   "mosaic",  0.5],
  ["forge",  "echo",    0.6],
  ["atlas",  "echo",    0.5],
];

// Pre-canned event templates used by the live ticker
const EVENT_TEMPLATES = [
  { lvl: "info", agent: "kernel", msg: ["dispatch →", "atlas",   "query.semantic(\"oauth refresh flow\")"] },
  { lvl: "tool", agent: "atlas",  msg: ["search.local", "→", "hit 14 / 3.2k chunks  (412ms)"] },
  { lvl: "tool", agent: "atlas",  msg: ["embed", "→", "batch=32  model=nomic-v2  (188ms)"] },
  { lvl: "info", agent: "loom",   msg: ["plan", "→", "draft 3 candidate responses, then critique"] },
  { lvl: "ok",   agent: "loom",   msg: ["complete", "step 2/5", "synthesis ok  (1.4s)"] },
  { lvl: "tool", agent: "forge",  msg: ["shell", "→", "pnpm test --filter pkg/auth"] },
  { lvl: "ok",   agent: "forge",  msg: ["test passed", "auth.spec.ts", "142/210"] },
  { lvl: "warn", agent: "ledger", msg: ["budget", "→", "41% of $25/hr cap used in 14m"] },
  { lvl: "info", agent: "warden", msg: ["policy.check", "fs.write", "approved → ~/projects/acme"] },
  { lvl: "warn", agent: "warden", msg: ["policy.check", "shell", "denied → rm -rf /"] },
  { lvl: "err",  agent: "harbor", msg: ["429", "api.notion.com", "rate limit  retry in 28s"] },
  { lvl: "info", agent: "scout",  msg: ["awaiting", "github://acme", "credentials prompt sent to user"] },
  { lvl: "tool", agent: "praxis", msg: ["score", "→", "candidate A=0.81  B=0.74  C=0.69  D=0.52"] },
  { lvl: "ok",   agent: "praxis", msg: ["vote", "→", "selected candidate A"] },
  { lvl: "info", agent: "echo",   msg: ["stream", "→", "+1.2 MB → runs/2026-05-11T14-22.jsonl"] },
  { lvl: "tool", agent: "mosaic", msg: ["summarize", "→", "rollup queued until kernel.done"] },
  { lvl: "info", agent: "kernel", msg: ["delegate →", "praxis", "evaluate(strategies=4)"] },
  { lvl: "ok",   agent: "atlas",  msg: ["complete", "shard 3/8", "→ loom (124 chunks)"] },
];

// Seed history (most-recent-last)
const SEED_EVENTS = [
  "kernel.boot  v0.42.1  pid=24811",
  "kernel.load  manifest=mos.toml  (12 agents)",
  "kernel.start trace.id=run_4f2a91",
  ...Array.from({length: 22}, () => null),
].map((s, i) => {
  if (typeof s === "string") {
    return { id: i, ts: fmtTs(-32 + i), lvl: "info", agent: "kernel",
             parts: [s], boot: true };
  }
  const tpl = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length];
  return { id: i, ts: fmtTs(-32 + i), lvl: tpl.lvl, agent: tpl.agent, parts: tpl.msg };
});

function fmtTs(deltaSec) {
  // returns HH:MM:SS relative to "now-fixed" 14:22:00
  const base = 14*3600 + 22*60;
  const t = base + deltaSec;
  const h = Math.floor(t/3600), m = Math.floor((t%3600)/60), s = t%60;
  return [h,m,s].map(n => String(n).padStart(2,"0")).join(":");
}

function makeEvent(id, agentId) {
  // produce a fresh event roughly themed for the agent
  const pool = EVENT_TEMPLATES.filter(e => !agentId || e.agent === agentId);
  const tpl = pool[Math.floor(Math.random() * pool.length)] || EVENT_TEMPLATES[0];
  const base = 14*3600 + 22*60 + Math.floor(Math.random()*200);
  const h = Math.floor(base/3600), m = Math.floor((base%3600)/60), s = base%60;
  const ts = [h,m,s].map(n=>String(n).padStart(2,"0")).join(":");
  return { id, ts, lvl: tpl.lvl, agent: tpl.agent, parts: tpl.msg };
}

Object.assign(window, {
  AGENT_ROLES, AGENTS, EDGES, EVENT_TEMPLATES, SEED_EVENTS, makeEvent, fmtTs,
});
