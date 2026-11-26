// micms: integración de Astro que añade un gestor de contenido (textos, fotos y SEO) a la web.
//
//   import micms from 'micms';
//   integrations: [micms()]
//
// Añade dos rutas que se ejecutan en el servidor (no se generan en estático), así que la web necesita un adaptador:
//   <ruta>              el panel (formularios generados a partir de los esquemas)
//   <ruta>/api/<acción> estado · imagen · publicar · entrar · salir
// y, al compilar, `_micms/version.json` con el commit publicado (para saber cuándo está en línea un cambio).
//
// Acceso: por defecto micms tiene su propio login (secreto MICMS_CLAVE). Si la web ya tiene un panel con login
// que protege la ruta, `acceso: 'web'` y `layout` con la plantilla de ese panel.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAQUETE = fileURLToPath(new URL('./', import.meta.url));
const barras = (p) => p.replace(/\\/g, '/');

/**
 * @param {object} [o]
 * @param {'propio'|'web'} [o.acceso] quién protege el gestor: su propio login (secreto MICMS_CLAVE, por defecto) o el de la web
 * @param {string} [o.layout]     plantilla del panel de la web (recibe `title` y `actual="contenido"`). Por defecto, una página propia
 * @param {string} [o.carpeta]    carpeta del contenido, desde la raíz del repositorio. Por defecto, src/contenido
 * @param {string} [o.esquemas]   módulo que exporta ESQUEMAS ({ 'fichero.json': esquemaZod }). Por defecto, <carpeta>/esquemas.ts
 * @param {string} [o.marcadores] módulo que exporta MARCADORES ({ nombre: explicación }), opcional. Por defecto, <carpeta>/marcadores.ts si existe
 * @param {string} [o.ruta]       dirección del panel (sin la `base` de la web). Por defecto, /admin/contenido
 * @returns {import('astro').AstroIntegration}
 */
export default function micms(o = {}) {
  const carpeta = (o.carpeta ?? 'src/contenido').replace(/^\.?\/+|\/+$/g, '');
  const ruta = '/' + (o.ruta ?? '/admin/contenido').replace(/^\/+|\/+$/g, '');
  const acceso = o.acceso ?? 'propio';
  if (acceso !== 'propio' && acceso !== 'web') throw new Error(`micms: «acceso» tiene que ser 'propio' o 'web', no ${JSON.stringify(acceso)}`);
  if (!/^\/[a-z0-9/_-]+$/i.test(ruta)) throw new Error(`micms: la ruta ${JSON.stringify(ruta)} solo puede tener letras, números, «-», «_» y «/»`);

  return {
    name: 'micms',
    hooks: {
      'astro:config:setup': ({ config, injectRoute, updateConfig, logger }) => {
        const raiz = fileURLToPath(config.root);
        const abs = (p) => barras(resolve(raiz, p));
        const esquemas = abs(o.esquemas ?? `${carpeta}/esquemas.ts`);
        const layout = o.layout ? abs(o.layout) : barras(fileURLToPath(new URL('./src/paginas/Base.astro', import.meta.url)));
        const marcadores = o.marcadores ? abs(o.marcadores) : existsSync(abs(`${carpeta}/marcadores.ts`)) ? abs(`${carpeta}/marcadores.ts`) : null;
        for (const [que, f] of [['esquemas', esquemas], ['layout', layout], ['marcadores', marcadores]])
          if (f && !existsSync(f)) throw new Error(`micms: no existe ${f} (opción «${que}»)`);
        // Comprobaciones al compilar, para no descubrirlo al abrir el panel.
        const textoEsquemas = readFileSync(esquemas, 'utf8');
        if (!/export\s+(const|let|var)\s+ESQUEMAS\b|export\s*\{[^}]*\bESQUEMAS\b/.test(textoEsquemas))
          throw new Error(`micms: ${esquemas} tiene que exportar ESQUEMAS = { 'fichero.json': esquemaZod, … }`);
        if (/from\s+['"]zod['"]/.test(textoEsquemas)) logger.warn(`${esquemas} importa 'zod': usa 'astro/zod' para que sea la misma versión que Astro (Zod 4).`);
        if (acceso === 'web') logger.info(`acceso: 'web' → ${ruta} tiene que estar protegida por el login de la web.`);

        const opciones = {
          carpeta,
          ruta,
          acceso,
          sitio: config.site ?? null,
          base: (config.base ?? '/').replace(/\/+$/, ''), // '' en la raíz, '/mi-web' en una subcarpeta
          barra: config.trailingSlash === 'always',
        };

        // Módulos virtuales: se resuelven desde la web, así Zod y Astro son los de la web (una sola copia).
        const virtuales = {
          'virtual:micms/config': `
import { z } from 'astro/zod';
import * as modulo from ${JSON.stringify(esquemas)};
${marcadores ? `import { MARCADORES } from ${JSON.stringify(marcadores)};` : 'const MARCADORES = {};'}
const ESQUEMAS = modulo.ESQUEMAS;
if (!ESQUEMAS || typeof ESQUEMAS !== 'object')
  throw new Error(${JSON.stringify(`micms: ${esquemas} tiene que exportar ESQUEMAS = { 'fichero.json': esquemaZod }`)});
z.config(z.locales.es());
export const OPCIONES = ${JSON.stringify(opciones)};
export { MARCADORES };
export const FICHEROS = Object.keys(ESQUEMAS);
export const ESQUEMAS_JSON = Object.fromEntries(
  Object.entries(ESQUEMAS).map(([k, e]) => {
    if (!/^[\\w.-]+\\.json$/.test(k)) throw new Error('micms: en ESQUEMAS, «' + k + '» tiene que ser el nombre de un fichero .json de la carpeta del contenido');
    try {
      return [k, z.toJSONSchema(e, { io: 'input', unrepresentable: 'any' })];
    } catch (err) {
      throw new Error('micms: el esquema de ' + k + " no es de Zod 4 (impórtalo de 'astro/zod'): " + err.message);
    }
  }),
);
export function validar(fichero, datos) {
  const r = ESQUEMAS[fichero].safeParse(datos);
  return r.success ? [] : r.error.issues.map((i) => ({ ruta: i.path.map((p) => (typeof p === 'symbol' ? String(p) : p)), mensaje: i.message }));
}`,
          'virtual:micms/layout': `export { default } from ${JSON.stringify(layout)};`,
        };

        updateConfig({
          vite: {
            plugins: [
              {
                name: 'micms:virtual',
                resolveId: (id) => (id in virtuales ? `\0${id}` : undefined),
                load: (id) => (id.startsWith('\0') && id.slice(1) in virtuales ? virtuales[id.slice(1)] : undefined),
              },
            ],
            // Si micms está enlazado desde otra carpeta (file:), que use el Astro de la web y no otra copia.
            resolve: { dedupe: ['astro'] },
            server: { fs: { allow: [raiz, PAQUETE] } },
          },
        });

        injectRoute({ pattern: ruta, entrypoint: new URL('./src/paginas/panel.astro', import.meta.url), prerender: false });
        injectRoute({ pattern: `${ruta}/api/[accion]`, entrypoint: new URL('./src/paginas/api.ts', import.meta.url), prerender: false });
      },

      // El panel y la publicación se ejecutan en el servidor: sin adaptador, Astro no podría servirlos.
      'astro:config:done': ({ config }) => {
        if (!config.adapter)
          throw new Error(
            'micms necesita un adaptador de servidor (@astrojs/cloudflare, @astrojs/node, @astrojs/netlify o @astrojs/vercel): ' +
              'el panel y la publicación se ejecutan en el servidor, aunque la web siga siendo estática. Con GitHub Pages no funciona.',
          );
      },

      // Commit con el que se ha compilado esta versión de la web, según dónde se compile: Cloudflare Workers
      // Builds, Cloudflare Pages, Netlify, Vercel o GitHub Actions. Compilado a mano, null.
      'astro:build:done': async ({ dir, logger }) => {
        const e = process.env;
        const commit = e.WORKERS_CI_COMMIT_SHA || e.CF_PAGES_COMMIT_SHA || e.COMMIT_REF || e.VERCEL_GIT_COMMIT_SHA || e.GITHUB_SHA || null;
        const destino = new URL('_micms/', dir);
        await mkdir(destino, { recursive: true });
        await writeFile(new URL('version.json', destino), JSON.stringify({ commit, fecha: new Date().toISOString() }) + '\n');
        logger.info(`_micms/version.json (commit ${commit ?? 'desconocido: compilado a mano'})`);
      },
    },
  };
}
