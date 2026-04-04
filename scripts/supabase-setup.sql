-- Run this in the Supabase SQL Editor for the multi-user store-scoped sync model.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists store_memberships (
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'manager', 'staff', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create or replace function public.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_memberships sm
    where sm.store_id = target_store_id
      and sm.user_id = auth.uid()
  );
$$;

create table if not exists customers (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  phone text not null default '',
  trust_score text not null default 'Bago',
  created_at timestamptz not null default now(),
  unique (store_id, sync_id)
);

create table if not exists products (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  price_cents integer not null,
  cost_price_cents integer not null default 0,
  stock integer not null default 0,
  category text,
  barcode text,
  image_uri text,
  min_stock numeric(10,4) not null default 5,
  is_weight_based boolean not null default false,
  pricing_mode text not null default 'direct',
  pricing_strategy text not null default 'manual',
  total_kg_available numeric(10,4),
  cost_price_total_cents integer,
  selling_price_total_cents integer,
  cost_price_per_kg_cents integer,
  selling_price_per_kg_cents integer,
  target_margin_percent numeric(10,4),
  computed_price_per_kg_cents integer,
  has_container_return boolean not null default false,
  container_label text,
  container_deposit_cents integer not null default 0,
  default_container_quantity_per_sale integer not null default 1,
  created_at timestamptz not null default now(),
  unique (store_id, sync_id)
);

create table if not exists inventory_pools (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  base_unit_label text not null,
  quantity_available numeric(10,4) not null default 0,
  reorder_threshold numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sync_id)
);

create table if not exists app_settings (
  store_id uuid not null references stores(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, key)
);

create table if not exists sales (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  total_cents integer not null,
  cash_paid_cents integer not null default 0,
  change_given_cents integer not null default 0,
  discount_cents integer not null default 0,
  payment_method text not null default 'cash',
  customer_sync_id uuid references customers(sync_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (store_id, sync_id)
);

create table if not exists expenses (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  category text not null,
  amount_cents integer not null,
  description text,
  expense_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sync_id)
);

create table if not exists restock_lists (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  title text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (store_id, sync_id)
);

create table if not exists utang (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  customer_sync_id uuid not null references customers(sync_id) on delete cascade,
  amount_cents integer not null,
  amount_paid_cents integer not null default 0,
  description text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (store_id, sync_id)
);

create table if not exists product_inventory_links (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  product_sync_id uuid not null references products(sync_id) on delete cascade,
  inventory_pool_sync_id uuid not null references inventory_pools(sync_id) on delete cascade,
  units_per_sale numeric(10,4) not null,
  display_unit_label text not null,
  is_primary_restock_product boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, sync_id)
);

create table if not exists sale_items (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  sale_sync_id uuid not null references sales(sync_id) on delete cascade,
  product_sync_id uuid references products(sync_id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null,
  unit_cost_cents integer not null default 0,
  quantity integer not null default 1,
  is_weight_based boolean not null default false,
  weight_kg numeric(10,4),
  line_total_cents integer not null default 0,
  line_cost_total_cents integer not null default 0,
  unique (store_id, sync_id)
);

create table if not exists container_return_events (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  sale_sync_id uuid not null references sales(sync_id) on delete cascade,
  customer_sync_id uuid references customers(sync_id) on delete set null,
  product_sync_id uuid references products(sync_id) on delete set null,
  product_name_snapshot text not null,
  container_label_snapshot text not null,
  quantity_out integer not null,
  quantity_returned integer not null default 0,
  created_at timestamptz not null default now(),
  last_returned_at timestamptz,
  status text not null default 'open',
  unique (store_id, sync_id)
);

create table if not exists repack_sessions (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  inventory_pool_sync_id uuid not null references inventory_pools(sync_id) on delete cascade,
  source_product_sync_id uuid not null references products(sync_id) on delete cascade,
  output_product_sync_id uuid not null references products(sync_id) on delete cascade,
  source_quantity_used numeric(10,4) not null,
  output_units_created numeric(10,4) not null,
  wastage_units numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  note text,
  unique (store_id, sync_id)
);

create table if not exists restock_list_items (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  restock_list_sync_id uuid not null references restock_lists(sync_id) on delete cascade,
  product_sync_id uuid references products(sync_id) on delete set null,
  product_name_snapshot text not null,
  category_snapshot text,
  current_stock_snapshot numeric(10,4) not null default 0,
  min_stock_snapshot numeric(10,4) not null default 0,
  suggested_quantity numeric(10,4) not null default 0,
  is_weight_based_snapshot boolean not null default false,
  is_checked boolean not null default false,
  checked_at timestamptz,
  note text,
  unique (store_id, sync_id)
);

create table if not exists utang_payments (
  sync_id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  utang_sync_id uuid not null references utang(sync_id) on delete cascade,
  customer_sync_id uuid not null references customers(sync_id) on delete cascade,
  amount_cents integer not null,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (store_id, sync_id)
);

alter table profiles enable row level security;
alter table stores enable row level security;
alter table store_memberships enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table inventory_pools enable row level security;
alter table app_settings enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;
alter table restock_lists enable row level security;
alter table utang enable row level security;
alter table product_inventory_links enable row level security;
alter table sale_items enable row level security;
alter table container_return_events enable row level security;
alter table repack_sessions enable row level security;
alter table restock_list_items enable row level security;
alter table utang_payments enable row level security;

drop policy if exists "profiles self access" on profiles;
create policy "profiles self access" on profiles
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "stores member access" on stores;
create policy "stores member access" on stores
for select using (public.is_store_member(id));
drop policy if exists "stores owner insert" on stores;
create policy "stores owner insert" on stores
for insert with check (owner_user_id = auth.uid());
drop policy if exists "stores owner update" on stores;
create policy "stores owner update" on stores
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists "stores owner delete" on stores;
create policy "stores owner delete" on stores
for delete using (owner_user_id = auth.uid());

drop policy if exists "memberships member view" on store_memberships;
create policy "memberships member view" on store_memberships
for select using (user_id = auth.uid() or public.is_store_member(store_id));
drop policy if exists "memberships self insert" on store_memberships;
create policy "memberships self insert" on store_memberships
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from stores s
    where s.id = store_memberships.store_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "customers members access" on customers;
create policy "customers members access" on customers for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "products members access" on products;
create policy "products members access" on products for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "inventory pools members access" on inventory_pools;
create policy "inventory pools members access" on inventory_pools for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "app settings members access" on app_settings;
create policy "app settings members access" on app_settings for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "sales members access" on sales;
create policy "sales members access" on sales for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "expenses members access" on expenses;
create policy "expenses members access" on expenses for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "restock lists members access" on restock_lists;
create policy "restock lists members access" on restock_lists for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "utang members access" on utang;
create policy "utang members access" on utang for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "product inventory links members access" on product_inventory_links;
create policy "product inventory links members access" on product_inventory_links for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "sale items members access" on sale_items;
create policy "sale items members access" on sale_items for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "container return members access" on container_return_events;
create policy "container return members access" on container_return_events for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "repack sessions members access" on repack_sessions;
create policy "repack sessions members access" on repack_sessions for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "restock list items members access" on restock_list_items;
create policy "restock list items members access" on restock_list_items for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "utang payments members access" on utang_payments;
create policy "utang payments members access" on utang_payments for all
using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product images are public" on storage.objects;
create policy "product images are public"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "product images member upload" on storage.objects;
create policy "product images member upload"
on storage.objects for insert
with check (
  bucket_id = 'product-images'
  and public.is_store_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "product images member update" on storage.objects;
create policy "product images member update"
on storage.objects for update
using (
  bucket_id = 'product-images'
  and public.is_store_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'product-images'
  and public.is_store_member(((storage.foldername(name))[1])::uuid)
);
