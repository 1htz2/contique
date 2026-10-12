import { Baloo_2, Fredoka, Lilita_One } from "next/font/google";
import type { CoverLook } from "@/lib/domain/cover-look";

// Only the font a given book uses is downloaded: none of them is preloaded.
const fredoka = Fredoka({ subsets: ["latin"], weight: ["700"], preload: false });
const baloo = Baloo_2({ subsets: ["latin"], weight: ["800"], preload: false });
const lilita = Lilita_One({ subsets: ["latin"], weight: ["400"], preload: false });
export const COVER_FONTS: Record<CoverLook["font"], string> = {
  fredoka: fredoka.className,
  baloo: baloo.className,
  lilita: lilita.className,
};

type Props = {
  src: string;
  title: string;
  subtitle?: string;
  look: CoverLook;
  accent: string;
  className?: string;
};

// The same title treatment as the PDF cover (src/lib/server/pdf), so the preview is what they get.
export function BookCover({ src, title, subtitle, look, accent, className = "" }: Props) {
  const font = COVER_FONTS[look.font];
  return (
    <div className={`relative aspect-[3/4] overflow-hidden rounded-l-md rounded-r-2xl bg-paper-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
      <img src={src} alt={`Capa: ${title}`} className="absolute inset-0 size-full object-cover" draggable={false} />
      <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/25 to-transparent" />

      {look.panel === "bubble" && (
        <div className="absolute inset-x-[7%] top-[5%] -rotate-1 rounded-[1.6rem] bg-paper/95 px-3 py-3 text-center shadow-md">
          <p className={`${font} text-[clamp(1.25rem,6vw,1.9rem)] leading-[1.02]`} style={{ color: accent }}>
            {title}
          </p>
          {subtitle && <p className="mt-1 text-[0.7rem] font-bold text-ink/60">{subtitle}</p>}
        </div>
      )}
      {look.panel === "ribbon" && (
        <div className="absolute inset-x-0 top-0 px-4 pt-[8%] pb-3 text-center text-white" style={{ backgroundColor: `${accent}eb` }}>
          <p className={`${font} text-[clamp(1.25rem,6vw,1.9rem)] leading-[1.02]`}>{title}</p>
          {subtitle && <p className="mt-1 text-[0.7rem] font-bold text-white/85">{subtitle}</p>}
        </div>
      )}
      {look.panel === "shade" && (
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-[#0d0d1a]/80 via-[#0d0d1a]/45 to-transparent px-4 pt-[8%] pb-[22%] text-center text-white">
          <p className={`${font} text-[clamp(1.4rem,7vw,2.1rem)] leading-[1.02] [text-shadow:0_2px_10px_rgb(0_0_0/0.45)]`}>{title}</p>
          {subtitle && <p className="mt-1.5 text-[0.7rem] font-bold text-white/85">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
