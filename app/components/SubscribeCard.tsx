"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type KitId,
  KIT_ORDER,
  KITS,
  DOWNLOAD_KIT_ORDER,
  defaultKitId,
  parseKitFromSearchParams,
} from "../lib/download-kits";
import { LeadForm } from "./LeadForm";

function KitSegmentedControl({
  activeId,
  onSelect,
}: {
  activeId: KitId;
  onSelect: (id: KitId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Choisir le fichier à télécharger"
      className="flex w-full flex-col gap-2"
    >
      <div className="flex min-h-[38px] w-full flex-1 rounded-[9px] border border-os-line-strong bg-os-bg p-[3px]">
        {KIT_ORDER.map((id) => {
          const selected = id === activeId;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`kit-tab-${id}`}
              aria-controls="kit-panel-form"
              onClick={() => onSelect(id)}
              className={`relative min-w-0 flex-1 rounded-[6px] px-1.5 py-2 text-center text-[11.5px] font-medium transition-colors sm:px-2 sm:py-1.5 ${
                selected
                  ? "bg-os-elev-2 text-os-text shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "text-os-text-dim hover:bg-os-elev-2/60 hover:text-os-text"
              }`}
            >
              {KITS[id].tabLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubscribeCardInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);

  const kitId = useMemo(() => {
    return parseKitFromSearchParams(searchParams) ?? defaultKitId();
  }, [searchParams]);

  function selectKit(id: KitId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const kit = KITS[kitId];

  return (
    <>
      <div className="mb-4">
        <KitSegmentedControl activeId={kitId} onSelect={selectKit} />
      </div>

      {!submitted ? (
        <div className="mb-5 text-left">
          <h2 className="text-sm font-semibold text-os-text">
            Ton accès immédiat au kit
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-os-text-dim">
            {kitId === "all" ? (
              <>
                Dès que tu valides le formulaire, tu reçois successivement{" "}
                {DOWNLOAD_KIT_ORDER.map((id, i) => (
                  <span key={id}>
                    {i > 0
                      ? i === DOWNLOAD_KIT_ORDER.length - 1
                        ? " et "
                        : ", "
                      : null}
                    <span className="font-mono text-[11.5px] text-os-text">
                      {KITS[id].filename}
                    </span>
                  </span>
                ))}
                . {kit.shortDescription}
              </>
            ) : (
              <>
                Dès que tu valides le formulaire, ton navigateur télécharge{" "}
                <span className="font-mono text-[11.5px] text-os-text">
                  {kit.filename}
                </span>{" "}
                : {kit.shortDescription}
              </>
            )}
          </p>
        </div>
      ) : null}
      <div id="kit-panel-form" role="tabpanel" aria-labelledby={`kit-tab-${kitId}`}>
        <LeadForm kitId={kitId} onSuccess={() => setSubmitted(true)} />
      </div>
    </>
  );
}

function SubscribeCardFallback() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-[38px] rounded-[9px] bg-os-elev-2" />
      <div className="h-16 rounded-lg bg-os-elev-2/80" />
      <div className="h-24 rounded-lg bg-os-elev-2/60" />
    </div>
  );
}

export function SubscribeCard() {
  return (
    <Suspense fallback={<SubscribeCardFallback />}>
      <SubscribeCardInner />
    </Suspense>
  );
}
