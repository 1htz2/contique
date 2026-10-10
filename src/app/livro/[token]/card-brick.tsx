"use client";

import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import type { CardCheckoutRequest, PaymentStatus, Product } from "@/lib/contracts";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "";
if (PUBLIC_KEY) initMercadoPago(PUBLIC_KEY, { locale: "pt-BR" });

// Card data never touches our server: the brick tokenizes it and we forward only the token. The
// amount here is display only; the server charges its own price.
export type CardOutcome = PaymentStatus | "already_paid";

export default function CardBrick({
  token,
  product,
  amount,
  onSubmitted,
}: {
  token: string;
  product: Product;
  amount: number;
  onSubmitted: (outcome: CardOutcome) => void;
}) {
  return (
    <CardPayment
      locale="pt-BR"
      initialization={{ amount }}
      customization={{
        paymentMethods: { maxInstallments: 1 },
        visual: {
          style: {
            theme: "default",
            customVariables: {
              baseColor: "#2b2320",
              formBackgroundColor: "#fbf6ec",
              borderRadiusLarge: "20px",
              borderRadiusMedium: "14px",
            },
          },
        },
      }}
      onSubmit={async (formData) => {
        const body: CardCheckoutRequest = { token, product, formData };
        const res = await fetch("/api/checkout/card", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.status === 409) return onSubmitted("already_paid");
        // Throwing lets the brick show its own error and keep the form filled for a retry.
        if (!res.ok) throw new Error("card checkout failed");
        const { status } = (await res.json()) as { status: PaymentStatus };
        onSubmitted(status);
      }}
    />
  );
}
