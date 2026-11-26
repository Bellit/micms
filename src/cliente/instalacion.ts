// Pestaña «Instalación» del panel: comprueba que el gestor está bien conectado y reúne los requisitos y el
// prompt para adaptar otra web. El prompt se lee de PROMPT-ADAPTAR.md (una sola copia).
import promptMd from '../../PROMPT-ADAPTAR.md?raw';
import { h } from './dom';

type Nivel = 'ok' | 'aviso' | 'error' | 'info';
type Comprobacion = { titulo: string; nivel: Nivel; detalle: string };
type Diagnostico = {
  comprobaciones: Comprobacion[];
  commit: string | null;
  ajustes: { version: string; ruta: string; base: string; carpeta: string; acceso: string; repo: string | null; rama: string; ficheros: string[] };
};
type Opciones = { api: (accion: string) => string; urlVersion: string };

const REPO = 'https://github.com/Bellit/micms';
const PROMPT = promptMd.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1] ?? '';
const NOMBRE: Record<Nivel, string> = { ok: 'Correcto', aviso: 'Aviso', error: 'Error', info: 'Información' };
const SIMBOLO: Record<Nivel, string> = { ok: '✓', aviso: '!', error: '✕', info: 'i' };

/** Commit con el que se compiló la web publicada: string, null (compilada a mano) o undefined (no se sabe). */
async function versionPublicada(url: string): Promise<string | null | undefined> {
  try {
    const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()).commit as string | null) : undefined;
  } catch {
    return undefined;
  }
}

/** ¿La web publicada sale del último commit? Se mira desde el navegador, que es quien ve la web publicada. */
function publicacion(commit: string | null, publicado: string | null | undefined): Comprobacion {
  const titulo = 'Publicación automática';
  if (publicado === undefined)
    return { titulo, nivel: 'aviso', detalle: 'No se encuentra _micms/version.json en la web publicada. ¿Se ha compilado con micms instalado?' };
  if (publicado === null)
    return { titulo, nivel: 'aviso', detalle: 'La web publicada se compiló a mano: los cambios se guardarán en GitHub, pero no se verán hasta la próxima publicación. Conecta la publicación al repositorio.' };
  if (!commit) return { titulo, nivel: 'info', detalle: `La web publicada sale del commit ${publicado.slice(0, 7)}.` };
  if (publicado === commit) return { titulo, nivel: 'ok', detalle: `La web publicada es la del último commit (${commit.slice(0, 7)}).` };
  return {
    titulo,
    nivel: 'aviso',
    detalle: `La web publicada (${publicado.slice(0, 7)}) no es la del último commit (${commit.slice(0, 7)}). Si se acaba de publicar, espera un par de minutos; si no, revisa que la publicación esté conectada al repositorio y que la última compilación no haya fallado.`,
  };
}

function lista(comprobaciones: Comprobacion[]) {
  return h(
    'ul',
    { class: 'micms-comprobaciones' },
    ...comprobaciones.map((c) =>
      h(
        'li',
        { class: `micms-nivel ${c.nivel}` },
        h('span', { class: 'micms-simbolo', 'aria-hidden': 'true' }, SIMBOLO[c.nivel]),
        h('span', { class: 'micms-oculto-lector' }, `${NOMBRE[c.nivel]}: `),
        h('span', {}, h('strong', {}, c.titulo), ' ', c.detalle),
      ),
    ),
  );
}

function ajustes(a: Diagnostico['ajustes']) {
  const filas: [string, string][] = [
    ['Versión de micms', a.version],
    ['Repositorio', a.repo ? `${a.repo} · rama ${a.rama}` : 'sin configurar'],
    ['Contenido', `${a.carpeta}/ (${a.ficheros.join(', ')})`],
    ['Fotos', `${a.carpeta}/imagenes/`],
    ['Dirección del gestor', `${a.base === '/' ? '' : a.base}${a.ruta}`],
    ['Acceso', a.acceso === 'web' ? 'login de la web' : 'clave propia (MICMS_CLAVE)'],
  ];
  return h('dl', { class: 'micms-ajustes' }, ...filas.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

function requisitos(version: string) {
  const puntos = [
    'Astro 7 o posterior, en un repositorio de GitHub que se publica solo al hacer commit.',
    'Un adaptador de servidor (Cloudflare, Node, Netlify o Vercel). Con GitHub Pages no funciona.',
    'Todo lo editable en JSON dentro de src/contenido/; ningún texto del cliente escrito en los .astro.',
    'src/contenido/esquemas.ts exporta ESQUEMAS, con Zod de astro/zod, etiqueta y longitud máxima en cada campo.',
    'Las fotos en src/contenido/imagenes/ y, en el JSON, su nombre y su texto alternativo.',
    'Las páginas validan el contenido con su esquema al compilar.',
  ];
  return h(
    'details',
    { class: 'micms-seccion' },
    h('summary', {}, 'Requisitos de la web'),
    h('ul', { class: 'micms-puntos' }, ...puntos.map((p) => h('li', {}, p))),
    h('p', {}, h('a', { href: `${REPO}/blob/v${version}/COMPATIBILIDAD.md`, target: '_blank', rel: 'noopener' }, 'Lista completa, tipos de campo y comprobación final (COMPATIBILIDAD.md)')),
  );
}

function prompt(version: string) {
  const estado = h('span', { class: 'micms-estado', role: 'status' });
  const texto = h('textarea', { class: 'micms-prompt', readonly: true, rows: 12, 'aria-label': 'Prompt para adaptar una web' }) as HTMLTextAreaElement;
  texto.value = PROMPT;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT);
      estado.textContent = 'Copiado.';
    } catch {
      texto.select();
      estado.textContent = 'Selecciónalo y cópialo con Ctrl+C.';
    }
  };
  return h(
    'details',
    { class: 'micms-seccion' },
    h('summary', {}, 'Adaptar otra web a micms'),
    h('p', {}, 'Para una web Astro que aún no es compatible: copia este prompt y pégalo en la IA que trabaje en su repositorio. Primero hace un diagnóstico y espera; después la adapta sin cambiar cómo se ve.'),
    texto,
    h('div', { class: 'micms-fila-botones' }, h('button', { type: 'button', class: 'micms-btn principal', onclick: copiar }, 'Copiar el prompt'), estado),
    h('p', {}, h('a', { href: `${REPO}/blob/v${version}/PROMPT-ADAPTAR.md`, target: '_blank', rel: 'noopener' }, 'Ver en GitHub (PROMPT-ADAPTAR.md)')),
  );
}

/** Pinta la pestaña en `cont`. Se puede abrir aunque el contenido no cargue (precisamente para ver por qué). */
export async function pintarInstalacion(cont: HTMLElement, o: Opciones) {
  const comprobar = () => pintarInstalacion(cont, o);
  cont.replaceChildren(h('p', { class: 'micms-cargando' }, 'Comprobando la instalación…'));
  let d: Diagnostico;
  try {
    const r = await fetch(o.api('diagnostico'), { cache: 'no-store' });
    if (r.status === 401) return location.reload();
    const cuerpo = await r.json();
    if (!r.ok) throw new Error(cuerpo.errores?.[0]?.mensaje);
    d = cuerpo;
  } catch (e) {
    cont.replaceChildren(
      h('p', { class: 'micms-aviso err', role: 'alert' }, (e as Error).message || 'No se ha podido comprobar la instalación.'),
      h('button', { type: 'button', class: 'micms-btn', onclick: comprobar }, 'Volver a comprobar'),
    );
    return;
  }
  const todas = [...d.comprobaciones, publicacion(d.commit, await versionPublicada(o.urlVersion))];
  const errores = todas.filter((c) => c.nivel === 'error').length;
  const avisos = todas.filter((c) => c.nivel === 'aviso').length;
  const resumen = errores
    ? { clase: 'err', texto: `${errores} ${errores > 1 ? 'cosas impiden' : 'cosa impide'} que el gestor funcione. Abajo dice cómo arreglarlo.` }
    : avisos
      ? { clase: 'info', texto: `El gestor funciona, con ${avisos} aviso${avisos > 1 ? 's' : ''}.` }
      : { clase: 'ok', texto: 'Todo en orden.' };

  cont.replaceChildren(
    h('p', { class: `micms-aviso ${resumen.clase}`, role: errores ? 'alert' : 'status' }, resumen.texto),
    h('section', { class: 'micms-seccion micms-bloque', 'aria-labelledby': 'micms-estado-inst' }, h('h2', { id: 'micms-estado-inst' }, 'Estado'), lista(todas), h('button', { type: 'button', class: 'micms-btn', onclick: comprobar }, 'Volver a comprobar')),
    h('section', { class: 'micms-seccion micms-bloque', 'aria-labelledby': 'micms-ajustes-inst' }, h('h2', { id: 'micms-ajustes-inst' }, 'Configuración'), ajustes(d.ajustes), h('p', { class: 'micms-ayuda-campo' }, 'Se cambia en astro.config.mjs y en los secretos del alojamiento, no desde aquí.')),
    requisitos(d.ajustes.version),
    prompt(d.ajustes.version),
  );
}
