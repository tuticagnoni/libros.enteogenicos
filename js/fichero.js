/* ==========================================================
   Libros Enteogénicos — fichero, pedidos, menú y suscripción
   ========================================================== */

/* De dónde salen los libros.
   - Si FUENTE_PLANILLA tiene un link, se lee la planilla de Google Sheets
     (Archivo › Compartir › Publicar en la web › formato CSV).
   - Si está vacío o falla, se usa libros.json del repo. */
const FUENTE_PLANILLA = '';
const FUENTE_JSON = 'libros.json';

const ESCRITORIO = window.matchMedia('(min-width: 900px)');

// en el inicio se muestran solo los destacados; en catalogo.html, todos
const PAGINA = document.body.dataset.pagina || 'catalogo';
const CANTIDAD_DESTACADOS = 6;

const estado = {
  libros: [],
  filtro: 'Todos',
  busqueda: '',
  abierto: null,   // id del libro abierto
  reverso: false   // si la ficha abierta muestra la reseña
};

/* ---------- utilidades ---------- */
const $ = (sel) => document.querySelector(sel);

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// los títulos del JSON traen "֍ " adelante; acá lo sacamos sin tocar los datos
function limpiarTitulo(t) {
  return String(t || '').replace(/^\s*֍\s*/, '').trim();
}

function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// la reseña puede traer <br> y <b>; dejamos solo esas etiquetas
function resenaSegura(html) {
  const permitido = escapar(html)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;(\/?)(b|strong|i|em)&gt;/gi, '<$1$2>');
  return permitido
    .split(/(?:<br>\s*){2,}/)
    .map((p) => `<p>${p.trim()}</p>`)
    .join('');
}

/* ---------- lectura de datos ---------- */
function parsearCSV(texto) {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...resto] = filas.filter((f) => f.some((v) => v.trim() !== ''));
  return resto.map((f) => Object.fromEntries(cabecera.map((k, i) => [k.trim(), (f[i] ?? '').trim()])));
}

function normalizarLibro(b) {
  const tags = Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const marcado = (v) => v === true || /^(si|sí|true|1|x)$/i.test(String(v || '').trim());
  const nuevo = marcado(b.nuevo);
  const destacado = marcado(b.destacado);
  return {
    id: String(b.id || '').trim(),
    titulo: limpiarTitulo(b.titulo),
    autor: b.autor || '',
    paginas: b.paginas || '',
    anio: b.añoPublicacion || b.anio || '',
    categoria: b.categoria || 'Otros',
    resumenCorto: b.resumenCorto || '',
    resumenCompleto: b.resumenCompleto || b.resumenCorto || '',
    tags,
    imagen: b.imagen || '',
    nuevo,
    destacado
  };
}

async function cargarLibros() {
  if (FUENTE_PLANILLA) {
    try {
      const r = await fetch(FUENTE_PLANILLA, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return parsearCSV(await r.text()).map(normalizarLibro).filter((b) => b.id && b.titulo);
    } catch (e) {
      console.warn('No se pudo leer la planilla, uso libros.json', e);
    }
  }
  const r = await fetch(FUENTE_JSON);
  const datos = await r.json();
  return datos.map(normalizarLibro).filter((b) => b.id && b.titulo);
}

/* ---------- filtros ---------- */
function categorias() {
  const vistas = [];
  estado.libros.forEach((b) => { if (!vistas.includes(b.categoria)) vistas.push(b.categoria); });
  // "Otros" siempre al final
  vistas.sort((a, b) => (a === 'Otros') - (b === 'Otros'));
  return ['Todos', ...vistas];
}

function librosVisibles() {
  if (PAGINA === 'inicio') {
    // los marcados como "destacado"; si no hay ninguno, los primeros del catálogo
    const marcados = estado.libros.filter((b) => b.destacado);
    return (marcados.length ? marcados : estado.libros).slice(0, CANTIDAD_DESTACADOS);
  }
  const q = normalizar(estado.busqueda);
  return estado.libros.filter((b) => {
    if (estado.filtro !== 'Todos' && b.categoria !== estado.filtro) return false;
    if (!q) return true;
    return normalizar([b.titulo, b.autor, b.categoria, b.tags.join(' ')].join(' ')).includes(q);
  });
}

function pintarFiltros() {
  if (!$('#filtros')) return;
  $('#filtros').innerHTML = categorias().map((c) =>
    `<button type="button" class="filtro" data-filtro="${escapar(c)}" aria-pressed="${c === estado.filtro}">${escapar(c)}</button>`
  ).join('');
}

/* ---------- ficha ---------- */
function tapaHTML(b) {
  return b.imagen
    ? `<img src="${escapar(b.imagen)}" alt="Tapa de ${escapar(b.titulo)}" loading="lazy">`
    : `<span class="ficha__sin-tapa">Tapa en preparación</span>`;
}

function fichaHTML(b, conTitulo) {
  const titulo = conTitulo ? `<h3 class="titulo-medio ficha__titulo">${escapar(b.titulo)}</h3>` : '';
  const acciones = (reverso) => `
    <div class="ficha__acciones">
      <button type="button" class="boton boton--tinta boton--chico" data-accion="voltear">${reverso ? 'Volver al frente' : 'Ver reseña'}</button>
      <button type="button" class="boton boton--tinta boton--chico" data-accion="pedir" data-id="${escapar(b.id)}">Pedir</button>
    </div>`;

  if (estado.reverso) {
    return `
      ${conTitulo ? `<p class="etiqueta-ui" style="margin:0">Reseña</p>${titulo}` : ''}
      <div class="ficha__resena" style="margin-top:${conTitulo ? '16px' : '0'}">${resenaSegura(b.resumenCompleto)}</div>
      <a class="ficha__mas" href="libro.html?id=${encodeURIComponent(b.id)}">Ver la página completa del libro</a>
      ${acciones(true)}`;
  }

  return `
    <div class="ficha__frente">
      <div class="ficha__tapa">${tapaHTML(b)}</div>
      <div style="min-width:0">
        ${conTitulo ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="ficha__tema">${escapar(b.categoria)}</span>${b.nuevo ? '<span class="sello-nuevo" style="margin:0">Nuevo</span>' : ''}</div>${titulo}` : ''}
        <dl class="ficha__datos">
          <dt>AUTOR</dt><dd>${escapar(b.autor)}</dd>
          <dt>AÑO</dt><dd>${escapar(b.anio) || '—'}</dd>
          <dt>PÁGINAS</dt><dd>${b.paginas ? escapar(b.paginas) + ', A5' : 'A5'}</dd>
        </dl>
        ${conTitulo ? '' : `<span class="ficha__tema">${escapar(b.categoria)}</span>`}
      </div>
    </div>
    ${acciones(false)}`;
}

/* ---------- mazo ---------- */
function pintarMazo() {
  const lista = librosVisibles();
  const escritorio = ESCRITORIO.matches;

  // en escritorio siempre hay una ficha abierta: la primera de la lista si no hay otra
  if (escritorio && !lista.some((b) => b.id === estado.abierto)) {
    estado.abierto = lista[0]?.id ?? null;
    estado.reverso = false;
  }

  $('#fichero-vacio').hidden = lista.length > 0;
  $('#mazo').innerHTML = lista.map((b) => {
    const activo = b.id === estado.abierto;
    const atributo = escritorio ? `aria-pressed="${activo}"` : `aria-expanded="${activo}" aria-controls="ficha-${escapar(b.id)}"`;
    return `
      <li class="mazo__item${activo ? ' activo' : ''}">
        <button type="button" class="solapa" data-id="${escapar(b.id)}" ${atributo}>
          <span class="solapa__texto">${escapar(b.titulo)}</span>
          ${b.nuevo ? '<span class="sello-nuevo">Nuevo</span>' : ''}
        </button>
        ${activo && !escritorio
          ? `<div class="ficha" id="ficha-${escapar(b.id)}">${fichaHTML(b, false)}</div>`
          : '<div class="labio"></div>'}
      </li>`;
  }).join('');

  const elegido = lista.find((b) => b.id === estado.abierto);
  $('#panel').innerHTML = escritorio && elegido ? `<div class="ficha">${fichaHTML(elegido, true)}</div>` : '';
}

function abrir(id) {
  const escritorio = ESCRITORIO.matches;
  if (!escritorio && estado.abierto === id) {
    estado.abierto = null; // en celular, tocar la solapa abierta la cierra
  } else {
    estado.abierto = id;
  }
  estado.reverso = false;
  pintarMazo();
  if (!escritorio && estado.abierto) {
    const solapa = document.querySelector(`.solapa[data-id="${CSS.escape(id)}"]`);
    solapa?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // devolver el foco a la solapa tocada
  document.querySelector(`.solapa[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}

/* ---------- pedido (Netlify Forms) ---------- */
function abrirPedido(id) {
  const b = estado.libros.find((x) => x.id === id);
  if (!b) return;
  $('#pedido-libro').value = `${b.titulo} — ${b.autor}`;
  $('#pedido-libro-texto').textContent = `${b.titulo}, de ${b.autor}`;
  $('#pedido-estado').textContent = '';
  $('#form-pedido').hidden = false;
  const dialogo = $('#pedido');
  if (typeof dialogo.showModal === 'function') dialogo.showModal();
  else dialogo.setAttribute('open', '');
}

function cerrarPedido() {
  const dialogo = $('#pedido');
  if (typeof dialogo.close === 'function') dialogo.close();
  else dialogo.removeAttribute('open');
}

async function enviarPedido(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const estadoTxt = $('#pedido-estado');
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  estadoTxt.textContent = 'Enviando…';
  try {
    const r = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString()
    });
    if (!r.ok) throw new Error(r.status);
    form.reset();
    estadoTxt.textContent = '¡Listo! Recibimos tu pedido y te escribimos al mail para coordinar.';
  } catch (err) {
    estadoTxt.innerHTML = 'No se pudo enviar. Escribinos a <a href="mailto:libros.enteogenicos@gmail.com">libros.enteogenicos@gmail.com</a>.';
  } finally {
    boton.disabled = false;
  }
}

/* ---------- suscripción (Google Apps Script existente) ---------- */
const URL_SUSCRIPCION = 'https://script.google.com/macros/s/AKfycbxXXc_uMO2lKoZG93ja1IIPIyM--kcKpmEC-OAUl3-s8Ueunl3KyLfKdyiGE3vaZu3T9g/exec';

function suscribir(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const email = form.querySelector('input[type="email"]').value;
  const estadoTxt = $('#suscribir-estado');
  estadoTxt.textContent = 'Enviando…';
  fetch(URL_SUSCRIPCION, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(email)}`
  }).then(() => {
    estadoTxt.textContent = '¡Gracias por suscribirte!';
    form.reset();
  }).catch(() => {
    estadoTxt.textContent = 'No se pudo enviar. Probá de nuevo en un rato.';
  });
}

/* ---------- alias de Mercado Pago ---------- */
function copiarAlias(e) {
  const alias = e.currentTarget.dataset.alias;
  const aviso = $('#alias-estado');
  const listo = () => { aviso.textContent = '¡Alias copiado!'; };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(alias).then(listo).catch(() => { aviso.textContent = `Alias: ${alias}`; });
  } else {
    aviso.textContent = `Alias: ${alias}`;
  }
}

/* ---------- arranque ---------- */
function eventos() {
  const menuBoton = $('.menu-boton');
  const nav = $('#nav-principal');
  menuBoton.addEventListener('click', () => {
    const abierto = menuBoton.getAttribute('aria-expanded') === 'true';
    menuBoton.setAttribute('aria-expanded', String(!abierto));
    menuBoton.setAttribute('aria-label', abierto ? 'Abrir menú' : 'Cerrar menú');
    nav.classList.toggle('abierta', !abierto);
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.classList.remove('abierta');
      menuBoton.setAttribute('aria-expanded', 'false');
    }
  });

  $('#buscador')?.addEventListener('input', (e) => { estado.busqueda = e.target.value; pintarMazo(); });

  $('#filtros')?.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-filtro]');
    if (!boton) return;
    estado.filtro = boton.dataset.filtro;
    pintarFiltros();
    pintarMazo();
  });

  const alTocar = (e) => {
    const solapa = e.target.closest('.solapa');
    if (solapa) return abrir(solapa.dataset.id);
    const accion = e.target.closest('[data-accion]');
    if (!accion) return;
    if (accion.dataset.accion === 'voltear') {
      estado.reverso = !estado.reverso;
      pintarMazo();
      document.querySelector('[data-accion="voltear"]')?.focus({ preventScroll: true });
    }
    if (accion.dataset.accion === 'pedir') abrirPedido(accion.dataset.id);
  };
  $('#mazo').addEventListener('click', alTocar);
  $('#panel').addEventListener('click', alTocar);

  ESCRITORIO.addEventListener('change', pintarMazo);

  $('#pedido-cerrar').addEventListener('click', cerrarPedido);
  $('#form-pedido').addEventListener('submit', enviarPedido);
  $('#form-suscribir').addEventListener('submit', suscribir);
  $('#copiar-alias')?.addEventListener('click', copiarAlias);
}

async function iniciar() {
  eventos();
  try {
    estado.libros = await cargarLibros();
  } catch (e) {
    $('#fichero-vacio').hidden = false;
    $('#fichero-vacio').textContent = 'No pudimos cargar el catálogo. Probá recargar la página.';
    return;
  }
  const cantidad = $('#cantidad-titulos');
  if (cantidad) cantidad.textContent = `${estado.libros.length} títulos`;
  // arranca con la primera ficha abierta, como en el diseño
  estado.abierto = librosVisibles()[0]?.id ?? null;
  pintarFiltros();
  pintarMazo();
}

document.addEventListener('DOMContentLoaded', iniciar);
