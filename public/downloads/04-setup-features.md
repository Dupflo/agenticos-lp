# Prompt — Setup features (post-scaffold gap fixes)

À coller **après** `01-spawn-system.md`, `02-channel-input.md` et `03-remote-control.md`.

Les 3 prompts de Mike couvrent les fondations (spawn, intake channels, remote tunnel) mais laissent
plusieurs gaps qui empêchent l'OS d'être pleinement fonctionnel à l'usage quotidien :

- Les routines (cron-driven missions) n'existent pas
- Le Telegram n'a pas de continuité de session ni de streaming des réponses
- La mémoire n'a pas de scope ni d'auto-record
- Plusieurs micro-bugs UX bloquants (slash menu, glyph qui ne se sauvegarde pas, hydration warnings…)

Ce prompt comble tout ça en un seul passage.

---

## Pré-requis

Ce prompt suppose que tu as **déjà** :
- Scaffold initial via `00-init-mvp.md` (Next.js 16, DB à `.mos/mos.db`, agents repo, pages câblées)
- Spawn system via `01-spawn-system.md` (`registry.spawn()`, SSE par mission, events en DB)
- Channels via `02-channel-input.md` (Telegram bot polling de base, mission spawn sur message)
- Remote control via `03-remote-control.md` (tunnel + auth)

Si l'un de ces 4 prompts a échoué ou été appliqué partiellement, fais d'abord un état des lieux
avant d'enchaîner. Une checklist de vérification est à la fin de ce document.

---

## Prompt à coller dans Claude Code

````
Tu vas combler les gaps fonctionnels laissés par les prompts 01/02/03.
À la fin, MOS doit être 100% utilisable au quotidien : routines cron qui s'exécutent, Telegram qui
stream les réponses et garde la conversation, mémoire qui persiste, pas de bug UX bloquant.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A — ROUTINES (système cron complet)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pas couvert par les prompts 01/02/03. À implémenter from scratch.

A.1 — DB : ajoute (via `ensureColumn`) à la table `routines` créée dans 00-init-mvp :

```sql
-- déjà présentes après 00 :
-- id, name, description, cron_expr, agent_id, prompt, skill_ref,
-- notify_on, notify_channel, paused, last_run_ts, last_status, next_run_ts, created_at

-- À ajouter:
ALTER TABLE routines ADD COLUMN target_chat_ids TEXT;  -- JSON array, null = broadcast
ALTER TABLE missions ADD COLUMN routine_id TEXT;       -- pour les missions firées par routine
```

Aussi : prévoir une migration legacy au cas où un agent aurait créé la table avec un schéma
différent (champs `title`/`cron`/`enabled` au lieu de `name`/`cron_expr`/`paused`) :

```ts
const rCols = new Set((db.prepare(`PRAGMA table_info(routines)`).all() as { name: string }[]).map(c => c.name));
if (rCols.has("title") && !rCols.has("name"))     db.exec(`ALTER TABLE routines RENAME COLUMN title TO name`);
if (rCols.has("cron")  && !rCols.has("cron_expr"))db.exec(`ALTER TABLE routines RENAME COLUMN cron TO cron_expr`);
if (rCols.has("enabled") && !rCols.has("paused")) {
  db.exec(`ALTER TABLE routines ADD COLUMN paused INTEGER NOT NULL DEFAULT 0`);
  db.exec(`UPDATE routines SET paused = CASE WHEN enabled = 0 THEN 1 ELSE 0 END`);
}
db.exec(`UPDATE routines SET prompt = name WHERE prompt IS NULL OR prompt = ''`);
db.exec(`UPDATE routines SET next_run_ts = unixepoch() WHERE next_run_ts IS NULL AND paused = 0`);
```

A.2 — Cron parser maison dans `src/lib/routines/cron.ts`. Pas de dépendance externe. Supporte :
- `*`, `*/N`, ranges `1-5`, CSV `1,3,5`
- 5 champs : minute hour dom mon dow
- Vixie cron rule : si dom ET dow restreints → OR ; sinon AND

Expose `parseCron(expr)`, `nextRun(parsed, fromMs)`, `describeCron(expr)` (sortie humaine type
`"weekdays · at 08:00"`).

A.3 — Repo `src/lib/routines/repo.ts` :
- `listRoutines()` retourne `RoutineWithStats[]` avec `runs_mtd`, `cost_mtd`, `running` agrégés
  depuis `missions WHERE routine_id IS NOT NULL AND start_ts >= début_du_mois`
- `createRoutine`, `updateRoutine` (recompute `next_run_ts` quand `cron_expr` ou `paused` change)
- `dueRoutines(nowSec)` → routines à firer maintenant
- `markRoutineFired(id, status)` : update `last_run_ts`, `last_status`, recompute `next_run_ts`

A.4 — Scheduler `src/lib/routines/scheduler.ts` :
- `setInterval(tick, 30_000)` + tick initial au démarrage
- Pour chaque routine due → `registry.spawn(agent_id, prompt, { routineId, kind: "mission", skipKanbanCard: true })`
- Hook `registry.onMissionComplete` qui :
  1. Met à jour `routines.last_status`
  2. Si la routine a un `notify_channel` et que `notify_on` matche le status → délivre l'output
     aux subscribers du channel (cf section B.3)

A.5 — Bootstrap dans `src/instrumentation.ts` :

```ts
if (process.env.MOS_ROUTINES_AUTOSTART !== "0") {
  const { startScheduler } = await import("./lib/routines/scheduler");
  if (startScheduler()) console.log(`[mos] routines scheduler started`);
}
```

A.6 — API `src/app/api/routines/` :
- `GET /api/routines` (liste avec stats MTD)
- `POST /api/routines` (create avec validation `parseCron`)
- `GET/PATCH/DELETE /api/routines/[id]`
- `POST /api/routines/[id]/run` (déclenchement manuel)

A.7 — UI : page `/routines` qui matche `Kanban Board.html` en style (cards) avec :
- Header breadcrumb `← BACK · MESH / ROUTINES.CRON · X active · Y running · next in Zm`
- Grille de cards (min 380px) avec : status pill (RUNNING vert pulse / LAST FAILED rouge / SCHEDULED / PAUSED), cron + description humanisée, agent dot orange, stats 4-up NEXT/LAST/RUNS MTD/COST MTD, chip `◇ NOTIFY · {always|failure} · {channel}`
- Bouton `▶` (run now) + `···` (edit) sur chaque card
- Auto-refresh /api/routines toutes les 15s

A.8 — Editor de routine : modal avec champs name/description/cron_expr (preview live via
`describeCron`)/agent_id/prompt/skill_ref/notify_on/notify_channel + **picker chats destinataires**
sous forme de chips toggleables (cf B.4).

Ajoute le lien `Routines` dans la Topbar entre `Board` et `Skills`.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B — TELEGRAM amélioré (continuité + streaming + subscribers)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le prompt 02 a câblé l'intake basique (message → spawn mission) et l'output (sendMessage en fin de
mission). Plusieurs gaps critiques restent.

B.1 — **Bot token : accepter raw OU env var**. Dans le 02, le token est uniquement par `bot_token_env`
(nom de variable d'env). En pratique les utilisateurs collent le vrai token dans le champ et le
système plante. Fix :

Type `TelegramChannelConfig` :

```ts
export interface TelegramChannelConfig extends BaseChannelConfig {
  type: "telegram";
  bot_token_env?: string;   // nom de variable d'env (sécurisé)
  bot_token?: string;       // ou raw token (stocké en clair dans .mos/channels/)
  allowed_chat_ids?: number[];
}
```

Fonction `botToken(config)` :

```ts
function botToken(config: TelegramChannelConfig): string {
  if (config.bot_token && config.bot_token.includes(":")) return config.bot_token;
  if (!config.bot_token_env) throw new Error("telegram channel needs bot_token or bot_token_env");
  const tok = process.env[config.bot_token_env];
  if (!tok) throw new Error(`env var ${config.bot_token_env} not set`);
  return tok;
}
```

UI (dialog setup channel) : un seul champ qui auto-détecte. Si la valeur contient `:` ou fait
>40 chars → c'est un raw token, affiche un warning rouge "sera stocké en clair". Sinon traite
comme nom de variable.

B.2 — **Auto-capture des subscribers**. Le 02 force `allowed_chat_ids` à être maintenu à la main.
Fix : capture chaque chat qui écrit au bot dans `.mos/channels/<name>.subscribers.json`.

`src/lib/channels/subscribers.ts` :

```ts
export interface Subscriber {
  chat_id: number;
  username?: string;
  first_name?: string;
  first_seen: number;
  last_seen: number;
  message_count: number;
}

export function recordSubscriber(channelName, meta) { /* append/refresh dans le JSON */ }
export function listSubscribers(channelName): Subscriber[] { /* sorted par last_seen desc */ }
export function removeSubscriber(channelName, chatId): boolean { /* delete from JSON */ }
```

Dans le callback Telegram du `startTelegramPolling` (runtime.ts) :

```ts
recordSubscriber(name, {
  chat_id: msg.chat.id,
  username: msg.from?.username,
  first_name: msg.from?.first_name,
});
```

Expose les subscribers dans `GET /api/channels` (champ `subscribers: Record<channelName, Subscriber[]>`).

Ajoute `DELETE /api/channels/[name]/subscribers/[chatId]` pour suppression depuis l'UI.

B.3 — **Routine delivery via subscribers**. Quand une routine fire et a `notify_channel: "telegram"`,
elle doit envoyer son output aux subscribers. Dans le hook `onMissionComplete` du scheduler :

```ts
async function deliverRoutineNotification(routine, info) {
  if (routine.notify_on === "never" || !routine.notify_channel) return;
  if (routine.notify_on === "failure" && info.status === "done") return;

  const config = tryLoadChannelConfig(routine.notify_channel);
  if (!config || config.type !== "telegram") return;

  // Cibles : target_chat_ids si défini, sinon tous les subscribers
  let recipients: number[] = [];
  if (routine.target_chat_ids) {
    try {
      const parsed = JSON.parse(routine.target_chat_ids);
      if (Array.isArray(parsed)) recipients = parsed.map(Number).filter(Number.isFinite);
      else if (typeof parsed === "number") recipients = [parsed]; // tolérant aux mauvais formats
    } catch { /* CSV fallback */ }
  } else {
    recipients = listSubscribers(routine.notify_channel).map(s => s.chat_id);
  }

  const output = buildMissionOutput(info.missionId) || `(routine ${routine.id} ${info.status})`;
  const prefix = info.status === "done" ? `⏰ *${routine.name}*\n` : `🚨 *${routine.name}* — ${info.status}\n`;
  for (const chatId of recipients) {
    await sendTelegramMessage(config, chatId, prefix + output);
  }
}
```

**IMPORTANT** : le parsing de `target_chat_ids` doit tolérer un nombre bare (`8585742603`) au cas où
un agent aurait inséré sans wrapper en array. Sinon `for (const x of number)` throw `not iterable`.

B.4 — **UI picker chats par routine**. Dans l'éditeur de routine (modal sur `/routines`), quand un
`notify_channel` est sélectionné, affiche la liste des subscribers comme chips toggleables :
- Vide = broadcast à tous les subscribers (défaut)
- Sélection = scope aux chat_ids cliqués
- Bouton "× tout désélectionner (broadcast)" pour repasser en mode broadcast

Le champ stocké est un JSON array `[chatId1, chatId2]`.

B.5 — **Session resume per chat_id** (continuité Claude). Le 02 spawn une nouvelle session
Claude à chaque message Telegram → l'agent oublie tout d'un message au suivant.

Fix : avant chaque spawn Telegram, lookup la dernière `claude_session_id` pour ce
`(agent, channel, chat_id)` et la passer en `resumeSessionId`.

```ts
function lastSessionForChat(agentName, channelName, chatId): string | undefined {
  const rows = getDb().prepare(
    `SELECT claude_session_id, source_meta FROM missions
     WHERE agent_id = ? AND source_channel = ? AND claude_session_id IS NOT NULL
     ORDER BY start_ts DESC LIMIT 50`
  ).all(agentName, channelName) as { claude_session_id: string; source_meta: string | null }[];
  for (const r of rows) {
    try {
      const m = r.source_meta ? JSON.parse(r.source_meta) as { chat_id?: number } : null;
      if (m?.chat_id === chatId) return r.claude_session_id;
    } catch { /* ignore */ }
  }
  return undefined;
}

// Dans le poller Telegram avant spawn :
const resumeSessionId = lastSessionForChat(route.agent, name, msg.chat.id);
registry.spawn(route.agent, input, {
  sourceChannel: name,
  sourceMeta: { chat_id: msg.chat.id, reply_to: msg.message_id },
  kind: "channel",
  resumeSessionId,
});
```

B.6 — **Streaming des replies via `editMessageText`**. Au lieu d'attendre la fin de mission pour
envoyer un seul gros message, post un placeholder immédiatement et édite-le au fur et à mesure.

Ajoute à `src/lib/channels/handlers/telegram.ts` :

```ts
export async function sendTelegramTyping(config, chatId) { /* sendChatAction typing */ }
export async function sendTelegramPlaceholder(config, chatId, text, replyTo): Promise<number | null> {
  // sendMessage → retourne message_id
}
export async function editTelegramMessage(config, chatId, messageId, text) {
  // editMessageText, ignore "message is not modified" errors
}
```

Dans runtime.ts, remplace le spawn-direct par un `streamTelegramReply` :

```ts
async function streamTelegramReply(channelName, config, ctx, agentName, missionInput) {
  const chatId = Number(ctx.replyMeta.chat_id);
  void sendTelegramTyping(config, chatId);
  const placeholderId = await sendTelegramPlaceholder(config, chatId, "🤔 …", ctx.replyMeta.reply_to);
  if (placeholderId === null) {
    // fallback : end-of-mission reply normal
    registry.spawn(...);
    return;
  }
  const sourceMeta = { ...ctx.replyMeta, placeholder_message_id: placeholderId, streamed: true };
  const resumeSessionId = lastSessionForChat(agentName, channelName, chatId);
  const agent = registry.spawn(agentName, missionInput, { sourceChannel: channelName, sourceMeta, kind: "channel", resumeSessionId });

  // Throttling : Telegram rate-limit ≈ 1 edit/sec/chat → 1.5s min entre edits
  let buffer = "", lastSent = "", pending = null, lastFlushAt = 0, inflight = false;
  const MIN_INTERVAL = 1500;

  const flush = async () => {
    pending = null; if (inflight) return;
    const text = buffer.trim() || "🤔 …";
    if (text === lastSent) return;
    inflight = true; lastFlushAt = Date.now();
    try { await editTelegramMessage(config, chatId, placeholderId, text + " ▍"); lastSent = text; }
    finally { inflight = false; }
  };
  const scheduleFlush = () => {
    if (pending) return;
    const delay = Math.max(0, MIN_INTERVAL - (Date.now() - lastFlushAt));
    pending = setTimeout(flush, delay);
  };

  agent.on("event", (ev) => {
    let txt = null;
    if (ev.type === "result") txt = (ev.payload as any).result;
    else if (ev.type === "assistant") {
      const parts = [];
      for (const c of ev.payload?.message?.content ?? []) {
        if (c?.type === "text" && c.text) parts.push(c.text);
      }
      txt = parts.join("") || null;
    }
    if (!txt) return;
    if (ev.type === "result") buffer = txt; // result = full text final
    else buffer = (buffer ? buffer + "\n" : "") + txt; // chunks incremental
    scheduleFlush();
  });
  agent.on("done", async () => {
    if (pending) { clearTimeout(pending); pending = null; }
    const finalText = buffer.trim() || "✅ done";
    await editTelegramMessage(config, chatId, placeholderId, finalText);
  });
}
```

Et dans `dispatchMissionReply` (reply.ts), skip le `sendMessage` final si `sourceMeta.streamed === true`
(le streaming a déjà tout délivré).

B.7 — **Erreurs propres**. Wrappe `startAllChannels` en try/catch par-channel et retourne
`{ started: string[], errors: { name, error }[] }`. Le `PUT /api/channels/[name]` doit surfacer
l'erreur de démarrage (token invalide, env var manquante) au lieu de planter en 500 opaque.

B.8 — Type iMessage. Le scaffold liste 4 types, `02-channel-input.md` n'implémente que telegram +
webhook. Si tu veux ajouter iMessage maintenant (macOS uniquement, AppleScript bridge), c'est juste
le type :

```ts
export interface ImessageChannelConfig extends BaseChannelConfig {
  type: "imessage";
  allowed_handles?: string[];
  poll_interval_sec?: number;
}
```

Le runtime macOS arrive plus tard. Pour l'instant, juste exposer le type permet à l'UI
`/agents` (édition de `_main`) d'afficher la carte iMessage avec un bouton SETUP.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION C — MEMORY (scope + autorecord)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le 00 a posé les types `MemoryScope = "NONE" | "SESSION" | "USER" | "GLOBAL"` mais ne câble pas la
logique. À faire :

C.1 — `src/lib/orchestrator/config.ts` :

```ts
export const GLOBAL_MEMORY_DIR = path.join(os.homedir(), ".mos", "global-memory");

/**
 *   NONE    → empty
 *   SESSION → empty (continuité via Claude session resume, pas via fichiers)
 *   USER    → <project>/.mos/agents/<id>/memory/*.md
 *   GLOBAL  → USER + ~/.mos/global-memory/*.md
 */
export function loadMemory(name: string, scope: MemoryScope = "USER"): string {
  if (scope === "NONE" || scope === "SESSION") return "";
  const parts: string[] = [];
  parts.push(...readMdDir(path.join(agentDir(name), "memory"), "memory/"));
  if (scope === "GLOBAL") parts.push(...readMdDir(GLOBAL_MEMORY_DIR, "~/.mos/global-memory/"));
  if (parts.length === 0) return "";
  return `\n\n---\n## Agent memory\n\n${parts.join("\n\n")}`;
}
```

C.2 — `registry.spawn` doit respecter le scope :

```ts
const scope = config.memoryScope ?? "USER";
const systemPrompt = loadSystemPrompt(agentName) + loadMemory(agentName, scope);
const resumeSessionId = scope === "NONE" ? undefined : opts.resumeSessionId;
// utilise resumeSessionId au lieu de opts.resumeSessionId pour SpawnedAgent
```

C.3 — Auto-record des conversations. `src/lib/memory/autorecord.ts` :

```ts
const MAX_BYTES = 256 * 1024;

export function startAutoMemoryRecording(): boolean {
  registry.onMissionComplete((info) => {
    try {
      const scope = loadAgentConfig(info.agentName).memoryScope ?? "USER";
      if (scope === "NONE" || scope === "SESSION") return;
      const row = getDb().prepare(
        `SELECT agent_id, title, kind, source_channel, start_ts, end_ts FROM missions WHERE id = ?`
      ).get(info.missionId);
      if (!row || (row.kind !== "chat" && row.kind !== "channel")) return;

      const userText = row.title || "(empty)";
      const agentText = buildMissionOutput(info.missionId) || "(no text output)";
      if (agentText === userText) return; // skip echo

      const file = scope === "GLOBAL"
        ? path.join(GLOBAL_MEMORY_DIR, `${info.agentName}-conversations.md`)
        : path.join(ensureMemoryDir(info.agentName), "conversations.md");

      // Rotation si > MAX_BYTES
      if (fs.existsSync(file) && fs.statSync(file).size >= MAX_BYTES) {
        const archive = file.replace(/\.md$/, `-archive-${Date.now()}.md`);
        fs.renameSync(file, archive);
        fs.writeFileSync(file, `<!-- previous entries archived to ${path.basename(archive)} -->\n\n`);
      }

      const header = `${fmtTs(row.start_ts)}${row.source_channel ? ` · via ${row.source_channel}` : " · web"}`;
      const block = `## ${header}\n\n**user:** ${userText.trim()}\n\n**agent:** ${agentText.trim()}\n\n---\n\n`;
      fs.appendFileSync(file, block);
    } catch (e) { console.error("[memory] autorecord failed:", e); }
  });
  return true;
}
```

C.4 — Bootstrap dans `src/instrumentation.ts` :

```ts
if (process.env.MOS_MEMORY_AUTORECORD !== "0") {
  const { startAutoMemoryRecording } = await import("./lib/memory/autorecord");
  if (startAutoMemoryRecording()) console.log(`[mos] memory auto-record started`);
}
```

C.5 — UI : dans l'éditeur d'agent (`/agents`), la section "02 Model & memory" expose les 4 pills
de scope avec un hint live indiquant où la mémoire sera stockée.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION D — UI fixes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

D.1 — **Page `/chat` : live SSE pour les messages canal**. Quand un message arrive sur Telegram,
il apparaît automatiquement dans `/chat?agent=_main` ouvert dans un autre onglet :

```ts
useEffect(() => {
  if (!agentId) return;
  const es = new EventSource("/api/live/stream");
  let pending = null;
  es.onmessage = (msg) => {
    try {
      const { agentId: a } = JSON.parse(msg.data);
      if (a !== agentId) return;
      if (pending) return;
      pending = setTimeout(() => { pending = null; reloadHistory(true); }, 500);
    } catch {}
  };
  return () => { es.close(); if (pending) clearTimeout(pending); };
}, [agentId]);
```

Le `GET /api/chat/[agent]` doit inclure les missions `kind = 'channel'` **et** les missions
`kind = 'mission'` des 7 derniers jours en plus de `kind = 'chat'` :

```sql
WHERE agent_id = ? AND (
  (kind = 'chat' AND claude_session_id = ?)
  OR kind = 'channel'
  OR (kind = 'mission' AND end_ts IS NOT NULL AND start_ts >= strftime('%s','now','-7 days'))
)
ORDER BY start_ts ASC
```

Chaque message retourne `sourceChannel` et `kind` — l'UI affiche :
- Badge **"via telegram"** sur les bulles `kind='channel'`
- Badge **"MISSION"** + lien **"view log →"** (`/missions?id=...`) sur les bulles `kind='mission'`.
  Ces missions correspondent aux tâches proactivement spawned par l'agent (via routines, channels, etc.)
  et permettent à l'utilisateur de voir ce que l'agent a fait sans quitter le chat.

D.2 — **Slash autocomplete dans `/chat`**. Quand l'utilisateur tape `/`, popup au-dessus du
textarea listant les skills disponibles (`source === "skill"` depuis `/api/agents?native=1`).
Navigation ↑↓, Enter sélectionne, Esc ferme. Filtre par nom ou id.

D.3 — **Channels uniquement sur `_main`**. La page d'édition d'agent affiche la section
`// CHANNELS` UNIQUEMENT quand `id === "_main"`. Les sous-agents n'ont pas leurs propres channels —
ils héritent de ceux de l'orchestrateur.

D.4 — **Mesh toolbar** (bottom-center du visualiseur) avec 3 boutons :
- `▶ RUN TASK` (actif si agent MOS sélectionné) — ouvre un dialog "lancer une mission"
- `+ ADD AGENT` (toujours actif) — ouvre un dialog avec **sélecteur parent** (pour créer des
  sous-agents). Le parent par défaut = agent actuellement sélectionné si MOS.
- `× REMOVE` (actif sur agent MOS) — confirmation inline avant DELETE

Le champ `parent` doit être persisté dans `config.json` :

```ts
// agentsRepo.ts updateAgent + createAgent doivent accepter `parent`
if (patch.parent !== undefined) {
  if (patch.parent === null) delete raw.parent;
  else raw.parent = patch.parent;
}
```

Le graphe mesh tire ses edges de `cfg.parent`. Les agents sans parent (autres que `_main`) sont
reliés à `_main` par défaut.

D.5 — **Glyph save dans `/agents`**. Le picker de glyph (14 chars presets) doit être inclus dans
le PATCH save. Sinon le changement ne persiste pas :

```ts
// AgentEditor.tsx
const dirty = name !== cfg.name || glyph !== (cfg.glyph || cfg.name.charAt(0)) || ...;
const save = () => fetch(`/api/agents/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ name, glyph, cwd, model, permissionMode, systemPrompt, allowedTools, memoryScope }),
});
// API + agentsRepo.updateAgent doivent accepter `glyph`
// AgentConfig type doit avoir `glyph?: string`
```

D.6 — **Hydration warning** sur `<body>`. Les extensions navigateur (ColorZilla, Dark Reader,
Grammarly) injectent des attributs avant l'hydratation React, ce qui spamme la console avec un
warning rouge sur chaque page :

```tsx
// src/app/layout.tsx
<html lang="en" suppressHydrationWarning>
  <body suppressHydrationWarning style={{...}}>
```

`suppressHydrationWarning` ne masque QUE les attributs du tag sur lequel il est appliqué —
les enfants restent strictement vérifiés, donc pas de risque de masquer un vrai bug.

D.7 — **Page `/agents` en 2-pane** au lieu de 2 routes séparées :
- Liste 340px à gauche (sections MOS + Claude agents)
- Éditeur 1fr à droite, ID lu depuis `?id=<x>` query param
- Auto-sélection du premier agent MOS au chargement
- Cliquer sur un item → `router.replace("?id=...")` sans rechargement

La route legacy `/agents/[id]/edit` doit `redirect()` vers `/agents?id=[id]` pour préserver les
liens existants.

D.8 — **Inline styles hardcodés**. Repère les patterns répétés et extrais en classes :
- Modal backdrops → `.modal-backdrop` + `.modal-card`
- Bannières d'erreur → `.err-banner`
- États centrés ("loading…", "no data") → `.center-state`

Garde les inline styles légitimes (valeurs dynamiques, couleurs depuis data, transforms de dnd-kit).

D.9 — **Mesh visual tweaks**. Le prompt 01 a câblé le graphe mais le rendu par défaut est trop
discret. À ajuster dans `AgentGraph.tsx` :

- Rayon des nodes : `r = isKernel ? 34 : isNative ? 14 : 26` (au lieu de ~16 par défaut)
- Lignes des edges : `stroke="rgba(224,180,140,0.55)"` au lieu d'un gris terne, avec halo glow
  `stroke="rgba(224,122,95,0.12)" strokeWidth={(1.5 + l.w * 1.2) * 3}` en dessous
- Strokewidth de la ligne principale : `1.5 + l.w * 1.2`

Sans ça les utilisateurs ne voient pas leurs agents et les relations parent/enfant disparaissent
visuellement.

D.10 — **Mesh node : utilise `cfg.glyph`**. Quand on render un node, lire `agent.glyph` au lieu du
premier caractère du nom :

```tsx
const glyph = a.glyph || a.name.charAt(0).toUpperCase() || "◆";
```

Sinon le picker de glyph dans `/agents` (D.5) ne sert à rien — le mesh affichera toujours `_` pour
`_main`, `c` pour `code-helper`, etc.

D.11 — **Native agents dans le mesh + chat sidebar**. L'API `/api/agents?native=1` retourne MOS +
Claude agents (`source: "agent"`) + skills (`source: "skill"`). Ces 3 sources doivent être visibles
distinctement :

- **Mesh** : agents Claude natifs en vert (`#34d399`), MOS en orange accent. Toggle "Agents natifs"
  dans le TweaksPanel pour afficher/cacher les agents Claude (`source="agent"`). **Les skills
  (`source="skill"`) ne sont JAMAIS affichés dans le mesh** — ils sont uniquement accessibles via le
  slash menu dans `/chat`. Code de filtrage dans VisualizerApp :
  ```ts
  const cfgs = showNative
    ? allCfgs.filter((c) => c.source !== "skill")   // MOS + agents Claude, jamais les skills
    : allCfgs.filter((c) => c.source === "mos" || !c.source); // MOS seulement
  ```
- **Chat sidebar** : section MOS en haut + section "CLAUDE AGENTS" (count en vert) en dessous.
  **Pas de section "SKILLS"** dans la sidebar chat — on peut chatter qu'avec les agents, pas les
  skills.
- **/agents** : section "MOS" + section "CLAUDE AGENTS" en lecture seule (badge "CLAUDE" vert).
  **Pas de section "SKILLS"** dans `/agents` non plus — les skills sont des outils, pas des agents.

Les skills restent invocables via le slash menu dans `/chat` (D.2) — c'est leur place naturelle.

D.12 — **Topbar : retirer `/channels`**. Les channels vivent maintenant uniquement dans l'éditeur
de `_main` (cf D.3). Si le prompt 02 a ajouté un onglet `Channels` dans la Topbar, supprime-le.
Si la route `/channels` existe, supprime aussi `src/app/channels/` (page + API standalones — l'API
`/api/channels/*` reste, c'est juste la page UI qui disparaît).

L'ordre des tabs dans la Topbar : `Mesh · Agents · Chat · Memory · Missions · Board · Routines · Skills · Dashboard`.

D.13a — **Discovery natif depuis `~/.claude/`**. Mike's `02-channel-input.md` ne s'occupe pas de
ça. Ajoute deux reads filesystem dans `agentsRepo` + `skillsRepo` :

**`src/lib/agentsRepo.ts`** doit exposer 3 listings :

```ts
// MOS agents — <project>/.mos/agents/<id>/
export function listAgentConfigs(): AgentConfig[];

// Claude native skills — ~/.claude/skills/<id>/SKILL.md
//   Format SKILL.md : YAML frontmatter avec name, description (block scalar `|`), allowed-tools (list)
export function listNativeAgents(): AgentConfig[];

// Claude native agents — ~/.claude/agents/<id>.md ET <project>/.claude/agents/<id>.md
//   Format .md : YAML frontmatter (name, description, model, color) + body = system prompt
//   Dédup par id, project-local override global
export function listClaudeAgents(): AgentConfig[];
```

Chacun retourne des `AgentConfig` avec :
- `source: "mos" | "skill" | "agent"` pour différencier
- Tous les champs habituels (id, name, model, systemPrompt, allowedTools…)
- `permissionMode: "auto"` par défaut pour les natifs
- `cwd: "~"` par défaut pour les natifs

L'API `GET /api/agents?native=1` combine les 3 :

```ts
const mos = listAgentConfigs();
if (!includeNative) return mos;
return [...mos, ...listClaudeAgents(), ...listNativeAgents()];
```

Le frontend filtre ensuite par `source` selon le contexte (cf D.11).

D.13b — **Page `/skills` : catalogue des skills natifs Claude Code**. Doit lister TROIS sources :

```ts
// src/lib/skillsRepo.ts
const SKILLS_DIR            = path.join(process.cwd(), ".mos", "skills");        // skills MOS
const CLAUDE_GLOBAL_SKILLS  = path.join(os.homedir(), ".claude", "skills");      // skills user-global
const CLAUDE_PROJECT_SKILLS = path.join(process.cwd(), ".claude", "skills");     // skills project-local

export function listSkills(): Skill[] {
  const out: Skill[] = [];
  // 1. Skills MOS (skill.json)
  if (fs.existsSync(SKILLS_DIR)) {
    for (const d of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const raw = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, d.name, "skill.json"), "utf8"));
      out.push({ ...raw, id: d.name, source: "project" });
    }
  }
  // 2. Skills ~/.claude/skills/<id>/SKILL.md
  if (fs.existsSync(CLAUDE_GLOBAL_SKILLS)) {
    for (const d of fs.readdirSync(CLAUDE_GLOBAL_SKILLS, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const s = readClaudeSkill(path.join(CLAUDE_GLOBAL_SKILLS, d.name), "claude-global");
      if (s) out.push(s);
    }
  }
  // 3. Skills <project>/.claude/skills/<id>/SKILL.md
  // (idem avec source: "claude-project")
  return out;
}

function readClaudeSkill(dir: string, source: SkillSource): Skill | null {
  const md = path.join(dir, "SKILL.md");
  if (!fs.existsSync(md)) return null;
  const content = fs.readFileSync(md, "utf8");
  const fm = parseFrontmatter(content);
  return {
    id: path.basename(dir),
    name: fm.name ?? path.basename(dir),
    description: fm.description ?? "",
    category: "dev",
    agents: [],
    enabled: true,
    source,
  };
}
```

Le **parser frontmatter** doit gérer les block scalars `|` (description multi-lignes indentée dans
les skills Claude) :

```ts
function parseFrontmatter(raw: string) {
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return {};
  const block = fm[1];
  // Description en block scalar
  const descBlock = block.match(/^description:\s*\|\s*\n((?:[ \t]+.+\n?)+)/m);
  if (descBlock) {
    return {
      ...parseInlineFields(block),
      description: descBlock[1].split("\n").map(l => l.replace(/^\s{2}/, "").trimEnd()).filter(Boolean).join(" ").trim(),
    };
  }
  return parseInlineFields(block);
}
```

L'UI `/skills` affiche un catalogue avec :
- Filter bar par source (Project / Global Claude / Project Claude)
- Card par skill : nom, description en clamp 3 lignes, badge source coloré, count d'agents qui
  l'utilisent, toggle enabled (uniquement pour skills MOS — les Claude sont lecture seule)
- Bouton "+ New skill" qui crée un skill MOS dans `.mos/skills/<id>/skill.json`

Sur un agent Claude natif (~/.claude/agents/) tu n'as JAMAIS de PUT/DELETE — ils sont gérés par
l'utilisateur via le CLI Claude Code, l'OS ne fait que les lire et les exposer. Same pour les
skills natifs.

D.13c — **Auto-complete `/` dans chat = skills natifs**. Le slash menu (D.2) doit puiser dans
`/api/agents?native=1`, filtrer par `source === "skill"`, et insérer `/<skill.id> ` dans le textarea
quand on sélectionne. Les skills sont donc utilisables depuis le chat même s'ils n'apparaissent
pas dans la sidebar agents.

D.13d — **Pattern "edit page = create page"**. Si tes routes `/agents` et `/skills` utilisent
des modals "New X" (ce que faisait le scaffold de base), supprime-les et passe au pattern sentinel.

Une seule URL gère les deux modes :
- `/agents?id=<existingId>` → édition
- `/agents?id=__new__` → création (même UI, ID input visible, save fait POST)

Et idem `/skills?id=__new__`.

Composant `AgentEditor` accepte `isNew?: boolean` + `onCreated?: (newId: string) => void` :

```tsx
function AgentEditor({ id, isNew = false, onCreated, onDeleted }) {
  // En mode isNew : skip fetch, valeurs par défaut, montre champ "ID"
  useEffect(() => {
    if (isNew) {
      setNewId(""); setName(""); setGlyph("◆"); /* ... defaults ... */
      return;
    }
    fetch(`/api/agents/${id}`).then(/* ... */);
  }, [id, isNew]);

  const save = async () => {
    if (isNew) {
      const res = await fetch(`/api/agents`, { method: "POST", body: JSON.stringify({ id: newId, ... }) });
      if (res.ok) onCreated?.(newId);
      return;
    }
    await fetch(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify({ ... }) });
  };

  return (
    <>
      {/* Section Identity : si isNew, montre un champ ID en plus du Name */}
      {isNew && <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="e.g. forge" />}
      {/* ... reste de l'éditeur ... */}
      <button onClick={save}>{isNew ? "Create agent" : "Save"}</button>
      {/* Pas de bouton Delete en mode isNew */}
    </>
  );
}
```

Page `/agents` :

```tsx
const NEW_SENTINEL = "__new__";
const isNew = selectedId === NEW_SENTINEL;

<button className={`new-agent${isNew ? " active" : ""}`}
  onClick={() => router.replace(`/agents?id=${NEW_SENTINEL}`)}>
  + Spawn new agent
</button>

{isNew
  ? <AgentEditor key="__new__" id={NEW_SENTINEL} isNew onCreated={(newId) => router.replace(`/agents?id=${newId}`)} />
  : selectedId
  ? <AgentEditor key={selectedId} id={selectedId} onDeleted={onDeleted} />
  : <div className="empty-editor">…</div>}
```

Idem pour `/skills` avec son propre `SkillEditor` qui gère les sources :
- `source=project` → éditable (nom, description, catégorie pills DEV/CONTENT/OPS/LIFE, enabled toggle, corps Markdown)
- `source=claude-global` ou `claude-project` → **lecture seule enrichie** : parser le frontmatter YAML
  du `SKILL.md` (gérer les block scalars `|` pour `description`) et afficher un bandeau metadata
  (invocation `/id`, chemin source, description, tools chips) + le body Markdown séparé. Pas
  d'inputs éditables, pas de bouton Save. Le `description` dans le frontmatter SKILL.md est souvent
  un block scalar multi-lignes — utiliser ce parser :
  ```ts
  const parsedFm = useMemo(() => {
    if (!content) return null;
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { body: content, name: "", description: "", tools: [] as string[] };
    const fm = parseInlineFields(match[1]);
    const tools = fm.allowedTools ?? fm["allowed-tools"] ?? fm.tools ?? [];
    return { body: match[2].trim(), name: fm.name ?? "", description: fm.description ?? "",
             tools: Array.isArray(tools) ? tools : [] };
  }, [content]);
  ```

Pour ça `GET /api/skills/[id]?source=<src>` doit retourner soit le skill MOS soit le contenu du
`SKILL.md` natif :

```ts
export async function GET(req, { params }) {
  const { id } = await params;
  const source = new URL(req.url).searchParams.get("source") ?? "project";
  if (source === "claude-global" || source === "claude-project") {
    const file = path.join(source === "claude-global" ? CLAUDE_GLOBAL : CLAUDE_PROJECT, id, "SKILL.md");
    if (!fs.existsSync(file)) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ id, source, content: fs.readFileSync(file, "utf8") });
  }
  // ... project skill ...
}
```

Et le repo doit exposer `updateSkill(id, patch)` pour le PATCH :

```ts
// src/lib/skillsRepo.ts
export interface UpdateSkillInput {
  name?: string; description?: string; category?: SkillCategory;
  agents?: string[]; enabled?: boolean; code?: string;
}
export function updateSkill(id: string, patch: UpdateSkillInput): Skill | null {
  /* lit + patch + écrit skill.json */
}
```

Avec son endpoint `PATCH /api/skills/[id]` (uniquement pour `source=project`).

D.13e — **Historique des sessions de chat (browsable)**. Le `DELETE /api/chat/[agent]` qui nukait
`claude_session_id` à chaque "+ New chat" rend les anciennes conversations irrécupérables — c'est
de la perte de données silencieuse. À refaire :

1. **`DELETE /api/chat/[agent]`** devient un **no-op** côté serveur. "+ New chat" est un reset
   purement frontend (`setMessages([]); setViewSession(null); setSessionId(null)`). Les missions
   gardent leur `claude_session_id` historique.

2. **Nouvel endpoint `GET /api/chat/[agent]/sessions`** liste les sessions Claude passées de
   l'agent, avec firstTitle / count / firstTs / lastTs :

```ts
export async function GET(_req, { params }) {
  const { agent } = await params;
  const rows = getDb().prepare(`
    SELECT
      claude_session_id,
      MIN(start_ts) AS first_ts, MAX(start_ts) AS last_ts,
      COUNT(*)      AS message_count,
      (SELECT title FROM missions m2
        WHERE m2.agent_id = m.agent_id
          AND m2.claude_session_id = m.claude_session_id
          AND m2.kind = 'chat'
        ORDER BY m2.start_ts ASC LIMIT 1) AS first_title
    FROM missions m
    WHERE agent_id = ? AND kind = 'chat' AND claude_session_id IS NOT NULL
    GROUP BY claude_session_id
    ORDER BY last_ts DESC
  `).all(agent);
  return NextResponse.json(rows.map(r => ({
    sessionId: r.claude_session_id,
    firstTs: r.first_ts, lastTs: r.last_ts,
    messageCount: r.message_count, firstTitle: r.first_title,
  })));
}
```

3. **`GET /api/chat/[agent]?session_id=X`** charge un historique de session passée (chat-only,
   sans le mix channel, parce que les channels n'ont pas le même session_id). Sans `?session_id`,
   garde le comportement existant (latest chat session + channel messages).

4. **UI dans le header de chat** : le badge `● session aaaa…` devient un **bouton-pill cliquable**.
   Au clic, dropdown qui affiche :
   - "+ New chat" tout en haut (en accent) — frontend reset, prochain send → nouvelle session Claude
   - "↩ Back to latest" si `viewSession` est non-null
   - Section "PAST SESSIONS · N" — chaque entrée affiche : 4 premiers chars du session_id (mono),
     firstTitle (truncate), `Nm/Nh/Nd ago` côté droit. Clic → `setViewSession(sessionId)` qui
     déclenche le reload via `?session_id=X`.

5. **Envoi en mode "viewing session"** : `resume_session_id` passé à `/api/agents/spawn` devient
   `viewSession ?? sessionId ?? undefined`. Comme ça si l'utilisateur tape un message en visionnant
   une vieille session, le spawn la reprend (Claude continue la conversation) au lieu de créer une
   troisième session orpheline.

6. **Click-outside** : ferme le menu quand on clique ailleurs ou avec Escape.

7. **Reset destructif** (en plus du "+ New chat" non-destructif). Le DELETE accepte 2 query
   params optionnels pour vraiment supprimer des données :
   - `DELETE /api/chat/[agent]` (sans query) → no-op (cf D.13e point 1)
   - `DELETE /api/chat/[agent]?session_id=X` → wipe une session précise (missions + events)
   - `DELETE /api/chat/[agent]?all=1` → wipe TOUT l'historique : missions `kind='chat'` **ET**
     `kind='channel'` (Telegram/iMessage/Discord) + leurs events. Repartir complètement à zéro sur
     toutes les conversations web et canal. Implémentation :
     ```ts
     const rows = db.prepare(
       `SELECT id FROM missions WHERE agent_id = ? AND kind IN ('chat', 'channel')`
     ).all(agent) as { id: string }[];
     ```

   **Important — sync avec le fichier `memory/conversations.md`**. L'auto-record (Section C.3)
   appende un bloc Markdown pour chaque mission chat/channel terminée dans
   `.mos/agents/<id>/memory/conversations.md`. Quand on supprime une mission de la DB il faut
   aussi supprimer le bloc correspondant du fichier mémoire — sinon l'agent garderait les
   souvenirs d'une conversation effacée.

   Modifie d'abord `appendEntry` dans `lib/memory/autorecord.ts` pour **taguer chaque bloc**
   avec le mission_id sous forme de commentaire HTML :

```md
<!-- mission: m_a91 -->
## 2026-05-12 18:42 · via telegram

**user:** ...

**agent:** ...

---
```

   Puis ajoute deux helpers exportés à `autorecord.ts` :

```ts
export function removeConversationEntries(agentName: string, missionIds: string[]): void {
  if (missionIds.length === 0) return;
  const files = [
    path.join(agentDir(agentName), "memory", "conversations.md"),         // USER scope
    path.join(GLOBAL_MEMORY_DIR, `${agentName}-conversations.md`),         // GLOBAL scope
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, "utf8");
    let changed = false;
    for (const mid of missionIds) {
      const re = new RegExp(
        `<!-- mission: ${mid.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} -->\\n[\\s\\S]*?\\n---\\n?\\n?`,
        "g"
      );
      const next = content.replace(re, "");
      if (next !== content) { content = next; changed = true; }
    }
    if (changed) fs.writeFileSync(file, content);
  }
}

export function clearAllConversations(agentName: string): void {
  for (const file of [
    path.join(agentDir(agentName), "memory", "conversations.md"),
    path.join(GLOBAL_MEMORY_DIR, `${agentName}-conversations.md`),
  ]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
```

   On nettoie les DEUX scopes (USER et GLOBAL) à la suppression — on ne sait pas
   rétroactivement quel scope était actif au moment de l'enregistrement, et le tag mission_id
   rend l'opération idempotente (les blocs sans match restent intacts).

   Le DELETE handler appelle ces helpers après la suppression DB :

```ts
import { removeConversationEntries, clearAllConversations } from "@/lib/memory/autorecord";

if (wipeAll) {
  const rows = db.prepare(`SELECT id FROM missions WHERE agent_id = ? AND kind = 'chat'`).all(agent);
  const delE = db.prepare(`DELETE FROM events WHERE mission_id = ?`);
  const delM = db.prepare(`DELETE FROM missions WHERE id = ?`);
  db.transaction(() => { for (const { id } of rows) { delE.run(id); delM.run(id); } })();
  clearAllConversations(agent);  // ← wipe le fichier memory
}
if (wipeSession) {
  // ... même chose mais filtrée par session_id ...
  removeConversationEntries(agent, ids);  // ← surgical removal par mission_id
}
```

   Les archives (`conversations-archive-<ts>.md` créées par rotation) sont **préservées** par
   `clearAllConversations` — ce sont des snapshots historiques que l'utilisateur a peut-être
   intentionnellement archivés.

   UI dans le dropdown session-picker :
   - **× sur hover** de chaque ligne de session → `deleteSession(sid)` avec confirm()
   - **"⌫ Reset all chat history"** en rouge tout en bas du menu, séparé par un divider →
     `resetAllChat()` avec confirm() explicite mentionnant que les channels ne sont pas touchés
   - Après reset : `setMessages([]); setSessionId(null); setViewSession(null); reloadSessions()`

   ⚠ **Compatibilité legacy** : les blocs déjà présents dans `conversations.md` AVANT d'avoir
   ajouté le tag `<!-- mission: ... -->` (c'est-à-dire ceux créés par d'anciennes versions du
   prompt 04) **ne seront pas supprimés** par `removeConversationEntries` — pas de mission_id
   à matcher. L'utilisateur doit les nettoyer manuellement s'il y tient. C'est une dette
   acceptable : à partir d'aujourd'hui tout est correctement tagué.

D.13f — **Glyph reflété partout**. Le pattern `cfg.glyph || cfg.name.charAt(0)` doit être appliqué
**à tous les endroits** qui dérivent un glyph d'un agent :

- `/agents` liste : `AgentItem` → `const glyph = cfg.glyph || cfg.name.charAt(0).toUpperCase()`
- Mesh / VisualizerApp : `synthesizeAgent(config)` → `glyph: config.glyph || config.name.charAt(0)`
- Chat header : `currentAgent.glyph || currentAgent.name.charAt(0)`

Sinon le picker D.5 ne sert qu'à modifier le glyph dans l'éditeur, sans propagation visuelle.

D.13g — **Visualizer : MeshToolbar en haut + overlap topbar fixé**. Deux problèmes UI dans le
prompt 01-spawn-system :

1. **`.frame` et `.stage` mal contextualisés** : `position:absolute;inset:0` sans parent
   `position:relative` → ils prennent la taille de la viewport, ce qui chevauche la Topbar 48px.
   Fix : wrap tout `VisualizerApp` dans `<div className="viz-root">` avec :

```css
.viz-root {
  position: relative;
  height: calc(100vh - 48px);
  width: 100%;
  overflow: hidden;
}
```

Tous les overlays absolus (`.stage`, `.frame`, `.detail`, `.console`, etc.) sont maintenant
correctement bornés par cet ancêtre positionné.

2. **`MeshToolbar` en bas → haut**. La toolbar `▶ RUN TASK / + ADD AGENT / × REMOVE` était
   `bottom: 24px` ce qui collait au console SSE en bas. La passer en `top: 16px` (sous la Topbar)
   la rend toujours visible et accessible. Conserve `left: 50%; transform: translateX(-50%)` pour
   le centrage horizontal.

3. **Commander obsolète**. Le `Commander` du prompt 01 (input "spawn an agent…" en haut au centre)
   se chevauche maintenant avec la MeshToolbar. Comme la toolbar couvre déjà l'action "ADD AGENT",
   commente le rendu du Commander (ou supprime-le). Si tu veux le garder, déplace-le en bas
   ou dans le TweaksPanel.

D.13 — **Bouton "+ New chat" dans `/chat`**. Dans le header de chat (à droite, à côté du badge
model), bouton qui simplement reset l'état frontend (pas de DELETE serveur, cf D.13e) :

```ts
const newChat = async () => {
  if (!confirm("Start a new chat? Past messages stay in /missions but won't appear here anymore.")) return;
  await fetch(`/api/chat/${encodeURIComponent(agentId)}`, { method: "DELETE" });
  setSessionId(null); setMessages([]);
};
```

Backend (`DELETE /api/chat/[agent]`) doit ne purger QUE les missions `kind='chat'`, pas celles
`kind='channel'` :

```sql
UPDATE missions SET claude_session_id = NULL WHERE agent_id = ? AND kind = 'chat'
```

Comme ça l'historique Telegram reste préservé même quand on "new chat" sur le web.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION D.14 — TweaksPanel : persistance cookies
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le `TweaksPanel` se fermait et revenait à ses valeurs par défaut à chaque rechargement de page.
À corriger : persister l'état ouvert/fermé et les valeurs des tweaks dans des cookies `document.cookie`
(pas de `localStorage` car SSR).

```ts
// Helpers cookies côté client
function readCookie(key: string): string | null {
  return document.cookie.split(";").map(c => c.trim())
    .find(c => c.startsWith(key + "="))?.split("=")[1] ?? null;
}
function writeCookie(key: string, value: string) {
  document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=31536000`;
}

const OPEN_COOKIE    = "mos-tweaks-open";
const SETTINGS_COOKIE = "mos-tweaks-settings";
```

Hook `useTweaks<T>` :
```ts
export function useTweaks<T extends Record<string, unknown>>(
  defaults: T,
  cookieKey?: string,
): [T, (key: keyof T, val: T[keyof T]) => void] {
  const [tweaks, setTweaks] = useState<T>(() => {
    if (!cookieKey || typeof document === "undefined") return defaults;
    try { return { ...defaults, ...JSON.parse(decodeURIComponent(readCookie(cookieKey) ?? "{}")) }; }
    catch { return defaults; }
  });
  const setTweak = (key: keyof T, val: T[keyof T]) => {
    const next = { ...tweaks, [key]: val };
    setTweaks(next);
    if (cookieKey) writeCookie(cookieKey, JSON.stringify(next));
  };
  return [tweaks, setTweak];
}
```

Comportement panel fermé : quand `TweaksPanel` est fermé (`open=false`), rendre un bouton `⚙` en
position `absolute top:12px right:12px` qui rouvre le panel. Ne pas rendre `null` — sinon il n'y a
aucun moyen de le rouvrir sans rechargement.

Supprimer `eventRate` (taux d'injection d'événements mock) et `pulseRate` (vitesse de l'animation)
du `TweaksPanel` : ce sont des knobs de simulation qui n'ont pas leur place dans l'UI production.
Utiliser une constante `PULSE_RATE = 2.6` à la place.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION D.15 — Folder picker + section Skills dans l'éditeur d'agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**D.15a — Bouton folder picker dans le champ `cwd`**

Le champ "Working directory" de la section 01 Identity doit avoir un bouton `📁` à droite qui
ouvre un sélecteur de dossier natif macOS via AppleScript :

```ts
// src/app/api/system/pick-folder/route.ts
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

export async function POST() {
  try {
    const { stdout } = await execAsync(
      `osascript -e 'POSIX path of (choose folder with prompt "Sélectionner le répertoire de travail :")'`
    );
    const chosen = stdout.trim().replace(/\/$/, "") || "~";
    return NextResponse.json({ path: chosen });
  } catch {
    return NextResponse.json({ cancelled: true });
  }
}
```

Dans `AgentEditor.tsx` :
```tsx
async function pickFolder() {
  const res = await fetch("/api/system/pick-folder", { method: "POST" });
  const data = await res.json();
  if (!data.cancelled && data.path) setCwd(data.path);
}
```

Sur les OS non-macOS (Linux, Windows), le bouton est rendu désactivé avec un tooltip "macOS only".

**D.15b — Section 04 Skills dans l'éditeur d'agent**

L'éditeur d'agent comporte maintenant **5 sections** (pas 4) :

| # | Label | Contenu |
|---|---|---|
| 01 | IDENTITY | name, glyph picker, cwd + folder picker |
| 02 | MODEL & MEMORY | pills model, memoryScope |
| 03 | PERMISSIONS | mode pills, tool chips |
| **04** | **SKILLS** | chips des skills associés (MOS + natifs Claude) |
| 05 | CHANNELS | uniquement sur `_main` |

Section 04 Skills :
- Charge `/api/agents?native=1`, filtre sur `source === "skill"` pour obtenir la liste de tous les skills disponibles
- Affiche chaque skill comme un chip `.chip` cliquable (togglé = inclus dans `skills[]`)
- Two groupes : "MOS SKILLS" (`source=undefined` ou skill MOS) et "CLAUDE SKILLS" (skills `~/.claude/skills/`)
- La valeur `skills: string[]` est persistée dans `config.json` via `PATCH /api/agents/[id]`

Dans `agentsRepo.ts` :
```ts
// RawConfig + AgentConfig + CreateAgentInput + UpdateAgentInput ont tous skills?: string[]
export function toAgentConfig(raw: RawConfig): AgentConfig {
  return {
    // ...
    skills: raw.skills ?? [],
  };
}
export function updateAgent(id, patch) {
  // ...
  if (patch.skills !== undefined) raw.skills = patch.skills;
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION E — Data layer safety
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

E.1 — **Forcer la DB à `.mos/mos.db`**. Si un agent a inséré directement en SQL via Bash, il peut
avoir créé un `mos.db` à la racine du projet. La logique de resolveDbPath des prompts précédents
pouvait alors pointer dessus.

`src/lib/db.ts` doit AUJOURD'HUI :

```ts
function resolveDbPath(): string {
  const fromEnv = process.env.MOS_SQLITE?.trim();
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
  return path.join(MOS_DIR, "mos.db");  // TOUJOURS .mos/mos.db
}

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
    // .mos/mos.db existe déjà → rename root en .bak pour ne plus l'utiliser
    fs.renameSync(rootDb, rootDb + `.bak-${Date.now()}`);
  }
}

consolidateLegacyDb();  // s'exécute AVANT resolveDbPath
const DB_PATH = resolveDbPath();
```

E.2 — **`ensureColumn` pour migrations non-destructives** sur missions :

```ts
ensureColumn(_db, "missions", "source_channel", "TEXT");
ensureColumn(_db, "missions", "source_meta", "TEXT");
ensureColumn(_db, "missions", "claude_session_id", "TEXT");
ensureColumn(_db, "missions", "kind", "TEXT NOT NULL DEFAULT 'mission'");
ensureColumn(_db, "missions", "routine_id", "TEXT");
ensureColumn(_db, "kanban_cards", "description", "TEXT");
ensureColumn(_db, "kanban_cards", "not_before", "TEXT");
ensureColumn(_db, "kanban_cards", "mission_id", "TEXT");
ensureColumn(_db, "routines", "target_chat_ids", "TEXT");
```

E.3 — **Capture cost & tokens** depuis les events `result` du Claude CLI. Dans le listener
`agent.on("event")` du registry :

```ts
if (ev.type === "result") {
  const p = ev.payload as Record<string, unknown>;
  const cost = typeof p.total_cost_usd === "number" ? p.total_cost_usd : null;
  const usage = p.usage as Record<string, unknown> | null | undefined;
  const tokIn = typeof usage?.input_tokens === "number" ? usage.input_tokens : null;
  const tokOut = typeof usage?.output_tokens === "number" ? usage.output_tokens : null;
  if (cost !== null) updateCost.run(cost, tokIn ?? 0, tokOut ?? 0, missionId);
}
```

Sans ça, le dashboard et les stats /routines restent à $0 pour toujours.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION E.bis — System prompt MOS-aware pour `_main`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le système prompt par défaut de `_main` (livré par le prompt 00) est trop générique : l'agent ne
sait pas qu'il vit dans MOS, donc quand l'utilisateur demande "crée une routine qui ping toutes
les minutes", `_main` part éditer `crontab`, écrire un shell script dans `~/.mos/scripts/`, et
**rien n'apparaît dans `/routines`** côté UI. Frustrant et invisible.

Réécris `<project>/.mos/agents/_main/system-prompt.md` pour rendre l'agent **API-MOS-aware** :

````md
# System prompt — _main

You are `_main`, the orchestrator of **MOS** (Multi-agent OS), a local-first agentic operating
system that runs on the user's machine. You speak French by default unless asked otherwise.

## You live INSIDE the MOS API surface

MOS has a Next.js app on `localhost:3000`, a SQLite DB at `<project>/.mos/mos.db`, and dedicated
UI pages for every concept. **Always prefer MOS-native primitives over generic Unix tools** —
otherwise the user can't see what you create in the interface.

### Capability → preferred MOS surface

| User asks… | Use this, NOT that |
|---|---|
| Create a cron / routine / scheduled task | `POST /api/routines` (visible at `/routines`). **Never** edit `crontab` or write `launchd` plists. |
| Create / spawn a new agent | `POST /api/agents` (visible at `/agents`). **Never** just write a shell script. |
| Run a one-shot task on an agent | `POST /api/agents/spawn` (visible at `/missions`). |
| Create a skill | Write `.mos/skills/<id>/skill.json` (visible at `/skills`). |
| Add a kanban card | `POST /api/kanban` (visible at `/kanban`). |
| Send a message via Telegram | Recurring → routine with `notify_channel: "telegram"`. One-off → use the configured token from `.mos/channels/telegram.json`. |

If MOS genuinely doesn't have a primitive, flag it: "MOS doesn't have X, falling back to launchd."

### How to create a routine (the right way)

```bash
curl -X POST http://localhost:3000/api/routines \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ping-telegram",
    "name": "Ping Telegram every minute",
    "cron_expr": "* * * * *",
    "agent_id": "_main",
    "prompt": "Réponds par: Hello Florian",
    "notify_on": "always",
    "notify_channel": "telegram",
    "target_chat_ids": [8585742603]
  }'
```

After this: routine visible at `/routines`, scheduler fires every minute, each run is a mission
visible at `/missions`, output delivered to chat automatically. No system cron.

### How to create a sub-agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "pinger", "name": "pinger", "glyph": "P",
    "model": "claude-haiku-4-5-20251001",
    "permissionMode": "auto", "cwd": "~",
    "allowedTools": [], "parent": "_main",
    "systemPrompt": "Reply with the requested text, nothing else."
  }'
```

After this: agent visible at `/agents`, mesh shows a new node connected to `_main`,
`.mos/agents/pinger/` folder created.

### Channels — verify before asking

Never ask the user for a bot token if a channel is already configured. Check first:

```bash
curl http://localhost:3000/api/channels
```

The response shows each channel's stored token (`bot_token` raw or `bot_token_env` env var).
A routine with `notify_channel: "telegram"` uses that token automatically.

## Principles

- **Verify before asking.** Run `GET /api/channels`, `GET /api/agents`, `GET /api/routines`
  before asking the user for info that might already be in the system.
- **MOS-first, Unix-fallback.** Default to MOS API. Reach for crontab/launchd/scripts only if MOS
  doesn't have a primitive — and say so.
- **Surface your actions.** End with a pointer: "→ visible at `/routines`".
- **Delegate when it fits.** Spawn sub-agents via `/api/agents/spawn` if the task matches their
  specialty.
- Budget cap: $25/hour, hard halt at $30.

## Voice

Terse, technical. French + English code-switching OK. Bullets > paragraphs.
````

Sans cette mise à jour, les utilisateurs vont demander "crée moi une routine" et voir leur agent
créer des crontab système invisibles depuis l'UI — c'est le bug #1 remonté en feedback.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION F — UX micro-fixes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

F.1 — `/missions` : detail panel (1fr / 460px split). Le 01 a câblé le streaming mais probablement
pas l'UI table + detail. À ajouter : tabs Timeline / Output / Logs, delete avec confirmation.

F.2 — `/kanban` : ajoute `description` au modal de création de card (textarea sous le title).
Quand on drop une card sur `doing`, la mission est spawn avec `card.title + "\n\n" + card.description`
en mission text. Ajoute le bouton de suppression × dans le detail panel des cards.

F.2a — **Drag-and-drop free entre toutes les colonnes**. Deux bugs UX kanban à corriger :

1. **Colonnes non droppables**. Par défaut seule une carte est un drop target (sortable
   context). Si la colonne cible est vide ou si tu drop au-dessus/en-dessous des cards,
   `over.id` est null et rien ne se passe — l'utilisateur a l'impression que le drag est
   cassé. Fix : enregistrer chaque colonne en `useDroppable` :

```tsx
import { useDroppable } from "@dnd-kit/core";

const COL_DROPPABLE_PREFIX = "col:";

function Column({ col, cards, ... }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_DROPPABLE_PREFIX}${col.id}` });
  return (
    <div className={`kb-col ${col.id}${isOver ? " drop-over" : ""}`}>
      ...
      <div ref={setNodeRef} className="kb-col-body scroll">{/* cards */}</div>
    </div>
  );
}
```

Dans `onDragEnd`, détecte les deux types d'`over.id` :

```tsx
const overId = String(over.id);
let targetCol;
if (overId.startsWith(COL_DROPPABLE_PREFIX)) {
  targetCol = overId.slice(COL_DROPPABLE_PREFIX.length);  // drop sur la colonne directement
} else {
  const overCard = cards.find(c => c.id === overId);
  if (overCard) targetCol = overCard.col;                 // drop sur une autre card
}
```

Ajoute aussi un style `.kb-col.drop-over { border-color: var(--accent); ... }` pour le feedback
visuel pendant le drag.

2. **Auto-promote en `done` indésirable**. Le registry promouvait la card en `done` à la
   complétion de la mission spawned (dans `agent.on("done")`) :

```ts
// AVANT — la card jump direct à done dès que la mission finit (souvent en 2-3s)
if (kind !== "chat") {
  updateCardByMissionId(missionId, {
    col: "done",
    ...(finalStatus === "failed" ? { tags: ["failed"] } : {}),
  });
}
```

Résultat : l'utilisateur drop une card dans `doing` → la mission Trevor finit en 3s → la
card passe directement à `done` sans laisser le temps de la voir en cours. Frustrant pour
un kanban : on perd le contrôle manuel.

Fix : ne pas auto-promouvoir, garder uniquement le tag `failed` en cas d'échec :

```ts
// APRÈS — la card reste où l'utilisateur l'a mise. Seul un tag failed est appliqué automatiquement.
if (kind !== "chat" && finalStatus === "failed") {
  updateCardByMissionId(missionId, { tags: ["failed"] });
}
```

L'utilisateur décide quand la tâche est "done" en draggant manuellement. Vrai comportement
kanban.

F.3 — `/memory` : 2-col layout (tree + editor). Bouton de suppression au hover sur chaque ligne
de fichier dans la tree. Path affiché en mono dans le label de section : `.mos/agents/<id>/memory/`.

F.4 — Suspense boundaries. Toute page qui appelle `useSearchParams()` doit être wrappée dans
`<Suspense>` ou Next.js 16 fait un build-error. Concerné : `/agents` (lit `?id=`), `/chat` (lit
`?agent=`), `/memory` (peut lire `?agent=`).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECKLIST DE VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Avant de considérer l'OS comme fully functional :

**Routines** :
- [ ] `/routines` liste les routines avec stats temps réel
- [ ] Créer une routine `* * * * *` qui ping `_main` avec un prompt simple
- [ ] Après 1 min, voir apparaître une mission en DB avec `routine_id = "<id>"`
- [ ] `last_run_ts` et `next_run_ts` se mettent à jour automatiquement

**Telegram** :
- [ ] Configurer telegram via Mesh → `_main` → EDIT CONFIG → CHANNELS → SETUP
- [ ] Coller un raw token (avec `:`) → le placeholder "détecté comme token brut" s'affiche
- [ ] Envoyer un message au bot → le `chat_id` apparaît dans `.mos/channels/telegram.subscribers.json`
- [ ] Voir le bot répondre avec un placeholder `🤔 …` qui se remplit progressivement
- [ ] Envoyer un 2e message au bot — il garde le contexte du précédent (session resume)
- [ ] Créer une routine avec `notify_channel: telegram, notify_on: always` → ping reçu sur Telegram

**Chat** :
- [ ] Ouvrir `/chat?agent=_main` dans un onglet
- [ ] Envoyer un message via Telegram → il apparaît dans le chat web en quelques secondes
- [ ] Badge "via telegram" visible sur les bulles canal-sourced
- [ ] Taper `/` dans l'input → popup avec les skills disponibles

**Mémoire** :
- [ ] Échanger 3 messages avec `_main`
- [ ] Vérifier `.mos/agents/_main/memory/conversations.md` rempli avec les 3 échanges
- [ ] Changer le scope à `NONE` dans `/agents` → save → plus rien n'est appendé
- [ ] Changer à `USER` → reprend l'enregistrement

**Mesh** :
- [ ] Toolbar bas-centre avec ▶ RUN TASK / + ADD AGENT / × REMOVE
- [ ] Créer un sous-agent avec parent `_main` → la nouvelle node apparaît reliée à `_main`
- [ ] Cliquer sur un agent → panel droit avec OPEN CHAT / EDIT CONFIG / MEMORY
- [ ] Nodes assez grosses pour être visibles (kernel 34px, autres 26px), lignes orangées
- [ ] Le glyph custom (depuis `/agents`) s'affiche bien dans la node correspondante
- [ ] Toggle "Agents natifs" dans TweaksPanel → affiche/cache les skills + Claude agents

**Chat — sessions browsables** :
- [ ] Cliquer "+ New chat" → ne nuke RIEN en DB (les sessions restent dans `missions.claude_session_id`)
- [ ] Le badge `● session aaaa…` du header est cliquable → dropdown des sessions passées
- [ ] Cliquer une session passée → l'historique se charge en mode read-only-ish (chat-only)
- [ ] Envoyer un message en visionnant une vieille session → Claude la reprend (pas de nouvelle session)
- [ ] `/api/chat/[agent]/sessions` retourne au moins 1 entry par session_id distinct
- [ ] × sur hover de chaque session → suppression d'une session précise (missions + events)
- [ ] Bouton rouge "Reset all chat history" en bas du dropdown → wipe complet de l'agent
- [ ] Chaque bloc dans `.mos/agents/<id>/memory/conversations.md` est tagué `<!-- mission: <id> -->`
- [ ] Supprimer une session retire les blocs correspondants du `conversations.md`
- [ ] "Reset all" supprime le `conversations.md` entier (archives préservées)

**Kanban drag-and-drop** :
- [ ] Drag d'une card de `todo` vers une colonne `done` vide → la card y atterrit (pas seulement sur un autre card)
- [ ] Drag d'une card de `done` vers `backlog` → la card revient en backlog (toutes directions OK)
- [ ] Drop sur une colonne → highlight accent visible pendant le drag
- [ ] Drop d'une card sur `doing` → spawn la mission MAIS la card reste en `doing` (ne passe pas auto à `done`)
- [ ] Tag `failed` appliqué seulement si la mission échoue

**`_main` MOS-aware** :
- [ ] Demander à `_main` "crée une routine ping toutes les minutes" → il appelle `POST /api/routines`, pas `crontab`
- [ ] Demander à `_main` "crée un sous-agent pinger" → il appelle `POST /api/agents` (visible dans `/agents`)
- [ ] Demander à `_main` une action Telegram → il check `GET /api/channels` d'abord au lieu de redemander le token
- [ ] Chaque action API se termine par un pointeur "→ visible at /routines" ou similaire

**Glyph cohérent partout** :
- [ ] Changer le glyph dans `/agents?id=X` → save → le nouveau glyph apparaît dans la liste de gauche
- [ ] Idem dans le mesh (la node correspondante affiche le nouveau glyph)
- [ ] Idem dans le header de `/chat?agent=X`

**Visualizer — positioning** :
- [ ] `.viz-root` wrap tout, `height: calc(100vh - 48px)` → plus aucun overlap avec la Topbar
- [ ] MeshToolbar en haut (`top: 16px`), centrée horizontalement
- [ ] Commander absent (ou repositionné), pas de chevauchement avec la MeshToolbar

**Discovery natif** :
- [ ] `/api/agents?native=1` retourne MOS + skills (`source: "skill"`) + Claude agents (`source: "agent"`)
- [ ] `/skills` liste les skills depuis `~/.claude/skills/*/SKILL.md` (frontmatter avec description block scalar parsé)
- [ ] Les skills `<project>/.claude/skills/` sont aussi listés (override global si même id)
- [ ] `/agents` affiche une section "CLAUDE AGENTS" en lecture seule avec les `.claude/agents/*.md`
- [ ] Slash menu dans `/chat` propose les skills natifs (taper `/chr` filtre vers `/chrome-navigator`)

**Create = edit page (pattern sentinel)** :
- [ ] Cliquer "+ Spawn new agent" → URL devient `/agents?id=__new__`, l'éditeur s'ouvre vide avec champ ID
- [ ] Sauvegarder un nouveau agent → POST + redirect vers `/agents?id=<newId>` (même UI, mode edit)
- [ ] Pas de modal "New agent" résiduelle
- [ ] Idem `/skills?id=__new__` pour créer un skill MOS
- [ ] Cliquer sur un skill natif (claude-global/claude-project) → preview SKILL.md en read-only, pas d'inputs

**Édition agent** :
- [ ] Changer le glyph → save → recharger la page → le nouveau glyph est là
- [ ] Changer `memoryScope` → save → vérifier dans `.mos/agents/<id>/config.json` la valeur persiste

**DB** :
- [ ] `.mos/mos.db` existe et contient toutes les tables (missions, events, kanban_cards, routines, remote_tokens)
- [ ] Pas de `mos.db` parasite à la racine du projet
- [ ] Si un legacy `mos.db` existait, il est renommé en `mos.db.bak-<ts>`

**Console** :
- [ ] Aucune erreur d'hydratation dans la console navigateur
- [ ] Au boot du serveur : `[mos] channels started: …`, `[mos] routines scheduler started`,
      `[mos] memory auto-record started`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRAINTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Ne PAS toucher au scaffold de base (déjà fait dans 00-init-mvp)
- Ne PAS reimplémenter le spawn (déjà fait dans 01-spawn-system)
- Ne PAS reimplémenter le polling Telegram basique (déjà fait dans 02-channel-input) — juste
  l'enrichir (subscribers, streaming, session resume)
- Ne PAS toucher au tunnel/auth (déjà fait dans 03-remote-control)
- TypeScript strict, pas de `any` non justifié
- À chaque modif backend (channels, routines, autorecord), prévenir l'utilisateur de redémarrer
  `npm run dev` — les listeners enregistrés via `instrumentation.ts` sont câblés au boot et
  Next.js ne les recharge pas automatiquement
````

---

## Notes pour l'utilisateur

- Ce prompt est conçu pour s'appliquer **idempotemment** — si certaines fonctionnalités sont déjà
  partiellement implémentées par 01/02/03, l'agent doit détecter et n'ajouter que ce qui manque
  (cf le `ensureColumn` qui ne crashe pas si la colonne existe).
- **Redémarrage obligatoire** du serveur Next.js après ce prompt — les hooks dans
  `instrumentation.ts` ne se rechargent pas à chaud.
- Si Telegram est déjà configuré avec un `bot_token_env` qui pointe vers une variable manquante,
  la migration vers `bot_token` raw ne se fait PAS automatiquement — l'utilisateur doit re-saisir
  son token via l'UI (Mesh → `_main` → EDIT CONFIG → CHANNELS → Telegram ⋯).
- ⚠ **Sécurité tokens** : si vous décidez d'accepter les raw tokens, prévenez vos utilisateurs
  que `.mos/channels/*.json` doit être dans `.gitignore` et **jamais committé**. Le `.env.local`
  reste la solution recommandée.

## Ordre conseillé après ce prompt

1. Redémarrer `npm run dev`
2. Aller sur `/agents` → vérifier que `_main` apparaît et que ses configs sont persistantes
3. Aller sur Mesh → `_main` → EDIT CONFIG → CHANNELS → SETUP Telegram
4. Tester un échange Telegram (streaming + session resume)
5. Créer une routine de test `* * * * *` → vérifier la livraison sur Telegram après 1 min
6. C'est fonctionnel.
