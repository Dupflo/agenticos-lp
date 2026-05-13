# Prompt — Initialisation du projet MOS (MVP Next.js 16)

Scaffold le projet Next.js à partir des fichiers de design exportés depuis Claude Design.
Ce prompt est à coller **en premier**, avant les prompts de câblage (`01-spawn-system.md`, `02-channel-input.md`, `03-remote-control.md`).

À la fin de ce prompt, tu auras :
- Une app Next.js 16 (App Router, TypeScript strict) qui matche les 8 maquettes HTML au pixel
- La structure complète `<project>/.mos/` avec DB SQLite, agents config, channels, memory
- Toutes les API stubs nécessaires aux 3 prompts suivants
- Une UI qui tourne avec `npm run dev` sans aucun TODO laissé en plan

---

## Contexte

Le design existe déjà dans un dossier `Agentic OS/` au même niveau que ce dossier de prompts.
Claude Design a exporté :

| Fichier design | Écran cible (route Next.js) |
|---|---|
| `Agent Visualizer.html` (+ `agent-app.jsx`, `agent-graph.jsx`, `agent-ui.jsx`, `agent-data.jsx`, `agent-sim.jsx`) | `/visualizer` (page d'accueil) |
| `Edit Agent Config.html` | `/agents` *(2-pane : liste + éditeur dans la même page)* |
| `Chat Agent.html` | `/chat` |
| `Memory Editor.html` | `/memory` |
| `Missions.html` | `/missions` |
| `Kanban Board.html` | `/kanban` |
| `Skills Catalog.html` | `/skills` |
| `Dashboard.html` | `/dashboard` |
| `agent-os.css` | Design tokens partagés (CSS variables) |
| `tweaks-panel.jsx` | Composant panneau de tweaks du mesh |

**Règle d'or design** : chaque HTML contient un `<style>` inline qui définit l'apparence exacte de sa page. **Lis le HTML AVANT d'écrire le composant**. Ne dévie pas des tokens.

---

## Prompt à coller dans Claude Code

````
Tu as accès au dossier "Agentic OS/" qui contient le design complet de MOS (Multi-agent OS personnel),
exporté depuis Claude Design : 8 pages HTML standalone + 6 fichiers JSX déjà componentisés.

Ton objectif : migrer ce design dans un projet Next.js 16 propre, fonctionnel, sans perdre un pixel.
À la fin, l'app doit tourner avec `npm run dev` et permettre de naviguer entre toutes les pages.
La logique d'orchestration (spawn d'agents Claude Code, channels, remote control) viendra dans les
prompts suivants — ici on prépare l'UI + les API stubs + la DB.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 1 — SCAFFOLD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Initialise le projet :

```bash
npx create-next-app@latest mos \
  --typescript --tailwind --app --src-dir \
  --import-alias "@/*" --no-git
cd mos

npm install better-sqlite3 @types/better-sqlite3
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install recharts
npm install react-markdown
```

Tu utilises Next.js 16 App Router. **Lis `node_modules/next/dist/docs/`** avant tout — l'API
diffère sensiblement de Next 13/14 que tu connais peut-être.

Conventions clés à respecter :
- Server Components par défaut, "use client" uniquement quand un hook ou un event browser est nécessaire
- `params` et `searchParams` sont **async** dans les route handlers et les pages dynamiques
- `instrumentation.ts` à la racine de `src/` pour le bootstrap des services en background
- TypeScript strict — pas de `any` non documenté

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 2 — DESIGN TOKENS + CSS CONSOLIDÉ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Copie `Agentic OS/agent-os.css` dans `src/app/agent-os.css`. Ce fichier définit ~20 design tokens
(`--bg`, `--accent`, `--ok`, etc.) plus les primitives partagées : `.btn`, `.input`, `.textarea`,
`.select`, `.chip`, `.toggle`, `.radio-group`, `.badge`, `.field-label`. **N'invente pas de nouvelles
couleurs** — tout doit venir de ces variables.

Étends `agent-os.css` avec ces utility classes partagées (utilisées par les modals et états de page) :

```css
/* shared utility classes */
.modal-backdrop{position:fixed;inset:0;z-index:200;
  background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  display:flex;align-items:center;justify-content:center}
.modal-card{background:var(--bg-elev);border:1px solid var(--line-strong);border-radius:12px;
  padding:20px;display:flex;flex-direction:column;gap:14px;max-height:88vh;overflow-y:auto}
.modal-card.w-sm{width:420px} .modal-card.w-md{width:500px} .modal-card.w-lg{width:540px}
.modal-hd{display:flex;align-items:center;justify-content:space-between}
.modal-hd h2{margin:0;font-size:16px;font-weight:600}

.err-banner{font-size:12px;color:var(--err);padding:6px 10px;background:var(--err-soft);border-radius:6px}
.info-banner{font-size:12px;color:var(--info);padding:6px 10px;background:rgba(126,197,255,0.08);border-radius:6px}

.center-state{flex:1;padding:40px 20px;text-align:center;color:var(--text-faint);font-size:13px}
.center-state.err{color:var(--err)} .center-state.dim{color:var(--text-dim)}
```

**Important — pas de layout.tsx par route.** Crée un fichier CSS par route et importe-les TOUS depuis
`globals.css`. Tu auras donc un seul layout (`src/app/layout.tsx` à la racine), pas 7 layouts à
maintenir. Schéma cible :

```css
/* src/app/globals.css */
@import "./agent-os.css";
@import "tailwindcss";

@import "./visualizer/visualizer.css";
@import "./chat/chat.css";
@import "./agents/agents.css";
@import "./missions/missions.css";
@import "./kanban/kanban.css";
@import "./memory/memory.css";
@import "./dashboard/dashboard.css";

@theme inline { /* couleur tokens pour Tailwind */ }
```

Préfixe les classes par route pour éviter les collisions (`.chat-*`, `.mp-*` pour missions,
`.kb-*` pour kanban, `.mem-*` pour memory, `.dash-*` pour dashboard, `.col-list`/`.edit-*` pour
agents). Quand deux fichiers définissent malgré tout la même classe, utilise un parent selector
pour scope (ex : `.detail .detail-empty` au lieu de `.detail-empty`).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 3 — LAYOUT RACINE + TOPBAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`src/app/layout.tsx` :
- Charge Inter via `next/font/google` (400/500/600/700) en CSS variable `--font-inter`
- Met `<link>` Google Fonts pour JetBrains Mono dans `<head>`
- `<body suppressHydrationWarning>` (les extensions browser comme ColorZilla / Dark Reader
  injectent des attrs avant l'hydratation — sans ce flag tu auras un warning rouge sur chaque page)
- Wrappe le contenu sous une `<Topbar>` (48px de haut, sticky en haut)

`src/components/Topbar.tsx` (Client Component) :
- Brand mark (conic-gradient saumon) + "MOS" + version mono
- Tabs : `Mesh` `Agents` `Chat` `Memory` `Missions` `Board` `Routines` `Skills` `Dashboard`
- État actif déterminé par `usePathname()`
- Pill droite : `local · airgapped` avec dot pulsant vert

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 4 — DB + RÈGLE DE STOCKAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Règle stricte : **tout ce qui est project-scope va dans `<project>/.mos/`. Seule la mémoire
cross-projet user-globale va dans `~/.mos/global-memory/`.** Jamais de DB ni de config dans
`~/.mos/` à part global-memory.

`src/lib/db.ts` :

```ts
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const MOS_DIR = path.join(process.cwd(), ".mos");
if (!fs.existsSync(MOS_DIR)) fs.mkdirSync(MOS_DIR, { recursive: true });

function resolveDbPath(): string {
  const fromEnv = process.env.MOS_SQLITE?.trim();
  if (fromEnv) {
    const p = path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return p;
  }
  return path.join(MOS_DIR, "mos.db");
}

/** One-shot migration: rapatrie un éventuel `<project>/mos.db` vers `.mos/mos.db`. */
function consolidateLegacyDb(): void {
  const rootDb = path.join(process.cwd(), "mos.db");
  if (!fs.existsSync(rootDb)) return;
  const nestedDb = path.join(MOS_DIR, "mos.db");
  if (!fs.existsSync(nestedDb)) {
    fs.renameSync(rootDb, nestedDb);
    for (const ext of ["-wal", "-shm"]) {
      if (fs.existsSync(rootDb + ext)) fs.renameSync(rootDb + ext, nestedDb + ext);
    }
  } else {
    fs.renameSync(rootDb, rootDb + `.bak-${Date.now()}`);
  }
}

consolidateLegacyDb();
const DB_PATH = resolveDbPath();
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = OFF");
  _db.exec(`/* schéma complet ci-dessous */`);
  /* + ensureColumn() pour les migrations non-destructives */
  return _db;
}

function ensureColumn(db: Database.Database, table: string, name: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}
```

Schéma SQL initial (toutes les tables avec `CREATE TABLE IF NOT EXISTS`) :

```sql
CREATE TABLE IF NOT EXISTS missions (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',
  domain      TEXT,
  cost_usd    REAL DEFAULT 0,
  tokens_in   INTEGER DEFAULT 0,
  tokens_out  INTEGER DEFAULT 0,
  start_ts    INTEGER DEFAULT (unixepoch()),
  end_ts      INTEGER,
  created_at  INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id  TEXT NOT NULL,
  agent_id    TEXT,
  ts          INTEGER DEFAULT (unixepoch()),
  kind        TEXT NOT NULL,
  body        TEXT
);

CREATE TABLE IF NOT EXISTS kanban_cards (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  agent       TEXT,
  col         TEXT NOT NULL DEFAULT 'backlog',
  domain      TEXT,
  tags        TEXT DEFAULT '[]',
  due         TEXT,
  progress    REAL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS routines (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  cron_expr       TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  skill_ref       TEXT,
  notify_on       TEXT NOT NULL DEFAULT 'failure',
  notify_channel  TEXT,
  target_chat_ids TEXT,  -- JSON array, null = broadcast
  paused          INTEGER NOT NULL DEFAULT 0,
  last_run_ts     INTEGER,
  last_status     TEXT,
  next_run_ts     INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS remote_tokens (
  jti           TEXT PRIMARY KEY,
  client_name   TEXT NOT NULL,
  token_hash    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  last_used_at  INTEGER,
  call_count    INTEGER NOT NULL DEFAULT 0
);
```

Migrations à exécuter après le CREATE (avec `ensureColumn`) :

```ts
ensureColumn(_db, "missions", "source_channel", "TEXT");
ensureColumn(_db, "missions", "source_meta", "TEXT");
ensureColumn(_db, "missions", "claude_session_id", "TEXT");
ensureColumn(_db, "missions", "kind", "TEXT NOT NULL DEFAULT 'mission'"); // 'mission' | 'chat' | 'channel'
ensureColumn(_db, "missions", "routine_id", "TEXT");
ensureColumn(_db, "kanban_cards", "mission_id", "TEXT");
ensureColumn(_db, "kanban_cards", "not_before", "TEXT");
ensureColumn(_db, "kanban_cards", "description", "TEXT");
// Légacy routines schemas — au cas où un agent aurait inséré avec d'autres noms
if (rCols.has("title") && !rCols.has("name")) _db.exec(`ALTER TABLE routines RENAME COLUMN title TO name`);
if (rCols.has("cron") && !rCols.has("cron_expr")) _db.exec(`ALTER TABLE routines RENAME COLUMN cron TO cron_expr`);
if (rCols.has("enabled") && !rCols.has("paused")) {
  _db.exec(`ALTER TABLE routines ADD COLUMN paused INTEGER NOT NULL DEFAULT 0`);
  _db.exec(`UPDATE routines SET paused = CASE WHEN enabled = 0 THEN 1 ELSE 0 END`);
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 5 — STRUCTURE FICHIERS AGENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Les agents MOS vivent **sur le filesystem**, pas en DB. Structure :

```
<project>/.mos/agents/<id>/
  config.json          ← raw config (id, name, glyph, model, permissionMode, cwd,
                          allowedTools, parent, memoryScope, channels)
  system-prompt.md     ← CLAUDE.md de l'agent
  memory/*.md          ← notes persistantes (USER scope)
  logs/log.jsonl       ← événements bruts (un par ligne)
```

`src/lib/agentsRepo.ts` lit AUSSI deux sources read-only en bonus :
- `~/.claude/agents/*.md` (agents Claude natifs avec frontmatter YAML : name, description, model)
- `~/.claude/skills/*/SKILL.md` (skills Claude natifs avec frontmatter)

Expose ces 3 fonctions :
- `listAgentConfigs()` → MOS agents seulement
- `listClaudeAgents()` → ~/.claude/agents/*.md (parsing YAML frontmatter manuel)
- `listNativeAgents()` → ~/.claude/skills/*/SKILL.md (block scalar `|` à parser)

Type `AgentConfig` complet :

```ts
export type MemoryScope = "NONE" | "SESSION" | "USER" | "GLOBAL";

export interface AgentConfig {
  id: string;
  name: string;
  glyph?: string;            // ← single char affiché dans le mesh + cards
  model: string;
  permissionMode: "auto" | "acceptEdits" | "plan" | "bypassPermissions";
  systemPrompt: string;       // lu depuis system-prompt.md
  cwd: string;
  allowedTools: string[];
  deniedTools?: string[];
  channels: Record<string, { on: boolean; value: string }>;
  parent?: string;            // pour le mesh : id de l'agent parent
  source?: "mos" | "skill" | "agent";
  memoryScope?: MemoryScope;  // défaut "USER"
  skills?: string[];          // ids de skills MOS ou natifs associés à l'agent
  missions: number;
}
```

`updateAgent(id, patch)` doit accepter `name`, `glyph`, `model`, `permissionMode`, `systemPrompt`,
`cwd`, `allowedTools`, `parent`, `memoryScope`. Le `glyph` est essentiel — sans lui le changement
ne persiste pas et l'utilisateur ne comprend pas pourquoi son emoji ne se sauvegarde pas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 6 — PAGES (lecture + structure)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pour chaque HTML de design :
1. **Lis le fichier en entier** avant d'écrire la moindre ligne TSX
2. Extrais le `<style>` inline → copie-le dans `src/app/<route>/<route>.css` (préfixé par route)
3. Convertis le markup en JSX (className, htmlFor, self-closing, etc.)
4. Remplace les données mock par des `fetch()` réels vers `/api/*`
5. Garde **tous** les états hover, animations CSS (`shimmer`, `bounce`, `pulse`, `halo`),
   raccourcis clavier (`⌘K`, `⌘S`, `/` slash menu)

**Mapping route → comportements clés à câbler** :

| Route | Comportements à reproduire |
|---|---|
| `/visualizer` (= `/`) | SVG force-layout, panel inspect 320px overlay (jamais reflow), bottom toolbar `▶ RUN TASK / + ADD AGENT / × REMOVE`, console en bas. Click sur un nœud → buttons OPEN CHAT (→ `/chat?agent=`), EDIT CONFIG (→ `/agents?id=`), MEMORY (→ `/memory?agent=`) |
| `/agents` | **Layout 2-pane dans la même page** : liste 340px (search + Spawn button + sections MOS/Claude) + éditeur 1fr inline. Selection via `?id=<x>` query param. Éditeur = 5 sections numérotées : 01 Identity (name, glyph picker 14 presets, cwd avec bouton folder picker natif via `POST /api/system/pick-folder`), 02 Model & memory (pills 4-up), 03 Permissions (mode pills + tool chips), **04 Skills** (chips toggleables des skills MOS `/.mos/skills/` + skills Claude natifs `~/.claude/skills/` ; liste chargée depuis `/api/agents?native=1` filtrée sur `source="skill"`, persistée en `skills: string[]` dans `config.json`), **05 Channels** (uniquement sur `_main`), sticky footer Save/Reset/status. **Pas de route séparée `/agents/[id]/edit`** — fais un simple `redirect()` si la legacy URL est appelée. **Pas de modal "New agent"** non plus : `?id=__new__` (sentinel) ouvre le même éditeur en mode create — un champ ID s'affiche en haut de section Identity, Save bouton fait POST au lieu de PATCH, redirige vers `?id=<newId>` au succès |
| `/chat` | Header 60px avec avatar+badges live/model+stats session, day-divider, bulles user (accent)/agent (Markdown via react-markdown), thinking dots, mode tabs question/mission/routine, slash popup avec autocomplete des skills, SSE temps réel via `/api/missions/[id]/stream` + global `/api/live/stream` (pour que les messages Telegram apparaissent automatiquement). **Session picker** dans le badge `● session aaaa…` du header : clic → dropdown qui liste toutes les sessions Claude passées de cet agent (`GET /api/chat/[agent]/sessions`), `+ New chat` en haut pour repartir à zéro, chaque session montre le titre du 1er user message + count + "Nh ago". Cliquer une session → `?session_id=X` charge cet historique et l'envoi resume cette session précise |
| `/memory` | 2-col : tree gauche (agent picker vertical + file list avec X au hover + memory meter en bas) + éditeur droite (breadcrumb mono + toolbar avec view tabs split/raw/preview + ⌘S save + footer stats lines/words/chars/tokens). Path affiché en mono dans le label de section : `.mos/agents/<id>/memory/` |
| `/missions` | KPI 4-up (this month: count/cost/tokens/success rate), filter bar (status pills + agent select + search), table + detail panel 460px (uniquement quand sélection). Detail = badge + meta + 4 stats grid + tabs Timeline/Output/Logs + delete inline |
| `/kanban` | 4 colonnes (backlog/todo/doing/done), chaque colonne a un swatch coloré (`doing` pulse), filter bar agent+domain, cards avec tags colorés/agent glyph/due/progress shimmer sur doing, drag-and-drop `@dnd-kit`. Drop sur `doing` auto-spawn la mission |
| `/routines` | Header breadcrumb-style `← BACK · MESH / ROUTINES.CRON · X active · Y running`, grille de cards (min 380px). Chaque card : status coloré (RUNNING vert pulse / LAST FAILED rouge / SCHEDULED / PAUSED), cron + description humanisée, 4 stats NEXT/LAST/RUNS MTD/COST MTD, chip notify. Editor : sélection chats destinataires avec chips toggleables (vide = broadcast) |
| `/dashboard` | 5-up KPI strip avec mini sparks, segmented range 24h/7d/30d, recharts area chart (cost/missions/tokens switcher), mission funnel barres horizontales colorées, top-agents bars, recent traces table |
| `/skills` | **Même pattern 2-pane que `/agents`** : liste 340px (sections PROJECT + NATIVE CLAUDE) + éditeur 1fr. Selection via `?id=<x>&source=<src>` (`source` = `project` / `claude-global` / `claude-project`, défaut `project`). `?id=__new__` ouvre l'éditeur vide pour créer un skill MOS. Skills natifs (`claude-global`, `claude-project`) sont en lecture seule : l'éditeur affiche le contenu SKILL.md en preview Markdown sans inputs. Skills MOS éditables : id (au create seulement) / name / description / category pills (DEV/CONTENT/OPS/LIFE) / enabled toggle / corps Markdown left-pane |

**Règle d'overlay** : les panels (mesh inspect, missions detail, agents config) sont soit
absolute-positioned soit dans une grid track de largeur fixe. **Ouvrir/fermer un panel ne doit
jamais reflow le reste de la page.**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 7 — API ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crée toutes les routes en mode "stub" (retournent depuis DB + filesystem, pas de spawn réel) :

```
api/
├── agents/route.ts                  GET (?native=1 inclut skills+claude agents), POST
├── agents/[id]/route.ts             GET, PATCH (name, glyph, model, perm, prompt, tools, parent, memoryScope), DELETE
├── agents/spawn/route.ts            POST → 501 pour l'instant (câblé dans 01-spawn-system.md)
├── chat/[agent]/route.ts            GET (history, mix kind='chat' + kind='channel' ; `?session_id=X` charge un historique spécifique chat-only), DELETE (no-op — "+ New chat" est un reset front pur)
├── chat/[agent]/sessions/route.ts   GET (liste sessions Claude passées : firstTitle, count, firstTs, lastTs ; GROUP BY claude_session_id)
├── memory/[agent]/route.ts          GET (list .md files dans memory/)
├── memory/[agent]/[file]/route.ts   GET (read), PUT (write), DELETE
├── missions/route.ts                GET
├── missions/[id]/route.ts           GET (mission + events), DELETE (cascade events)
├── missions/[id]/stream/route.ts    SSE (501 pour l'instant)
├── kanban/route.ts                  GET, POST
├── kanban/[id]/route.ts             PATCH, DELETE
├── routines/route.ts                GET (avec stats MTD), POST
├── routines/[id]/route.ts           GET, PATCH, DELETE
├── routines/[id]/run/route.ts       POST → 501 pour l'instant
├── channels/route.ts                GET (configured + running + subscribers)
├── channels/[name]/route.ts         GET, PUT (create/update), DELETE
├── channels/[name]/subscribers/[chatId]/route.ts  DELETE
├── channels/[name]/inbound/route.ts POST → 501 pour l'instant (câblé dans 02-channel-input.md)
├── dashboard/stats/route.ts         GET (counts, daily, byAgent, recent)
├── live/stream/route.ts             SSE global (501 pour l'instant)
├── system/pick-folder/route.ts      POST → AppleScript `choose folder` (macOS) ; retourne `{ path: string }` ou `{ cancelled: true }`
└── health/route.ts                  GET → { status: "ok", db: "connected" }
```

Rappels Next.js 16 :
- `params` est async : `{ params }: { params: Promise<{ id: string }> }` puis `const { id } = await params;`
- `export const runtime = "nodejs"` partout (better-sqlite3 ne tourne pas sur edge)
- `export const dynamic = "force-dynamic"` sur les routes qui lisent la DB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 8 — CHANNELS (UI seule, pas de logique réseau)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Channels = telegram + imessage + discord + webhook. Types et CRUD seulement. Le polling Telegram et
les webhooks viennent dans `02-channel-input.md`.

`src/lib/channels/types.ts` :

```ts
export type ChannelType = "telegram" | "imessage" | "discord" | "webhook";

export interface BaseChannelConfig {
  type: ChannelType;
  default_agent: string;
  agent_routing?: Record<string, string>;
}

export interface TelegramChannelConfig extends BaseChannelConfig {
  type: "telegram";
  bot_token_env?: string;   // nom de variable d'env (préféré pour sécurité)
  bot_token?: string;       // ou raw token (moins safe — stocké en clair)
  allowed_chat_ids?: number[];
}

export interface ImessageChannelConfig extends BaseChannelConfig {
  type: "imessage";
  allowed_handles?: string[];
  poll_interval_sec?: number;
}

export interface WebhookChannelConfig extends BaseChannelConfig {
  type: "webhook";
  secret_env: string;
}

export interface DiscordChannelConfig extends BaseChannelConfig {
  type: "discord";
  bot_token_env: string;
  guild_id?: string;   // optionnel — restreindre à un serveur
  channel_id?: string; // optionnel — limiter les réponses à un channel Discord
}

export type ChannelConfig = TelegramChannelConfig | ImessageChannelConfig | WebhookChannelConfig | DiscordChannelConfig;
```

Configs stockées dans `<project>/.mos/channels/<name>.json`. Subscribers (auto-capturés sur message
entrant — câblé dans le prompt 02) dans `<project>/.mos/channels/<name>.subscribers.json`.

**Important UX du token Telegram** : sur l'éditeur de channel, fais UN seul champ "BOT TOKEN" qui
accepte soit le raw token soit un nom de variable d'env. Auto-détecte : si la valeur contient `:` ou
fait >40 chars, c'est un token brut → stocke en `bot_token`, affiche un warning rouge (sera en clair
sur disque). Sinon c'est un nom de var → stocke en `bot_token_env`.

**La section Channels n'apparaît QUE sur la page d'édition de `_main`.** C'est l'agent
orchestrateur — les sous-agents n'ont pas leurs propres channels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 9 — ROUTINES (scheduler + cron parser)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cron parser maison, pas de dépendance externe. `src/lib/routines/cron.ts` :

```ts
// supporte: * | */N | ranges 1-5 | CSV 1,3,5 — sur 5 champs (m h dom mon dow)
export function parseCron(expr: string): ParsedCron { ... }
export function nextRun(cron: ParsedCron, fromMs: number): number { ... }
export function describeCron(expr: string): string { ... }  // "weekdays · at 08:00"
```

Scheduler tick toutes les 30s, démarré au boot via `instrumentation.ts` :

```ts
// src/instrumentation.ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.MOS_CHANNELS_AUTOSTART !== "0") {
    const { startAllChannels } = await import("./lib/channels/runtime");
    const { started } = startAllChannels();
    if (started.length) console.log(`[mos] channels started: ${started.join(", ")}`);
  }
  if (process.env.MOS_ROUTINES_AUTOSTART !== "0") {
    const { startScheduler } = await import("./lib/routines/scheduler");
    if (startScheduler()) console.log(`[mos] routines scheduler started`);
  }
  if (process.env.MOS_MEMORY_AUTORECORD !== "0") {
    const { startAutoMemoryRecording } = await import("./lib/memory/autorecord");
    if (startAutoMemoryRecording()) console.log(`[mos] memory auto-record started`);
  }
}
```

Pour l'instant le scheduler peut fire les routines en mode "dry-run" (juste logger qu'il fire) —
le vrai spawn arrive dans le prompt 01.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 10 — SEED DE DÉMARRAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crée à la main au premier `npm run dev` :

```
<project>/.mos/
├── agents/_main/
│   ├── config.json
│   ├── system-prompt.md
│   └── memory/
├── channels/   (vide)
└── mos.db      (créée auto par getDb())
```

`config.json` :

```json
{
  "id": "_main",
  "name": "_main",
  "glyph": "◆",
  "model": "claude-sonnet-4-6",
  "permissionMode": "auto",
  "cwd": "~",
  "allowedTools": ["Bash", "Read", "Edit", "Write"],
  "channels": {},
  "memoryScope": "USER"
}
```

`system-prompt.md` — **doit rendre l'agent MOS-aware**, sinon il default à crontab/launchd/raw
scripts quand l'utilisateur demande une routine ou un agent, et rien n'apparaît dans l'UI :

````md
# System prompt — _main

You are `_main`, the orchestrator of **MOS** (Multi-agent OS), a local-first agentic operating
system that runs on the user's machine. You speak French by default unless asked otherwise.

## You live INSIDE the MOS API surface

MOS has a Next.js app on `localhost:3000`, a SQLite DB at `<project>/.mos/mos.db`, and dedicated
UI pages for every concept. **Always prefer MOS-native primitives over generic Unix tools** —
otherwise the user can't see what you create.

### Capability → preferred MOS surface

| User asks… | Use this, NOT that |
|---|---|
| Create a cron / routine / scheduled task | `POST /api/routines` (visible at `/routines`). **Never** edit `crontab` or write `launchd` plists. |
| Create / spawn a new agent | `POST /api/agents` (visible at `/agents`). |
| Run a one-shot task | `POST /api/agents/spawn` (visible at `/missions`). |
| Create a skill | `.mos/skills/<id>/skill.json` (visible at `/skills`). |
| Add a kanban card | `POST /api/kanban` (visible at `/kanban`). |
| Send a recurring Telegram message | routine with `notify_channel: "telegram"`. |
| Configure a channel | User does it in UI (Mesh → `_main` → EDIT CONFIG → CHANNELS). |

### Verify before asking

Don't ask the user for info that might already exist in the system. Check first:

```bash
curl http://localhost:3000/api/channels   # configured channels + their tokens
curl http://localhost:3000/api/agents     # existing agents
curl http://localhost:3000/api/routines   # existing routines
```

### Routine example (the right way)

```bash
curl -X POST http://localhost:3000/api/routines \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ping", "name": "Ping every minute",
    "cron_expr": "* * * * *", "agent_id": "_main",
    "prompt": "Réponds par: Hello",
    "notify_on": "always", "notify_channel": "telegram",
    "target_chat_ids": [123456789]
  }'
```

→ Routine visible at `/routines`, scheduler fires it, output delivered via Telegram. Zero
system cron, zero shell script.

## Principles

- **Verify before asking.** GET the API state before requesting info from the user.
- **MOS-first, Unix-fallback.** Reach for crontab/launchd only if MOS doesn't have a primitive,
  and flag it explicitly when you do.
- **Surface your actions.** End with `→ visible at /routines` etc.
- **Delegate.** Spawn sub-agents when the task matches their specialty.
- Budget: $25/hour soft, $30 hard halt.

## Voice

Terse, technical. French + English code-switching OK. Bullets > paragraphs.
````

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 11 — PATTERN "EDIT PAGE = CREATE PAGE"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Règle de cohérence sur tout l'OS : **pour créer une entité, on ne fait JAMAIS de modal "New X".**
On réutilise la même page d'édition, en mode vide. Concrètement :

- Les pages `/agents` et `/skills` réservent l'id sentinel `__new__` dans l'URL.
- Quand `?id=__new__`, l'éditeur s'affiche avec :
  - Tous les champs vides ou avec leurs valeurs par défaut
  - **Un input "ID" supplémentaire** en haut de la section Identity (immutable après création)
  - Le bouton du footer affiche "Create agent" / "Create skill" au lieu de "Save"
  - Le breadcrumb affiche `agents / new agent` en accent
  - Pas de bouton Delete (rien à supprimer)
- Au submit en mode create :
  - L'éditeur appelle `POST /api/agents` ou `POST /api/skills` (au lieu de PATCH)
  - Au succès, redirect vers `?id=<newId>` — l'utilisateur tombe sur le même éditeur en mode edit
  - Si l'id existe déjà → l'API renvoie 409, l'éditeur affiche l'erreur sans perdre les données saisies

Pourquoi ce pattern :
- **Une seule UI à maintenir** pour create + edit (mêmes champs, mêmes validations, même style)
- Pas de "ah j'ai cliqué dans le vide et ma modal a fermé" — l'utilisateur reste dans le contexte
- L'URL est partageable / bookmarkable (`/agents?id=__new__` peut être un raccourci)

Implémentation TS (signature commune) :

```tsx
function AgentEditor({ id, isNew = false, onCreated, onDeleted }: {
  id: string;            // soit l'id réel, soit "__new__" en mode create
  isNew?: boolean;       // si true → champ ID input, save fait POST, pas de Delete
  onCreated?: (newId: string) => void;
  onDeleted?: () => void;
}) {
  // En mode isNew : skip le fetch initial, init avec valeurs par défaut, montre l'input ID
  // En mode edit : fetch l'agent, dirty check inclut tous les champs vs cfg
  // save() branche sur isNew → POST /api/agents vs PATCH /api/agents/[id]
}
```

Côté list, le bouton "Spawn new agent" (ou "+ New skill") fait simplement :
```tsx
<button onClick={() => router.replace(`/agents?id=__new__`)}>+ Spawn new agent</button>
```
Et reçoit la classe `.new-agent.active` quand `selectedId === "__new__"` pour le surligner.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 11b — SUSPENSE BOUNDARIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dans Next.js 16 toute page qui appelle `useSearchParams()` au render must être wrappée dans
`<Suspense>` ou ça build-fail. La page `/agents` lit `?id=<x>` — c'est le cas typique :

```tsx
export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="center-state">loading…</div>}>
      <AgentsPageInner />  {/* contient le useSearchParams */}
    </Suspense>
  );
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAPE 12 — VÉRIFICATIONS FINALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Avant de considérer le scaffold comme fini :

- [ ] `npx tsc --noEmit` passe avec zéro erreur
- [ ] `npm run dev` démarre, port 3000 accessible
- [ ] Les 9 routes (`/`, `/agents`, `/chat`, `/memory`, `/missions`, `/kanban`, `/routines`,
      `/skills`, `/dashboard`) répondent toutes 200
- [ ] La Topbar est sticky en haut, tab active surligné, fond `#0a0a0a`
- [ ] Sur `/agents`, la liste 340px à gauche et l'éditeur à droite. Cliquer sur `_main`
      sélectionne sans rechargement de page (juste `?id=_main` dans l'URL)
- [ ] Changer le glyph dans `/agents` + cliquer Save → le `config.json` sur disque a la nouvelle
      valeur de `glyph`
- [ ] Aucune erreur d'hydratation côté navigateur (le `suppressHydrationWarning` sur `<body>`
      neutralise les extensions browser)
- [ ] `.mos/mos.db` est créée au premier démarrage et contient les 5 tables
- [ ] Pas de fichier `mos.db` parasite à la racine du projet
- [ ] Toutes les pages utilisent les classes de `agent-os.css` — pas de hex en dur dans le JSX
      hors valeurs dynamiques (couleurs venant des data, badges colorés, etc.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRAINTES GLOBALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- TypeScript strict, pas de `any` non justifié
- "use client" uniquement quand un hook React ou un event browser l'exige
- Fidélité au design HTML — pas de simplification "esthétique" sans en parler
- **Pas de inline styles hardcodés** quand un pattern est répété : créer une classe (cf
  `.modal-backdrop`, `.modal-card`, `.err-banner`, `.center-state` ci-dessus). OK pour les
  valeurs dynamiques (width %, couleurs depuis data, transforms dnd-kit)
- Pas de `confirm()` natif sauf pour la suppression de fichiers
- Aucune extension Tailwind exotique — `agent-os.css` couvre déjà 95% des besoins
- **JAMAIS** de DB à la racine du projet ni dans `~/.mos/` (sauf `~/.mos/global-memory/`)
- **JAMAIS** loguer un token de bot — utiliser env var ou stockage encrypté
````

---

## Ce que ce prompt ne fait PAS

Ces éléments sont couverts par les prompts suivants :

| Fonctionnalité | Prompt |
|---|---|
| Spawn réel d'agents Claude via le SDK + SSE streaming des events | `01-spawn-system.md` |
| Telegram polling, streaming des replies via `editMessageText`, auto-capture subscribers, iMessage AppleScript, Discord webhooks, session-resume per chat_id | `02-channel-input.md` |
| Remote control via tunnel pour piloter depuis Claude.ai mobile | `03-remote-control.md` |
| Mémoire auto-recorded (post-mission) qui append dans `memory/conversations.md` | inclus dans 01 |

## Notes

- Les fichiers `agent-sim.jsx` contiennent les hooks `useForceLayout` et `useTraffic` — logique de simulation déjà écrite, à migrer telle quelle dans `src/hooks/`.
- `agent-os.css` est un système de design complet en CSS variables — pas besoin de shadcn/ui pour les primitives de base, toutes les classes `.btn`, `.input`, `.toggle`, `.badge`, `.chip`, `.field-label`, `.radio-group` y sont déjà définies.
- Les HTML de design sont autonomes (React via CDN) : extraire uniquement le `<style>` et le markup, ignorer les `<script>` CDN.
- L'ordre des étapes compte : tokens CSS d'abord, puis layout, puis DB, puis API stubs, puis pages. Les pages tirent leurs données des API qui tirent de la DB.
- Quand un agent insère en SQL direct dans une table qui existe déjà (cas du legacy `routines` schema), `consolidateLegacyDb()` + `ensureColumn` + les RENAME COLUMN gèrent la migration sans data loss.
