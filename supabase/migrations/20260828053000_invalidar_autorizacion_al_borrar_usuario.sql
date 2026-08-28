-- Si se elimina el perfil que aprobó una pieza, el FK pone autorizado_por en
-- null. La misma actualización debe retirar la aprobación para conservar el
-- constraint y, sobre todo, impedir una publicación sin responsable.

create or replace function private.invalidar_autorizacion_contenido_social()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.titulo is distinct from old.titulo
     or new.texto is distinct from old.texto
     or new.tipo is distinct from old.tipo
     or new.plataformas is distinct from old.plataformas
     or new.programado_para is distinct from old.programado_para
     or (new.autorizado_por is null and old.autorizado_por is not null) then
    new.autorizado_en := null;
    new.autorizado_por := null;
  end if;
  return new;
end;
$$;

revoke all on function private.invalidar_autorizacion_contenido_social()
  from public, anon, authenticated, service_role;

drop trigger if exists contenidos_sociales_invalidar_autorizacion
  on public.contenidos_sociales;
create trigger contenidos_sociales_invalidar_autorizacion
  before update of titulo, texto, tipo, plataformas, programado_para, autorizado_por
  on public.contenidos_sociales
  for each row execute function private.invalidar_autorizacion_contenido_social();
