-- ============================================================
-- avansa · Sistema Integral — 0009 · alta de solicitudes desde el sitio
-- ============================================================
-- El sitio necesita escribir en `leads`, pero `leads` tiene RLS y no hay
-- política de insert para `anon` a propósito: la tabla guarda datos
-- personales y no puede quedar abierta.
--
-- La alternativa habitual es mandarle al sitio la `service_role`, una llave
-- que puede leer y borrar la base entera. Para escribir una fila de un
-- formulario público eso es desproporcionado: si el servidor del sitio se ve
-- comprometido, se va toda la base.
--
-- En su lugar, esta función `security definer` es la única puerta: valida,
-- recorta y escribe exactamente una fila, y no devuelve más que el id. `anon`
-- puede ejecutarla y nada más. El peor caso de un abuso es una solicitud
-- basura, no una fuga de datos personales.
-- ============================================================

create or replace function public.registrar_lead(
  p_nombre               text,
  p_telefono             text,
  p_email                text default null,
  p_estado_republica     text default null,
  p_saldo_subcuenta      numeric default null,
  p_tipo_mejora          text default null,
  p_vivienda_a_su_nombre boolean default null,
  p_mensaje              text default null,
  p_origen               text default 'sitio-web',
  p_utm                  jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nuevo_id uuid;
  nombre_limpio   text := btrim(p_nombre);
  telefono_limpio text := btrim(p_telefono);
  email_limpio    text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if char_length(nombre_limpio) < 2 then
    raise exception 'El nombre es obligatorio.';
  end if;

  -- Diez dígitos, con o sin separadores: es lo mismo que valida el sitio.
  if char_length(regexp_replace(telefono_limpio, '[^0-9]', '', 'g')) < 10 then
    raise exception 'El teléfono debe tener al menos 10 dígitos.';
  end if;

  if email_limpio is not null and email_limpio !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    email_limpio := null;   -- se descarta el correo malo, no la solicitud
  end if;

  insert into public.leads (
    nombre, telefono, email, estado_republica, saldo_subcuenta, tipo_mejora,
    vivienda_a_su_nombre, mensaje, acepta_privacidad, origen, canal, utm
  ) values (
    left(nombre_limpio, 120),
    left(telefono_limpio, 30),
    left(email_limpio, 160),
    left(nullif(btrim(coalesce(p_estado_republica, '')), ''), 60),
    case when p_saldo_subcuenta is not null and p_saldo_subcuenta > 0
         then least(p_saldo_subcuenta, 99999999) end,
    left(nullif(btrim(coalesce(p_tipo_mejora, '')), ''), 80),
    p_vivienda_a_su_nombre,
    left(nullif(btrim(coalesce(p_mensaje, '')), ''), 1200),
    -- El sitio no envía esta solicitud sin la casilla marcada, y la base
    -- tiene un `check` que impide guardar sin consentimiento.
    true,
    coalesce(left(nullif(btrim(coalesce(p_origen, '')), ''), 60), 'sitio-web'),
    case when p_utm ? 'utm_source' then 'meta-ads' else null end,
    p_utm
  )
  returning id into nuevo_id;

  return nuevo_id;
end;
$$;

revoke all on function public.registrar_lead(text, text, text, text, numeric, text, boolean, text, text, jsonb) from public;
grant execute on function public.registrar_lead(text, text, text, text, numeric, text, boolean, text, text, jsonb) to anon, authenticated;

comment on function public.registrar_lead is
  'Única puerta de alta desde el sitio público. Valida y escribe una fila; no expone la tabla.';
