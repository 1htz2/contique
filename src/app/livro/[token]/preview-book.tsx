"use client";

import { useRef, useState } from "react";
import { BookCover } from "@/components/book-cover";
import type { CoverLook } from "@/lib/domain/cover-look";

type Props = {
  cover: string;
  title: string;
  subtitle: string;
  look: CoverLook;
  accent: string;
  name: string;
  firstPage: string;
  // Opening words of page 2, shown fading into the locked part of the book.
  teaser: string;
  textSize: string;
};

const SPREADS = ["Capa", "Página 1", "Página 2"] as const;

export function PreviewBook({ cover, title, subtitle, look, accent, name, firstPage, teaser, textSize }: Props) {
  const [spread, setSpread] = useState(0);
  const startX = useRef<number | null>(null);
  const go = (to: number) => setSpread(Math.max(0, Math.min(SPREADS.length - 1, to)));
  const open = spread > 0;

  return (
    <div className="mx-auto mt-7 w-[82%]">
      <div
        className="relative aspect-[3/4] touch-pan-y select-none [perspective:1600px]"
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > 40) go(spread + (dx < 0 ? 1 : -1));
          else if (!open) go(1);
        }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-l-md rounded-r-2xl bg-white shadow-[0_24px_50px_-20px_rgb(43_35_32/0.55)]">
          <div className="flex h-full motion-safe:transition-transform motion-safe:duration-500" style={{ transform: `translateX(-${Math.max(0, spread - 1) * 100}%)` }}>
            <section className="flex h-full w-full shrink-0 flex-col p-5" aria-hidden={spread !== 1}>
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
              <img src={cover} alt="" className="mx-auto size-16 shrink-0 rounded-full object-cover object-[50%_65%] ring-4 ring-paper-2" draggable={false} />
              <p className="label mt-3 text-center text-stone">Página 1</p>
              <p className={`mt-2 flex-1 overflow-y-auto text-center leading-relaxed ${textSize}`}>{firstPage}</p>
            </section>
            <section className="relative flex h-full w-full shrink-0 flex-col p-5" aria-hidden={spread !== 2}>
              <p className="label text-center text-stone">Página 2</p>
              <p className={`mt-2 text-center leading-relaxed ${textSize}`}>{teaser}…</p>
              <div className="mt-3 space-y-2.5 blur-[3px]" aria-hidden>
                {[92, 80, 88, 64].map((w) => (
                  <div key={w} className="mx-auto h-3 rounded-full bg-ink/15" style={{ width: `${w}%` }} />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-white via-white to-white/0 px-5 pt-14 pb-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-sun-soft text-2xl" aria-hidden>
                  🔒
                </span>
                <p className="display mt-3 text-[1.3rem] leading-tight">Mais 9 páginas ilustradas com {name}</p>
                <p className="mt-1 text-sm text-ink/70">Liberadas no livro completo.</p>
              </div>
            </section>
          </div>
        </div>

        <div
          className={`absolute inset-0 origin-left [transform-style:preserve-3d] motion-safe:transition-[transform,opacity] motion-safe:duration-700 ${open ? "pointer-events-none opacity-0" : "cursor-pointer motion-safe:animate-peek"}`}
          style={open ? { transform: "rotateY(-110deg)" } : undefined}
          role="button"
          tabIndex={open ? -1 : 0}
          aria-label="Abrir o livro"
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(1)}
        >
          <BookCover src={cover} title={title} subtitle={subtitle} look={look} accent={accent} className="size-full shadow-[0_24px_50px_-20px_rgb(43_35_32/0.55)]" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button type="button" className="min-h-12 min-w-12 rounded-full font-bold text-ink/70 disabled:opacity-0" onClick={() => go(spread - 1)} disabled={!open} aria-label="Voltar">
          ←
        </button>
        {open ? (
          <div className="flex gap-2" role="tablist" aria-label="Páginas da prévia">
            {SPREADS.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={spread === i}
                aria-label={label}
                onClick={() => go(i)}
                className={`h-2.5 rounded-full transition-all ${spread === i ? "w-6 bg-ink" : "w-2.5 bg-ink/25"}`}
              />
            ))}
          </div>
        ) : (
          <button type="button" className="btn-secondary min-h-11 w-auto whitespace-nowrap px-5 text-sm" onClick={() => go(1)}>
            Abrir o livro ✨
          </button>
        )}
        <button
          type="button"
          className="min-h-12 min-w-12 rounded-full font-bold text-ink/70 disabled:opacity-0"
          onClick={() => go(spread + 1)}
          disabled={spread === SPREADS.length - 1}
          aria-label="Avançar"
        >
          →
        </button>
      </div>
    </div>
  );
}
