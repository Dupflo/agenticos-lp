export type SingleKitId = "design" | "mvp" | "features";

export type KitId = SingleKitId | "all";

/** Onglets du sélecteur (inclut le pack complet). */
export const KIT_ORDER: KitId[] = ["design", "mvp", "features", "all"];

/** Fichiers inclus dans le pack « Tout » (ordre des téléchargements). */
export const DOWNLOAD_KIT_ORDER: SingleKitId[] = ["design", "mvp", "features"];

const TAB_ALIASES: Record<string, KitId> = {
  design: "design",
  "cloud-design": "design",
  clouddesign: "design",
  cloud: "design",
  mvp: "mvp",
  features: "features",
  feature: "features",
  all: "all",
  tout: "all",
  pack: "all",
  complet: "all",
  ensemble: "all",
};

export const KITS: Record<
  KitId,
  {
    tabLabel: string;
    shortDescription: string;
    href: string;
    filename: string;
    submitCta: string;
    downloadCta: string;
  }
> = {
  design: {
    tabLabel: "Cloud Design",
    shortDescription:
      "le zip Claude Design : fichiers prêts et lien vers le projet Cloud Design.",
    href: "/downloads/agentic-os-claude-design.zip",
    filename: "agentic-os-claude-design.zip",
    submitCta: "Reçois ton kit Cloud Design",
    downloadCta: "Télécharger le kit Cloud Design",
  },
  mvp: {
    tabLabel: "MVP",
    shortDescription:
      "la fiche MVP (init projet) alignée sur la vidéo mise en avant.",
    href: "/downloads/00-init-mvp.md",
    filename: "00-init-mvp.md",
    submitCta: "Reçois la fiche MVP",
    downloadCta: "Télécharger la fiche MVP",
  },
  features: {
    tabLabel: "Features",
    shortDescription:
      "le guide setup features aligné sur la vidéo mise en avant.",
    href: "/downloads/04-setup-features.md",
    filename: "04-setup-features.md",
    submitCta: "Reçois le guide Features",
    downloadCta: "Télécharger le guide Features",
  },
  all: {
    tabLabel: "Tout",
    shortDescription:
      "inscription unique : enchaînement automatique des trois téléchargements (Cloud Design, MVP, Features).",
    href: "",
    filename: "",
    submitCta: "Reçois le pack complet",
    downloadCta: "Télécharger tout le pack",
  },
};

export function defaultKitId(): KitId {
  return "design";
}

type SearchParamsRead = { get(name: string): string | null };

export function parseKitFromSearchParams(
  searchParams: SearchParamsRead | null,
): KitId | null {
  if (!searchParams) return null;
  const raw = searchParams.get("tab") ?? searchParams.get("kit");
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return TAB_ALIASES[key] ?? null;
}

export function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Déclenche les trois téléchargements avec un léger décalage (navigateurs bloquent souvent le parallèle strict). */
export function downloadAllKits() {
  DOWNLOAD_KIT_ORDER.forEach((id, index) => {
    const k = KITS[id];
    window.setTimeout(() => {
      triggerDownload(k.href, k.filename);
    }, index * 450);
  });
}
