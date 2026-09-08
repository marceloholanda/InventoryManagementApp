-- Keep privileged inventory implementations outside the exposed API schema.
-- The public functions below are invoker-rights entry points; their private
-- implementations still validate auth.uid(), ownership and lock product rows.
create schema if not exists private;

alter function public.create_product_with_initial_stock(text, integer, date, text, text, integer)
  set schema private;
alter function public.register_inventory_movement(uuid, text, integer, date, text, text)
  set schema private;
alter function public.correct_inventory_movement(uuid, integer, text, text)
  set schema private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on function private.create_product_with_initial_stock(text, integer, date, text, text, integer)
  from public, anon, authenticated;
revoke all on function private.register_inventory_movement(uuid, text, integer, date, text, text)
  from public, anon, authenticated;
revoke all on function private.correct_inventory_movement(uuid, integer, text, text)
  from public, anon, authenticated;

grant execute on function private.create_product_with_initial_stock(text, integer, date, text, text, integer)
  to authenticated;
grant execute on function private.register_inventory_movement(uuid, text, integer, date, text, text)
  to authenticated;
grant execute on function private.correct_inventory_movement(uuid, integer, text, text)
  to authenticated;

create function public.create_product_with_initial_stock(
  p_description text,
  p_quantity integer,
  p_happened_on date,
  p_responsible text,
  p_invoice_number text default null,
  p_low_stock_limit integer default 10
)
returns public.inventory_movements
language sql
security invoker
set search_path = ''
as $$
  select private.create_product_with_initial_stock($1, $2, $3, $4, $5, $6);
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
language sql
security invoker
set search_path = ''
as $$
  select private.register_inventory_movement($1, $2, $3, $4, $5, $6);
$$;

create function public.correct_inventory_movement(
  p_movement_id uuid,
  p_new_quantity integer,
  p_reason text,
  p_responsible text
)
returns public.inventory_corrections
language sql
security invoker
set search_path = ''
as $$
  select private.correct_inventory_movement($1, $2, $3, $4);
$$;

revoke all on function public.create_product_with_initial_stock(text, integer, date, text, text, integer)
  from public, anon;
revoke all on function public.register_inventory_movement(uuid, text, integer, date, text, text)
  from public, anon;
revoke all on function public.correct_inventory_movement(uuid, integer, text, text)
  from public, anon;

grant execute on function public.create_product_with_initial_stock(text, integer, date, text, text, integer)
  to authenticated;
grant execute on function public.register_inventory_movement(uuid, text, integer, date, text, text)
  to authenticated;
grant execute on function public.correct_inventory_movement(uuid, integer, text, text)
  to authenticated;

-- Older deployments created this helper as SECURITY DEFINER. It is not part
-- of the application API and must not be callable by browser roles.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
