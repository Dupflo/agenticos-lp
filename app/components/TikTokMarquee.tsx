"use client";

import Script from "next/script";
import styles from "./TikTokMarquee.module.css";

const TUTORIAL_VIDEOS = [
  {
    id: "7638581673910701314",
    href: "https://www.tiktok.com/@dupflodev/video/7638581673910701314",
  },
  {
    id: "7638696116653002006",
    href: "https://www.tiktok.com/@dupflodev/video/7638696116653002006",
  },
  {
    id: "7638939107510603041",
    href: "https://www.tiktok.com/@dupflodev/video/7638939107510603041",
  },
] as const;

function TikTokCard({ id, href }: { id: string; href: string }) {
  return (
    <article className="flex h-[560px] w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-os-line-strong bg-os-elev shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
      <div className="relative min-h-0 flex-1">
        <iframe
          title={`Tutoriel TikTok pour toi — ${id}`}
          src={`https://www.tiktok.com/embed/v2/${id}?autoplay=1&loop=1`}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 border-t border-os-line bg-os-elev-2 py-2 text-center text-[11px] font-medium text-os-text-dim transition-colors hover:bg-os-elev hover:text-os-accent"
      >
        Ouvre sur TikTok
      </a>
    </article>
  );
}

export function TikTokMarquee() {
  const loop = [...TUTORIAL_VIDEOS, ...TUTORIAL_VIDEOS];

  return (
    <section
      className="relative mt-14 w-screen max-w-[100vw] shrink-0 overflow-hidden sm:mt-16"
      style={{
        marginLeft: "calc(50% - 50vw)",
        marginRight: "calc(50% - 50vw)",
      }}
      aria-label="Tes tutoriels TikTok défilent ici"
    >
      <Script src="https://www.tiktok.com/embed.js" strategy="lazyOnload" />

      <div className="pointer-events-none absolute inset-0 z-20 flex justify-between">
        <div
          className={`${styles.fadeLeft} h-full w-[18%] max-w-[140px] sm:w-[22%] sm:max-w-[200px]`}
          aria-hidden
        />
        <div
          className={`${styles.fadeRight} h-full w-[18%] max-w-[140px] sm:w-[22%] sm:max-w-[200px]`}
          aria-hidden
        />
      </div>

      <div className="border-y border-os-line bg-os-elev/40 py-6 backdrop-blur-[2px]">
        <p className="mb-4 px-4 text-center text-[10.5px] font-semibold uppercase tracking-[0.12em] text-os-text-faint">
          Tes tutoriels TikTok
        </p>
        <div className={styles.viewport}>
          <div className={styles.track}>
            {loop.map((v, i) => (
              <TikTokCard key={`${v.id}-${i}`} id={v.id} href={v.href} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
