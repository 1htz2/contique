import { Landing } from "@/components/landing";
import { env } from "@/lib/server/env";

export default function Home() {
  return <Landing price={env().BOOK_PRICE_BRL} />;
}
