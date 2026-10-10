"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { copyText } from "@/components/copy";
import { CheckIcon, Spinner } from "@/components/ui";
import { trackEvent } from "@/lib/analytics/client";
import type { PaymentStatusResponse, PixCheckoutRequest, PixCheckoutResponse, Product } from "@/lib/contracts";
import { brl, PRODUCT_NAMES } from "@/lib/site";
import type { CardOutcome } from "./card-brick";
import { usePaymentStatus } from "./use-payment-status";

const CardBrick = dynamic(() => import("./card-brick"), {
  ssr: false,
  loading: () => <div className="animate-shimmer h-72 rounded-2xl" />,
});
const CARD_ENABLED = Boolean(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY);

type Checkout =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "pix"; pix: PixCheckoutResponse }
  | { kind: "card" }
  | { kind: "card_processing" }
  | { kind: "approved" }
  | { kind: "expired" }
  | { kind: "rejected" }
  | { kind: "error" };

const POLLING: Checkout["kind"][] = ["pix", "card_processing"];

type PixOutcome = { kind: "pix"; pix: PixCheckoutResponse } | { kind: "already_paid" } | { kind: "error" };

// 503 means another request for this book is mid-creation; one retry picks up its Pix.
async function requestPix(token: string, product: Product, retried = false): Promise<PixOutcome> {
  try {
    const body: PixCheckoutRequest = { token, product };
    const res = await fetch("/api/checkout/pix", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { kind: "pix", pix: (await res.json()) as PixCheckoutResponse };
    if (res.status === 409) return { kind: "already_paid" };
    if (res.status === 503 && !retried) {
      await new Promise((r) => setTimeout(r, 1000));
      return requestPix(token, product, true);
    }
  } catch {}
  return { kind: "error" };
}

export function Checkout({
  token,
  product,
  price,
  cta,
  note,
  sticky = true,
}: {
  token: string;
  product: Product;
  price: number;
  cta: string;
  note: string;
  sticky?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checkout, setCheckout] = useState<Checkout>({ kind: "idle" });
  const startEvent = product === "book" ? "checkout_started" : "coloring_checkout_started";

  async function createPix() {
    setCheckout({ kind: "creating" });
    const outcome = await requestPix(token, product);
    if (outcome.kind === "already_paid") {
      router.refresh();
      return;
    }
    if (outcome.kind === "error") {
      setCheckout({ kind: "error" });
      return;
    }
    const { pix } = outcome;
    setCheckout({ kind: "pix", pix });
    trackEvent("pix_generated", { value: pix.amount, currency: "BRL", product }, { eventId: pix.paymentId, token });
  }

  function start() {
    setOpen(true);
    if (checkout.kind !== "idle") return;
    trackEvent(startEvent, { value: price, currency: "BRL" }, { token });
    createPix();
  }

  usePaymentStatus(token, product, POLLING.includes(checkout.kind), (status: PaymentStatusResponse) => {
    if (status.status === "approved") {
      trackEvent(
        product === "book" ? "payment_approved" : "coloring_upsell_purchased",
        { value: status.value, currency: status.currency },
        { eventId: status.purchaseEventId, token },
      );
      setOpen(true);
      setCheckout({ kind: "approved" });
    } else if (status.status === "expired") {
      setCheckout({ kind: "expired" });
    } else if (status.status === "rejected") {
      setCheckout({ kind: "rejected" });
    }
  });

  useEffect(() => {
    if (checkout.kind !== "approved") return;
    const timer = setTimeout(() => {
      setOpen(false);
      router.refresh();
    }, 1600);
    return () => clearTimeout(timer);
  }, [checkout.kind, router]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const button = (
    <>
      <button type="button" onClick={start} aria-label={`${cta} por ${brl(price)}`} className="btn-primary justify-between! gap-2! pr-2! pl-5! text-[0.875rem]! tracking-[0.02em]!">
        <span className="text-left leading-tight">{cta}</span>
        <span className="shrink-0 rounded-full bg-paper/15 px-[0.8em] py-[0.6em] leading-none whitespace-nowrap">{brl(price)}</span>
      </button>
      <p className="mt-2 text-center text-[0.8125rem] font-semibold text-stone">{note}</p>
    </>
  );

  return (
    <>
      {sticky ? (
        <div className="sticky bottom-0 z-40 mt-6 bg-gradient-to-t from-paper via-paper/95 to-transparent px-5 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-md">{button}</div>
        </div>
      ) : (
        <div className="mt-5">{button}</div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Pagamento">
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            onClick={() => checkout.kind !== "approved" && setOpen(false)}
          />
          <div className="animate-rise relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-paper px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgb(43_35_32/0.35)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            {checkout.kind !== "approved" && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="absolute top-2 right-2 flex size-12 items-center justify-center rounded-full text-xl text-stone"
              >
                ✕
              </button>
            )}
            <SheetBody
              checkout={checkout}
              token={token}
              product={product}
              price={price}
              onRetryPix={createPix}
              onCard={() => setCheckout({ kind: "card" })}
              onCardSubmitted={(outcome) => {
                if (outcome === "already_paid") router.refresh();
                else setCheckout({ kind: outcome === "rejected" ? "rejected" : "card_processing" });
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function SheetBody({
  checkout,
  token,
  product,
  price,
  onRetryPix,
  onCard,
  onCardSubmitted,
}: {
  checkout: Checkout;
  token: string;
  product: Product;
  price: number;
  onRetryPix: () => void;
  onCard: () => void;
  onCardSubmitted: (outcome: CardOutcome) => void;
}) {
  const title = (text: string) => <SheetTitle title={text} product={product} price={price} />;
  switch (checkout.kind) {
    case "idle":
    case "creating":
      return (
        <div className="flex flex-col items-center py-14 text-center">
          <Spinner className="size-12" />
          <p className="display mt-6 text-2xl">Gerando seu Pix…</p>
        </div>
      );
    case "pix":
      return <PixPanel pix={checkout.pix} title={title("Pague com Pix")} onCard={onCard} product={product} />;
    case "card":
      return (
        <div>
          {title("Pagar com cartão")}
          <div className="mt-4">
            <CardBrick token={token} product={product} amount={price} onSubmitted={onCardSubmitted} />
          </div>
          <button type="button" onClick={onRetryPix} className="mt-2 min-h-14 w-full text-sm font-bold text-ink/70 underline underline-offset-4">
            Prefiro pagar com Pix
          </button>
        </div>
      );
    case "card_processing":
      return <Waiting title="Processando seu cartão…" text="Isso leva só alguns segundos." />;
    case "approved":
      return (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-leaf text-white">
            <CheckIcon className="size-10" />
          </div>
          <p className="display mt-6 text-[2.1rem]">Pagamento confirmado</p>
          <p className="mt-2 text-ink/70">{product === "book" ? "Começando a criar o livro…" : "Começando a versão para colorir…"}</p>
        </div>
      );
    case "expired":
      return <Problem title="Esse Pix expirou" text="Sem problema. Gere um novo código e pague em poucos segundos." action="GERAR NOVO PIX" onAction={onRetryPix} />;
    case "rejected":
      return <Problem title="Pagamento não aprovado" text="Nada foi cobrado. Tente de novo com Pix, que é aprovado na hora." action="PAGAR COM PIX" onAction={onRetryPix} />;
    case "error":
      return (
        <Problem
          title="O Pix não saiu dessa vez"
          text="Foi uma instabilidade do nosso lado, não do seu banco. Tente de novo em alguns segundos."
          action="TENTAR DE NOVO"
          onAction={onRetryPix}
          onCard={onCard}
        />
      );
  }
}

function SheetTitle({ title, product, price }: { title: string; product: Product; price: number }) {
  return (
    <div className="flex items-end justify-between pr-10">
      <div>
        <p className="label text-stone">{PRODUCT_NAMES[product]}</p>
        <h2 className="display mt-1.5 text-[1.9rem]">{title}</h2>
      </div>
      <p className="display text-2xl text-sky">{brl(price)}</p>
    </div>
  );
}

function PixPanel({ pix, title, onCard, product }: { pix: PixCheckoutResponse; title: React.ReactNode; onCard: () => void; product: Product }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!(await copyText(pix.qrCode))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div>
      {title}
      <div className="mt-4 flex items-center gap-2 rounded-full bg-leaf-soft px-3.5 py-2 text-sm font-bold text-leaf">
        <span className="animate-pulse-dot size-2 rounded-full bg-leaf" />
        Aguardando pagamento
        <span className="ml-auto text-xs font-semibold text-leaf/80">liberação automática</span>
      </div>

      <div className="mt-5">
        <label htmlFor="pix-code" className="label text-stone">Pix copia e cola</label>
        <input
          id="pix-code"
          readOnly
          value={pix.qrCode}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 h-12 w-full truncate rounded-xl border-2 border-line bg-white px-3.5 font-mono text-xs text-ink/80 outline-none"
        />
        <button type="button" onClick={copy} className="btn-primary mt-3" aria-live="polite">
          {copied ? (
            <>
              <CheckIcon className="size-5" /> Copiado!
            </>
          ) : (
            "COPIAR CÓDIGO PIX"
          )}
        </button>
      </div>

      <ol className="mt-5 grid grid-cols-3 gap-2 text-center text-[0.8125rem] leading-tight font-semibold text-ink/80">
        {["Abra o app do seu banco", "Escolha Pix copia e cola", "Cole o código e confirme"].map((step, i) => (
          <li key={step} className="card px-2 py-3">
            <span className="display block text-xl text-sky">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <details className="group card mt-4">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold text-ink/80">
          Pagar pelo QR Code
          <span className="text-stone transition-transform group-open:rotate-45">+</span>
        </summary>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI from Mercado Pago, nothing to optimize */}
        <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code do Pix" width={200} height={200} className="mx-auto mb-4 size-[200px] rounded-xl bg-white p-2" />
      </details>

      {CARD_ENABLED && <CardLink onClick={onCard} />}
      <p className="mt-2 text-center text-xs leading-relaxed text-stone">
        Pagamento único processado pelo Mercado Pago. Assim que o Pix cair, {product === "book" ? "o livro começa a ser criado" : "a versão para colorir começa a ser criada"} aqui mesmo.
      </p>
    </div>
  );
}

function Waiting({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <span className="animate-pulse-dot size-3 rounded-full bg-leaf" />
      <p className="display mt-6 text-2xl">{title}</p>
      <p className="mt-2 text-ink/70">{text}</p>
    </div>
  );
}

function Problem({ title, text, action, onAction, onCard }: { title: string; text: string; action: string; onAction: () => void; onCard?: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="display text-[1.9rem]">{title}</p>
      <p className="mx-auto mt-3 max-w-xs text-ink/70">{text}</p>
      <button type="button" onClick={onAction} className="btn-primary mt-7">
        {action}
      </button>
      {CARD_ENABLED && onCard && <CardLink onClick={onCard} />}
    </div>
  );
}

function CardLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 min-h-14 w-full text-sm font-bold text-ink/70 underline underline-offset-4">
      Pagar com cartão
    </button>
  );
}
