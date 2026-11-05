// =====================================================================
//  SISTEMA DE CONTEO DE VOTOS - PASTAZA 2027
//  Aplicación web (HTML + JavaScript) conectada a Supabase
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TITULO, SUBTITULO, REFRESCO_SEGUNDOS } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-EC');
const pct = (a, b) => (b ? (100 * a / b) : 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const hora = () => new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const ESTADO_TXT = { PENDIENTE: 'Pendiente', INGRESADA: 'Ingresada', INCONSISTENTE: 'Inconsistente', VALIDADA: 'Validada' };
const ROL_TXT = { ADMIN: 'Administrador', DIGITADOR: 'Digitador', VISUALIZADOR: 'Visualización', PENDIENTE: 'Pendiente' };
const AMBITO_TXT = {
  NACIONAL: 'Toda la provincia', PROVINCIAL: 'Provincial', CANTONAL: 'Por cantón',
  CANTONAL_URBANA: 'Cantón – zona urbana', CANTONAL_RURAL: 'Cantón – zona rural', PARROQUIAL_RURAL: 'Por parroquia rural',
};
const estadoBadge = (e) => `<span class="estado ${esc(e)}">${esc(ESTADO_TXT[e] || e)}</span>`;

function traducirError(m = '') {
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'El correo aún no ha sido confirmado.';
  if (/violates foreign key/i.test(m)) return 'No se puede eliminar: el registro está siendo usado (por ejemplo, ya tiene votos o candidaturas). Desactívelo en su lugar.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor. Revise su internet e intente de nuevo.';
  if (/JWT expired/i.test(m)) return 'Su sesión expiró. Vuelva a ingresar.';
  return m;
}
async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(traducirError(error.message));
  return data;
}
function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'mal' ? 7000 : 4000);
}
function modal(html) {
  return new Promise((resolve) => {
    const f = document.createElement('div');
    f.className = 'modal-fondo';
    f.innerHTML = `<form class="modal">${html}<div class="acciones"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primario">Aceptar</button></div></form>`;
    document.body.appendChild(f);
    const form = $('form', f);
    const cerrar = (v) => { f.remove(); resolve(v); };
    $('[data-x]', f).onclick = () => cerrar(null);
    form.onsubmit = (e) => { e.preventDefault(); cerrar(Object.fromEntries(new FormData(form))); };
    const primero = $('input, textarea, select', form);
    if (primero) primero.focus();
  });
}
const opciones = (lista, valor, vacio) =>
  (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') +
  lista.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(valor ?? '') ? 'selected' : ''}>${esc(o.t)}</option>`).join('');

// ---------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------
const S = {
  session: null, perfil: null,
  cantones: [], parroquias: [], juntas: [], dignidades: [], organizaciones: [],
  vista: null, timer: null,
  r: { dignidad: null, canton: '', parroquia: '', incons: false, ultimo: null },
  d: { canton: '', parroquia: '', recinto: '', junta: '', dignidad: null },
  a: { sub: 'actas', estado: 'INCONSISTENTE', dignidad: '', canton: '', candDignidad: null },
};
const esRol = (...r) => S.perfil && r.includes(S.perfil.rol);
const dignidad = (id) => S.dignidades.find((d) => d.id === Number(id));
const parroquiasDe = (canton, tipo) => S.parroquias.filter((p) => (!canton || p.canton_id === Number(canton)) && (!tipo || p.tipo === tipo));
const tipoParroquiaPara = (ambito) => ({ CANTONAL_URBANA: 'URBANA', CANTONAL_RURAL: 'RURAL', PARROQUIAL_RURAL: 'RURAL' }[ambito] || null);

// ---------------------------------------------------------------------
// Arranque y sesión
// ---------------------------------------------------------------------
async function init() {
  document.title = TITULO;
  if (SUPABASE_URL.includes('TU-PROYECTO')) {
    $('#app').innerHTML = `<div class="login-caja"><div class="panel"><div class="franja"></div><h1>Falta configurar</h1>
      <p>Edite <code>web/js/config.js</code> y coloque la URL y la <i>anon public key</i> de su proyecto Supabase.</p></div></div>`;
    return;
  }
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') { S.session = null; S.perfil = null; detenerRefresco(); renderLogin(); }
  });
  const { data } = await sb.auth.getSession();
  if (data && data.session) await iniciarSesion(data.session);
  else renderLogin();
}

function renderLogin(msg = '') {
  $('#app').innerHTML = `
    <div class="login-caja">
      <form class="panel" id="f-login">
        <div class="franja"></div>
        <div><h1>${esc(TITULO)}</h1><small>${esc(SUBTITULO)}</small></div>
        ${msg ? `<div class="alerta mal">${esc(msg)}</div>` : ''}
        <label>Correo electrónico <input type="email" name="email" required autocomplete="username"></label>
        <label>Contraseña <input type="password" name="password" required autocomplete="current-password"></label>
        <button class="btn primario" id="b-login">Ingresar</button>
        <small>Acceso solo para usuarios autorizados. Toda acción queda registrada.</small>
      </form>
    </div>`;
  $('#f-login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#b-login').disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('password') });
    if (error) return renderLogin(traducirError(error.message));
    await iniciarSesion(data.session);
  };
}

async function iniciarSesion(session) {
  S.session = session;
  try {
    S.perfil = await q(sb.from('perfil').select('*').eq('user_id', session.user.id).maybeSingle());
  } catch (e) { return renderLogin(e.message); }
  if (!S.perfil || S.perfil.rol === 'PENDIENTE' || !S.perfil.activo) {
    $('#app').innerHTML = `<div class="login-caja"><div class="panel"><div class="franja"></div>
      <h1>Acceso pendiente</h1>
      <p>Su usuario <b>${esc(session.user.email)}</b> aún no tiene un rol asignado o está desactivado. Solicite al administrador del sistema que le asigne el rol de digitador o de visualización.</p>
      <button class="btn" id="b-salir">Salir</button></div></div>`;
    $('#b-salir').onclick = () => sb.auth.signOut();
    return;
  }
  try { await cargarCatalogos(); } catch (e) { toast(e.message, 'mal'); }
  if (S.perfil.canton_id) S.d.canton = String(S.perfil.canton_id);
  renderMarco();
  irA(esRol('DIGITADOR') ? 'digitacion' : 'resultados');
}

async function cargarCatalogos() {
  const [cantones, parroquias, juntas, dignidades, organizaciones] = await Promise.all([
    q(sb.from('canton').select('*').order('nombre')),
    q(sb.from('parroquia').select('*').order('nombre')),
    q(sb.from('v_junta').select('*').order('recinto').order('sexo').order('numero').limit(5000)),
    q(sb.from('dignidad').select('*').eq('activa', true).order('orden')),
    q(sb.from('organizacion').select('*').order('lista')),
  ]);
  Object.assign(S, { cantones, parroquias, juntas, dignidades, organizaciones });
  if (!S.r.dignidad && dignidades.length) S.r.dignidad = dignidades[0].id;
}

function renderMarco() {
  const tabs = [['resultados', 'Resultados']];
  if (esRol('ADMIN', 'DIGITADOR')) tabs.push(['digitacion', 'Digitación de actas']);
  if (esRol('ADMIN')) tabs.push(['admin', 'Administración']);
  $('#app').innerHTML = `
    <header class="barra-sup">
      <div class="marca"><b>${esc(TITULO)}</b><span>${esc(SUBTITULO)}</span></div>
      <nav class="pestanas">${tabs.map(([v, t]) => `<button data-vista="${v}">${t}</button>`).join('')}</nav>
      <div class="usuario"><span class="correo">${esc(S.perfil.nombre || S.perfil.email)}</span>
        <span class="rol">${esc(ROL_TXT[S.perfil.rol])}</span><button id="b-salir">Salir</button></div>
    </header>
    <main id="vista"></main>`;
  $$('nav.pestanas button').forEach((b) => (b.onclick = () => irA(b.dataset.vista)));
  $('#b-salir').onclick = () => sb.auth.signOut();
}

function irA(vista) {
  S.vista = vista;
  detenerRefresco();
  $$('nav.pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  if (vista === 'resultados') vistaResultados();
  else if (vista === 'digitacion') vistaDigitacion();
  else if (vista === 'admin') vistaAdmin();
}
function detenerRefresco() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

// =====================================================================
//  RESULTADOS (todos los roles)
// =====================================================================
function vistaResultados() {
  $('#vista').innerHTML = `
    <section class="panel">
      <div class="chips" id="r-dign"></div>
      <div class="fila">
        <label>Cantón <select id="r-canton"></select></label>
        <label>Parroquia <select id="r-parroquia"></select></label>
        <label class="check"><input type="checkbox" id="r-incons"> Incluir actas inconsistentes</label>
        <span class="sello" id="r-sello"></span>
        <button class="btn" id="r-act">Actualizar</button>
        <button class="btn" id="r-csv">Descargar CSV</button>
      </div>
    </section>
    <section class="kpis" id="r-kpis"></section>
    <section class="panel"><h2 id="r-titulo">Resultados</h2><div id="r-barras" class="barras"></div></section>
    <section class="panel"><h2>Avance del escrutinio por dignidad</h2><div id="r-avance" class="tabla-cont"></div></section>`;
  $('#r-incons').checked = S.r.incons;
  $('#r-incons').onchange = (e) => { S.r.incons = e.target.checked; cargarResultados(); };
  $('#r-act').onclick = () => cargarResultados();
  $('#r-csv').onclick = descargarCSV;
  pintarFiltrosResultados();
  cargarResultados();
  S.timer = setInterval(() => { if (!document.hidden) cargarResultados(true); }, REFRESCO_SEGUNDOS * 1000);
}

function pintarFiltrosResultados() {
  $('#r-dign').innerHTML = S.dignidades.map((d) =>
    `<button class="chip ${d.id === S.r.dignidad ? 'activa' : ''}" data-id="${d.id}">${esc(d.nombre)}</button>`).join('');
  $$('#r-dign .chip').forEach((b) => (b.onclick = () => {
    S.r.dignidad = Number(b.dataset.id);
    const tipo = tipoParroquiaPara(dignidad(S.r.dignidad).ambito);
    if (S.r.parroquia && tipo && S.parroquias.find((p) => p.id === Number(S.r.parroquia))?.tipo !== tipo) S.r.parroquia = '';
    pintarFiltrosResultados(); cargarResultados();
  }));
  const d = dignidad(S.r.dignidad) || {};
  const cantonObligatorio = d.ambito && !['NACIONAL', 'PROVINCIAL'].includes(d.ambito);
  $('#r-canton').innerHTML = opciones(S.cantones.map((c) => ({ v: c.id, t: c.nombre })), S.r.canton,
    cantonObligatorio ? '— Seleccione —' : 'Toda la provincia');
  $('#r-parroquia').innerHTML = opciones(parroquiasDe(S.r.canton, tipoParroquiaPara(d.ambito)).map((p) => ({ v: p.id, t: `${p.nombre}${p.tipo === 'URBANA' ? ' (urbana)' : ''}` })),
    S.r.parroquia, d.ambito === 'PARROQUIAL_RURAL' ? '— Seleccione —' : 'Todas');
  $('#r-parroquia').disabled = !S.r.canton;
  $('#r-canton').onchange = (e) => { S.r.canton = e.target.value; S.r.parroquia = ''; pintarFiltrosResultados(); cargarResultados(); };
  $('#r-parroquia').onchange = (e) => { S.r.parroquia = e.target.value; cargarResultados(); };
}

async function cargarResultados(silencioso = false) {
  const d = dignidad(S.r.dignidad);
  if (!d) { $('#r-barras').innerHTML = '<div class="vacio">No hay dignidades configuradas.</div>'; return; }
  const falta = (!['NACIONAL', 'PROVINCIAL'].includes(d.ambito) && !S.r.canton) ? 'cantón'
    : (d.ambito === 'PARROQUIAL_RURAL' && !S.r.parroquia) ? 'parroquia rural' : null;
  $('#r-titulo').textContent = d.nombre + (S.r.canton ? ' · ' + S.cantones.find((c) => c.id === Number(S.r.canton))?.nombre : ' · Provincia de Pastaza')
    + (S.r.parroquia ? ' · ' + S.parroquias.find((p) => p.id === Number(S.r.parroquia))?.nombre : '');
  cargarAvance();
  if (falta) {
    $('#r-kpis').innerHTML = '';
    $('#r-barras').innerHTML = `<div class="vacio">Seleccione un ${falta} para ver los resultados de esta dignidad.</div>`;
    S.r.ultimo = null;
    return;
  }
  try {
    const r = await q(sb.rpc('resultados', {
      p_dignidad: d.id, p_canton: S.r.canton ? Number(S.r.canton) : null,
      p_parroquia: S.r.parroquia ? Number(S.r.parroquia) : null, p_incluir_inconsistentes: S.r.incons,
    }));
    S.r.ultimo = { r, d };
    pintarResultados(r);
    $('#r-sello').textContent = 'Actualizado ' + hora();
  } catch (e) { if (!silencioso) toast(e.message, 'mal'); }
}

function pintarResultados(r) {
  const avance = r.juntas_total ? r.actas_contabilizadas / r.juntas_total : 0;
  $('#r-kpis').innerHTML = `
    <div class="kpi"><small>Actas contabilizadas</small><b>${pct(r.actas_contabilizadas, r.juntas_total)}</b>
      <span>${fmt(r.actas_contabilizadas)} de ${fmt(r.juntas_total)} juntas</span><div class="progreso"><div style="width:${(avance * 100).toFixed(1)}%"></div></div></div>
    <div class="kpi"><small>Sufragantes</small><b>${fmt(r.sufragantes)}</b><span>Participación ${pct(r.sufragantes, r.electores_contabilizados)}</span></div>
    <div class="kpi"><small>Votos válidos</small><b>${fmt(r.validos)}</b><span>${pct(r.validos, r.sufragantes)} de sufragantes</span></div>
    <div class="kpi"><small>Votos blancos</small><b>${fmt(r.blancos)}</b><span>${pct(r.blancos, r.sufragantes)}</span></div>
    <div class="kpi"><small>Votos nulos</small><b>${fmt(r.nulos)}</b><span>${pct(r.nulos, r.sufragantes)}</span></div>
    <div class="kpi"><small>Actas con novedad</small><b>${fmt(r.actas_inconsistentes)}</b><span>${fmt(r.actas_validadas)} validadas</span></div>`;
  const c = r.candidaturas || [];
  if (!c.length) { $('#r-barras').innerHTML = '<div class="vacio">No hay candidaturas registradas para este filtro.</div>'; return; }
  const max = Math.max(...c.map((x) => x.votos), 1);
  $('#r-barras').innerHTML = c.map((x, i) => `
    <div class="barra ${i === 0 && x.votos > 0 ? 'lider' : ''}">
      <div class="barra-info">
        <span class="lista" style="background:${esc(x.color)}">${esc(x.lista || '–')}</span>
        <b title="${esc(x.nombre)}">${esc(x.nombre)}</b>
        <small title="${esc(x.organizacion || '')}">${esc(x.sigla || x.organizacion || '')}${x.parroquia ? ' · ' + esc(x.parroquia) : ''}</small>
      </div>
      <div class="barra-pista"><div class="barra-relleno" style="width:${(100 * x.votos / max).toFixed(2)}%;background:${esc(x.color)}"></div></div>
      <div class="barra-num"><b>${pct(x.votos, r.validos)}</b><small>${fmt(x.votos)} votos</small></div>
    </div>`).join('');
}

async function cargarAvance() {
  try {
    const filas = await q(sb.from('v_avance').select('*').order('dignidad_orden'));
    $('#r-avance').innerHTML = filas.length ? `<table><thead><tr><th>Dignidad</th><th class="num">Juntas</th><th class="num">Ingresadas</th><th class="num">Validadas</th><th class="num">Con novedad</th><th class="num">Avance</th></tr></thead><tbody>
      ${filas.map((f) => `<tr><td>${esc(f.dignidad)}</td><td class="num">${fmt(f.juntas_total)}</td><td class="num">${fmt(f.actas_ingresadas)}</td>
        <td class="num">${fmt(f.actas_validadas)}</td><td class="num">${fmt(f.actas_inconsistentes)}</td><td class="num">${pct(f.actas_ingresadas, f.juntas_total)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="vacio">Aún no hay candidaturas registradas.</div>';
  } catch (e) { /* silencioso */ }
}

function descargarCSV() {
  if (!S.r.ultimo) return toast('No hay resultados para descargar.');
  const { r, d } = S.r.ultimo;
  const lin = [['Dignidad', 'Lista', 'Sigla', 'Organizacion', 'Candidatura', 'Canton', 'Parroquia', 'Votos', 'Porcentaje_validos']];
  for (const x of r.candidaturas) lin.push([d.nombre, x.lista, x.sigla, x.organizacion, x.nombre, x.canton, x.parroquia, x.votos, r.validos ? (100 * x.votos / r.validos).toFixed(4) : 0]);
  lin.push([], ['Validos', r.validos], ['Blancos', r.blancos], ['Nulos', r.nulos], ['Sufragantes', r.sufragantes],
    ['Actas contabilizadas', r.actas_contabilizadas], ['Juntas', r.juntas_total], ['Generado', new Date().toLocaleString('es-EC')]);
  const csv = '﻿' + lin.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `resultados_${d.codigo}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// =====================================================================
//  DIGITACIÓN (ADMIN y DIGITADOR)
// =====================================================================
function vistaDigitacion() {
  $('#vista').innerHTML = `
    <div class="digit">
      <section class="panel">
        <h2>1. Seleccione la junta</h2>
        <div class="selectores">
          <label>Cantón <select id="d-canton"></select></label>
          <label>Parroquia <select id="d-parroquia"></select></label>
          <label>Recinto <select id="d-recinto"></select></label>
          <label>Junta <select id="d-junta"></select></label>
        </div>
        <div id="d-ficha"></div>
        <div id="d-dign"></div>
      </section>
      <section class="panel" id="d-form"><h2>2. Ingrese el acta</h2><div class="vacio">Seleccione una junta y luego la dignidad.</div></section>
    </div>`;
  pintarSelectoresJunta();
}

function pintarSelectoresJunta() {
  const d = S.d;
  const bloqueado = S.perfil.rol === 'DIGITADOR' && S.perfil.canton_id;
  $('#d-canton').innerHTML = opciones(S.cantones.filter((c) => !bloqueado || c.id === S.perfil.canton_id).map((c) => ({ v: c.id, t: c.nombre })), d.canton, '— Cantón —');
  $('#d-parroquia').innerHTML = opciones(parroquiasDe(d.canton).map((p) => ({ v: p.id, t: p.nombre })), d.parroquia, '— Parroquia —');
  const js = S.juntas.filter((j) => String(j.parroquia_id) === String(d.parroquia));
  const recintos = [...new Map(js.map((j) => [j.recinto_id, { v: j.recinto_id, t: `${j.recinto}${j.zona_codigo ? ' (' + j.zona + ')' : ''}` }])).values()]
    .sort((a, b) => a.t.localeCompare(b.t));
  $('#d-recinto').innerHTML = opciones(recintos, d.recinto, '— Recinto —');
  const juntas = js.filter((j) => String(j.recinto_id) === String(d.recinto))
    .sort((a, b) => a.sexo.localeCompare(b.sexo) || a.numero - b.numero);
  $('#d-junta').innerHTML = opciones(juntas.map((j) => ({ v: j.junta_id, t: j.etiqueta })), d.junta, '— Junta —');
  $('#d-parroquia').disabled = !d.canton;
  $('#d-recinto').disabled = !d.parroquia;
  $('#d-junta').disabled = !d.recinto;
  $('#d-canton').onchange = (e) => { Object.assign(d, { canton: e.target.value, parroquia: '', recinto: '', junta: '', dignidad: null }); pintarSelectoresJunta(); };
  $('#d-parroquia').onchange = (e) => { Object.assign(d, { parroquia: e.target.value, recinto: '', junta: '', dignidad: null }); pintarSelectoresJunta(); };
  $('#d-recinto').onchange = (e) => { Object.assign(d, { recinto: e.target.value, junta: '', dignidad: null }); pintarSelectoresJunta(); };
  $('#d-junta').onchange = (e) => { Object.assign(d, { junta: e.target.value, dignidad: null }); pintarSelectoresJunta(); };
  if (d.junta) cargarDignidadesJunta();
  else {
    $('#d-ficha').innerHTML = ''; $('#d-dign').innerHTML = '';
    $('#d-form').innerHTML = '<h2>2. Ingrese el acta</h2><div class="vacio">Seleccione una junta y luego la dignidad.</div>';
  }
}

async function cargarDignidadesJunta(abrirSiguiente = false) {
  const j = S.juntas.find((x) => x.junta_id === Number(S.d.junta));
  if (!j) return;
  $('#d-ficha').innerHTML = `<div class="ficha">
      <span><b>${esc(j.etiqueta)}</b> · ${esc(j.recinto)}</span>
      <small>${esc(j.parroquia)} (${j.parroquia_tipo === 'URBANA' ? 'urbana' : 'rural'}) · ${esc(j.canton)} · Electores ${j.electores_referencial ? 'aprox.' : ''} ${fmt(j.electores)}</small>
    </div>`;
  try {
    const [dign, actas] = await Promise.all([
      q(sb.from('v_junta_dignidad').select('dignidad_id,dignidad,dignidad_orden').eq('junta_id', j.junta_id).order('dignidad_orden')),
      q(sb.from('acta').select('id,dignidad_id,estado').eq('junta_id', j.junta_id)),
    ]);
    const estado = Object.fromEntries(actas.map((a) => [a.dignidad_id, a.estado]));
    if (!dign.length) {
      $('#d-dign').innerHTML = '<div class="alerta aviso" style="margin-top:.8rem">No hay candidaturas registradas para las dignidades de esta junta. El administrador debe cargarlas primero.</div>';
      return;
    }
    if (abrirSiguiente) {
      const sig = dign.find((x) => !estado[x.dignidad_id]);
      if (sig) S.d.dignidad = sig.dignidad_id;
    }
    const hechas = dign.filter((x) => estado[x.dignidad_id]).length;
    $('#d-dign').innerHTML = `<div class="lista-dign"><small>${hechas} de ${dign.length} actas ingresadas en esta junta</small>
      ${dign.map((x) => `<button data-id="${x.dignidad_id}" class="${x.dignidad_id === S.d.dignidad ? 'activa' : ''}">
        <span>${esc(x.dignidad)}</span>${estadoBadge(estado[x.dignidad_id] || 'PENDIENTE')}</button>`).join('')}</div>`;
    $$('#d-dign button').forEach((b) => (b.onclick = () => { S.d.dignidad = Number(b.dataset.id); cargarDignidadesJunta(); }));
    if (S.d.dignidad) abrirFormulario(j, dignidad(S.d.dignidad));
  } catch (e) { toast(e.message, 'mal'); }
}

async function abrirFormulario(j, d) {
  const cont = $('#d-form');
  cont.innerHTML = `<h2>2. ${esc(d.nombre)}</h2><div class="vacio">Cargando…</div>`;
  let cands, acta, votos = [];
  try {
    [cands, acta] = await Promise.all([
      q(sb.rpc('candidaturas_junta', { p_junta: j.junta_id, p_dignidad: d.id })),
      q(sb.from('acta').select('*').eq('junta_id', j.junta_id).eq('dignidad_id', d.id).maybeSingle()),
    ]);
    if (acta) votos = await q(sb.from('acta_voto').select('*').eq('acta_id', acta.id));
  } catch (e) { cont.innerHTML = `<div class="alerta mal">${esc(e.message)}</div>`; return; }
  const vmap = Object.fromEntries(votos.map((v) => [v.candidatura_id, v.votos]));
  const soloLectura = acta && acta.estado === 'VALIDADA' && !esRol('ADMIN');
  const val = (v) => (v === undefined || v === null ? '' : v);

  cont.innerHTML = `
    <h2>2. ${esc(d.nombre)} — ${esc(j.etiqueta)}</h2>
    ${acta ? `<div class="alerta ${acta.estado === 'INCONSISTENTE' ? 'mal' : acta.estado === 'VALIDADA' ? 'ok' : 'info'}">
        Acta ${estadoBadge(acta.estado)} el ${new Date(acta.digitado_en).toLocaleString('es-EC')}.
        ${soloLectura ? 'Solo un administrador puede modificarla.' : 'Si guarda de nuevo, se registrará como corrección.'}
        ${acta.novedades?.length ? `<ul>${acta.novedades.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>` : ''}
    <form class="form-acta" id="f-acta" autocomplete="off">
      <div class="linea-voto total"><div class="nom">Total de sufragantes (firmas del padrón)</div>
        <input type="number" inputmode="numeric" min="0" step="1" name="sufragantes" required value="${val(acta?.sufragantes)}"></div>
      ${cands.map((c) => `<div class="linea-voto"><div class="nom"><span class="lista" style="background:${esc(c.color)}">${esc(c.lista || '–')}</span>
          <span title="${esc(c.organizacion || '')}">${esc(c.nombre)} <small>${esc(c.sigla || '')}</small></span></div>
          <input type="number" inputmode="numeric" min="0" step="1" data-cand="${c.id}" required value="${val(vmap[c.id])}"></div>`).join('')}
      <div class="linea-voto especial"><div class="nom">Votos en blanco</div><input type="number" inputmode="numeric" min="0" step="1" name="blancos" required value="${val(acta?.blancos)}"></div>
      <div class="linea-voto especial"><div class="nom">Votos nulos</div><input type="number" inputmode="numeric" min="0" step="1" name="nulos" required value="${val(acta?.nulos)}"></div>
      <div class="cuadre" id="cuadre"></div>
      <label>Observación (opcional) <input type="text" name="observacion" maxlength="300" value="${esc(acta?.observacion || '')}"></label>
      <div id="f-msg"></div>
      <div class="acciones">
        <button type="button" class="btn" id="b-limpiar">Limpiar</button>
        <button class="btn primario" id="b-guardar">Guardar acta</button>
      </div>
    </form>`;
  const form = $('#f-acta');
  const inputs = $$('input[type=number]', form);
  if (soloLectura) { $$('input, button', form).forEach((x) => (x.disabled = true)); }
  let confirmarDescuadre = false;

  const leer = () => {
    const n = (x) => (x.value === '' ? null : Number(x.value));
    const v = $$('[data-cand]', form).map((x) => ({ candidatura_id: Number(x.dataset.cand), votos: n(x) }));
    return { suf: n(form.sufragantes), bla: n(form.blancos), nul: n(form.nulos), votos: v, obs: form.observacion.value.trim() };
  };
  const cuadre = () => {
    const x = leer();
    const validos = x.votos.reduce((s, v) => s + (v.votos || 0), 0);
    const total = validos + (x.bla || 0) + (x.nul || 0);
    const ok = x.suf !== null && total === x.suf;
    $('#cuadre').innerHTML = `
      <div>Válidos<b>${fmt(validos)}</b></div>
      <div>Válidos + blancos + nulos<b>${fmt(total)}</b></div>
      <div>Sufragantes<b>${x.suf === null ? '—' : fmt(x.suf)}</b></div>
      <div style="background:var(${ok ? '--ok-bg' : '--mal-bg'});color:var(${ok ? '--ok' : '--mal'})">Diferencia<b style="color:inherit">${x.suf === null ? '—' : fmt(total - x.suf)}</b></div>`;
    confirmarDescuadre = false;
    $('#b-guardar').textContent = 'Guardar acta';
    return { ok, x, validos, total };
  };
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', cuadre);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); (inputs[i + 1] || $('#b-guardar')).focus(); }
    });
    inp.addEventListener('focus', () => inp.select());
  });
  $('#b-limpiar').onclick = () => { inputs.forEach((x) => (x.value = '')); cuadre(); inputs[0].focus(); };
  cuadre();
  if (!soloLectura) inputs[0].focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const { ok, x, total } = cuadre_estado();
    const msg = $('#f-msg');
    if (x.suf === null || x.bla === null || x.nul === null || x.votos.some((v) => v.votos === null)) {
      msg.innerHTML = '<div class="alerta mal">Complete todos los campos. Ingrese 0 donde no haya votos.</div>'; return;
    }
    if ([x.suf, x.bla, x.nul, ...x.votos.map((v) => v.votos)].some((n) => !Number.isInteger(n) || n < 0)) {
      msg.innerHTML = '<div class="alerta mal">Solo se admiten números enteros mayores o iguales a cero.</div>'; return;
    }
    if (!ok && !confirmarDescuadre) {
      confirmarDescuadre = true;
      $('#b-guardar').textContent = 'Guardar de todas formas';
      msg.innerHTML = `<div class="alerta aviso">La suma (${fmt(total)}) no coincide con los sufragantes (${fmt(x.suf)}). Revise el acta física. Si los datos son correctos tal como constan en el acta, pulse <b>Guardar de todas formas</b>: quedará marcada como <b>inconsistente</b> para revisión.</div>`;
      return;
    }
    $('#b-guardar').disabled = true;
    try {
      const r = await q(sb.rpc('guardar_acta', {
        p_junta: j.junta_id, p_dignidad: d.id, p_sufragantes: x.suf, p_blancos: x.bla, p_nulos: x.nul,
        p_votos: x.votos, p_observacion: x.obs || null,
      }));
      toast(`Acta de ${d.nombre} guardada (${ESTADO_TXT[r.estado]}).`, r.estado === 'INCONSISTENTE' ? 'mal' : 'ok');
      (r.avisos || []).forEach((a) => toast(a));
      S.d.dignidad = null;
      await cargarDignidadesJunta(true);
      if (!S.d.dignidad) $('#d-form').innerHTML = `<h2>2. Ingrese el acta</h2><div class="alerta ok">Todas las actas de ${esc(j.etiqueta)} están ingresadas. Seleccione la siguiente junta.</div>`;
    } catch (err) {
      msg.innerHTML = `<div class="alerta mal">${esc(err.message)}</div>`;
      $('#b-guardar').disabled = false;
    }
  };
  // conserva la confirmación de descuadre entre el aviso y el segundo clic
  function cuadre_estado() {
    const keep = confirmarDescuadre;
    const r = cuadre();
    confirmarDescuadre = keep;
    if (keep) $('#b-guardar').textContent = 'Guardar de todas formas';
    return r;
  }
}

// =====================================================================
//  ADMINISTRACIÓN (solo ADMIN)
// =====================================================================
const SUBS = [['actas', 'Revisión de actas'], ['usuarios', 'Usuarios'], ['organizaciones', 'Organizaciones políticas'],
  ['candidaturas', 'Candidaturas'], ['parroquias', 'Parroquias'], ['electores', 'Electores por junta']];

function vistaAdmin() {
  $('#vista').innerHTML = `<section class="panel"><div class="subnav">${SUBS.map(([k, t]) => `<button data-sub="${k}">${t}</button>`).join('')}</div><div id="a-cont"></div></section>`;
  $$('.subnav button').forEach((b) => (b.onclick = () => { S.a.sub = b.dataset.sub; pintarAdmin(); }));
  pintarAdmin();
}
function pintarAdmin() {
  $$('.subnav button').forEach((b) => b.classList.toggle('activa', b.dataset.sub === S.a.sub));
  ({ actas: adminActas, usuarios: adminUsuarios, organizaciones: adminOrganizaciones, candidaturas: adminCandidaturas,
    parroquias: adminParroquias, electores: adminElectores })[S.a.sub]();
}

// ---------- Revisión de actas ----------
async function adminActas() {
  const c = $('#a-cont');
  c.innerHTML = `
    <div class="fila" style="margin-bottom:.8rem">
      <label>Estado <select id="aa-estado">${opciones([{ v: 'INCONSISTENTE', t: 'Inconsistentes' }, { v: 'INGRESADA', t: 'Ingresadas' }, { v: 'VALIDADA', t: 'Validadas' }], S.a.estado, 'Todas')}</select></label>
      <label>Dignidad <select id="aa-dign">${opciones(S.dignidades.map((d) => ({ v: d.id, t: d.nombre })), S.a.dignidad, 'Todas')}</select></label>
      <label>Cantón <select id="aa-canton">${opciones(S.cantones.map((x) => ({ v: x.id, t: x.nombre })), S.a.canton, 'Todos')}</select></label>
      <button class="btn" id="aa-act">Actualizar</button>
    </div>
    <div id="aa-tabla" class="tabla-cont"><div class="vacio">Cargando…</div></div>`;
  $('#aa-estado').onchange = (e) => { S.a.estado = e.target.value; adminActas(); };
  $('#aa-dign').onchange = (e) => { S.a.dignidad = e.target.value; adminActas(); };
  $('#aa-canton').onchange = (e) => { S.a.canton = e.target.value; adminActas(); };
  $('#aa-act').onclick = adminActas;
  let consulta = sb.from('v_acta_detalle').select('*').order('digitado_en', { ascending: false }).limit(1000);
  if (S.a.estado) consulta = consulta.eq('estado', S.a.estado);
  if (S.a.dignidad) consulta = consulta.eq('dignidad_id', Number(S.a.dignidad));
  if (S.a.canton) consulta = consulta.eq('canton_id', Number(S.a.canton));
  try {
    const filas = await q(consulta);
    $('#aa-tabla').innerHTML = !filas.length ? '<div class="vacio">No hay actas con este filtro.</div>' : `
      <small>${filas.length} actas${filas.length === 1000 ? ' (se muestran las 1000 más recientes; use los filtros)' : ''}</small>
      <table><thead><tr><th>Junta</th><th>Dignidad</th><th class="num">Sufrag.</th><th class="num">Válidos</th><th class="num">Blancos</th><th class="num">Nulos</th><th>Estado / novedades</th><th>Digitado por</th><th></th></tr></thead><tbody>
      ${filas.map((a) => `<tr>
        <td><b>${esc(a.etiqueta)}</b><br><small>${esc(a.recinto)} · ${esc(a.parroquia)} · ${esc(a.canton)}</small></td>
        <td>${esc(a.dignidad)}</td><td class="num">${fmt(a.sufragantes)}</td><td class="num">${fmt(a.total_validos)}</td>
        <td class="num">${fmt(a.blancos)}</td><td class="num">${fmt(a.nulos)}</td>
        <td>${estadoBadge(a.estado)}${(a.novedades || []).map((n) => `<br><small>${esc(n)}</small>`).join('')}${a.observacion ? `<br><small><i>Obs.: ${esc(a.observacion)}</i></small>` : ''}</td>
        <td><small>${esc(a.digitado_por_email || '')}<br>${new Date(a.digitado_en).toLocaleString('es-EC')}</small></td>
        <td style="white-space:nowrap">
          <button class="btn peq" data-ver="${a.acta_id}" data-junta="${a.junta_id}" data-dign="${a.dignidad_id}">Ver / corregir</button>
          ${a.estado === 'VALIDADA' ? `<button class="btn peq" data-reabrir="${a.acta_id}">Reabrir</button>` : `<button class="btn peq ok" data-validar="${a.acta_id}">Validar</button>`}
          <button class="btn peq peligro" data-eliminar="${a.acta_id}">Eliminar</button></td></tr>`).join('')}
      </tbody></table>`;
  } catch (e) { $('#aa-tabla').innerHTML = `<div class="alerta mal">${esc(e.message)}</div>`; return; }
  $$('[data-validar]').forEach((b) => (b.onclick = async () => {
    try { await q(sb.rpc('validar_acta', { p_acta: Number(b.dataset.validar), p_validar: true })); toast('Acta validada.', 'ok'); adminActas(); } catch (e) { toast(e.message, 'mal'); }
  }));
  $$('[data-reabrir]').forEach((b) => (b.onclick = async () => {
    try { await q(sb.rpc('validar_acta', { p_acta: Number(b.dataset.reabrir), p_validar: false })); toast('Acta reabierta.'); adminActas(); } catch (e) { toast(e.message, 'mal'); }
  }));
  $$('[data-eliminar]').forEach((b) => (b.onclick = async () => {
    const r = await modal('<h2>Eliminar acta</h2><p class="ayuda">El acta y sus votos se borrarán. Quedará registro en la bitácora de auditoría.</p><label>Motivo <textarea name="motivo" required style="min-height:5rem"></textarea></label>');
    if (!r) return;
    try { await q(sb.rpc('eliminar_acta', { p_acta: Number(b.dataset.eliminar), p_motivo: r.motivo })); toast('Acta eliminada.', 'ok'); adminActas(); } catch (e) { toast(e.message, 'mal'); }
  }));
  $$('[data-ver]').forEach((b) => (b.onclick = () => {
    const j = S.juntas.find((x) => x.junta_id === Number(b.dataset.junta));
    Object.assign(S.d, { canton: String(j.canton_id), parroquia: String(j.parroquia_id), recinto: String(j.recinto_id), junta: String(j.junta_id), dignidad: Number(b.dataset.dign) });
    irA('digitacion');
  }));
}

// ---------- Usuarios ----------
async function adminUsuarios() {
  const c = $('#a-cont');
  c.innerHTML = `<p class="ayuda">Para crear un usuario: en Supabase vaya a <b>Authentication → Users → Add user → Create new user</b>, escriba el correo y una contraseña y marque <i>Auto Confirm User</i>. El usuario aparecerá aquí como <b>Pendiente</b>; asígnele el rol. Opcionalmente limite a un digitador a un cantón.</p><div class="tabla-cont" id="au-t"><div class="vacio">Cargando…</div></div>`;
  try {
    const us = await q(sb.from('perfil').select('*').order('email'));
    $('#au-t').innerHTML = `<table><thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Cantón (digitador)</th><th>Activo</th><th></th></tr></thead><tbody>
      ${us.map((u) => `<tr data-u="${u.user_id}">
        <td>${esc(u.email)}</td>
        <td><input type="text" name="nombre" value="${esc(u.nombre || '')}"></td>
        <td><select name="rol" ${u.user_id === S.perfil.user_id ? 'disabled' : ''}>${opciones(Object.entries(ROL_TXT).map(([v, t]) => ({ v, t })), u.rol)}</select></td>
        <td><select name="canton_id">${opciones(S.cantones.map((x) => ({ v: x.id, t: x.nombre })), u.canton_id, 'Todos')}</select></td>
        <td><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''} ${u.user_id === S.perfil.user_id ? 'disabled' : ''}></td>
        <td><button class="btn peq primario" data-guardar>Guardar</button></td></tr>`).join('')}</tbody></table>`;
    $$('#au-t [data-guardar]').forEach((b) => (b.onclick = async () => {
      const tr = b.closest('tr');
      const cambios = { nombre: $('[name=nombre]', tr).value.trim(), canton_id: $('[name=canton_id]', tr).value ? Number($('[name=canton_id]', tr).value) : null };
      if (!$('[name=rol]', tr).disabled) { cambios.rol = $('[name=rol]', tr).value; cambios.activo = $('[name=activo]', tr).checked; }
      try { await q(sb.from('perfil').update(cambios).eq('user_id', tr.dataset.u)); toast('Usuario actualizado.', 'ok'); } catch (e) { toast(e.message, 'mal'); }
    }));
  } catch (e) { $('#au-t').innerHTML = `<div class="alerta mal">${esc(e.message)}</div>`; }
}

// ---------- Organizaciones políticas ----------
async function adminOrganizaciones() {
  const c = $('#a-cont');
  c.innerHTML = `
    <form class="fila" id="ao-f" style="margin-bottom:1rem">
      <label>N.º lista <input type="text" name="lista" size="5" required></label>
      <label>Sigla <input type="text" name="sigla" size="10"></label>
      <label style="flex:1;min-width:200px">Nombre de la organización <input type="text" name="nombre" required></label>
      <label>Color <input type="color" name="color" value="#1d4ed8"></label>
      <button class="btn primario">Agregar</button>
    </form><div class="tabla-cont" id="ao-t"></div>`;
  $('#ao-f').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await q(sb.from('organizacion').insert({ lista: f.lista.trim(), sigla: f.sigla.trim() || null, nombre: f.nombre.trim(), color: f.color })); toast('Organización agregada.', 'ok'); await recargarOrgs(); adminOrganizaciones(); } catch (err) { toast(err.message, 'mal'); }
  };
  $('#ao-t').innerHTML = !S.organizaciones.length ? '<div class="vacio">Aún no hay organizaciones.</div>' : `<table><thead><tr><th>Lista</th><th>Sigla</th><th>Nombre</th><th>Color</th><th></th></tr></thead><tbody>
    ${S.organizaciones.map((o) => `<tr data-id="${o.id}"><td><input type="text" name="lista" value="${esc(o.lista || '')}" size="4"></td>
      <td><input type="text" name="sigla" value="${esc(o.sigla || '')}"></td><td><input type="text" name="nombre" value="${esc(o.nombre)}"></td>
      <td><input type="color" name="color" value="${esc(o.color)}"></td>
      <td style="white-space:nowrap"><button class="btn peq primario" data-g>Guardar</button> <button class="btn peq peligro" data-e>Eliminar</button></td></tr>`).join('')}</tbody></table>`;
  $$('#ao-t [data-g]').forEach((b) => (b.onclick = async () => {
    const tr = b.closest('tr');
    const v = (n) => $(`[name=${n}]`, tr).value.trim();
    try { await q(sb.from('organizacion').update({ lista: v('lista'), sigla: v('sigla') || null, nombre: v('nombre'), color: v('color') }).eq('id', Number(tr.dataset.id))); toast('Guardado.', 'ok'); await recargarOrgs(); } catch (e) { toast(e.message, 'mal'); }
  }));
  $$('#ao-t [data-e]').forEach((b) => (b.onclick = async () => {
    try { await q(sb.from('organizacion').delete().eq('id', Number(b.closest('tr').dataset.id))); toast('Eliminada.', 'ok'); await recargarOrgs(); adminOrganizaciones(); } catch (e) { toast(e.message, 'mal'); }
  }));
}
async function recargarOrgs() { S.organizaciones = await q(sb.from('organizacion').select('*').order('lista')); }

// ---------- Candidaturas ----------
async function adminCandidaturas() {
  if (!S.a.candDignidad && S.dignidades.length) S.a.candDignidad = S.dignidades[0].id;
  const d = dignidad(S.a.candDignidad);
  const c = $('#a-cont');
  const circ = ['CANTONAL', 'CANTONAL_URBANA', 'CANTONAL_RURAL'].includes(d.ambito)
    ? `<label>Cantón <select name="canton_id" required>${opciones(S.cantones.map((x) => ({ v: x.id, t: x.nombre })), '', '— Cantón —')}</select></label>`
    : d.ambito === 'PARROQUIAL_RURAL'
      ? `<label>Parroquia rural <select name="parroquia_id" required>${opciones(parroquiasDe(null, 'RURAL').map((p) => ({ v: p.id, t: `${p.nombre} (${S.cantones.find((x) => x.id === p.canton_id)?.nombre})` })), '', '— Parroquia —')}</select></label>`
      : '';
  c.innerHTML = `
    <div class="chips">${S.dignidades.map((x) => `<button class="chip ${x.id === d.id ? 'activa' : ''}" data-id="${x.id}">${esc(x.nombre)}</button>`).join('')}</div>
    <p class="ayuda">Ámbito: <b>${esc(AMBITO_TXT[d.ambito])}</b>. Registre cada opción tal como aparece en el acta: binomio, candidato o lista. ${['CANTONAL_URBANA', 'CANTONAL_RURAL', 'PARROQUIAL_RURAL'].includes(d.ambito) ? 'Para concejales y vocales se registra una línea por lista en cada circunscripción.' : ''}</p>
    <form class="fila" id="ac-f" style="margin-bottom:1rem">
      <label>Organización <select name="organizacion_id">${opciones(S.organizaciones.map((o) => ({ v: o.id, t: `${o.lista ? o.lista + ' – ' : ''}${o.sigla || o.nombre}` })), '', '(sin organización)')}</select></label>
      <label style="flex:1;min-width:200px">Nombre de candidato / lista <input type="text" name="nombre" required></label>
      ${circ}
      <label>Orden <input type="number" name="orden" value="0" style="width:5rem"></label>
      <button class="btn primario">Agregar</button>
    </form>
    <div class="tabla-cont" id="ac-t"><div class="vacio">Cargando…</div></div>`;
  $$('#a-cont .chips .chip').forEach((b) => (b.onclick = () => { S.a.candDignidad = Number(b.dataset.id); adminCandidaturas(); }));
  $('#ac-f').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const reg = { dignidad_id: d.id, nombre: f.nombre.trim(), orden: Number(f.orden || 0),
      organizacion_id: f.organizacion_id ? Number(f.organizacion_id) : null,
      canton_id: f.canton_id ? Number(f.canton_id) : null, parroquia_id: f.parroquia_id ? Number(f.parroquia_id) : null };
    try { await q(sb.from('candidatura').insert(reg)); toast('Candidatura agregada.', 'ok'); adminCandidaturas(); } catch (err) { toast(err.message, 'mal'); }
  };
  try {
    const lista = await q(sb.from('candidatura').select('*').eq('dignidad_id', d.id).order('canton_id').order('parroquia_id').order('orden').order('id'));
    const nomC = (id) => S.cantones.find((x) => x.id === id)?.nombre || '';
    const nomP = (id) => S.parroquias.find((x) => x.id === id)?.nombre || '';
    const org = (id) => S.organizaciones.find((o) => o.id === id);
    $('#ac-t').innerHTML = !lista.length ? '<div class="vacio">Sin candidaturas para esta dignidad.</div>' : `<table><thead><tr><th>Lista</th><th>Candidatura</th><th>Circunscripción</th><th class="num">Orden</th><th>Activa</th><th></th></tr></thead><tbody>
      ${lista.map((x) => `<tr data-id="${x.id}"><td>${org(x.organizacion_id) ? `<span class="lista" style="background:${esc(org(x.organizacion_id).color)}">${esc(org(x.organizacion_id).lista || '–')}</span> ${esc(org(x.organizacion_id).sigla || '')}` : '–'}</td>
        <td><input type="text" name="nombre" value="${esc(x.nombre)}"></td>
        <td>${esc(x.parroquia_id ? nomP(x.parroquia_id) + ' · ' + nomC(x.canton_id) : x.canton_id ? nomC(x.canton_id) : 'Provincia')}</td>
        <td class="num"><input type="number" name="orden" value="${x.orden}" style="width:4.5rem"></td>
        <td><input type="checkbox" name="activa" ${x.activa ? 'checked' : ''}></td>
        <td style="white-space:nowrap"><button class="btn peq primario" data-g>Guardar</button> <button class="btn peq peligro" data-e>Eliminar</button></td></tr>`).join('')}</tbody></table>`;
  } catch (e) { $('#ac-t').innerHTML = `<div class="alerta mal">${esc(e.message)}</div>`; return; }
  $$('#ac-t [data-g]').forEach((b) => (b.onclick = async () => {
    const tr = b.closest('tr');
    try { await q(sb.from('candidatura').update({ nombre: $('[name=nombre]', tr).value.trim(), orden: Number($('[name=orden]', tr).value || 0), activa: $('[name=activa]', tr).checked }).eq('id', Number(tr.dataset.id))); toast('Guardado.', 'ok'); } catch (e) { toast(e.message, 'mal'); }
  }));
  $$('#ac-t [data-e]').forEach((b) => (b.onclick = async () => {
    try { await q(sb.from('candidatura').delete().eq('id', Number(b.closest('tr').dataset.id))); toast('Eliminada.', 'ok'); adminCandidaturas(); } catch (e) { toast(e.message, 'mal'); }
  }));
}

// ---------- Parroquias ----------
function adminParroquias() {
  const c = $('#a-cont');
  const lista = [...S.parroquias].sort((a, b) => a.canton_id - b.canton_id || a.nombre.localeCompare(b.nombre));
  c.innerHTML = `<p class="ayuda">El tipo define qué dignidades se votan: en parroquias <b>urbanas</b> se votan concejales urbanos; en <b>rurales</b>, concejales rurales y vocales de la junta parroquial. Verifique con la circunscripción oficial del CNE.</p>
    <div class="tabla-cont"><table><thead><tr><th>Cantón</th><th>Código</th><th>Parroquia</th><th>Tipo</th></tr></thead><tbody>
    ${lista.map((p) => `<tr><td>${esc(S.cantones.find((x) => x.id === p.canton_id)?.nombre)}</td><td>${p.id}</td><td>${esc(p.nombre)}</td>
      <td><select data-p="${p.id}">${opciones([{ v: 'URBANA', t: 'Urbana' }, { v: 'RURAL', t: 'Rural' }], p.tipo)}</select></td></tr>`).join('')}
    </tbody></table></div>`;
  $$('[data-p]', c).forEach((s) => (s.onchange = async () => {
    try {
      await q(sb.from('parroquia').update({ tipo: s.value }).eq('id', Number(s.dataset.p)));
      await cargarCatalogos(); toast('Tipo de parroquia actualizado.', 'ok');
    } catch (e) { toast(e.message, 'mal'); }
  }));
}

// ---------- Electores por junta ----------
function adminElectores() {
  const c = $('#a-cont');
  const ref = S.juntas.filter((j) => j.electores_referencial).length;
  c.innerHTML = `
    <p class="ayuda">El distributivo del CNE trae los electores por <b>recinto</b>; el sistema los repartió en partes iguales entre sus juntas
      (${ref} de ${S.juntas.length} juntas siguen con valor referencial). Cuando tenga el padrón por junta, pegue aquí una línea por junta con el formato
      <code>codigo_recinto;sexo;numero_junta;electores</code> (ejemplo: <code>5795;F;47;352</code>).</p>
    <textarea id="ae-txt" placeholder="5795;F;47;352&#10;5795;F;48;349"></textarea>
    <div class="acciones"><button class="btn" id="ae-plantilla">Descargar plantilla</button><button class="btn primario" id="ae-go">Actualizar electores</button></div>
    <div id="ae-msg"></div>`;
  $('#ae-plantilla').onclick = () => {
    const csv = 'codigo_recinto;sexo;numero_junta;electores;recinto;parroquia;canton\r\n' +
      S.juntas.map((j) => [j.recinto_id, j.sexo, j.numero, j.electores, j.recinto, j.parroquia, j.canton].join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'plantilla_electores_por_junta.csv'; a.click();
  };
  $('#ae-go').onclick = async () => {
    const lineas = $('#ae-txt').value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let ok = 0; const errores = [];
    $('#ae-go').disabled = true;
    for (const l of lineas) {
      const [rec, sexo, num, ele] = l.split(/[;,\t]/).map((x) => x.trim());
      if (/codigo/i.test(rec)) continue;
      const j = S.juntas.find((x) => x.recinto_id === Number(rec) && x.sexo === String(sexo).toUpperCase() && x.numero === Number(num));
      if (!j || !Number.isInteger(Number(ele))) { errores.push(l); continue; }
      try { await q(sb.from('junta').update({ electores: Number(ele), electores_referencial: false }).eq('id', j.junta_id)); ok++; } catch (e) { errores.push(`${l} → ${e.message}`); }
      $('#ae-msg').innerHTML = `<div class="alerta info">Procesando… ${ok} actualizadas</div>`;
    }
    await cargarCatalogos();
    $('#ae-go').disabled = false;
    $('#ae-msg').innerHTML = `<div class="alerta ${errores.length ? 'aviso' : 'ok'}">${ok} juntas actualizadas.${errores.length ? `<br>${errores.length} líneas con error:<ul>${errores.slice(0, 20).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
  };
}

init();
