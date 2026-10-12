import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/book-cover";
import { BrandBar } from "@/components/ui";
import { coverLookOf } from "@/lib/domain/cover-look";
import { themeOf } from "@/lib/domain/themes";
import { findBookByToken, listAssets, storyOf } from "@/lib/server/books";
import { BUCKETS, signedUrl, signedUrls } from "@/lib/server/storage";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Ler o livro",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ReaderPage({ params }: PageProps<"/livro/[token]/ler">) {
  const { token } = await params;
  const book = await findBookByToken(token);
  const story = book && storyOf(book);
  if (!book || !story || book.status !== "completed") notFound();

  const pages = (await listAssets(book.id, "page")).filter((a) => a.status === "ready" && a.storage_path);
  const urls = await signedUrls(BUCKETS.assets, pages.map((p) => p.storage_path!), 3600);
  const imageOf = (n: number) => {
    const path = pages.find((p) => p.page_number === n)?.storage_path;
    return path ? urls.get(path) : undefined;
  };
  const cover = book.cover_path ? await signedUrl(BUCKETS.assets, book.cover_path, 3600) : null;

  return (
    <main className="flex-1">
      <BrandBar>
        <Link href={`/livro/${token}`} className="min-h-12 px-2 py-3 font-bold text-ink/70">← Voltar</Link>
      </BrandBar>
      <article className="mx-auto flex max-w-md flex-col gap-8 px-5 pt-4">
        <h1 className="sr-only">{story.title}</h1>
        {cover && (
          <BookCover
            src={cover}
            title={story.title}
            subtitle={story.subtitle}
            look={coverLookOf(book.child_age)}
            accent={themeOf(book.theme).colors.ink}
            className="shadow-lg"
          />
        )}
        {story.pages.map((page) => {
          const src = imageOf(page.page);
          return (
            <section key={page.page} className="card overflow-hidden p-0">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL
                <img src={src} alt={`Ilustração da página ${page.page}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              ) : (
                <div className="aspect-[4/3] w-full bg-gradient-to-br from-sun-soft to-sky-soft" />
              )}
              <p className="px-5 pt-5 pb-2 text-[1.2rem] leading-relaxed">{page.text}</p>
              <p className="pb-4 text-center text-sm font-bold text-stone">{page.page}</p>
            </section>
          );
        })}
        <section className="py-10 text-center">
          <p className="display text-[1.8rem] text-balance">Esta história foi criada especialmente para {book.child_first_name}.</p>
          <p className="mt-3 text-ink/70">{story.dedication}</p>
          <p className="mt-6 font-extrabold text-rose">Feliz Dia das Crianças ❤️</p>
          <p className="mt-8 text-xs text-stone">Feito com carinho por {SITE_NAME}</p>
        </section>
      </article>
    </main>
  );
}
