-- Migración: un acta inconsistente (con novedades) ya no se puede validar.
-- Antes, al validarla pasaba a VALIDADA y se sumaba a los resultados aunque tuviera descuadre.
-- Ejecutar completo en Supabase > SQL Editor. Se puede volver a ejecutar.

create or replace function public.validar_acta(p_acta bigint, p_validar boolean default true, p_observacion text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_acta public.acta%rowtype; v_email text;
begin
  if public.rol_actual() <> 'ADMIN' then
    raise exception 'Solo un administrador puede validar actas';
  end if;
  select email into v_email from public.perfil where user_id = auth.uid();
  -- Un acta con novedades (descuadre, sufragantes > electores) nunca se suma: hay que corregirla, no validarla
  if p_validar and exists (select 1 from public.acta a where a.id = p_acta and cardinality(a.novedades) > 0) then
    raise exception 'No se puede validar un acta inconsistente. Corrija los datos del acta para que cuadre.';
  end if;
  if p_validar then
    update public.acta
       set estado = 'VALIDADA', validado_por = auth.uid(), validado_en = now(),
           observacion = coalesce(p_observacion, observacion)
     where id = p_acta returning * into v_acta;
  else
    update public.acta
       set estado = case when cardinality(novedades) > 0 then 'INCONSISTENTE' else 'INGRESADA' end,
           validado_por = null, validado_en = null,
           observacion = coalesce(p_observacion, observacion)
     where id = p_acta returning * into v_acta;
  end if;
  if not found then raise exception 'Acta no encontrada'; end if;
  insert into public.acta_historial (acta_id, junta_id, dignidad_id, accion, datos, usuario, usuario_email)
  values (v_acta.id, v_acta.junta_id, v_acta.dignidad_id,
          case when p_validar then 'VALIDACION' else 'REAPERTURA' end,
          jsonb_build_object('observacion', p_observacion), auth.uid(), v_email);
  return jsonb_build_object('acta_id', v_acta.id, 'estado', v_acta.estado);
end $$;

-- Actas que ya se validaron estando inconsistentes: vuelven a INCONSISTENTE (queda en la bitácora)
with reab as (
  update public.acta set estado = 'INCONSISTENTE', validado_por = null, validado_en = null
   where estado = 'VALIDADA' and cardinality(novedades) > 0
  returning id, junta_id, dignidad_id
)
insert into public.acta_historial (acta_id, junta_id, dignidad_id, accion, datos, usuario_email)
select id, junta_id, dignidad_id, 'REAPERTURA',
       jsonb_build_object('motivo', 'Migración 04: acta inconsistente no puede estar validada'), 'sistema'
  from reab;

-- Cuántas actas se reabrieron (0 es lo normal)
select count(*) as actas_reabiertas from public.acta_historial
 where accion = 'REAPERTURA' and datos->>'motivo' like 'Migración 04%';
