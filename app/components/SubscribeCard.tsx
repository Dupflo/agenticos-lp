"use client";

import { useState } from "react";
import { KIT_FILENAME, LeadForm } from "./LeadForm";

export function SubscribeCard() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      {!submitted ? (
        <div className="mb-5 text-left">
          <h2 className="text-sm font-semibold text-os-text">
            Ton accès immédiat au kit
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-os-text-dim">
            Dès que tu valides le formulaire, ton navigateur télécharge{" "}
            <span className="font-mono text-[11.5px] text-os-text">
              {KIT_FILENAME}
            </span>{" "}
            : tu y trouves les fichiers et le lien vers le projet Claude Design.
          </p>
        </div>
      ) : null}
      <LeadForm onSuccess={() => setSubmitted(true)} />
    </>
  );
}
