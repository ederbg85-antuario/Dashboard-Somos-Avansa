-- Los administradores pueden intervenir en cualquier conversación visible.
-- La firma conserva el usuario exacto que envió el mensaje desde el panel.
drop policy if exists "asesor firma sus respuestas" on public.respuestas;
drop policy if exists "equipo firma sus respuestas" on public.respuestas;

create policy "equipo firma sus respuestas"
  on public.respuestas for insert to authenticated
  with check (
    (private.es_admin() or private.es_asesor())
    and autor_id = (select auth.uid())
    and private.puede_ver_conversacion(conversacion_id)
  );
