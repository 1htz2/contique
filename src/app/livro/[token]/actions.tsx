"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copyText } from "@/components/copy";
import { trackEvent } from "@/lib/analytics/client";

// Shares the reading link with family. The link is unlisted (never indexed) and only whoever
// receives it can open the book.
export function ShareButton({ token, title }: { token: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    trackEvent("share_clicked", {}, { token });
    const url = `${window.location.origin}/livro/${token}/ler`;
    const text = `Olha o livro que eu criei: ${title}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    if (await copyText(`${text} ${url}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }
  return (
    <button type="button" onClick={share} className="btn-secondary" aria-live="polite">
      {copied ? "LINK COPIADO!" : "COMPARTILHAR"}
    </button>
  );
}

export function DeleteData({ token }: { token: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/books/${token}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      trackEvent("data_deleted", {}, { token });
      router.refresh();
      return;
    }
    setFailed(true);
    setBusy(false);
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="min-h-12 text-sm font-bold text-stone underline underline-offset-4">
        Excluir o livro e os dados agora
      </button>
    );
  }
  return (
    <div className="card p-5 text-left">
      <p className="font-extrabold">Excluir tudo agora?</p>
      <p className="mt-1 text-sm text-ink/70">Apagamos as ilustrações, o PDF, a história e os dados da criança. Não dá para desfazer. Baixe o PDF antes, se quiser guardar.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={remove} disabled={busy} className="btn-primary min-h-12! flex-1 text-sm!">
          {busy ? "EXCLUINDO…" : "SIM, EXCLUIR"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-secondary min-h-12! flex-1 text-sm!">
          CANCELAR
        </button>
      </div>
      {failed && <p className="mt-3 text-sm font-bold text-[#b2394d]">Não deu certo agora. Tente de novo.</p>}
    </div>
  );
}
