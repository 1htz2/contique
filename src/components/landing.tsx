import Link from "next/link";
import { BookMockup } from "@/components/book-mockup";
import { ThemeArt } from "@/components/theme-art";
import { TrackOnMount } from "@/components/track-on-mount";
import { BrandBar, CheckIcon, Sparkle } from "@/components/ui";
import { THEMES } from "@/lib/domain/themes";
import { brl } from "@/lib/site";

const STEPS = [
  { title: "Envie uma foto", text: "Clara, de frente, com o rosto visível.", color: "bg-sky-soft text-sky" },
  { title: "Escolha uma aventura", text: "Dinossauros, espaço, fundo do mar e mais.", color: "bg-leaf-soft text-leaf" },
  { title: "Conte um pouco sobre a criança", text: "Nome, idade, do que gosta e como ela é.", color: "bg-sun-soft text-[#a8741a]" },
  { title: "Receba o livro personalizado", text: "Um PDF para guardar, compartilhar ou imprimir.", color: "bg-rose-soft text-rose" },
];

const INCLUDED = ["História personalizada", "10 páginas ilustradas", "Ilustrações exclusivas", "PDF para baixar", "Pronto para imprimir"];

const FAQ = [
  {
    q: "A criança aparece como na foto?",
    a: "Ela vira personagem ilustrado, no estilo de livro infantil. A foto serve só de referência para cabelo, rosto e cores. Nunca é uma cópia fotográfica.",
  },
  {
    q: "O que acontece com a foto?",
    a: "Fica guardada em ambiente privado só enquanto criamos o personagem e é excluída automaticamente logo depois, no máximo em 24 horas. Nunca é pública.",
  },
  {
    q: "Quanto tempo demora?",
    a: "A prévia com a capa fica pronta em cerca de um minuto. Depois do pagamento, o livro completo sai em poucos minutos.",
  },
  {
    q: "Posso imprimir?",
    a: "Sim. O PDF vem em tamanho A4, com margens pensadas para impressora de casa ou gráfica rápida.",
  },
];

export function Landing({ price, seasonal = false }: { price: number; seasonal?: boolean }) {
  const href = seasonal ? "/criar?origem=dia-das-criancas" : "/criar";
  return (
    <main className="flex-1 overflow-x-hidden">
      <TrackOnMount event="landing_view" properties={{ seasonal }} />
      {seasonal && (
        <div className="bg-ink px-4 py-2.5 text-center text-sm font-extrabold tracking-wide text-paper">
          <Sparkle className="mr-1.5 inline size-3.5 text-sun" />
          Especial Dia das Crianças
        </div>
      )}
      <BrandBar />

      <section className="mx-auto max-w-md px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-soft px-3 py-1.5 text-sm font-extrabold text-leaf">
          <span className="animate-pulse-dot size-2 rounded-full bg-leaf" />
          Pronto em poucos minutos
        </span>
        <h1 className="display mt-4 text-[2.55rem] text-balance">
          {seasonal ? (
            <>Ainda procurando um presente especial?</>
          ) : (
            <>
              Neste Dia das Crianças, dê uma história onde <em className="text-sky not-italic">ela é a protagonista.</em>
            </>
          )}
        </h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink/75">
          {seasonal
            ? "Crie uma história personalizada em poucos minutos, com o nome, os gostos e uma aventura feita para uma criança que você ama."
            : "Crie um livro personalizado com nome, características e uma aventura feita especialmente para uma criança que você ama."}
        </p>

        <div className="relative mx-auto mt-8 w-[78%]">
          <span className="animate-twinkle absolute -top-3 -left-6 text-sun"><Sparkle className="size-6" /></span>
          <span className="animate-twinkle absolute top-1/3 -right-7 text-rose [animation-delay:700ms]"><Sparkle className="size-5" /></span>
          <BookMockup className="animate-float" />
        </div>

        <Link href={href} className="btn-primary mt-9">CRIAR MINHA HISTÓRIA</Link>
        <p className="mt-3 text-center text-sm font-semibold text-stone">
          Sem frete. Sem espera. Um presente feito especialmente para ela.
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-md px-5">
        <div className="card bg-sun-soft/60 p-6">
          <h2 className="display text-[1.9rem]">Um presente que não existe igual.</h2>
          <p className="mt-3 leading-relaxed text-ink/75">
            Cada história é criada com o nome, gostos e características da criança. Uma aventura que nenhuma outra criança terá igual.
          </p>
          <p className="mt-3 text-sm font-semibold text-ink/60">
            Para seu filho, sobrinho, afilhado ou neto. Para qualquer criança que você ama.
          </p>
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-md px-5">
        <h2 className="display text-[2rem]">Como funciona</h2>
        <ol className="mt-6 flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card flex items-center gap-4 p-4">
              <span className={`display flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${step.color}`}>{i + 1}</span>
              <span>
                <span className="block text-[1.0625rem] font-extrabold">{step.title}</span>
                <span className="block text-[0.95rem] text-ink/65">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-16 max-w-md px-5">
        <h2 className="display text-[2rem]">Escolha a aventura</h2>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {Object.values(THEMES).map((theme) => (
            <Link key={theme.id} href={`${href}${href.includes("?") ? "&" : "?"}tema=${theme.id}`} className="card overflow-hidden p-0 transition active:scale-[0.98]">
              <ThemeArt themeId={theme.id} className="aspect-[4/3]" />
              <span className="block px-3 pt-2.5 pb-3">
                <span className="block font-extrabold">{theme.name}</span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink/60">{theme.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-md px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink p-7 text-paper">
          <Sparkle className="absolute top-5 right-6 size-6 text-sun" />
          <p className="label text-paper/60">Livro personalizado completo</p>
          <p className="display mt-2 text-[3.2rem] leading-none">{brl(price)}</p>
          <p className="mt-2 font-bold text-paper/80">Pagamento único.</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-2.5 font-semibold">
                <span className="flex size-6 items-center justify-center rounded-full bg-leaf text-white">
                  <CheckIcon className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-paper/70">PDF pronto para guardar, compartilhar ou imprimir. Pix ou cartão.</p>
          <Link href={href} className="mt-6 flex min-h-[3.75rem] w-full items-center justify-center rounded-full bg-sun text-[0.95rem] font-extrabold tracking-[0.06em] text-ink active:scale-[0.98]">
            TRANSFORMAR UMA CRIANÇA EM PERSONAGEM
          </Link>
          <p className="mt-3 text-center text-xs text-paper/60">Você vê a capa antes de pagar.</p>
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-md px-5">
        <h2 className="display text-[2rem]">Perguntas frequentes</h2>
        <div className="mt-5 flex flex-col gap-2.5">
          {FAQ.map((item) => (
            <details key={item.q} className="group card px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 font-extrabold">
                {item.q}
                <span className="text-xl text-stone transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-5 leading-relaxed text-ink/70">{item.a}</p>
            </details>
          ))}
        </div>
        <Link href={href} className="btn-primary mt-8">CRIAR MINHA HISTÓRIA</Link>
      </section>
    </main>
  );
}
