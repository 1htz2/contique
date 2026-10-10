create extension if not exists pgcrypto;

-- One row per book. The child's photo never lives here: photo_path points into the private
-- `child-uploads` bucket only until the preview is ready. Generated files are referenced by
-- storage path, never by URL: every read goes through a short-lived signed URL.
create table public.books (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  status text not null default 'preview_pending' check (status in (
    'preview_pending', 'preview_generating', 'preview_ready', 'preview_failed', 'photo_rejected',
    'paid', 'generating_images', 'building_pdf', 'completed', 'failed', 'deleted'
  )),
  status_detail text,
  visitor_id text,
  consent_at timestamptz not null,
  child_first_name text not null,
  child_nickname text,
  child_age int not null check (child_age between 1 and 12),
  child_pronoun text not null check (child_pronoun in ('ele', 'ela', 'neutro')),
  theme text not null,
  interests text,
  traits text[] not null default '{}',
  companion_json jsonb,
  language text not null default 'pt-BR',
  story_json jsonb,
  character_json jsonb,
  photo_path text,
  photo_deleted_at timestamptz,
  cover_path text,
  pdf_path text,
  coloring_status text not null default 'none' check (coloring_status in ('none', 'paid', 'generating', 'completed', 'failed')),
  coloring_pdf_path text,
  -- One pipeline worker per book. A worker that crashes simply lets its lease expire.
  lease_until timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  preview_ready_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  coloring_paid_at timestamptz,
  coloring_completed_at timestamptz,
  deleted_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  ttclid text,
  fbp text,
  fbc text,
  landing_path text,
  client_ip text,
  client_user_agent text
);
create index books_created_idx on public.books (created_at);
create index books_pending_photo_idx on public.books (created_at) where photo_deleted_at is null and photo_path is not null;
create index books_work_idx on public.books (updated_at)
  where status in ('preview_pending', 'preview_generating', 'paid', 'generating_images', 'building_pdf')
     or coloring_status in ('paid', 'generating');

-- Every generated image. One row per (book, type, page), so regenerating one page touches one row.
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  type text not null check (type in ('cover', 'page', 'coloring')),
  page_number int not null default 0,
  storage_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, type, page_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id),
  product text not null check (product in ('book', 'coloring')),
  provider text not null default 'mercadopago',
  provider_payment_id text unique,
  idempotency_key text not null unique,
  method text not null check (method in ('pix', 'card')),
  amount numeric(10, 2) not null,
  currency text not null default 'BRL',
  status text not null,
  status_detail text,
  qr_code text,
  qr_code_base64 text,
  expires_at timestamptz,
  live_mode boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  purchase_event_sent_at timestamptz,
  superseded_at timestamptz
);
create index payments_book_idx on public.payments (book_id, product);
create index payments_status_idx on public.payments (status, created_at);

-- A book has at most one open Pix per product. Concurrent checkouts race on this index instead of
-- each creating a charge. A Pix close to expiry is retired by setting superseded_at.
create unique index payments_one_open_pix_idx on public.payments (book_id, product)
  where method = 'pix' and superseded_at is null and status in ('creating', 'pending');

create table public.events (
  id bigint generated always as identity primary key,
  book_id uuid references public.books (id) on delete set null,
  visitor_id text,
  event_name text not null,
  event_id text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_name_created_idx on public.events (event_name, created_at);
create unique index events_dedupe_idx on public.events (event_name, event_id);

-- What each AI call cost, to know the margin per book.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  book_id uuid references public.books (id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null,
  input_tokens int,
  output_tokens int,
  estimated_cost numeric(10, 6) not null default 0,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_book_idx on public.ai_usage (book_id);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

-- Returns true while the caller is inside the limit. One atomic upsert per hit.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
as $$
declare
  hits int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into hits;
  return hits <= p_max;
end;
$$;

-- Claims the pipeline lease for one book. Returns false while another worker holds it.
create or replace function public.claim_book_lease(p_book_id uuid, p_seconds int)
returns boolean
language sql
as $$
  with claimed as (
    update public.books
    set lease_until = now() + make_interval(secs => p_seconds)
    where id = p_book_id and (lease_until is null or lease_until < now())
    returning id
  )
  select exists (select 1 from claimed);
$$;

-- All access goes through the server with the service role. RLS on with no policies denies anon and authenticated.
alter table public.books enable row level security;
alter table public.assets enable row level security;
alter table public.payments enable row level security;
alter table public.events enable row level security;
alter table public.ai_usage enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.books, public.assets, public.payments, public.events, public.ai_usage, public.rate_limits
  from anon, authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.claim_book_lease(uuid, int) from public, anon, authenticated;

-- Private buckets: no storage policies exist for them, so only the service role can read or write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('child-uploads', 'child-uploads', false, 5242880, array['image/jpeg']),
  ('book-assets', 'book-assets', false, 15728640, array['image/png', 'image/jpeg', 'image/webp']),
  ('generated-books', 'generated-books', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.admin_metrics(p_since timestamptz)
returns jsonb
language sql
stable
as $$
  with
  funnel as (
    select
      count(distinct visitor_id) filter (where event_name = 'landing_view') as visitors,
      count(distinct visitor_id) filter (where event_name = 'create_started') as create_started,
      count(distinct visitor_id) filter (where event_name = 'photo_uploaded') as photo_uploaded,
      count(distinct book_id) filter (where event_name = 'preview_generated') as preview_generated,
      count(distinct book_id) filter (where event_name = 'paywall_viewed') as paywall_viewed,
      count(distinct book_id) filter (where event_name = 'checkout_started') as checkout_started,
      count(distinct book_id) filter (where event_name = 'pix_generated') as pix_generated,
      count(distinct book_id) filter (where event_name = 'pdf_downloaded') as pdf_downloaded,
      count(distinct book_id) filter (where event_name = 'coloring_upsell_viewed') as coloring_viewed
    from public.events
    where created_at >= p_since
  ),
  books as (
    select
      count(*) as created,
      count(*) filter (where status = 'photo_rejected') as photo_rejected,
      count(*) filter (where completed_at is not null) as completed,
      count(*) filter (where status = 'failed') as failed
    from public.books where created_at >= p_since
  ),
  live_payments as (
    select * from public.payments where live_mode is distinct from false
  ),
  sales as (
    select p.amount, p.product, p.book_id, b.utm_source, b.utm_campaign, b.utm_content, b.theme
    from live_payments p
    join public.books b on b.id = p.book_id
    where p.status = 'approved' and p.approved_at >= p_since
  ),
  totals as (
    select
      count(*) filter (where product = 'book') as books_sold,
      count(*) filter (where product = 'coloring') as coloring_sold,
      coalesce(sum(amount), 0) as revenue,
      coalesce(sum(amount) filter (where product = 'book'), 0) as book_revenue,
      count(distinct book_id) as paying_books
    from sales
  ),
  ai as (
    select
      coalesce(sum(estimated_cost), 0) as total,
      coalesce(sum(estimated_cost) filter (where operation in ('character', 'story', 'cover')), 0) as preview,
      coalesce(sum(estimated_cost) filter (where operation = 'page'), 0) as pages,
      coalesce(sum(estimated_cost) filter (where operation = 'coloring'), 0) as coloring
    from public.ai_usage where created_at >= p_since
  ),
  per_book as (
    select avg(cost) as avg_paid_book_cost
    from (
      select u.book_id, sum(u.estimated_cost) as cost
      from public.ai_usage u
      join public.books b on b.id = u.book_id
      where b.completed_at is not null and b.created_at >= p_since and u.operation <> 'coloring'
      group by u.book_id
    ) t
  )
  select jsonb_build_object(
    'visitors', funnel.visitors,
    'create_started', funnel.create_started,
    'photo_uploaded', funnel.photo_uploaded,
    'books_created', books.created,
    'photo_rejected', books.photo_rejected,
    'preview_generated', funnel.preview_generated,
    'paywall_viewed', funnel.paywall_viewed,
    'checkout_started', funnel.checkout_started,
    'pix_generated', funnel.pix_generated,
    'books_sold', totals.books_sold,
    'books_completed', books.completed,
    'books_failed', books.failed,
    'pdf_downloaded', funnel.pdf_downloaded,
    'coloring_viewed', funnel.coloring_viewed,
    'coloring_sold', totals.coloring_sold,
    'revenue', totals.revenue,
    'avg_ticket', case when totals.paying_books > 0 then round(totals.revenue / totals.paying_books, 2) end,
    'visitor_to_sale', case when funnel.visitors > 0 then round(totals.books_sold::numeric / funnel.visitors, 4) end,
    'preview_to_sale', case when funnel.preview_generated > 0 then round(totals.books_sold::numeric / funnel.preview_generated, 4) end,
    'checkout_to_sale', case when funnel.checkout_started > 0 then round(totals.books_sold::numeric / funnel.checkout_started, 4) end,
    'ai_cost_usd', round(ai.total, 4),
    'ai_preview_cost_usd', round(ai.preview, 4),
    'ai_pages_cost_usd', round(ai.pages, 4),
    'ai_coloring_cost_usd', round(ai.coloring, 4),
    'avg_paid_book_ai_cost_usd', round(per_book.avg_paid_book_cost, 4),
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'sales', n, 'revenue', revenue) order by revenue desc, key), '[]')
      from (select coalesce(utm_source, '(direto)') as key, count(*) as n, sum(amount) as revenue from sales group by 1) t
    ),
    'by_campaign', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'sales', n, 'revenue', revenue) order by revenue desc, key), '[]')
      from (select coalesce(utm_campaign, '(direto)') as key, count(*) as n, sum(amount) as revenue from sales group by 1) t
    ),
    'by_content', (
      select coalesce(jsonb_agg(jsonb_build_object('key', key, 'sales', n, 'revenue', revenue) order by revenue desc, key), '[]')
      from (select coalesce(utm_content, '(direto)') as key, count(*) as n, sum(amount) as revenue from sales group by 1) t
    ),
    'themes', (
      select coalesce(jsonb_agg(jsonb_build_object('key', theme, 'books', n, 'sold', sold) order by n desc, theme), '[]')
      from (
        select b.theme, count(*) as n,
          (select count(*) from sales s where s.book_id = any(array_agg(b.id)) and s.product = 'book') as sold
        from public.books b where b.created_at >= p_since group by b.theme
      ) t
    )
  )
  from funnel, books, totals, ai, per_book;
$$;

revoke execute on function public.admin_metrics(timestamptz) from public, anon, authenticated;
