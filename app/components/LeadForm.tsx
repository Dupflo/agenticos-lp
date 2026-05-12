"use client";

import { useEffect, useState } from "react";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const KIT_ZIP = "/downloads/agentic-os-claude-design.zip";
export const KIT_FILENAME = "agentic-os-claude-design.zip";

type LeadFormProps = {
  onSuccess?: () => void;
};

export function LeadForm({ onSuccess }: LeadFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmed = email.trim();
    if (!emailRegex.test(trimmed)) {
      setStatus("error");
      setMessage("Indique une adresse e-mail valide.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setStatus("error");
        const base = data.error ?? "Une erreur est survenue de notre côté. Réessaie dans un instant.";
        setMessage(data.detail ? `${base}\n${data.detail}` : base);
        return;
      }
      setStatus("success");
      onSuccess?.();
    } catch {
      setStatus("error");
      setMessage("Problème réseau de ton côté ou du nôtre. Vérifie ta connexion, puis réessaie.");
    }
  }

  useEffect(() => {
    if (status !== "success") return;
    const id = window.setTimeout(() => {
      const a = document.createElement("a");
      a.href = KIT_ZIP;
      a.download = KIT_FILENAME;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, 400);
    return () => window.clearTimeout(id);
  }, [status]);

  if (status === "success") {
    return (
      <div className="flex flex-col gap-4 text-left">
        <p className="text-[15px] font-semibold text-os-text">Merci !</p>
        <p className="text-[12.5px] leading-relaxed text-os-text-dim">
          Ton inscription est bien enregistrée. Le téléchargement de{" "}
          <span className="font-mono text-[11.5px] text-os-text">{KIT_FILENAME}</span>{" "}
          devrait démarrer tout seul. Si rien ne se passe, clique sur le bouton
          ci-dessous.
        </p>
        <a
          href={KIT_ZIP}
          download={KIT_FILENAME}
          className="inline-flex h-9 items-center justify-center rounded-[7px] border border-os-line-strong bg-os-elev-2 px-4 text-[12.5px] font-medium text-os-text transition-colors hover:border-os-accent-line hover:text-os-accent"
        >
          Télécharger le kit
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-3"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor="email"
          className="text-[11px] font-medium uppercase tracking-[0.08em] text-os-text-dim"
        >
          Ton e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="toi@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
          className="w-full rounded-[7px] border border-os-line-strong bg-os-bg px-[11px] py-[9px] text-[13px] text-os-text outline-none transition-[border-color,box-shadow,background] placeholder:text-os-text-faint focus:border-os-accent-line focus:bg-[#0d0d0d] focus:shadow-[0_0_0_3px_var(--os-accent-soft)] disabled:opacity-60"
        />
        <p className="text-[11.5px] leading-relaxed text-os-text-faint">
          On n’utilise ton e-mail que pour t’envoyer le kit et les nouveautés qui
          te concernent sur Agentic OS.
        </p>
      </div>
      {message ? (
        <p
          className={`text-[12.5px] ${status === "error" ? "text-[#f29696]" : "text-os-text-dim"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-[7px] border border-transparent bg-os-accent px-4 text-[12.5px] font-medium text-[#1a0e09] transition-colors hover:bg-os-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "loading" ? "Envoi en cours…" : "Reçois ton Claude Design"}
      </button>
    </form>
  );
}
