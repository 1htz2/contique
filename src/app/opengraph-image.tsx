import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DinoIsland } from "@/components/book-mockup";

export const alt = "Contique: crie uma história onde a criança é a protagonista.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A generic sample book. A customer's photo or book never becomes a share image.
export default async function Image() {
  const [title, body] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Fraunces-SemiBold.ttf")),
    readFile(join(process.cwd(), "public/fonts/Nunito-ExtraBold.ttf")),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FBF6EC", color: "#2B2320", padding: 64, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 48 }}>
          <div style={{ fontFamily: "Nunito", fontSize: 28, color: "#4F8A5B", letterSpacing: 2 }}>CONTIQUE</div>
          <div style={{ fontFamily: "Fraunces", fontSize: 68, lineHeight: 1.05, marginTop: 20 }}>
            Crie uma história onde a criança é a protagonista.
          </div>
          <div style={{ fontFamily: "Nunito", fontSize: 28, marginTop: 28, color: "#7D7068" }}>
            Envie uma foto, escolha uma aventura, receba o livro.
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 372, height: 496, borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 60px rgba(43,35,32,0.35)" }}>
          <DinoIsland className="" width={372} height={496} />
          <div style={{ position: "absolute", top: 24, left: 22, right: 22, display: "flex", justifyContent: "center", textAlign: "center", background: "rgba(251,246,236,0.92)", borderRadius: 16, padding: "14px 12px", fontFamily: "Fraunces", fontSize: 32, lineHeight: 1.05 }}>
            Lucas e a Ilha dos Dinossauros
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: title, weight: 600 },
        { name: "Nunito", data: body, weight: 800 },
      ],
    },
  );
}
