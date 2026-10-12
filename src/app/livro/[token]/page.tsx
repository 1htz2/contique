import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/book-cover";
import { TrackOnMount } from "@/components/track-on-mount";
import { BrandBar, CheckIcon, Sparkle } from "@/components/ui";
import type { BookStatusResponse } from "@/lib/contracts";
import { PHOTO_PROBLEMS, VIEW_OF, type PhotoProblem, type Story } from "@/lib/domain/book";
import { ageBand } from "@/lib/domain/book-input";
import { coverLookOf } from "@/lib/domain/cover-look";
import { themeOf } from "@/lib/domain/themes";
import { findBookByToken, storyOf, type BookRow } from "@/lib/server/books";
import { env } from "@/lib/server/env";
import { BUCKETS, signedUrl } from "@/lib/server/storage";
import { CONTACT_EMAIL } from "@/lib/site";
import { DeleteData, ShareButton } from "./actions";
import { Checkout } from "./checkout";
import { PreviewBook } from "./preview-book";
import { ColoringProgress, GenerationProgress, PreviewProgress } from "./progress";

export const metadata: Metadata = {
  title: "Seu livro",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const INCLUDED = ["História personalizada", "10 páginas", "Ilustrações exclusivas", "PDF para baixar", "Pronto para imprimir"];

export default async function BookPage({ params }: PageProps<"/livro/[token]">) {
  const { token } = await params;
  const book = await findBookByToken(token);
  if (!book) notFound();

  const view = VIEW_OF[book.status];
  const story = storyOf(book);
  const name = book.child_first_name;
  const cover = book.cover_path ? await signedUrl(BUCKETS.assets, book.cover_path, 3600) : null;
  const initial: BookStatusResponse = { view, status: book.status, coloring: book.coloring_status, progress: 0 };
  const { BOOK_PRICE_BRL, COLORING_BOOK_PRICE_BRL, BOOK_RETENTION_DAYS } = env();

  return (
    <main className="flex-1">
      <BrandBar />
      {view === "preview_generating" && <PreviewProgress token={token} name={name} initial={initial} />}
      {view === "photo_rejected" && <PhotoRejected problem={book.status_detail} name={name} />}
      {view === "preview_failed" && <Trouble title="A capa não saiu dessa vez" text="Tivemos uma instabilidade ao criar a prévia. Nada foi cobrado. Tente de novo em alguns minutos." retry />}
      {view === "preview_ready" && story && cover && <Preview token={token} book={book} story={story} cover={cover} price={BOOK_PRICE_BRL} />}
      {view === "generating" && <GenerationProgress token={token} name={name} initial={initial} />}
      {view === "completed" && story && (
        <Completed
          token={token}
          book={book}
          story={story}
          cover={cover}
          coloringPrice={COLORING_BOOK_PRICE_BRL}
          retentionDays={BOOK_RETENTION_DAYS}
          initial={initial}
        />
      )}
      {view === "failed" && (
        <Trouble
          title="Ainda estamos terminando o seu livro"
          text={`Algumas ilustrações deram trabalho e o livro parou no meio. Seu pagamento está garantido: escreva para ${CONTACT_EMAIL} com o código ${book.id.slice(0, 8)} e resolvemos.`}
        />
      )}
      {view === "deleted" && <Trouble title="Este livro foi excluído" text="Os dados e as ilustrações foram apagados." retry />}
    </main>
  );
}

// Body text size in the preview follows the PDF: bigger letters for the youngest readers.
const PREVIEW_TEXT = { small: "text-[1.2rem]", middle: "text-[1.05rem]", big: "text-[0.98rem]" } as const;

function Preview({ token, book, story, cover, price }: { token: string; book: BookRow; story: Story; cover: string; price: number }) {
  const name = book.child_first_name;
  const teaser = story.pages[1].text.split(/\s+/).slice(0, 12).join(" ");
  return (
    <>
      <TrackOnMount event="paywall_viewed" token={token} properties={{ value: price, currency: "BRL" }} />
      <section className="animate-fade mx-auto max-w-md px-5 pt-2">
        <p className="label text-leaf">A capa está pronta</p>
        <h1 className="display mt-2 text-[2.2rem] text-balance">A aventura de {name} está pronta para continuar.</h1>
        <PreviewBook
          cover={cover}
          title={story.title}
          subtitle={story.subtitle}
          look={coverLookOf(book.child_age)}
          accent={themeOf(book.theme).colors.ink}
          name={name}
          firstPage={story.pages[0].text}
          teaser={teaser}
          textSize={PREVIEW_TEXT[ageBand(book.child_age)]}
        />

        <div className="mt-8 rounded-[2rem] bg-sun-soft/70 p-6">
          <h2 className="display text-[1.7rem]">O livro de {name} está quase pronto.</h2>
          <p className="mt-1 text-ink/70">Seu livro personalizado está pronto para ser criado.</p>
          <ul className="mt-5 grid grid-cols-1 gap-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-2.5 font-bold">
                <span className="flex size-6 items-center justify-center rounded-full bg-leaf text-white">
                  <CheckIcon className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <Checkout token={token} product="book" price={price} cta="CRIAR O LIVRO COMPLETO" note="Pagamento único • PDF liberado após a criação" />
    </>
  );
}

function Completed({
  token,
  book,
  story,
  cover,
  coloringPrice,
  retentionDays,
  initial,
}: {
  token: string;
  book: BookRow;
  story: Story;
  cover: string | null;
  coloringPrice: number;
  retentionDays: number;
  initial: BookStatusResponse;
}) {
  const download = `/api/books/${token}/download`;
  return (
    <section className="animate-fade mx-auto max-w-md px-5 pt-2">
      <TrackOnMount event="book_viewed" token={token} />
      <p className="label flex items-center gap-1.5 text-leaf"><Sparkle className="size-3.5" /> Seu livro está pronto!</p>
      <h1 className="display mt-2 text-[2.2rem] text-balance">{story.title}</h1>
      {cover && (
        <BookCover
          src={cover}
          title={story.title}
          subtitle={story.subtitle}
          look={coverLookOf(book.child_age)}
          accent={themeOf(book.theme).colors.ink}
          className="mx-auto mt-6 w-[72%] shadow-[0_24px_50px_-20px_rgb(43_35_32/0.55)]"
        />
      )}

      <div className="mt-8 flex flex-col gap-3">
        <a href={download} className="btn-primary">BAIXAR PDF</a>
        <Link href={`/livro/${token}/ler`} className="btn-secondary">VER LIVRO</Link>
        <ShareButton token={token} title={story.title} />
      </div>
      <p className="mt-3 text-center text-sm text-stone">Guarde este link: o livro fica disponível para download por {retentionDays} dias.</p>

      <div className="mt-12 rounded-[2rem] bg-sky-soft/70 p-6">
        {book.coloring_status === "none" && (
          <>
            <TrackOnMount event="coloring_upsell_viewed" token={token} />
            <h2 className="display text-[1.75rem] text-balance">Quer transformar a aventura em um livro para colorir?</h2>
            <p className="mt-2 text-ink/70">As mesmas cenas e personagens em traços limpos, fundo branco e fácil de imprimir.</p>
            {cover && (
              <div className="mt-5 flex items-center justify-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                <img src={cover} alt="Ilustração colorida" className="aspect-[3/4] w-[40%] rounded-xl object-cover shadow-md" />
                <span className="display text-2xl text-sky">→</span>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, previewed as line art */}
                <img
                  src={cover}
                  alt="Prévia da versão para colorir"
                  className="aspect-[3/4] w-[40%] rounded-xl bg-white object-cover shadow-md [filter:grayscale(1)_contrast(3.2)_brightness(1.35)]"
                />
              </div>
            )}
            <Checkout token={token} product="coloring" price={coloringPrice} cta="CRIAR VERSÃO PARA COLORIR" note="+ pagamento único • 10 páginas para colorir" sticky={false} />
          </>
        )}
        {(book.coloring_status === "paid" || book.coloring_status === "generating") && <ColoringProgress token={token} initial={initial} />}
        {book.coloring_status === "completed" && (
          <>
            <h2 className="display text-[1.75rem]">O livro para colorir está pronto!</h2>
            <a href={`${download}?file=coloring`} className="btn-primary mt-5">BAIXAR LIVRO PARA COLORIR</a>
          </>
        )}
        {book.coloring_status === "failed" && (
          <p className="font-semibold">A versão para colorir deu trabalho. Escreva para {CONTACT_EMAIL} com o código {book.id.slice(0, 8)} e resolvemos.</p>
        )}
      </div>

      <div className="mt-10 text-center">
        <DeleteData token={token} />
      </div>
    </section>
  );
}

function PhotoRejected({ problem, name }: { problem: string | null; name: string }) {
  const message = PHOTO_PROBLEMS[problem as PhotoProblem] ?? PHOTO_PROBLEMS.face_not_visible;
  return (
    <section className="animate-fade mx-auto max-w-md px-6 pt-10 text-center">
      <h1 className="display text-[2.1rem] text-balance">Precisamos de outra foto de {name}</h1>
      <p className="mt-4 text-lg text-ink/75">{message}</p>
      <p className="mt-3 text-sm text-stone">A foto enviada já foi excluída. Nada foi cobrado.</p>
      <Link href="/criar?etapa=foto" className="btn-primary mt-8">ESCOLHER OUTRA FOTO</Link>
    </section>
  );
}

function Trouble({ title, text, retry = false }: { title: string; text: string; retry?: boolean }) {
  return (
    <section className="animate-fade mx-auto max-w-md px-6 pt-10 text-center">
      <h1 className="display text-[2.1rem] text-balance">{title}</h1>
      <p className="mt-4 text-ink/75">{text}</p>
      {retry && <Link href="/criar" className="btn-primary mt-8">CRIAR UMA NOVA HISTÓRIA</Link>}
    </section>
  );
}
