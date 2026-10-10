# Contique: arquitetura do MVP

Livro infantil personalizado em PDF. O responsável envia uma foto, escolhe uma aventura e recebe um livro de 12 páginas em que a criança é a protagonista ilustrada.

## 1. Ponto de partida

O repositório `~/www/paletique` já tem em produção o mesmo funil (foto → prévia → paywall → Pix → resultado) com Next.js 16, Supabase, Mercado Pago (Pix + Card Brick), webhook assinado, admin com Basic Auth, Meta Pixel + CAPI, UTMs e purga de fotos. O Contique é um projeto novo (`~/www/contique`) que reaproveita esses módulos, já validados com venda real, e troca o domínio (análise de cor → livro).

## 2. Arquitetura

```
Navegador                      Servidor (Vercel, gru1)                    Fornecedores
─────────                      ───────────────────────                    ────────────
/criar (assistente)  ──POST /api/books──▶ cria livro, sobe foto ─────────▶ Supabase Storage (privado)
                                         advanceBook() em after()
                                           1. personagem (visão)  ───────▶ Claude (TEXT_AI_PROVIDER)
                                           2. história (JSON+Zod) ───────▶ Claude
                                           3. capa (foto como ref.) ────▶ Gemini (IMAGE_AI_PROVIDER)
                                           4. apaga a foto original
/livro/[token] ◀─polling GET /api/books/[token] (e "chuta" o pipeline se parado)
paywall ──POST /api/checkout/pix──────▶ Mercado Pago ─webhook assinado─▶ syncPayment()
                                         pagamento aprovado → status paid → advanceBook()
                                           5. 10 páginas (capa ilustrada como ref.) ─▶ Gemini
                                           6. PDF (pdf-lib, A4)  ─▶ Storage generated-books
download ──GET /api/books/[token]/download──▶ signed URL de 10 min
upsell ──Pix R$ 6,90──▶ advanceBook() 7. line art das páginas ─▶ 8. PDF para colorir
```

### O pipeline é uma máquina de estados idempotente

`advanceBook(bookId)` lê o estado do livro e dos assets e executa o próximo passo que falta. Ele pode rodar quantas vezes for preciso e de qualquer ponto:

- Um lease (`books.lease_until`) garante um único worker por livro.
- Cada página é um registro em `assets` com `status` e `attempts`. Falhou uma página, só ela é refeita (até 3 tentativas). Depois disso o livro sai com uma ilustração decorativa no lugar, e nunca se perde o livro inteiro.
- Quem dispara: a criação do livro, o webhook de pagamento, o polling da tela (se o livro estiver parado sem lease) e o cron diário. Recarregar a página durante a geração só retoma o trabalho.

Estados do livro:

```
preview_pending → preview_generating → preview_ready ──pago──▶ paid → generating_images → building_pdf → completed
                         │                                                       │
                         ├─▶ photo_rejected (sem rosto, várias pessoas, imprópria)│
                         └─▶ preview_failed                                       └─▶ failed (com retomada)
```

O livro para colorir tem o próprio estado (`coloring_status`: none → paid → generating → completed | failed).

### A foto da criança sai do sistema o quanto antes

A foto original é usada duas vezes: para extrair a "character bible" (só atributos visuais) e como referência da capa. As 10 páginas usam a **capa ilustrada** como referência de personagem, não a foto. Por isso a foto é apagada assim que a prévia fica pronta, segundos depois do envio. Se algo falhar no meio, o cron apaga qualquer foto com mais de 24 horas.

## 3. Fornecedores

| Função | Padrão | Alternativa | Variável |
|---|---|---|---|
| História e personagem | Anthropic Claude | `template` (texto local, sem IA) | `TEXT_AI_PROVIDER` |
| Ilustrações | Google Gemini (`gemini-nano-banana-2.1`) | OpenAI (`gpt-image-*`) ou `mock` | `IMAGE_AI_PROVIDER` |
| Banco e arquivos | Supabase (Postgres + Storage privado) | | |
| Pagamento | Mercado Pago (Pix + cartão) | | |
| Hospedagem | Vercel | | |
| Anúncios | Meta Pixel + Conversions API | TikTok (opcional) | |

`generateStory()`, `describeCharacter()`, `generateIllustration()` e `generateBookPdf()` ficam atrás de interfaces em `src/lib/server/ai/` e `src/lib/server/pdf/`. Os provedores `template` e `mock` deixam o fluxo inteiro rodar localmente sem nenhuma chave.

## 4. Custo estimado por livro

Preços oficiais consultados em 10/10/2026. Câmbio assumido: US$ 1 = R$ 5,40 (variável `USD_BRL_RATE`).

| Etapa | Quando | Modelo | US$ |
|---|---|---|---|
| Personagem a partir da foto | antes do pagamento | Claude Opus 5.5, esforço baixo | ~0,02 |
| História completa (JSON) | antes do pagamento | Claude Opus 5.5, esforço baixo | ~0,06 |
| Capa | antes do pagamento | Gemini Nano Banana 2.1, 1K | 0,034 |
| **Prévia (toda pessoa que chega ao paywall)** | | | **~0,11** |
| 10 páginas | depois do pagamento | Gemini, 1K | 0,34 |
| PDF e storage | depois | Vercel + Supabase | < 0,005 |
| **Livro pago completo** | | | **~0,45 (≈ R$ 2,45)** |
| Livro para colorir (10 line arts) | depois do upsell | Gemini, 1K | 0,34 (≈ R$ 1,84) |

Sobre R$ 14,90: Pix no Mercado Pago custa 0,99%, então a margem bruta por livro fica perto de R$ 12. O custo que mais pesa é o das prévias de quem não paga: com 10% de conversão da prévia para a venda, cada venda carrega ~US$ 1,00 (R$ 5,40) de prévias não pagas. Trocar o modelo de texto para Claude Haiku 5.5 (`STORY_MODEL=claude-haiku-5-5`) reduz a prévia para ~US$ 0,04 e esse peso para ~R$ 2,10 por venda. A decisão é sua; o admin mostra o custo real por operação.

## 5. Antes e depois do pagamento

| Antes (paga quem chega ao paywall) | Depois (só quem pagou) |
|---|---|
| Character bible (visão) | 10 ilustrações das páginas |
| História inteira em JSON (título, 10 páginas, dedicatória) | PDF do livro |
| Capa ilustrada | Livro para colorir (só com o upsell) |
| Prévia: capa + página 1 em texto | |

A história completa sai antes porque custa centavos e deixa a prévia mostrar a primeira página de verdade. As imagens, que são o custo real, ficam para depois.

## 6. Estrutura de pastas

```
src/
  app/
    page.tsx                     landing
    dia-das-criancas/page.tsx    landing sazonal
    criar/                       assistente (dados, foto, aventura, personalização)
    livro/[token]/               prévia, paywall, geração, resultado, upsell
    livro/[token]/ler/           leitor do livro no navegador
    admin/                       métricas (Basic Auth)
    privacidade/ termos/ contato/
    api/
      books/                     criar livro, status, download, exclusão
      checkout/pix|card/         pagamento (produto: book | coloring)
      payment/status/            polling do pagamento
      webhooks/mercadopago/      webhook assinado
      events/                    analytics + CAPI
      cron/maintenance/          purga de fotos, retomada, retenção
  lib/
    domain/                      temas, traços, estados, validação do formulário (cliente e servidor)
    server/
      ai/                        provedores de texto e imagem, prompts, custo
      pdf/                       generateBookPdf, generateColoringPdf
      books.ts                   repositório do livro
      pipeline.ts                advanceBook (máquina de estados)
      payments.ts mercadopago.ts storage.ts rate-limit.ts env.ts
    analytics/                   eventos, pixel, CAPI
supabase/migrations/001_init.sql
```
