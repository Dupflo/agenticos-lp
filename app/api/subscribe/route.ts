import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Liste Brevo (Contacts > Listes) — id fourni par l’utilisateur */
const BREVO_LIST_ID = Number(process.env.BREVO_LIST_ID ?? "5");

type LeadsFile = {
  emails: string[];
  updatedAt: string;
};

const dataDir = path.join(process.cwd(), "data");
const leadsPath = path.join(dataDir, "leads.json");

async function readLeads(): Promise<LeadsFile> {
  try {
    const raw = await fs.readFile(leadsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LeadsFile>;
    if (!Array.isArray(parsed.emails)) {
      return { emails: [], updatedAt: new Date().toISOString() };
    }
    return { emails: parsed.emails, updatedAt: parsed.updatedAt ?? "" };
  } catch {
    return { emails: [], updatedAt: new Date().toISOString() };
  }
}

async function addContactToBrevo(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "Configuration Brevo manquante (BREVO_API_KEY)." };
  }
  if (!Number.isFinite(BREVO_LIST_ID) || BREVO_LIST_ID < 1) {
    return { ok: false, message: "BREVO_LIST_ID invalide." };
  }

  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      email,
      listIds: [BREVO_LIST_ID],
      updateEnabled: true,
    }),
  });

  if (res.ok || res.status === 201) {
    return { ok: true };
  }

  let detail = res.statusText;
  try {
    const errBody = (await res.json()) as { message?: string; code?: string };
    if (errBody?.message) {
      detail = errBody.message;
    }
  } catch {
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
  }

  return {
    ok: false,
    message: `Brevo (${res.status}): ${detail}`.slice(0, 500),
  };
}

/**
 * Copie locale des leads (pratique en dev / hébergement avec disque persistant).
 * Sur Vercel et la plupart des serverless, le FS est en lecture seule : on ignore
 * l’erreur — Brevo reste la source de vérité en prod.
 */
async function persistLocalCopy(email: string): Promise<boolean> {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const existing = await readLeads();
    const set = new Set(
      existing.emails.map((e) => e.trim().toLowerCase()).filter(Boolean),
    );
    const isNew = !set.has(email);
    set.add(email);
    const next: LeadsFile = {
      emails: [...set].sort(),
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(leadsPath, JSON.stringify(next, null, 2), "utf8");
    return isNew;
  } catch (err) {
    console.warn("[subscribe] Copie locale leads ignorée (FS non inscriptible ?):", err);
    return true;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Ton navigateur n’a pas envoyé les données attendues. Recharge la page, puis réessaie.",
      },
      { status: 400 },
    );
  }
  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";

  if (!emailRegex.test(email)) {
    return NextResponse.json(
      {
        error:
          "L’adresse e-mail que tu as saisie ne semble pas valide. Corrige-la, puis réessaie.",
      },
      { status: 400 },
    );
  }

  const hasBrevo = Boolean(process.env.BREVO_API_KEY?.trim());

  if (hasBrevo) {
    const brevo = await addContactToBrevo(email);
    if (!brevo.ok) {
      console.error("[subscribe] Brevo:", brevo.message);
      return NextResponse.json(
        {
          error:
            "On n’a pas pu enregistrer ton e-mail pour le moment. Réessaie dans quelques instants.",
          detail: brevo.message,
        },
        { status: 502 },
      );
    }
    const isNew = await persistLocalCopy(email);
    return NextResponse.json({ ok: true, new: isNew, brevo: true });
  }

  const isNew = await persistLocalCopy(email);
  return NextResponse.json({ ok: true, new: isNew, brevo: false });
}
