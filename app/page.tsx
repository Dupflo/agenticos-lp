import { SubscribeCard } from "./components/SubscribeCard"
import { TikTokMarquee } from "./components/TikTokMarquee"

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-mesh"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 vignette"
        aria-hidden
      />

      <header className="relative z-10 flex h-12 shrink-0 items-center gap-0 border-b border-os-line bg-linear-to-b from-os-bg/95 to-os-bg/70 px-4 text-[12px] text-os-text-dim backdrop-blur-md">
        <div className="mr-[18px] flex items-center gap-2.5 border-r border-os-line pr-[18px] text-os-text">
          <span
            className="brand-mark size-[18px] shrink-0 rounded-[5px]"
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-1">
            <span className="text-[13px] font-semibold tracking-wide text-os-text">
              Agentic OS
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex w-full min-w-0 flex-1 flex-col items-center px-4 py-14 sm:py-20">
        <div className="w-full max-w-xl text-center">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-os-text-faint">
            Tu arrives depuis TikTok
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-os-text sm:text-4xl">
            Débloque ton <span className="text-os-accent">Claude Design</span>{" "}
            et développe ton OS Agentic
          </h1>
        </div>

        <div className="mt-10 w-full max-w-md rounded-xl border border-os-line bg-os-elev p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] sm:p-8">
          <SubscribeCard />
        </div>

        <TikTokMarquee />
      </main>

      <footer className="relative z-10 border-t border-os-line px-4 py-6 text-center text-[11.5px] text-os-text-faint">
        Tu es sur la landing prototype Agentic OS · Next.js &amp; Tailwind
      </footer>
    </div>
  )
}
