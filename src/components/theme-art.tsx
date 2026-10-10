import { themeOf } from "@/lib/domain/themes";

// One small emblem per adventure. A theme without an emblem still renders its colors.
const EMBLEMS: Record<string, React.ReactNode> = {
  dinossauros: (
    <path d="M10 44 Q14 24 32 26 Q46 27 52 40 Q55 46 60 46 Q52 52 44 48 L42 54 L37 54 L36 49 L26 49 L25 55 L20 55 L19 48 Q12 48 10 44 Z M22 30 Q18 14 24 8 Q30 4 34 10 Q34 16 28 18 Q27 24 30 28 Z" fill="currentColor" />
  ),
  espaco: (
    <g fill="currentColor">
      <path d="M32 6 Q44 16 42 36 L22 36 Q20 16 32 6 Z" />
      <circle cx="32" cy="22" r="4.5" fill="white" opacity="0.85" />
      <path d="M22 30 L14 42 L22 40 Z M42 30 L50 42 L42 40 Z" />
      <path d="M26 38 Q32 52 38 38 Z" opacity="0.6" />
    </g>
  ),
  "super-heroi": (
    <g fill="currentColor">
      <path d="M32 8 L38 24 L55 24 L41 34 L46 51 L32 41 L18 51 L23 34 L9 24 L26 24 Z" />
    </g>
  ),
  "reino-magico": (
    <g fill="currentColor">
      <path d="M12 52 V26 L18 20 L24 26 V34 H28 V22 L32 12 L36 22 V34 H40 V26 L46 20 L52 26 V52 Z" />
      <path d="M28 52 V44 Q32 38 36 44 V52 Z" fill="white" opacity="0.8" />
    </g>
  ),
  "fundo-do-mar": (
    <g fill="currentColor">
      <path d="M10 32 Q24 16 42 26 L54 18 L52 32 L54 46 L42 38 Q24 48 10 32 Z" />
      <circle cx="20" cy="30" r="2.6" fill="white" />
      <circle cx="46" cy="12" r="3" opacity="0.6" />
      <circle cx="52" cy="6" r="2" opacity="0.5" />
    </g>
  ),
  animais: (
    <g fill="currentColor">
      <path d="M14 14 L22 26 L42 26 L50 14 L50 34 Q48 48 32 52 Q16 48 14 34 Z" />
      <path d="M26 42 Q32 46 38 42 L32 48 Z" fill="white" opacity="0.85" />
      <circle cx="25" cy="34" r="2.6" fill="white" />
      <circle cx="39" cy="34" r="2.6" fill="white" />
    </g>
  ),
};

export function ThemeArt({ themeId, className = "" }: { themeId: string; className?: string }) {
  const { colors } = themeOf(themeId);
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(160deg, ${colors.from}, ${colors.to})`, color: colors.ink }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="size-[58%] drop-shadow-[0_4px_6px_rgb(0_0_0/0.12)]">
        {EMBLEMS[themeId]}
      </svg>
      <span className="animate-twinkle absolute top-[14%] right-[16%] size-1.5 rounded-full bg-white" />
      <span className="animate-twinkle absolute bottom-[18%] left-[14%] size-1 rounded-full bg-white [animation-delay:800ms]" />
    </div>
  );
}
