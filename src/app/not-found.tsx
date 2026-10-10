import Link from "next/link";
import { BrandBar } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex-1">
      <BrandBar />
      <section className="mx-auto max-w-md px-6 pt-14 text-center">
        <h1 className="display text-[2.2rem]">Esta página não existe.</h1>
        <p className="mt-3 text-ink/70">Confira o link. Se for de um livro, ele pode ter expirado ou sido excluído.</p>
        <Link href="/" className="btn-primary mt-8">IR PARA O INÍCIO</Link>
      </section>
    </main>
  );
}
