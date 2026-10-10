"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, Sparkle, Spinner } from "@/components/ui";
import type { BookStatusResponse } from "@/lib/contracts";
import { GENERATION_STEPS } from "@/lib/domain/book";

const POLL_MS = 2500;

// Polls the book while something is being generated. The status call also resumes a stalled
// pipeline on the server, so keeping this page open is enough to finish a book. When the stored
// state changes, the server page re-renders with fresh signed URLs.
function useBookStatus(token: string, initial: BookStatusResponse) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const last = useRef(`${initial.view}|${initial.status}|${initial.coloring}`);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (document.visibilityState !== "hidden") {
        try {
          const res = await fetch(`/api/books/${token}`, { cache: "no-store" });
          if (res.ok && !stopped) {
            const next = (await res.json()) as BookStatusResponse;
            setStatus(next);
            const key = `${next.view}|${next.status}|${next.coloring}`;
            if (key !== last.current) {
              last.current = key;
              router.refresh();
            }
          }
        } catch {}
      }
      if (!stopped) timer = setTimeout(check, POLL_MS);
    }
    timer = setTimeout(check, 1200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token, router]);

  return status;
}

const PREVIEW_STAGES = ["Olhando a foto com carinho…", "Escrevendo a história…", "Desenhando a personagem…", "Pintando a capa…"];
const STAGE_MS = 9000;

export function PreviewProgress({ token, name, initial }: { token: string; name: string; initial: BookStatusResponse }) {
  useBookStatus(token, initial);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, PREVIEW_STAGES.length - 1)), STAGE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-6 pt-10 text-center" aria-live="polite">
      <div className="relative flex size-36 items-center justify-center rounded-[2rem] bg-sun-soft">
        <Sparkle className="animate-twinkle absolute top-4 left-5 size-5 text-sun" />
        <Sparkle className="animate-twinkle absolute right-5 bottom-5 size-4 text-rose [animation-delay:600ms]" />
        <Spinner className="size-14" />
      </div>
      <h1 className="display mt-8 text-[2.1rem] text-balance">Criando a capa do livro de {name}</h1>
      <p className="mt-3 min-h-7 text-lg font-bold text-ink/70">{PREVIEW_STAGES[stage]}</p>
      <p className="mt-6 text-sm text-stone">Leva cerca de um minuto. Pode deixar esta tela aberta.</p>
    </section>
  );
}

export function GenerationProgress({ token, name, initial }: { token: string; name: string; initial: BookStatusResponse }) {
  const status = useBookStatus(token, initial);
  // The story was written before payment, so the first step is already done.
  const active = ({ paid: 1, generating_images: 1, building_pdf: 2, completed: 4 } as Record<string, number>)[status.status] ?? 1;
  const percent = Math.round(Math.max(0.04, Math.min(1, status.progress)) * 100);

  return (
    <section className="mx-auto max-w-md px-6 pt-8" aria-live="polite">
      <p className="label text-leaf">Pagamento confirmado</p>
      <h1 className="display mt-3 text-[2.2rem] text-balance">Estamos criando a aventura de {name}…</h1>
      <div className="mt-7 h-3 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-sky transition-[width] duration-700" style={{ width: `${percent}%` }} />
      </div>
      <ol className="mt-7 flex flex-col gap-3">
        {GENERATION_STEPS.map((step, i) => {
          const done = i < active;
          const doing = i === active;
          return (
            <li key={step.status} className={`card flex items-center gap-3 p-4 font-bold ${done || doing ? "" : "opacity-45"}`}>
              <span className={`flex size-8 items-center justify-center rounded-full ${done ? "bg-leaf text-white" : "bg-paper-2"}`}>
                {done ? <CheckIcon className="size-4" /> : doing ? <Spinner className="size-5" /> : i + 1}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-sm text-stone">Leva alguns minutos. Se fechar esta página, é só abrir o mesmo link depois: o livro continua sendo criado.</p>
    </section>
  );
}

export function ColoringProgress({ token, initial }: { token: string; initial: BookStatusResponse }) {
  useBookStatus(token, initial);
  return (
    <div className="card mt-5 flex items-center gap-4 p-5" aria-live="polite">
      <Spinner className="size-8 shrink-0" />
      <div>
        <p className="font-extrabold">Criando a versão para colorir…</p>
        <p className="text-sm text-ink/65">Fica pronta em poucos minutos, aqui mesmo.</p>
      </div>
    </div>
  );
}
