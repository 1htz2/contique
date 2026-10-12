# Contique

Livro infantil personalizado em PDF para o Dia das Crianças. O responsável envia uma foto, escolhe uma aventura e recebe um livro de 12 páginas (capa, 10 páginas ilustradas e dedicatória) em que a criança é a protagonista, desenhada como personagem.

Funil: landing → `/criar` (criança, foto, aventura, personalização) → `/livro/[token]` (prévia com capa e página 1) → Pix ou cartão → geração das páginas → PDF → upsell do livro para colorir.

Arquitetura, fornecedores e custo por livro: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Roteiros de anúncio: [`docs/ANUNCIOS.md`](docs/ANUNCIOS.md).

## Como o livro é gerado

`src/lib/server/pipeline.ts` é uma máquina de estados idempotente. `advanceBook(id)` olha o estado salvo e executa o passo que falta:

1. **Prévia** (antes do pagamento): leitura da foto (`describeCharacter`) e história (`generateStory`) em paralelo, depois a capa (`generateIllustration`, com a foto como referência). A foto original é apagada assim que a capa fica pronta.
2. **Páginas** (depois do pagamento): 10 ilustrações com a capa ilustrada como referência, 4 em paralelo. Cada página tenta até 3 vezes; uma página que falha em todas sai com arte decorativa e o livro é entregue.
3. **PDF** (`generateBookPdf`): A4 retrato, capa separada, texto em fonte real, dedicatória.
4. **Livro para colorir** (upsell): line art de cada página e um segundo PDF.

Um lease no banco garante um único worker por livro. Quem chama `advanceBook`: a criação do livro, o webhook do pagamento, o polling da página do livro e o cron diário. Fechar a aba ou recarregar no meio só retoma o trabalho.

Provedores trocáveis em `src/lib/server/ai/`: `TEXT_AI_PROVIDER` (`anthropic` ou `template`) e `IMAGE_AI_PROVIDER` (`gemini`, `openai` ou `mock`). Temas novos são uma entrada em `src/lib/domain/themes.ts`. O visual por idade (fonte e painel do título, estilo das ilustrações) é uma tabela em `src/lib/domain/cover-look.ts`: até 5 anos mais fofo, de 6 a 8 aventura, de 9 a 14 menos infantil.

## Rodar localmente

Requisitos: Node 24, pnpm, Docker.

```bash
pnpm install
pnpm exec supabase start   # Postgres + Storage locais nas portas 545xx, aplica a migration
pnpm db:env                # gera .env.local com o Supabase local, texto "template" e imagens "mock"
pnpm dev
```

Assim o funil inteiro roda sem nenhuma chave: história modelo, ilustrações desenhadas localmente e PDF de verdade. Para IA real, preencha no `.env.local` `TEXT_AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` e `IMAGE_AI_PROVIDER=gemini` + `GEMINI_API_KEY`. Sem credenciais do Mercado Pago o checkout responde com erro amigável.

Verificações:

```bash
pnpm lint && pnpm typecheck && pnpm test   # os testes de pagamento usam o Supabase local
pnpm verify:pipeline                       # prévia, pagamento, falha de página, workers concorrentes, colorir
node scripts/e2e-funnel.mjs http://localhost:3000   # funil completo no Chrome em 390x844, com screenshots
pnpm build
```

## Testar o Mercado Pago no sandbox

1. No painel do Mercado Pago, crie uma aplicação "Contique" (cada aplicação tem um único webhook; Paletique e Perfil Algorítmico já usam os delas). Produto: pagamentos online, Checkout Transparente.
2. Copie as credenciais de teste para o `.env.local`: `MERCADOPAGO_ACCESS_TOKEN`, `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`.
3. O webhook precisa de URL pública. Rode `pnpm dev` e exponha com um túnel (`cloudflared tunnel --url http://localhost:3000` ou `ngrok http 3000`). Em Webhooks, cadastre `https://<túnel>/api/webhooks/mercadopago` com o evento Pagamentos e copie a assinatura secreta para `MERCADOPAGO_WEBHOOK_SECRET`.
4. Gere um Pix na prévia e confira o QR e o copia e cola. Um Pix de teste fica pendente: o sandbox não tem como pagá-lo. Para ver uma aprovação de ponta a ponta, use o cartão de teste (passo 5) ou, com credenciais de produção, uma compra real de baixo valor (foi assim que o Paletique validou a primeira venda). Em qualquer caso a página consulta o Mercado Pago a cada poucos segundos e libera sozinha quando o status muda.
5. Cartão: use os cartões de teste do Mercado Pago (titular `APRO` aprova, `OTHE` recusa). No Paletique, credenciais de teste de uma conta real deram `forced_issuer` no cartão; se acontecer, teste com um usuário vendedor de teste ou com uma compra real de valor baixo.

Nunca se libera o livro pelo navegador: só `syncPayment()`, com o pagamento buscado no Mercado Pago, muda o status para `paid`.

## Colocar no ar

1. **Supabase.** Crie o projeto "contique" na região São Paulo. `pnpm exec supabase login`, `pnpm exec supabase link --project-ref <ref>` e `pnpm exec supabase db push` (ou cole `supabase/migrations/001_init.sql` no SQL Editor). Isso cria tabelas com RLS, os três buckets privados e as funções de rate limit, lease e métricas. Use a chave `service_role` (JWT legado) em `SUPABASE_SERVICE_ROLE_KEY`; no Paletique a chave nova `sb_secret_` mascarada pela CLI quebrou os uploads.
2. **Mercado Pago.** Aplicação "Contique" com webhook em `https://<domínio>/api/webhooks/mercadopago`, evento Pagamentos.
3. **IA.** Chave da Anthropic (console.anthropic.com) e da Google AI Studio (aistudio.google.com, com faturamento ativo: o plano gratuito não cobre os modelos de imagem).
4. **Vercel.** Importe o repositório e cadastre as variáveis do `.env.example`. `vercel.json` fixa a região `gru1` e agenda `/api/cron/maintenance` às 04:00. As rotas de geração usam `maxDuration = 300`, que o plano Hobby aceita.
5. **Domínio e pixels.** `NEXT_PUBLIC_SITE_URL` com o endereço no ar, `NEXT_PUBLIC_CONTACT_EMAIL` com um e-mail que você leia, e os IDs do Meta Pixel + token da Conversions API.

## Privacidade

- Consentimento obrigatório antes de escolher a foto.
- Três buckets privados sem policies; o navegador só recebe signed URLs de minutos.
- A foto é reencodada no servidor (some o EXIF com GPS) e apagada assim que a capa fica pronta. O cron apaga qualquer foto com mais de 24 horas.
- As páginas usam a capa ilustrada como referência, não a foto.
- O schema da leitura da foto só tem atributos visuais: não existe campo para raça, etnia, saúde ou religião.
- "Excluir o livro e os dados agora" apaga ilustrações, PDFs, história e dados da criança. Pagamentos ficam, por obrigação fiscal.
- O admin não mostra nomes, fotos nem ilustrações.
