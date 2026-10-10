// The landing's sample book: an original illustration, never a customer's child.
export function BookMockup({ className = "", title = "Lucas e a Ilha dos Dinossauros" }: { className?: string; title?: string }) {
  return (
    <div className={`relative aspect-[3/4] ${className}`}>
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-r-2xl rounded-l-md bg-ink/15 blur-md" />
      <div className="relative h-full overflow-hidden rounded-r-2xl rounded-l-md shadow-[0_24px_50px_-20px_rgb(43_35_32/0.55)]">
        <DinoIsland />
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/25 via-black/5 to-transparent" />
        <div className="absolute inset-x-[7%] top-[6%] rounded-2xl bg-paper/90 px-3 py-3 text-center shadow-sm">
          <p className="display text-[clamp(1.05rem,5vw,1.6rem)] leading-[1.05] text-ink">{title}</p>
        </div>
      </div>
    </div>
  );
}

export function DinoIsland({ className = "h-full w-full", width, height }: { className?: string; width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 300 400" className={className} width={width} height={height} role="img" aria-label="Ilustração: uma criança e um dinossauro amigo numa ilha">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBE2B0" />
          <stop offset="0.55" stopColor="#F6D9B8" />
          <stop offset="1" stopColor="#CFE6CF" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9FD3D6" />
          <stop offset="1" stopColor="#6FB5C2" />
        </linearGradient>
      </defs>
      <rect width="300" height="400" fill="url(#sky)" />
      <circle cx="232" cy="150" r="34" fill="#FFF4D2" />
      <path d="M150 238 L188 168 Q196 158 204 168 L246 238 Z" fill="#E8A77A" opacity="0.55" />
      <path d="M186 172 Q196 150 206 172" fill="#F2B544" opacity="0.7" />
      <rect y="232" width="300" height="60" fill="url(#sea)" />
      <path d="M-10 270 Q60 236 150 252 T310 258 V400 H-10 Z" fill="#8DBF8B" />
      <path d="M-10 300 Q80 270 170 292 T310 288 V400 H-10 Z" fill="#5E9C69" />
      {/* ferns */}
      <g fill="#3F7A4E">
        <path d="M24 300 Q10 250 40 222 Q30 262 40 300 Z" />
        <path d="M40 300 Q46 248 82 236 Q58 268 54 300 Z" />
        <path d="M268 300 Q290 252 262 222 Q270 262 256 300 Z" />
      </g>
      {/* dinosaur */}
      <g>
        <path d="M150 318 Q172 262 214 270 Q252 276 270 310 Q282 330 296 332 Q272 346 246 336 L240 352 L226 352 L224 338 L196 338 L194 354 L180 354 L178 336 Q158 334 150 318 Z" fill="#6BAA75" />
        <path d="M176 290 Q166 238 174 206 Q178 186 196 186 Q216 186 216 206 Q214 222 200 226 Q194 254 204 274 Z" fill="#6BAA75" />
        <ellipse cx="200" cy="200" rx="22" ry="17" fill="#76B580" />
        <circle cx="206" cy="196" r="4.2" fill="#2B2320" />
        <circle cx="207.4" cy="194.6" r="1.4" fill="#fff" />
        <path d="M192 208 Q200 214 210 208" stroke="#2B2320" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="216" cy="206" r="4" fill="#F4A3A8" opacity="0.7" />
        <g fill="#9FD0A2">
          <circle cx="212" cy="290" r="7" />
          <circle cx="234" cy="300" r="5" />
          <circle cx="196" cy="304" r="5.5" />
        </g>
        <g fill="#F2B544">
          <path d="M184 196 l-6 -10 l10 4 Z" />
          <path d="M176 222 l-9 -6 l10 -1 Z" />
          <path d="M174 248 l-9 -4 l9 -4 Z" />
        </g>
      </g>
      {/* child */}
      <g>
        <rect x="88" y="318" width="11" height="30" rx="5" fill="#E8B48E" />
        <rect x="104" y="318" width="11" height="30" rx="5" fill="#E8B48E" />
        <path d="M84 350 h18 q4 0 4 5 v3 h-24 v-3 q0 -5 2 -5 Z" fill="#E2533F" />
        <path d="M101 350 h18 q4 0 4 5 v3 h-24 v-3 q0 -5 2 -5 Z" fill="#E2533F" />
        <path d="M84 296 h36 v26 q0 6 -6 6 h-24 q-6 0 -6 -6 Z" fill="#4C6FD1" />
        <rect x="80" y="258" width="44" height="46" rx="16" fill="#F2B544" />
        <rect x="70" y="266" width="14" height="30" rx="7" fill="#F0915A" />
        <path d="M122 270 Q140 250 146 232" stroke="#E8B48E" strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M118 266 Q128 262 132 256" stroke="#F2B544" strokeWidth="12" strokeLinecap="round" fill="none" />
        <circle cx="147" cy="229" r="7" fill="#E8B48E" />
        <circle cx="102" cy="236" r="25" fill="#E8B48E" />
        <g fill="#3A2A22">
          <circle cx="84" cy="224" r="9" />
          <circle cx="94" cy="214" r="10" />
          <circle cx="108" cy="212" r="10" />
          <circle cx="120" cy="220" r="9" />
          <circle cx="124" cy="232" r="6" />
          <circle cx="80" cy="234" r="6" />
        </g>
        <circle cx="94" cy="240" r="3" fill="#2B2320" />
        <circle cx="110" cy="240" r="3" fill="#2B2320" />
        <circle cx="95" cy="239" r="1" fill="#fff" />
        <circle cx="111" cy="239" r="1" fill="#fff" />
        <path d="M95 249 Q102 255 109 249" stroke="#2B2320" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="88" cy="248" r="4" fill="#F4A3A8" opacity="0.75" />
        <circle cx="116" cy="248" r="4" fill="#F4A3A8" opacity="0.75" />
      </g>
      {/* sparkles */}
      <g fill="#FFFFFF">
        <path d="M60 140 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" opacity="0.9" />
        <path d="M262 92 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" opacity="0.8" />
        <path d="M120 176 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" opacity="0.7" />
      </g>
    </svg>
  );
}
