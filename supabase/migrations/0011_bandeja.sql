-- ============================================================
-- avansa · Sistema Integral — 0011 · bandeja de conversaciones
-- ============================================================
-- Los mensajes viven en Chatwoot; aquí vive **quién atiende qué**.
--
-- Podría parecer más natural usar el `assignee_id` de Chatwoot y ahorrarse
-- estas tablas. No sirve, por dos razones que se comprobaron sobre la
-- instancia real:
--
--   1. Para asignarle una conversación a alguien en Chatwoot, ese alguien
--      tiene que ser un usuario de Chatwoot — con su login. El equipo de
--      avansa trabaja sólo en este panel y no debe poder entrar allá: si
--      entrara, vería la bandeja completa, porque restringir por conversación
--      es una función de pago (`Custom Roles`) y la instancia corre en
--      community edition.
--   2. Con la asignación aquí, el filtro lo aplica este servidor antes de
--      devolver nada. No es un acuerdo: es que los datos no salen.
--
-- Chatwoot queda entonces como motor de mensajes con una sola identidad, y
-- el reparto del trabajo es asunto del panel.
-- ============================================================

-- ---------- conversaciones ------------------------------------------------

create table if not exists public.conversaciones (
  id            bigint primary key,
  bandeja_id    bigint not null,
  asignado_a    uuid references public.perfiles (id) on delete set null,
  asignado_en   timestamptz,
  asignado_por  uuid references public.perfiles (id) on delete set null,
  lead_id       uuid references public.leads (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.conversaciones is
  'Reparto de las conversaciones de Chatwoot. El contenido no se copia: sólo '
  'quién la atiende y con qué expediente del CRM se corresponde.';
comment on column public.conversaciones.id is
  'Mismo id que en Chatwoot. No es un serial: lo asigna Chatwoot y aquí se refleja.';
comment on column public.conversaciones.asignado_a is
  'Null = nadie la ha tomado todavía; esas sí las ve todo el equipo, que es '
  'como se pueden repartir. En cuanto tiene dueño, sólo la ven su dueño y un admin.';

create index if not exists conversaciones_asignado_idx
  on public.conversaciones (asignado_a);
create index if not exists conversaciones_lead_idx
  on public.conversaciones (lead_id);

drop trigger if exists conversaciones_touch on public.conversaciones;
create trigger conversaciones_touch before update on public.conversaciones
  for each row execute function public.touch_updated_at();

-- ---------- autoría de las respuestas ------------------------------------
-- Todas las respuestas salen a Chatwoot con la misma identidad de
-- integración, así que allá no se distingue quién escribió. Aquí sí: esta
-- tabla es la que permite que el panel muestre «respondió Claudia» y que un
-- reporte por asesor signifique algo.

create table if not exists public.respuestas (
  mensaje_id      bigint primary key,
  conversacion_id bigint not null references public.conversaciones (id) on delete cascade,
  autor_id        uuid references public.perfiles (id) on delete set null,
  enviado_en      timestamptz not null default now()
);

comment on table public.respuestas is
  'Quién escribió cada mensaje saliente. Chatwoot no puede saberlo: recibe '
  'todas las respuestas con la misma credencial.';

create index if not exists respuestas_conversacion_idx
  on public.respuestas (conversacion_id);

-- ---------- quién puede ver qué ------------------------------------------

create or replace function public.puede_ver_conversacion(conv bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.es_equipo() then false
    when public.tiene_rol('admin') then true
    else exists (
      select 1 from public.conversaciones c
      where c.id = conv
        and (c.asignado_a = (select auth.uid()) or c.asignado_a is null)
    )
  end
$$;

comment on function public.puede_ver_conversacion(bigint) is
  'Regla única de visibilidad de la bandeja. La usan la RLS y las rutas de '
  'API, para que no puedan discrepar.';

-- Lo de «no es del equipo» va primero por una razón concreta: sin esa línea,
-- para un anónimo `asignado_a is null` se cumple y la función devolvía `true`
-- para cualquier conversación libre. No filtraba contenido —eso vive en
-- Chatwoot—, pero sí confirmaba cuáles existen y cuáles están sin tomar.
revoke execute on function public.puede_ver_conversacion(bigint) from anon;

-- ---------- RLS -----------------------------------------------------------

alter table public.conversaciones enable row level security;
alter table public.respuestas     enable row level security;

drop policy if exists "ve lo suyo y lo libre"        on public.conversaciones;
drop policy if exists "toma lo que está libre"       on public.conversaciones;
drop policy if exists "admin reparte"                on public.conversaciones;
drop policy if exists "registra conversaciones nuevas" on public.conversaciones;
drop policy if exists "ve las respuestas que puede"  on public.respuestas;
drop policy if exists "firma sus respuestas"         on public.respuestas;

-- Un asesor ve las suyas y las que no tiene dueño. Sin lo segundo nadie
-- podría tomar una conversación nueva y la bandeja se atascaría.
create policy "ve lo suyo y lo libre"
  on public.conversaciones for select to authenticated
  using (
    public.tiene_rol('admin')
    or asignado_a = (select auth.uid())
    or asignado_a is null
  );

-- Tomar una conversación libre, o soltar la propia. Nadie puede quitarle una
-- conversación a otro ni endosársela: para eso está el admin.
create policy "toma lo que está libre"
  on public.conversaciones for update to authenticated
  using (
    public.es_equipo()
    and (asignado_a is null or asignado_a = (select auth.uid()))
  )
  with check (
    asignado_a is null or asignado_a = (select auth.uid())
  );

-- Cualquiera del equipo puede registrar una conversación nueva, y sólo sin
-- dueño. Es lo que deja que la bandeja se sincronice sola en cuanto alguien
-- la abre; sin esto, una conversación recién llegada sería invisible hasta
-- que entrara un admin, y el `with check` impide usarlo para auto-asignarse.
create policy "registra conversaciones nuevas"
  on public.conversaciones for insert to authenticated
  with check (public.es_equipo() and asignado_a is null);

create policy "admin reparte"
  on public.conversaciones for all to authenticated
  using (public.tiene_rol('admin'))
  with check (public.tiene_rol('admin'));

create policy "ve las respuestas que puede"
  on public.respuestas for select to authenticated
  using (public.puede_ver_conversacion(conversacion_id));

create policy "firma sus respuestas"
  on public.respuestas for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and public.puede_ver_conversacion(conversacion_id)
  );
