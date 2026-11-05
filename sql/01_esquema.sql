-- =====================================================================
--  SISTEMA DE CONTEO DE VOTOS - PROVINCIA DE PASTAZA
--  ELECCIONES SECCIONALES Y CPCCS 2027
--  Script 1/2: ESQUEMA, SEGURIDAD (RLS) Y FUNCIONES
--  Ejecutar en Supabase > SQL Editor (o en cualquier PostgreSQL 15+
--  que tenga el esquema auth de Supabase).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. GEOGRAFÍA ELECTORAL (según Distributivo de Recintos del CNE)
-- ---------------------------------------------------------------------
create table if not exists public.canton (
  id      integer primary key,              -- código CNE del cantón
  nombre  text not null
);

create table if not exists public.parroquia (
  id         integer primary key,           -- código CNE de la parroquia
  canton_id  integer not null references public.canton(id),
  nombre     text not null,
  tipo       text not null default 'RURAL' check (tipo in ('URBANA','RURAL'))
);

create table if not exists public.zona (
  id            serial primary key,
  parroquia_id  integer not null references public.parroquia(id),
  codigo        integer not null,           -- código CNE de la zona (0 = sin zona)
  nombre        text,
  unique (parroquia_id, codigo)
);

create table if not exists public.recinto (
  id                      integer primary key,   -- código CNE del recinto
  zona_id                 integer not null references public.zona(id),
  nombre                  text not null,
  direccion               text,
  telefono                text,
  cda                     boolean not null default false,
  electores               integer not null default 0,
  num_juntas              integer not null default 0,
  latitud                 numeric,
  longitud                numeric,
  contingencia_codigo     integer,
  contingencia_nombre     text,
  contingencia_direccion  text,
  contingencia_distancia  text,
  contingencia_tiempo     text,
  contingencia_telefono   text
);

create table if not exists public.junta (
  id                     serial primary key,
  recinto_id             integer not null references public.recinto(id),
  numero                 integer not null,
  sexo                   char(1) not null check (sexo in ('F','M')),
  electores              integer,
  -- true = electores repartidos en partes iguales a partir del total del recinto.
  -- Cambiar a false cuando se cargue el padrón real por junta.
  electores_referencial  boolean not null default true,
  unique (recinto_id, sexo, numero)
);

-- ---------------------------------------------------------------------
-- 2. DIGNIDADES, ORGANIZACIONES Y CANDIDATURAS
-- ---------------------------------------------------------------------
create table if not exists public.dignidad (
  id      serial primary key,
  codigo  text not null unique,
  nombre  text not null,
  -- NACIONAL / PROVINCIAL: misma papeleta en toda la provincia
  -- CANTONAL: por cantón (alcaldes)
  -- CANTONAL_URBANA / CANTONAL_RURAL: concejales por circunscripción
  -- PARROQUIAL_RURAL: vocales de juntas parroquiales rurales
  ambito  text not null check (ambito in ('NACIONAL','PROVINCIAL','CANTONAL',
                                          'CANTONAL_URBANA','CANTONAL_RURAL','PARROQUIAL_RURAL')),
  orden   integer not null default 0,
  activa  boolean not null default true
);

create table if not exists public.organizacion (
  id      serial primary key,
  lista   text,                       -- número de lista
  sigla   text,
  nombre  text not null,
  color   text not null default '#64748b'
);

-- Una "candidatura" es cada opción que aparece en el acta:
-- un binomio (prefectura), un candidato (alcaldía / CPCCS) o una lista (concejales, vocales).
create table if not exists public.candidatura (
  id               serial primary key,
  dignidad_id      integer not null references public.dignidad(id),
  organizacion_id  integer references public.organizacion(id),
  nombre           text not null,
  canton_id        integer references public.canton(id),
  parroquia_id     integer references public.parroquia(id),
  orden            integer not null default 0,
  activa           boolean not null default true
);
create index if not exists idx_candidatura_dignidad on public.candidatura(dignidad_id);

-- ---------------------------------------------------------------------
-- 3. USUARIOS (perfil enlazado a Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.perfil (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nombre     text,
  rol        text not null default 'PENDIENTE'
             check (rol in ('ADMIN','DIGITADOR','VISUALIZADOR','PENDIENTE')),
  canton_id  integer references public.canton(id),   -- opcional: limita al digitador a un cantón
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. ACTAS Y VOTOS
-- ---------------------------------------------------------------------
create table if not exists public.acta (
  id             bigserial primary key,
  junta_id       integer not null references public.junta(id),
  dignidad_id    integer not null references public.dignidad(id),
  sufragantes    integer not null check (sufragantes >= 0),
  blancos        integer not null default 0 check (blancos >= 0),
  nulos          integer not null default 0 check (nulos >= 0),
  total_validos  integer not null default 0,
  estado         text not null default 'INGRESADA'
                 check (estado in ('INGRESADA','INCONSISTENTE','VALIDADA')),
  novedades      text[] not null default '{}',
  observacion    text,
  digitado_por   uuid references auth.users(id),
  digitado_en    timestamptz not null default now(),
  validado_por   uuid references auth.users(id),
  validado_en    timestamptz,
  unique (junta_id, dignidad_id)
);
create index if not exists idx_acta_dignidad on public.acta(dignidad_id, estado);

create table if not exists public.acta_voto (
  acta_id         bigint  not null references public.acta(id) on delete cascade,
  candidatura_id  integer not null references public.candidatura(id),
  votos           integer not null check (votos >= 0),
  primary key (acta_id, candidatura_id)
);
create index if not exists idx_acta_voto_cand on public.acta_voto(candidatura_id);

-- Bitácora de auditoría: cada ingreso, corrección, validación o eliminación
create table if not exists public.acta_historial (
  id             bigserial primary key,
  acta_id        bigint,
  junta_id       integer,
  dignidad_id    integer,
  accion         text not null,
  datos          jsonb,
  usuario        uuid,
  usuario_email  text,
  fecha          timestamptz not null default now()
);

-- =====================================================================
-- 5. FUNCIONES DE APOYO
-- =====================================================================

-- Crea el perfil automáticamente cuando se registra un usuario en Auth
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfil (user_id, email, nombre)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Usuarios que ya existían antes de correr este script
insert into public.perfil (user_id, email, nombre)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (user_id) do nothing;

-- Rol del usuario conectado ('PENDIENTE' si no tiene perfil o está inactivo)
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when p.activo then p.rol else 'PENDIENTE' end
       from public.perfil p where p.user_id = auth.uid()),
    'PENDIENTE')
$$;

-- ¿La dignidad se vota en una parroquia de este tipo?
create or replace function public.dignidad_aplica(p_ambito text, p_tipo_parroquia text)
returns boolean language sql immutable as $$
  select case p_ambito
    when 'CANTONAL_URBANA'  then p_tipo_parroquia = 'URBANA'
    when 'CANTONAL_RURAL'   then p_tipo_parroquia = 'RURAL'
    when 'PARROQUIAL_RURAL' then p_tipo_parroquia = 'RURAL'
    else true
  end
$$;

-- Valida la circunscripción de cada candidatura según el ámbito de la dignidad
create or replace function public.candidatura_validar()
returns trigger language plpgsql as $$
declare v_ambito text; v_tipo text;
begin
  select ambito into v_ambito from public.dignidad where id = new.dignidad_id;
  if v_ambito in ('NACIONAL','PROVINCIAL') then
    new.canton_id := null; new.parroquia_id := null;
  elsif v_ambito in ('CANTONAL','CANTONAL_URBANA','CANTONAL_RURAL') then
    if new.canton_id is null then
      raise exception 'La dignidad requiere indicar el cantón de la candidatura';
    end if;
    new.parroquia_id := null;
  elsif v_ambito = 'PARROQUIAL_RURAL' then
    if new.parroquia_id is null then
      raise exception 'La dignidad requiere indicar la parroquia rural de la candidatura';
    end if;
    select canton_id, tipo into new.canton_id, v_tipo from public.parroquia where id = new.parroquia_id;
    if v_tipo <> 'RURAL' then
      raise exception 'Los vocales solo se eligen en parroquias rurales';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_candidatura_validar on public.candidatura;
create trigger trg_candidatura_validar
  before insert or update on public.candidatura
  for each row execute function public.candidatura_validar();

-- =====================================================================
-- 6. VISTAS
-- =====================================================================
create or replace view public.v_junta with (security_invoker = true) as
select j.id                as junta_id,
       j.numero,
       j.sexo,
       'Junta ' || j.numero || ' ' || case j.sexo when 'F' then 'Femenino' else 'Masculino' end as etiqueta,
       j.electores,
       j.electores_referencial,
       r.id                as recinto_id,
       r.nombre            as recinto,
       z.id                as zona_id,
       z.codigo            as zona_codigo,
       z.nombre            as zona,
       p.id                as parroquia_id,
       p.nombre            as parroquia,
       p.tipo              as parroquia_tipo,
       c.id                as canton_id,
       c.nombre            as canton
from public.junta j
join public.recinto r   on r.id = j.recinto_id
join public.zona z      on z.id = r.zona_id
join public.parroquia p on p.id = z.parroquia_id
join public.canton c    on c.id = p.canton_id;

-- Candidaturas que aparecen en el acta de una junta para una dignidad
create or replace function public.candidaturas_junta(p_junta integer, p_dignidad integer)
returns table (id integer, nombre text, orden integer, organizacion_id integer,
               lista text, sigla text, organizacion text, color text)
language sql stable set search_path = public as $$
  select c.id, c.nombre, c.orden, o.id, o.lista, o.sigla, o.nombre, coalesce(o.color, '#64748b')
  from public.candidatura c
  join public.dignidad d on d.id = c.dignidad_id
  join public.v_junta j  on j.junta_id = p_junta
  left join public.organizacion o on o.id = c.organizacion_id
  where c.dignidad_id = p_dignidad
    and c.activa and d.activa
    and public.dignidad_aplica(d.ambito, j.parroquia_tipo)
    and (   d.ambito in ('NACIONAL','PROVINCIAL')
         or (d.ambito in ('CANTONAL','CANTONAL_URBANA','CANTONAL_RURAL') and c.canton_id = j.canton_id)
         or (d.ambito = 'PARROQUIAL_RURAL' and c.parroquia_id = j.parroquia_id))
  order by c.orden, c.id
$$;

-- Pares junta–dignidad que deben tener acta (la dignidad aplica y hay candidaturas)
create or replace view public.v_junta_dignidad with (security_invoker = true) as
select j.*, d.id as dignidad_id, d.nombre as dignidad, d.orden as dignidad_orden
from public.v_junta j
cross join public.dignidad d
where d.activa
  and public.dignidad_aplica(d.ambito, j.parroquia_tipo)
  and exists (
    select 1 from public.candidatura c
    where c.dignidad_id = d.id and c.activa
      and (   d.ambito in ('NACIONAL','PROVINCIAL')
           or (d.ambito in ('CANTONAL','CANTONAL_URBANA','CANTONAL_RURAL') and c.canton_id = j.canton_id)
           or (d.ambito = 'PARROQUIAL_RURAL' and c.parroquia_id = j.parroquia_id)));

-- Detalle de actas para revisión
create or replace view public.v_acta_detalle with (security_invoker = true) as
select a.id as acta_id, a.estado, a.sufragantes, a.blancos, a.nulos, a.total_validos,
       a.novedades, a.observacion, a.digitado_en, a.validado_en,
       pd.email as digitado_por_email,
       d.id as dignidad_id, d.nombre as dignidad,
       j.junta_id, j.etiqueta, j.electores, j.recinto, j.parroquia, j.parroquia_id,
       j.canton, j.canton_id
from public.acta a
join public.dignidad d on d.id = a.dignidad_id
join public.v_junta j  on j.junta_id = a.junta_id
left join public.perfil pd on pd.user_id = a.digitado_por;

-- Avance de escrutinio por dignidad
create or replace view public.v_avance with (security_invoker = true) as
select jd.dignidad_id, jd.dignidad, jd.dignidad_orden,
       count(*)                                          as juntas_total,
       count(a.id)                                       as actas_ingresadas,
       count(a.id) filter (where a.estado = 'VALIDADA')      as actas_validadas,
       count(a.id) filter (where a.estado = 'INCONSISTENTE') as actas_inconsistentes
from public.v_junta_dignidad jd
left join public.acta a on a.junta_id = jd.junta_id and a.dignidad_id = jd.dignidad_id
group by jd.dignidad_id, jd.dignidad, jd.dignidad_orden;

-- =====================================================================
-- 7. OPERACIONES (RPC) - toda escritura de actas pasa por aquí
-- =====================================================================
create or replace function public.guardar_acta(
  p_junta        integer,
  p_dignidad     integer,
  p_sufragantes  integer,
  p_blancos      integer,
  p_nulos        integer,
  p_votos        jsonb,          -- [{"candidatura_id": 1, "votos": 120}, ...]
  p_observacion  text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rol      text := public.rol_actual();
  v_perfil   public.perfil%rowtype;
  v_j        record;
  v_d        public.dignidad%rowtype;
  v_acta     public.acta%rowtype;
  v_existe   boolean;
  v_validos  integer;
  v_total    integer;
  v_nov      text[] := '{}';
  v_avisos   text[] := '{}';
  v_estado   text;
begin
  if v_rol not in ('ADMIN','DIGITADOR') then
    raise exception 'Su usuario no tiene permisos para ingresar actas';
  end if;
  select * into v_perfil from public.perfil where user_id = auth.uid();

  select * into v_j from public.v_junta where junta_id = p_junta;
  if not found then raise exception 'La junta % no existe', p_junta; end if;

  if v_rol = 'DIGITADOR' and v_perfil.canton_id is not null and v_perfil.canton_id <> v_j.canton_id then
    raise exception 'Su usuario solo puede digitar actas del cantón asignado';
  end if;

  select * into v_d from public.dignidad where id = p_dignidad and activa;
  if not found then raise exception 'Dignidad no válida'; end if;
  if not public.dignidad_aplica(v_d.ambito, v_j.parroquia_tipo) then
    raise exception 'La dignidad % no se vota en esta junta', v_d.nombre;
  end if;

  if p_sufragantes is null or p_blancos is null or p_nulos is null
     or p_sufragantes < 0 or p_blancos < 0 or p_nulos < 0 then
    raise exception 'Sufragantes, blancos y nulos son obligatorios y no pueden ser negativos';
  end if;
  if p_votos is null or jsonb_typeof(p_votos) <> 'array' then
    raise exception 'Formato de votos inválido';
  end if;
  if not exists (select 1 from public.candidaturas_junta(p_junta, p_dignidad)) then
    raise exception 'No hay candidaturas registradas para % en la circunscripción de esta junta', v_d.nombre;
  end if;
  if exists (select 1 from jsonb_to_recordset(p_votos) x(candidatura_id integer, votos integer)
             where x.candidatura_id is null or x.votos is null or x.votos < 0) then
    raise exception 'Hay votos vacíos o negativos';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_votos) x(candidatura_id integer, votos integer)
             where x.candidatura_id not in (select c.id from public.candidaturas_junta(p_junta, p_dignidad) c)) then
    raise exception 'Hay candidaturas que no corresponden a esta junta y dignidad';
  end if;
  if (select count(*) from jsonb_to_recordset(p_votos) x(candidatura_id integer, votos integer))
     <> (select count(distinct x.candidatura_id) from jsonb_to_recordset(p_votos) x(candidatura_id integer, votos integer)) then
    raise exception 'Hay candidaturas repetidas';
  end if;

  select coalesce(sum(x.votos), 0) into v_validos
  from jsonb_to_recordset(p_votos) x(candidatura_id integer, votos integer);
  v_total := v_validos + p_blancos + p_nulos;

  -- Consistencia numérica del acta
  if v_total <> p_sufragantes then
    v_nov := v_nov || format('La suma de válidos + blancos + nulos (%s) no coincide con el total de sufragantes (%s)',
                             v_total, p_sufragantes);
  end if;
  if v_j.electores is not null and p_sufragantes > v_j.electores then
    if v_j.electores_referencial then
      v_avisos := v_avisos || format('Los sufragantes (%s) superan el número referencial de electores de la junta (%s). Verifique con el padrón.',
                                     p_sufragantes, v_j.electores);
    else
      v_nov := v_nov || format('Los sufragantes (%s) superan los electores de la junta (%s)',
                               p_sufragantes, v_j.electores);
    end if;
  end if;
  v_estado := case when cardinality(v_nov) > 0 then 'INCONSISTENTE' else 'INGRESADA' end;

  select * into v_acta from public.acta
   where junta_id = p_junta and dignidad_id = p_dignidad for update;
  v_existe := found;

  if v_existe and v_acta.estado = 'VALIDADA' and v_rol <> 'ADMIN' then
    raise exception 'El acta ya fue validada; solo un administrador puede modificarla';
  end if;
  if v_existe and v_rol = 'DIGITADOR' and v_acta.digitado_por is distinct from auth.uid() then
    raise exception 'Esta acta ya fue ingresada por otro usuario; solicite la corrección al administrador';
  end if;

  if v_existe then
    update public.acta
       set sufragantes = p_sufragantes, blancos = p_blancos, nulos = p_nulos,
           total_validos = v_validos, estado = v_estado, novedades = v_nov,
           observacion = p_observacion, digitado_por = auth.uid(), digitado_en = now(),
           validado_por = null, validado_en = null
     where id = v_acta.id
     returning * into v_acta;
    delete from public.acta_voto where acta_id = v_acta.id;
  else
    insert into public.acta (junta_id, dignidad_id, sufragantes, blancos, nulos, total_validos,
                             estado, novedades, observacion, digitado_por)
    values (p_junta, p_dignidad, p_sufragantes, p_blancos, p_nulos, v_validos,
            v_estado, v_nov, p_observacion, auth.uid())
    returning * into v_acta;
  end if;

  insert into public.acta_voto (acta_id, candidatura_id, votos)
  select v_acta.id, x.candidatura_id, x.votos
  from jsonb_to_recordset(p_votos) x(candidatura_id integer, votos integer);

  -- Candidaturas no enviadas se registran con 0 votos
  insert into public.acta_voto (acta_id, candidatura_id, votos)
  select v_acta.id, c.id, 0 from public.candidaturas_junta(p_junta, p_dignidad) c
  on conflict do nothing;

  insert into public.acta_historial (acta_id, junta_id, dignidad_id, accion, datos, usuario, usuario_email)
  values (v_acta.id, p_junta, p_dignidad,
          case when v_existe then 'CORRECCION' else 'INGRESO' end,
          jsonb_build_object('sufragantes', p_sufragantes, 'blancos', p_blancos, 'nulos', p_nulos,
                             'votos', p_votos, 'estado', v_estado, 'observacion', p_observacion),
          auth.uid(), v_perfil.email);

  return jsonb_build_object('acta_id', v_acta.id, 'estado', v_estado,
                            'novedades', to_jsonb(v_nov), 'avisos', to_jsonb(v_avisos),
                            'total_validos', v_validos);
end $$;

-- Validar (o reabrir) un acta: solo administradores
create or replace function public.validar_acta(p_acta bigint, p_validar boolean default true, p_observacion text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_acta public.acta%rowtype; v_email text;
begin
  if public.rol_actual() <> 'ADMIN' then
    raise exception 'Solo un administrador puede validar actas';
  end if;
  select email into v_email from public.perfil where user_id = auth.uid();
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

-- Eliminar un acta (p. ej. ingresada en la junta equivocada): solo administradores
create or replace function public.eliminar_acta(p_acta bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acta public.acta%rowtype; v_email text;
begin
  if public.rol_actual() <> 'ADMIN' then
    raise exception 'Solo un administrador puede eliminar actas';
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indique el motivo'; end if;
  select email into v_email from public.perfil where user_id = auth.uid();
  delete from public.acta where id = p_acta returning * into v_acta;
  if not found then raise exception 'Acta no encontrada'; end if;
  insert into public.acta_historial (acta_id, junta_id, dignidad_id, accion, datos, usuario, usuario_email)
  values (v_acta.id, v_acta.junta_id, v_acta.dignidad_id, 'ELIMINACION',
          jsonb_build_object('motivo', p_motivo, 'sufragantes', v_acta.sufragantes,
                             'blancos', v_acta.blancos, 'nulos', v_acta.nulos),
          auth.uid(), v_email);
end $$;

-- Resultados consolidados por dignidad, con filtros opcionales de cantón y parroquia
create or replace function public.resultados(
  p_dignidad integer, p_canton integer default null, p_parroquia integer default null,
  p_incluir_inconsistentes boolean default false)
returns jsonb language sql stable set search_path = public as $$
  with jd as (
    select * from public.v_junta_dignidad
    where dignidad_id = p_dignidad
      and (p_canton is null or canton_id = p_canton)
      and (p_parroquia is null or parroquia_id = p_parroquia)
  ), ac as (
    select a.* from public.acta a join jd on jd.junta_id = a.junta_id
    where a.dignidad_id = p_dignidad
  ), acc as (
    select * from ac
    where estado in ('INGRESADA','VALIDADA') or (p_incluir_inconsistentes and estado = 'INCONSISTENTE')
  ), votos as (
    select v.candidatura_id, sum(v.votos)::bigint as votos
    from public.acta_voto v join acc on acc.id = v.acta_id
    group by v.candidatura_id
  ), cand as (
    select c.id, c.nombre, c.orden, o.lista, o.sigla, o.nombre as organizacion,
           coalesce(o.color, '#64748b') as color, ca.nombre as canton, pa.nombre as parroquia,
           coalesce(vt.votos, 0) as votos
    from public.candidatura c
    left join public.organizacion o on o.id = c.organizacion_id
    left join public.canton ca on ca.id = c.canton_id
    left join public.parroquia pa on pa.id = c.parroquia_id
    left join votos vt on vt.candidatura_id = c.id
    where c.dignidad_id = p_dignidad and c.activa
      and (p_canton is null or c.canton_id is null or c.canton_id = p_canton)
      and (p_parroquia is null or c.parroquia_id is null or c.parroquia_id = p_parroquia)
  )
  select jsonb_build_object(
    'juntas_total',          (select count(*) from jd),
    'electores_total',       (select coalesce(sum(electores), 0) from jd),
    'electores_contabilizados', (select coalesce(sum(jd.electores), 0) from jd join acc on acc.junta_id = jd.junta_id),
    'actas_ingresadas',      (select count(*) from ac),
    'actas_contabilizadas',  (select count(*) from acc),
    'actas_validadas',       (select count(*) from ac where estado = 'VALIDADA'),
    'actas_inconsistentes',  (select count(*) from ac where estado = 'INCONSISTENTE'),
    'sufragantes',           (select coalesce(sum(sufragantes), 0) from acc),
    'validos',               (select coalesce(sum(total_validos), 0) from acc),
    'blancos',               (select coalesce(sum(blancos), 0) from acc),
    'nulos',                 (select coalesce(sum(nulos), 0) from acc),
    'candidaturas',          coalesce((select jsonb_agg(to_jsonb(cand) order by cand.votos desc, cand.orden, cand.id) from cand), '[]'::jsonb)
  )
$$;

-- =====================================================================
-- 8. SEGURIDAD: ROW LEVEL SECURITY
-- =====================================================================
alter table public.canton         enable row level security;
alter table public.parroquia      enable row level security;
alter table public.zona           enable row level security;
alter table public.recinto        enable row level security;
alter table public.junta          enable row level security;
alter table public.dignidad       enable row level security;
alter table public.organizacion   enable row level security;
alter table public.candidatura    enable row level security;
alter table public.perfil         enable row level security;
alter table public.acta           enable row level security;
alter table public.acta_voto      enable row level security;
alter table public.acta_historial enable row level security;

do $$
declare t text;
begin
  -- Lectura para cualquier usuario con rol asignado
  foreach t in array array['canton','parroquia','zona','recinto','junta','dignidad',
                           'organizacion','candidatura','acta','acta_voto'] loop
    execute format('drop policy if exists lectura on public.%I', t);
    execute format($p$create policy lectura on public.%I for select to authenticated
                     using (public.rol_actual() in ('ADMIN','DIGITADOR','VISUALIZADOR'))$p$, t);
  end loop;
  -- Escritura directa solo para administradores (las actas se escriben por RPC)
  foreach t in array array['parroquia','junta','dignidad','organizacion','candidatura'] loop
    execute format('drop policy if exists admin_escribe on public.%I', t);
    execute format($p$create policy admin_escribe on public.%I for all to authenticated
                     using (public.rol_actual() = 'ADMIN') with check (public.rol_actual() = 'ADMIN')$p$, t);
  end loop;
end $$;

drop policy if exists perfil_lectura on public.perfil;
create policy perfil_lectura on public.perfil for select to authenticated
  using (user_id = auth.uid() or public.rol_actual() = 'ADMIN');
drop policy if exists perfil_admin on public.perfil;
create policy perfil_admin on public.perfil for update to authenticated
  using (public.rol_actual() = 'ADMIN') with check (public.rol_actual() = 'ADMIN');

drop policy if exists historial_admin on public.acta_historial;
create policy historial_admin on public.acta_historial for select to authenticated
  using (public.rol_actual() = 'ADMIN');

-- Un administrador no puede quitarse a sí mismo el rol (evita quedarse sin administradores)
create or replace function public.perfil_proteger()
returns trigger language plpgsql as $$
begin
  if old.user_id = auth.uid() and (new.rol <> 'ADMIN' or not new.activo) and old.rol = 'ADMIN' then
    raise exception 'No puede quitarse a sí mismo el rol de administrador';
  end if;
  return new;
end $$;
drop trigger if exists trg_perfil_proteger on public.perfil;
create trigger trg_perfil_proteger before update on public.perfil
  for each row execute function public.perfil_proteger();

-- =====================================================================
-- 9. PERMISOS
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke execute on function public.guardar_acta(integer, integer, integer, integer, integer, jsonb, text),
                           public.validar_acta(bigint, boolean, text),
                           public.eliminar_acta(bigint, text),
                           public.resultados(integer, integer, integer, boolean),
                           public.candidaturas_junta(integer, integer)
  from anon, public;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.organizacion, public.candidatura, public.dignidad to authenticated;
grant update on public.parroquia, public.junta, public.perfil to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.rol_actual(), public.dignidad_aplica(text, text),
                          public.candidaturas_junta(integer, integer),
                          public.guardar_acta(integer, integer, integer, integer, integer, jsonb, text),
                          public.validar_acta(bigint, boolean, text),
                          public.eliminar_acta(bigint, text),
                          public.resultados(integer, integer, integer, boolean)
  to authenticated;
