// Panel del gestor en el navegador. Pinta un formulario por fichero a partir de su esquema JSON:
//   objeto → grupo · lista → elementos con subir, bajar, quitar y añadir · texto → campo con contador
//   número · sí/no · foto (con recorte) · uniones «T | null» y «texto | ''».
// Nada se guarda hasta «Publicar», que manda todo junto al servidor (un solo commit en GitHub).
import { normalizar, tipoDe, vacio, type Esquema, type Ruta } from '../comun/esquema';
import { prepararFoto, proporcionLegible, type Foto } from './fotos';

type Fichero = { esquema: Esquema; datos: Record<string, unknown> };
type Estado = { commit: string; ficheros: Record<string, Fichero>; imagenes: string[]; marcadores: Record<string, string>; sitio: string | null };
type ErrorCampo = { fichero?: string; ruta?: Ruta; mensaje: string };
type Datos = Record<string | number, unknown>;

// ── Utilidades ──────────────────────────────────────────────────────────────────────────────────

type Hijo = Node | string | null | undefined | false;
/** Crea un elemento: h('p', { class: 'x', onclick: … }, 'texto', otroNodo). */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...hijos: Hijo[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of hijos) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Vista previa de un titular: *subrayado* y [píldora]. */
const marcas = (s: string) =>
  esc(s)
    .replace(/\*([^*]+)\*/g, '<span class="micms-mark">$1</span>')
    .replace(/\[([^\]]+)\]/g, '<span class="micms-pill">$1</span>');

const humano = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const clave = (f: string, ruta: Ruta) => `${f}:${ruta.join('.')}`;
let idSiguiente = 0;
const nuevoId = () => `micms-${++idSiguiente}`;

function obtener(obj: unknown, ruta: Ruta): unknown {
  return ruta.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Datos)[k] : undefined), obj);
}
function poner(obj: Datos, ruta: Ruta, valor: unknown) {
  const padre = obtener(obj, ruta.slice(0, -1)) as Datos;
  const k = ruta[ruta.length - 1];
  if (valor === undefined) delete padre[k];
  else padre[k] = valor;
}

// ── Panel ───────────────────────────────────────────────────────────────────────────────────────

export async function iniciar(raiz: HTMLElement) {
  const api = (accion: string) => raiz.dataset.api!.replace('ACCION', accion); // ya incluye base y barra final de la web
  const urlVersion = raiz.dataset.version!;
  const urlWeb = raiz.dataset.web ?? '/';
  let E!: Estado;
  let original: Record<string, string> = {};
  const subidas = new Map<string, Foto>();
  const abiertos = new Set<string>();
  const revisar = new Set<string>(); // descripciones de fotos que acaban de cambiar
  let errores: ErrorCampo[] = [];
  let pestana = '';
  let publicando = false;
  let aviso: { texto: string; tipo: 'ok' | 'err' | 'info'; enlace?: boolean } | null = null;
  let autoPublica: boolean | null = null; // ¿la web se vuelve a publicar sola al guardar en GitHub?

  // Partes que se actualizan sin volver a pintar todo (para no perder el foco al escribir).
  let barraEstado: HTMLElement;
  let botonPublicar: HTMLButtonElement;
  let botonDeshacer: HTMLButtonElement;
  const previsualizaciones: (() => void)[] = [];

  const datos = (f: string) => E.ficheros[f].datos;
  const cambiados = () => Object.keys(E.ficheros).filter((f) => JSON.stringify(datos(f)) !== original[f]);

  // ── Carga ──

  async function cargar() {
    raiz.replaceChildren(h('p', { class: 'micms-cargando' }, 'Cargando el contenido…'));
    let r: Response;
    try {
      r = await fetch(api('estado'), { cache: 'no-store' });
    } catch {
      return fatal('No hay conexión. Comprueba internet y recarga la página.');
    }
    if (r.status === 401 || r.redirected || !r.headers.get('Content-Type')?.includes('json')) return location.reload(); // sesión caducada
    const cuerpo = await r.json();
    if (!r.ok) return fatal(cuerpo.errores?.[0]?.mensaje ?? 'No se ha podido cargar el contenido.');
    E = cuerpo;
    original = Object.fromEntries(Object.entries(E.ficheros).map(([f, x]) => [f, JSON.stringify(x.datos)]));
    subidas.clear();
    errores = [];
    if (!pestana || !E.ficheros[pestana]) pestana = Object.keys(E.ficheros)[0];
    pintar();
  }

  function fatal(texto: string) {
    raiz.replaceChildren(h('p', { class: 'micms-aviso err', role: 'alert' }, texto), h('button', { class: 'micms-btn', type: 'button', onclick: cargar }, 'Reintentar'));
  }

  // ── Pintado ──

  function pintar() {
    previsualizaciones.length = 0;
    const fichero = E.ficheros[pestana];
    const pestanas = h(
      'div',
      { class: 'micms-pestanas', role: 'tablist' },
      ...Object.entries(E.ficheros).map(([f, x]) => {
        const nErr = errores.filter((e) => e.fichero === f).length;
        return h(
          'button',
          { type: 'button', role: 'tab', 'aria-selected': String(f === pestana), onclick: () => ((pestana = f), pintar()) },
          x.esquema.etiqueta ?? f,
          nErr ? h('span', { class: 'micms-num' }, String(nErr)) : null,
        );
      }),
    );

    const generales = errores.filter((e) => !e.ruta?.length);
    const partes: Hijo[] = [
      h('div', { class: 'micms-cabecera' }, h('h1', {}, 'Contenido de la web'), ayuda()),
      aviso && h('p', { class: `micms-aviso ${aviso.tipo}`, role: aviso.tipo === 'err' ? 'alert' : 'status' }, aviso.texto, aviso.enlace ? h('a', { href: urlWeb, target: '_blank', rel: 'noopener' }, ' Ver la web') : null),
      ...generales.map((e) => h('p', { class: 'micms-aviso err', role: 'alert' }, e.fichero ? `${e.fichero}: ${e.mensaje}` : e.mensaje)),
      pestanas,
      h('div', { class: 'micms-ficha', role: 'tabpanel' }, fichero.esquema.google ? vistaGoogle(pestana) : null, ...secciones(pestana)),
      barra(),
    ];
    raiz.replaceChildren(...partes.filter((x): x is Node | string => Boolean(x)));
    actualizarBarra();
  }

  function ayuda() {
    const m = Object.entries(E.marcadores);
    return h(
      'details',
      { class: 'micms-ayuda' },
      h('summary', {}, 'Cómo funciona'),
      h(
        'ul',
        {},
        h('li', {}, 'Cambia lo que quieras en las pestañas. Nada se guarda hasta que pulses «Publicar».'),
        h('li', {}, 'Al publicar, la web se actualiza sola en uno o dos minutos.'),
        h('li', {}, 'En los titulares, entre asteriscos se subraya (', h('code', {}, '*así*'), ') y entre corchetes sale como etiqueta (', h('code', {}, '[así]'), ').'),
        m.length ? h('li', {}, 'Puedes usar estos marcadores, que se cambian solos por su valor: ', ...m.flatMap(([k, v], i) => [i ? ', ' : '', h('code', { title: v }, `{${k}}`)])) : null,
        h('li', {}, 'Los límites de caracteres son los que caben en el diseño sin romperlo.'),
      ),
    );
  }

  /** Divide el fichero en secciones plegables: cada objeto o lista de primer nivel, y los campos sueltos juntos. */
  function secciones(f: string) {
    const raizEsq = normalizar(E.ficheros[f].esquema);
    const out: HTMLElement[] = [];
    let sueltos: HTMLElement[] = [];
    const cerrarSueltos = () => {
      if (sueltos.length) out.push(seccion(f, ['_general'], raizEsq.etiqueta ?? 'General', sueltos));
      sueltos = [];
    };
    for (const [k, sub] of Object.entries(raizEsq.properties ?? {})) {
      const n = normalizar(sub);
      const t = tipoDe(n);
      if (t === 'object' || t === 'array') {
        cerrarSueltos();
        out.push(seccion(f, [k], n.etiqueta ?? humano(k), [campo(f, sub, [k], true)], n.ayuda));
      } else sueltos.push(campo(f, sub, [k]));
    }
    cerrarSueltos();
    // La primera vez, la primera sección abierta.
    if (out[0] && ![...abiertos].some((k) => k.startsWith(`${f}:`))) (out[0] as HTMLDetailsElement).open = true;
    return out;
  }

  function seccion(f: string, ruta: Ruta, titulo: string, contenido: HTMLElement[], textoAyuda?: string) {
    const k = clave(f, ruta);
    const conError = errores.some((e) => e.fichero === f && e.ruta && (ruta[0] === '_general' ? typeof obtener(datos(f), [e.ruta[0]]) !== 'object' : e.ruta[0] === ruta[0]));
    const d = h(
      'details',
      { class: 'micms-seccion', open: abiertos.has(k) || conError, 'data-ruta': ruta.join('.'), ontoggle: () => (d.open ? abiertos.add(k) : abiertos.delete(k)) },
      h('summary', {}, titulo, conError ? h('span', { class: 'micms-num' }, '!') : null),
      textoAyuda ? h('p', { class: 'micms-ayuda-campo' }, textoAyuda) : null,
      ...contenido,
    ) as HTMLDetailsElement;
    return d;
  }

  /** Mensajes de error del servidor para este campo. */
  const erroresDe = (f: string, ruta: Ruta) =>
    errores.filter((e) => e.fichero === f && e.ruta && clave(f, e.ruta) === clave(f, ruta)).map((e) => h('p', { class: 'micms-error', role: 'alert' }, e.mensaje));

  function etiquetaDe(n: Esquema, ruta: Ruta) {
    const ultimo = ruta[ruta.length - 1];
    return n.etiqueta ?? (typeof ultimo === 'number' ? `${ultimo + 1}` : humano(String(ultimo)));
  }

  /** Un campo cualquiera según su tipo. `sinTitulo`: el título ya lo pone la sección o la tarjeta. */
  function campo(f: string, esq: Esquema, ruta: Ruta, sinTitulo = false, opcional = false): HTMLElement {
    const n = normalizar(esq);
    const t = tipoDe(n);
    const valor = obtener(datos(f), ruta);

    if (n.anulable) {
      const id = nuevoId();
      const activo = valor !== null && valor !== undefined;
      return h(
        'div',
        { class: 'micms-anulable', 'data-campo': clave(f, ruta) },
        h(
          'label',
          { class: 'micms-check', for: id },
          h('input', {
            id,
            type: 'checkbox',
            checked: activo,
            onchange: (e: Event) => {
              const { anulable: _, ...sinNull } = n;
              poner(datos(f), ruta, (e.target as HTMLInputElement).checked ? vacio(sinNull) : null);
              cambio(true);
            },
          }),
          ` ${etiquetaDe(n, ruta)}`,
        ),
        n.ayuda ? h('p', { class: 'micms-ayuda-campo' }, n.ayuda) : null,
        activo ? campo(f, { ...n, anyOf: undefined, anulable: false } as Esquema, ruta, true) : null,
        ...erroresDe(f, ruta),
      );
    }

    switch (t) {
      case 'object':
        return grupo(f, n, ruta, sinTitulo);
      case 'array':
        return lista(f, n, ruta, sinTitulo);
      case 'boolean':
        return siNo(f, n, ruta, opcional);
      case 'number':
      case 'integer':
        return numero(f, n, ruta);
      case 'string':
        if (Array.isArray(n.enum)) return desplegable(f, n, ruta);
        return n.tipo === 'imagen' ? foto(f, n, ruta) : texto(f, n, ruta, opcional || Boolean((n as { vacioPermitido?: boolean }).vacioPermitido));
      default:
        return h('p', { class: 'micms-ayuda-campo' }, `«${etiquetaDe(n, ruta)}» no se puede editar desde aquí.`);
    }
  }

  function grupo(f: string, n: Esquema, ruta: Ruta, sinTitulo: boolean) {
    const valor = (obtener(datos(f), ruta) ?? {}) as Datos;
    const requeridos = new Set(n.required ?? []);
    const hijos = Object.entries(n.properties ?? {})
      .filter(([, sub]) => {
        const oculto = normalizar(sub).ocultarSi as string | undefined;
        return !(oculto && valor[oculto]);
      })
      .map(([k, sub]) => campo(f, sub, [...ruta, k], false, !requeridos.has(k)));
    const cuerpo = [n.ayuda && !sinTitulo ? h('p', { class: 'micms-ayuda-campo' }, n.ayuda) : null, ...hijos, ...erroresDe(f, ruta)];
    if (sinTitulo) return h('div', { class: 'micms-grupo', 'data-campo': clave(f, ruta) }, ...cuerpo);
    return h('fieldset', { class: 'micms-grupo', 'data-campo': clave(f, ruta) }, h('legend', {}, etiquetaDe(n, ruta)), ...cuerpo);
  }

  function cabeceraCampo(n: Esquema, ruta: Ruta, id: string, extra?: HTMLElement | null) {
    return [
      h('div', { class: 'micms-etiqueta' }, h('label', { for: id }, etiquetaDe(n, ruta)), extra ?? null),
      n.ayuda ? h('p', { class: 'micms-ayuda-campo', id: `${id}-ayuda` }, n.ayuda) : null,
    ];
  }

  /** z.enum([...]): una lista cerrada. `.meta({ opciones: { valor: 'Texto visible' } })` pone nombres legibles. */
  function desplegable(f: string, n: Esquema, ruta: Ruta) {
    const id = nuevoId();
    const valor = String(obtener(datos(f), ruta) ?? '');
    const nombres = (n.opciones ?? {}) as Record<string, string>;
    const sel = h(
      'select',
      { id, class: 'micms-desplegable', 'aria-describedby': n.ayuda ? `${id}-ayuda` : undefined },
      ...(n.enum as string[]).map((v) => h('option', { value: v, selected: v === valor }, nombres[v] ?? v)),
    );
    sel.addEventListener('change', () => {
      poner(datos(f), ruta, sel.value);
      cambio();
    });
    return h('div', { class: 'micms-campo', 'data-campo': clave(f, ruta) }, ...cabeceraCampo(n, ruta, id), sel, ...erroresDe(f, ruta));
  }

  function texto(f: string, n: Esquema, ruta: Ruta, opcional: boolean) {
    const id = nuevoId();
    const valor = String(obtener(datos(f), ruta) ?? '');
    const largo = n.tipo === 'parrafo' || (n.maxLength ?? 0) > 90;
    const contador = h('span', { class: 'micms-contador', 'aria-live': 'polite' });
    const previa = n.tipo === 'titular' ? h('p', { class: 'micms-previa', 'aria-hidden': 'true' }) : null;
    const tipos: Record<string, string> = { email: 'email', url: 'url', telefono: 'tel' };
    const control = (largo ? h('textarea', { rows: 3 }) : h('input', { type: tipos[n.tipo ?? ''] ?? 'text' })) as HTMLInputElement | HTMLTextAreaElement;
    Object.assign(control, { id, value: valor });
    if (n.maxLength) control.maxLength = n.maxLength;
    if (n.ayuda) control.setAttribute('aria-describedby', `${id}-ayuda`);
    if (!opcional && (n.minLength ?? 0) > 0) control.required = true;

    const refrescar = () => {
      const v = control.value;
      if (n.maxLength) {
        contador.textContent = `${v.length}/${n.maxLength}`;
        contador.classList.toggle('lleno', v.length >= n.maxLength);
      }
      if (previa) previa.innerHTML = marcas(v);
      if (largo) {
        control.style.height = 'auto';
        control.style.height = `${control.scrollHeight + 2}px`;
      }
    };
    const k = clave(f, ruta);
    const recordatorio = revisar.has(k) ? h('p', { class: 'micms-revisar', role: 'status' }, 'Has cambiado la foto: revisa que esta descripción siga siendo correcta.') : null;
    control.addEventListener('input', () => {
      poner(datos(f), ruta, control.value === '' && opcional && !(n as { vacioPermitido?: boolean }).vacioPermitido ? undefined : control.value);
      revisar.delete(k);
      recordatorio?.remove();
      refrescar();
      cambio();
    });
    requestAnimationFrame(refrescar);
    refrescar();
    return h('div', { class: 'micms-campo', 'data-campo': k }, ...cabeceraCampo(n, ruta, id, contador), recordatorio, control, previa, ...erroresDe(f, ruta));
  }

  function numero(f: string, n: Esquema, ruta: Ruta) {
    const id = nuevoId();
    const control = h('input', { id, type: 'number', step: 'any', inputMode: 'decimal', min: n.minimum, max: n.maximum, class: 'micms-numero' }) as HTMLInputElement;
    const v = obtener(datos(f), ruta);
    control.value = v === undefined ? '' : String(v);
    control.addEventListener('input', () => {
      const x = control.valueAsNumber;
      if (!Number.isNaN(x)) poner(datos(f), ruta, x);
      cambio();
    });
    return h('div', { class: 'micms-campo', 'data-campo': clave(f, ruta) }, ...cabeceraCampo(n, ruta, id), control, ...erroresDe(f, ruta));
  }

  function siNo(f: string, n: Esquema, ruta: Ruta, opcional: boolean) {
    const id = nuevoId();
    return h(
      'div',
      { class: 'micms-campo', 'data-campo': clave(f, ruta) },
      h(
        'label',
        { class: 'micms-check', for: id },
        h('input', {
          id,
          type: 'checkbox',
          checked: Boolean(obtener(datos(f), ruta)),
          onchange: (e: Event) => {
            const marcado = (e.target as HTMLInputElement).checked;
            poner(datos(f), ruta, marcado ? true : opcional ? undefined : false);
            cambio(true); // puede mostrar u ocultar otros campos
          },
        }),
        ` ${etiquetaDe(n, ruta)}`,
      ),
      n.ayuda ? h('p', { class: 'micms-ayuda-campo' }, n.ayuda) : null,
      ...erroresDe(f, ruta),
    );
  }

  /** Lista de números en una sola línea: «27; 26,1; 25,3». */
  function listaNumeros(f: string, n: Esquema, ruta: Ruta) {
    const id = nuevoId();
    const v = (obtener(datos(f), ruta) as number[]) ?? [];
    const control = h('input', { id, type: 'text', inputMode: 'decimal', value: v.map((x) => String(x).replace('.', ',')).join('; ') }) as HTMLInputElement;
    const problema = h('p', { class: 'micms-error', hidden: true });
    control.addEventListener('input', () => {
      const partes = control.value.split(';').map((s) => s.trim()).filter(Boolean);
      const nums = partes.map((s) => Number(s.replace(',', '.')));
      const mal = nums.some(Number.isNaN);
      problema.hidden = !mal;
      problema.textContent = mal ? 'Escribe solo números separados por punto y coma (;).' : '';
      if (!mal) poner(datos(f), ruta, nums);
      cambio();
    });
    const limites = [n.minItems && `mínimo ${n.minItems}`, n.maxItems && `máximo ${n.maxItems}`].filter(Boolean).join(', ');
    return h(
      'div',
      { class: 'micms-campo', 'data-campo': clave(f, ruta) },
      ...cabeceraCampo({ ...n, ayuda: [n.ayuda, `Separados por punto y coma${limites ? ` (${limites})` : ''}.`].filter(Boolean).join(' ') }, ruta, id),
      control,
      problema,
      ...erroresDe(f, ruta),
    );
  }

  function lista(f: string, n: Esquema, ruta: Ruta, sinTitulo: boolean) {
    const item = normalizar(n.items ?? {});
    const ti = tipoDe(item);
    if (ti === 'number' || ti === 'integer') return listaNumeros(f, n, ruta);
    const valores = (obtener(datos(f), ruta) as unknown[]) ?? [];
    const [min, max] = [n.minItems ?? 0, n.maxItems ?? Infinity];
    const simple = ti === 'string' && item.tipo !== 'imagen';

    const mover = (i: number, d: number) => {
      const l = valores.slice();
      [l[i], l[i + d]] = [l[i + d], l[i]];
      poner(datos(f), ruta, l);
      cambio(true);
    };
    const quitar = (i: number) => {
      const l = valores.slice();
      l.splice(i, 1);
      poner(datos(f), ruta, l);
      cambio(true);
    };
    const anadir = () => {
      poner(datos(f), ruta, [...valores, vacio(item)]);
      abiertos.add(clave(f, [...ruta, valores.length]));
      cambio(true);
    };
    const nombreItem = (item.etiqueta ?? 'elemento').toLowerCase();
    const controles = (i: number) =>
      h(
        'div',
        { class: 'micms-controles' },
        h('button', { type: 'button', class: 'micms-mini', disabled: i === 0, onclick: () => mover(i, -1), 'aria-label': `Subir ${nombreItem} ${i + 1}`, title: 'Subir' }, '↑'),
        h('button', { type: 'button', class: 'micms-mini', disabled: i === valores.length - 1, onclick: () => mover(i, 1), 'aria-label': `Bajar ${nombreItem} ${i + 1}`, title: 'Bajar' }, '↓'),
        h('button', { type: 'button', class: 'micms-mini quitar', disabled: valores.length <= min, onclick: () => quitar(i), 'aria-label': `Quitar ${nombreItem} ${i + 1}`, title: 'Quitar' }, '✕'),
      );

    const elementos = valores.map((v, i) => {
      if (simple) return h('div', { class: 'micms-fila' }, campo(f, n.items!, [...ruta, i]), controles(i));
      const k = clave(f, [...ruta, i]);
      const resumen = typeof v === 'object' && v ? Object.values(v).find((x) => typeof x === 'string' && x) : v;
      const d = h(
        'details',
        { class: 'micms-tarjeta', open: abiertos.has(k) || errores.some((e) => e.fichero === f && e.ruta && clave(f, e.ruta.slice(0, ruta.length + 1)) === k), ontoggle: () => (d.open ? abiertos.add(k) : abiertos.delete(k)) },
        h('summary', {}, h('span', { class: 'micms-resumen' }, `${i + 1}. ${String(resumen ?? '').slice(0, 70) || '(vacío)'}`), controles(i)),
        campo(f, n.items!, [...ruta, i], true),
      ) as HTMLDetailsElement;
      return d;
    });

    const cuenta = `${valores.length}${Number.isFinite(max) ? ` de ${max} como máximo` : ''}${min ? ` · mínimo ${min}` : ''}`;
    return h(
      'div',
      { class: 'micms-lista', 'data-campo': clave(f, ruta) },
      !sinTitulo ? h('div', { class: 'micms-etiqueta' }, h('span', { class: 'micms-titulo-lista' }, etiquetaDe(n, ruta))) : null,
      n.ayuda && !sinTitulo ? h('p', { class: 'micms-ayuda-campo' }, n.ayuda) : null,
      h('p', { class: 'micms-cuenta' }, cuenta),
      ...elementos,
      ...erroresDe(f, ruta),
      h('button', { type: 'button', class: 'micms-btn secundario', disabled: valores.length >= max, onclick: anadir }, `+ Añadir ${nombreItem}`),
    );
  }

  function foto(f: string, n: Esquema, ruta: Ruta) {
    const id = nuevoId();
    const archivo = String(obtener(datos(f), ruta) ?? '');
    const subida = subidas.get(archivo);
    const r = n.imagen ?? {};
    const requisitos = [r.proporcion && `Se recorta a ${proporcionLegible(r.proporcion)}`, r.minAncho && `mínimo ${r.minAncho} px de ancho`, r.transparente && 'PNG con fondo transparente'].filter(Boolean).join(' · ');
    const problema = h('p', { class: 'micms-error', role: 'alert', hidden: true });
    const entrada = h('input', { id, type: 'file', accept: r.transparente ? 'image/png' : 'image/jpeg,image/png,image/webp', class: 'micms-oculto' }) as HTMLInputElement;
    entrada.addEventListener('change', async () => {
      const fichero = entrada.files?.[0];
      if (!fichero) return;
      problema.hidden = true;
      try {
        const nueva = await prepararFoto(fichero, r);
        const base = String(ruta.length > 1 && typeof ruta[ruta.length - 2] === 'string' ? ruta[ruta.length - 2] : 'foto')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        const nombre = `${base}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}.${nueva.ext}`;
        subidas.set(nombre, nueva);
        poner(datos(f), ruta, nombre);
        // Si la foto tiene descripción al lado, hay que revisarla: describía la foto anterior.
        const hermanos = obtener(datos(f), ruta.slice(0, -1));
        if (hermanos && typeof hermanos === 'object' && 'alt' in hermanos) revisar.add(clave(f, [...ruta.slice(0, -1), 'alt']));
        cambio(true);
      } catch (e) {
        problema.textContent = (e as Error).message;
        problema.hidden = false;
      }
      entrada.value = '';
    });
    const src = subida?.url ?? (archivo && E.imagenes.includes(archivo) ? `${api('imagen')}?archivo=${encodeURIComponent(archivo)}&ref=${E.commit}` : '');
    return h(
      'div',
      { class: 'micms-campo micms-foto', 'data-campo': clave(f, ruta) },
      h('div', { class: 'micms-etiqueta' }, h('span', {}, etiquetaDe(n, ruta))),
      n.ayuda ? h('p', { class: 'micms-ayuda-campo' }, n.ayuda) : null,
      h(
        'div',
        { class: 'micms-foto-fila' },
        src ? h('img', { src, alt: '', class: 'micms-miniatura', style: r.proporcion ? `aspect-ratio: ${r.proporcion}` : undefined }) : h('div', { class: 'micms-miniatura vacia' }, 'Sin foto'),
        h(
          'div',
          {},
          h('label', { for: id, class: 'micms-btn secundario' }, archivo ? 'Cambiar foto' : 'Elegir foto'),
          entrada,
          requisitos ? h('p', { class: 'micms-ayuda-campo' }, requisitos) : null,
          subida ? h('p', { class: 'micms-ayuda-campo' }, `Nueva: ${subida.ancho}×${subida.alto} px · se sube al publicar`) : null,
        ),
      ),
      problema,
      ...erroresDe(f, ruta),
    );
  }

  /** Cómo se verá en Google (si el esquema del fichero lo pide con `google`). */
  function vistaGoogle(f: string) {
    const g = normalizar(E.ficheros[f].esquema).google!;
    const rellenar = (s = '') => s.replace(/\{(\w+)\}/g, (_, k) => String(datos(f)[k] ?? ''));
    const titulo = h('p', { class: 'micms-g-titulo' });
    const desc = h('p', { class: 'micms-g-desc' });
    const notas = h('p', { class: 'micms-ayuda-campo' });
    const refrescar = () => {
      const [t, d] = [rellenar(g.titulo), rellenar(g.descripcion)];
      titulo.textContent = t.length > 60 ? `${t.slice(0, 58)}…` : t;
      desc.textContent = d.length > 160 ? `${d.slice(0, 157)}…` : d;
      const avisos = [t.length > 60 && `el título tiene ${t.length} caracteres y Google corta hacia los 60`, d.length < 70 && 'la descripción es corta', d.length > 160 && `la descripción tiene ${d.length} caracteres y Google corta hacia los 160`].filter(Boolean);
      notas.textContent = avisos.length ? `Ojo: ${avisos.join('; ')}.` : 'Título y descripción con buena longitud.';
    };
    previsualizaciones.push(refrescar);
    refrescar();
    const host = E.sitio ? new URL(E.sitio).host : location.host;
    return h('section', { class: 'micms-google', 'aria-label': 'Vista previa en Google' }, h('p', { class: 'micms-g-etiqueta' }, 'Así se verá en Google'), h('p', { class: 'micms-g-url' }, host), titulo, desc, notas);
  }

  // ── Cambios, barra y publicación ──

  function barra() {
    barraEstado = h('p', { class: 'micms-estado', 'aria-live': 'polite' });
    botonDeshacer = h('button', { type: 'button', class: 'micms-btn secundario', onclick: deshacer }, 'Deshacer cambios') as HTMLButtonElement;
    botonPublicar = h('button', { type: 'button', class: 'micms-btn principal', onclick: publicar }, 'Publicar') as HTMLButtonElement;
    return h('div', { class: 'micms-barra' }, barraEstado, h('div', { class: 'micms-controles' }, botonDeshacer, botonPublicar));
  }

  function actualizarBarra() {
    const c = cambiados();
    const n = c.length;
    barraEstado.textContent = publicando ? 'Publicando…' : n ? `Cambios sin publicar en ${c.map((f) => E.ficheros[f].esquema.etiqueta ?? f).join(', ')}` : 'Todo publicado';
    botonPublicar.disabled = publicando || !n;
    botonDeshacer.disabled = publicando || !n;
  }

  /** Tras cada cambio. `repintar`: si cambia la estructura (listas, fotos, casillas que muestran campos). */
  function cambio(repintar = false) {
    if (repintar) {
      const y = window.scrollY;
      pintar();
      window.scrollTo(0, y);
    } else {
      previsualizaciones.forEach((p) => p());
      actualizarBarra();
    }
  }

  function deshacer() {
    if (!confirm('¿Deshacer todos los cambios que no has publicado?')) return;
    for (const f of Object.keys(E.ficheros)) E.ficheros[f].datos = JSON.parse(original[f]);
    subidas.clear();
    errores = [];
    aviso = null;
    cambio(true);
  }

  async function publicar() {
    const c = cambiados();
    if (!c.length) return;
    publicando = true;
    aviso = null;
    actualizarBarra();
    const ficheros = Object.fromEntries(c.map((f) => [f, datos(f)]));
    const texto = JSON.stringify(ficheros);
    const fotos = Object.fromEntries([...subidas].filter(([n]) => texto.includes(`"${n}"`)).map(([n, x]) => [n, x.base64]));
    let r: Response;
    let cuerpo: { commit?: string | null; errores?: ErrorCampo[] } = {};
    try {
      r = await fetch(api('publicar'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: E.commit, ficheros, fotos }) });
      cuerpo = await r.json().catch(() => ({}));
    } catch {
      publicando = false;
      aviso = { texto: 'No hay conexión: no se ha publicado nada. Prueba otra vez.', tipo: 'err' };
      return cambio(true);
    }
    publicando = false;
    if (r.ok) {
      errores = [];
      if (!cuerpo.commit) {
        aviso = { texto: 'No había nada nuevo que publicar.', tipo: 'info' };
        return cambio(true);
      }
      await cargar();
      esperarPublicacion(cuerpo.commit);
      return;
    }
    errores = cuerpo.errores ?? [{ mensaje: 'No se ha podido publicar.' }];
    const conCampo = errores.filter((e) => e.fichero && e.ruta?.length);
    aviso = { texto: conCampo.length ? 'No se ha publicado nada: revisa los campos marcados en rojo.' : errores[0].mensaje, tipo: 'err' };
    if (conCampo.length) pestana = conCampo[0].fichero!;
    if (r.status !== 422) errores = []; // el mensaje ya está en el aviso
    cambio(true);
    (raiz.querySelector('[data-campo] .micms-error:not([hidden])') ?? raiz.querySelector('.micms-aviso.err'))?.scrollIntoView({ block: 'center' });
  }

  /** Consulta /_micms/version.json hasta que la web publicada tenga el commit nuevo. */
  async function versionPublicada(): Promise<string | null | undefined> {
    try {
      const r = await fetch(`${urlVersion}?t=${Date.now()}`, { cache: 'no-store' });
      return r.ok ? ((await r.json()).commit as string | null) : undefined;
    } catch {
      return undefined;
    }
  }

  async function esperarPublicacion(commit: string) {
    if (autoPublica === false) {
      aviso = { texto: 'Cambios guardados. Esta web se publica a mano: se verán en cuanto se vuelva a publicar.', tipo: 'ok' };
      return cambio(true);
    }
    aviso = { texto: 'Cambios guardados. Actualizando la web… (suele tardar uno o dos minutos)', tipo: 'info' };
    cambio(true);
    const hasta = Date.now() + 10 * 60_000;
    while (Date.now() < hasta) {
      await new Promise((r) => setTimeout(r, 5000));
      if ((await versionPublicada()) === commit) {
        aviso = { texto: '¡Publicado! Los cambios ya se ven en la web.', tipo: 'ok', enlace: true };
        return cambio(true);
      }
    }
    aviso = { texto: 'Los cambios están guardados, pero la web tarda más de lo normal en actualizarse. Mira la web dentro de un rato.', tipo: 'info' };
    cambio(true);
  }

  window.addEventListener('beforeunload', (e) => {
    if (E && cambiados().length) e.preventDefault();
  });

  await cargar();
  // ¿La web se compila sola desde GitHub? Si la versión publicada no sabe de qué commit sale, se publica a mano.
  const v = await versionPublicada();
  autoPublica = v === undefined ? null : v !== null;
  if (autoPublica === false && !aviso) {
    aviso = { texto: 'Aviso: esta web no se publica sola desde GitHub. Los cambios se guardarán y se verán cuando se vuelva a publicar.', tipo: 'info' };
    if (E) cambio(true);
  }
}
