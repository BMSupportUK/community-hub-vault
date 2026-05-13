-- Enums
create type public.order_status as enum ('pending','processing','shipped','completed','cancelled');

-- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  image_url text,
  category text,
  stock integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;

create policy "products read active or staff" on public.products for select to authenticated
  using (is_active = true or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]));
create policy "products manage admin" on public.products for all to authenticated
  using (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]))
  with check (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]));

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status public.order_status not null default 'pending',
  total_cents integer not null default 0 check (total_cents >= 0),
  shipping_name text,
  shipping_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;

create policy "orders read own or admin" on public.orders for select to authenticated
  using (user_id = auth.uid() or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]));
create policy "orders insert self" on public.orders for insert to authenticated
  with check (user_id = auth.uid());
create policy "orders update admin" on public.orders for update to authenticated
  using (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]))
  with check (has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]));

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- order_items
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);
alter table public.order_items enable row level security;

create policy "order_items read own or admin" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
    and (o.user_id = auth.uid() or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]))));
create policy "order_items insert own" on public.order_items for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- order_messages
create table public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.order_messages enable row level security;

create policy "order_msg read participants" on public.order_messages for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
    and (o.user_id = auth.uid() or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]))));
create policy "order_msg insert participants" on public.order_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.orders o where o.id = order_id
    and (o.user_id = auth.uid() or has_any_role(auth.uid(), array['admin'::app_role,'management'::app_role]))));

-- realtime
alter publication supabase_realtime add table public.order_messages;
alter publication supabase_realtime add table public.orders;