import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <path d="M4 7 Q10 5 16 8 V27 Q10 24 4 26 Z" fill="#5B7FD6" />
        <path d="M28 7 Q22 5 16 8 V27 Q22 24 28 26 Z" fill="#F2B544" />
        <path d="M16 8 V27" stroke="#2B2320" strokeWidth="1.6" />
        <path d="M22 3 l1.2 2.8 l2.8 1.2 l-2.8 1.2 l-1.2 2.8 l-1.2 -2.8 l-2.8 -1.2 l2.8 -1.2 Z" fill="#E9798F" />
      </svg>
      <span className="display text-[1.45rem] tracking-tight">{SITE_NAME}</span>
    </span>
  );
}

export function BrandBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-4 pb-2">
      <Link href="/" aria-label={`${SITE_NAME}, página inicial`} className="py-2">
        <Logo />
      </Link>
      {children}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-md px-6 pt-14 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
      <nav className="flex justify-center gap-6 text-sm font-bold text-ink/70">
        <Link href="/termos" className="py-2">Termos</Link>
        <Link href="/privacidade" className="py-2">Privacidade</Link>
        <Link href="/contato" className="py-2">Contato</Link>
      </nav>
      <p className="mt-3 text-xs leading-relaxed text-stone">
        Fotos privadas, nunca públicas, excluídas automaticamente. Dúvidas: {CONTACT_EMAIL}
      </p>
      <p className="label mt-4 text-stone/70">© {new Date().getFullYear()} {SITE_NAME}</p>
    </footer>
  );
}

export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Sparkle({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
    </svg>
  );
}

export function Spinner({ className = "size-10" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-[3px] border-line border-t-ink ${className}`} aria-hidden />;
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <BrandBar />
      <article className="mx-auto max-w-md px-6 pt-6">
        <p className="label text-stone">Atualizado em {updated}</p>
        <h1 className="display mt-3 text-[2.5rem]">{title}</h1>
        <div className="mt-8 flex flex-col gap-8 text-[1rem] leading-relaxed text-ink/80 [&_a]:font-bold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_h2]:display [&_h2]:mb-2 [&_h2]:text-[1.4rem] [&_h2]:text-ink [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul+p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </main>
  );
}
