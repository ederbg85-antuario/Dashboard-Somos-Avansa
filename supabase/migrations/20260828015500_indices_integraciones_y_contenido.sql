-- Las relaciones nuevas se consultan desde Marketing y se conservan también
-- para borrados/actualizaciones de perfiles sin escaneos completos.
create index if not exists contenidos_sociales_creado_por_idx
  on public.contenidos_sociales (creado_por);

create index if not exists contenidos_sociales_actualizado_por_idx
  on public.contenidos_sociales (actualizado_por)
  where actualizado_por is not null;

create index if not exists integraciones_google_conectado_por_idx
  on public.integraciones_google (conectado_por)
  where conectado_por is not null;
