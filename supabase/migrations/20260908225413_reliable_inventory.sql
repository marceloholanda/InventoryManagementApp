create extension if not exists pgcrypto;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  legacy_id text,
  description text not null check (btrim(description) <> ''),
  invoice_number text,
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_limit integer not null default 10 check (low_stock_limit >= 1),
  responsible text,
  first_entry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_owner_description_unique
  on public.products (owner_id, lower(btrim(description)));
create unique index products_owner_legacy_id_unique
  on public.products (owner_id, legacy_id)
  where legacy_id is not null;
create index products_owner_id_idx on public.products (owner_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  legacy_id text,
  movement_type text not null check (movement_type in ('entrada', 'saida', 'estorno')),
  quantity integer not null check (quantity > 0),
  delta integer not null check (delta <> 0 and abs(delta) = quantity),
  happened_on date not null,
  description_snapshot text not null,
  invoice_number text,
  responsible text not null check (btrim(responsible) <> ''),
  reason text,
  related_movement_id uuid references public.inventory_movements(id) on delete restrict,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  constraint inventory_movements_type_delta_check check (
    (movement_type = 'entrada' and delta > 0)
    or (movement_type = 'saida' and delta < 0)
    or movement_type = 'estorno'
  )
);

create unique index inventory_movements_owner_legacy_id_unique
  on public.inventory_movements (owner_id, legacy_id)
  where legacy_id is not null;
create index inventory_movements_owner_date_idx
  on public.inventory_movements (owner_id, happened_on desc, created_at desc);
create index inventory_movements_product_idx
  on public.inventory_movements (product_id, created_at desc);

create table public.inventory_corrections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  original_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  reversal_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  replacement_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  reason text not null check (btrim(reason) <> ''),
  corrected_by text not null check (btrim(corrected_by) <> ''),
  created_at timestamptz not null default now()
);

create index inventory_corrections_owner_idx
  on public.inventory_corrections (owner_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create function public.create_product_with_initial_stock(
  p_description text,
  p_quantity integer,
  p_happened_on date,
  p_responsible text,
  p_invoice_number text default null,
  p_low_stock_limit integer default 10
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_product public.products;
  v_movement public.inventory_movements;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'A quantidade deve ser maior que zero.';
  end if;
  if btrim(coalesce(p_description, '')) = '' or btrim(coalesce(p_responsible, '')) = '' then
    raise exception using errcode = '22023', message = 'Descrição e responsável são obrigatórios.';
  end if;
  if coalesce(p_low_stock_limit, 0) < 1 then
    raise exception using errcode = '22023', message = 'O limite de estoque baixo deve ser maior que zero.';
  end if;

  insert into public.products (
    owner_id, description, invoice_number, quantity, low_stock_limit,
    responsible, first_entry_date
  ) values (
    v_owner_id, btrim(p_description), nullif(btrim(p_invoice_number), ''), p_quantity,
    p_low_stock_limit, btrim(p_responsible), p_happened_on
  ) returning * into v_product;

  insert into public.inventory_movements (
    owner_id, product_id, movement_type, quantity, delta, happened_on,
    description_snapshot, invoice_number, responsible
  ) values (
    v_owner_id, v_product.id, 'entrada', p_quantity, p_quantity, p_happened_on,
    v_product.description, nullif(btrim(p_invoice_number), ''), btrim(p_responsible)
  ) returning * into v_movement;

  return v_movement;
end;
$$;

create function public.register_inventory_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_happened_on date,
  p_responsible text,
  p_invoice_number text default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_product public.products;
  v_delta integer;
  v_new_quantity integer;
  v_movement public.inventory_movements;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if p_movement_type not in ('entrada', 'saida') then
    raise exception using errcode = '22023', message = 'Tipo de movimentação inválido.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'A quantidade deve ser maior que zero.';
  end if;
  if btrim(coalesce(p_responsible, '')) = '' then
    raise exception using errcode = '22023', message = 'O responsável é obrigatório.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and owner_id = v_owner_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Produto não encontrado.';
  end if;

  v_delta := case when p_movement_type = 'entrada' then p_quantity else -p_quantity end;
  v_new_quantity := v_product.quantity + v_delta;

  if v_new_quantity < 0 then
    raise exception using errcode = 'P0001', message = format(
      'Estoque insuficiente. Disponível: %s.', v_product.quantity
    );
  end if;

  update public.products
  set quantity = v_new_quantity,
      invoice_number = case
        when p_movement_type = 'entrada' and nullif(btrim(p_invoice_number), '') is not null
          then btrim(p_invoice_number)
        else invoice_number
      end,
      responsible = case
        when p_movement_type = 'entrada' then btrim(p_responsible)
        else responsible
      end,
      first_entry_date = case
        when p_movement_type = 'entrada' then least(coalesce(first_entry_date, p_happened_on), p_happened_on)
        else first_entry_date
      end
  where id = v_product.id;

  insert into public.inventory_movements (
    owner_id, product_id, movement_type, quantity, delta, happened_on,
    description_snapshot, invoice_number, responsible
  ) values (
    v_owner_id, v_product.id, p_movement_type, p_quantity, v_delta, p_happened_on,
    v_product.description, nullif(btrim(p_invoice_number), ''), btrim(p_responsible)
  ) returning * into v_movement;

  return v_movement;
end;
$$;

create function public.correct_inventory_movement(
  p_movement_id uuid,
  p_new_quantity integer,
  p_reason text,
  p_responsible text
)
returns public.inventory_corrections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_original public.inventory_movements;
  v_product public.products;
  v_reversal public.inventory_movements;
  v_replacement public.inventory_movements;
  v_correction public.inventory_corrections;
  v_replacement_delta integer;
  v_resulting_quantity integer;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'Autenticação obrigatória.';
  end if;
  if p_new_quantity is null or p_new_quantity <= 0 then
    raise exception using errcode = '22023', message = 'A nova quantidade deve ser maior que zero.';
  end if;
  if btrim(coalesce(p_reason, '')) = '' or btrim(coalesce(p_responsible, '')) = '' then
    raise exception using errcode = '22023', message = 'Motivo e responsável são obrigatórios.';
  end if;

  select * into v_original
  from public.inventory_movements
  where id = p_movement_id and owner_id = v_owner_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Movimentação não encontrada.';
  end if;
  if v_original.movement_type = 'estorno' or v_original.corrected_at is not null then
    raise exception using errcode = 'P0001', message = 'Esta movimentação não pode ser corrigida novamente.';
  end if;

  select * into v_product
  from public.products
  where id = v_original.product_id and owner_id = v_owner_id
  for update;

  v_replacement_delta := case
    when v_original.movement_type = 'entrada' then p_new_quantity
    else -p_new_quantity
  end;
  v_resulting_quantity := v_product.quantity - v_original.delta + v_replacement_delta;

  if v_resulting_quantity < 0 then
    raise exception using errcode = 'P0001', message = format(
      'A correção deixaria o estoque negativo. Disponível após estorno: %s.',
      v_product.quantity - v_original.delta
    );
  end if;

  insert into public.inventory_movements (
    owner_id, product_id, movement_type, quantity, delta, happened_on,
    description_snapshot, invoice_number, responsible, reason, related_movement_id
  ) values (
    v_owner_id, v_product.id, 'estorno', v_original.quantity, -v_original.delta,
    current_date, v_product.description, v_original.invoice_number,
    btrim(p_responsible), btrim(p_reason), v_original.id
  ) returning * into v_reversal;

  insert into public.inventory_movements (
    owner_id, product_id, movement_type, quantity, delta, happened_on,
    description_snapshot, invoice_number, responsible, reason, related_movement_id
  ) values (
    v_owner_id, v_product.id, v_original.movement_type, p_new_quantity,
    v_replacement_delta, v_original.happened_on, v_product.description,
    v_original.invoice_number, btrim(p_responsible),
    'Substituição do lançamento corrigido', v_original.id
  ) returning * into v_replacement;

  update public.inventory_movements
  set corrected_at = now()
  where id = v_original.id;

  update public.products
  set quantity = v_resulting_quantity
  where id = v_product.id;

  insert into public.inventory_corrections (
    owner_id, original_movement_id, reversal_movement_id,
    replacement_movement_id, reason, corrected_by
  ) values (
    v_owner_id, v_original.id, v_reversal.id, v_replacement.id,
    btrim(p_reason), btrim(p_responsible)
  ) returning * into v_correction;

  return v_correction;
end;
$$;

alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_corrections enable row level security;

revoke all on table public.products from anon, authenticated;
revoke all on table public.inventory_movements from anon, authenticated;
revoke all on table public.inventory_corrections from anon, authenticated;

grant select on table public.products to authenticated;
grant update (description, invoice_number, low_stock_limit, responsible, first_entry_date)
  on table public.products to authenticated;
grant select on table public.inventory_movements to authenticated;
grant select on table public.inventory_corrections to authenticated;

create policy products_select_own
on public.products for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy products_update_own
on public.products for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy movements_select_own
on public.inventory_movements for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy corrections_select_own
on public.inventory_corrections for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.create_product_with_initial_stock(text, integer, date, text, text, integer) from public, anon;
revoke all on function public.register_inventory_movement(uuid, text, integer, date, text, text) from public, anon;
revoke all on function public.correct_inventory_movement(uuid, integer, text, text) from public, anon;

grant execute on function public.create_product_with_initial_stock(text, integer, date, text, text, integer) to authenticated;
grant execute on function public.register_inventory_movement(uuid, text, integer, date, text, text) to authenticated;
grant execute on function public.correct_inventory_movement(uuid, integer, text, text) to authenticated;
