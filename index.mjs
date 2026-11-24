// micms: integración de Astro que añade el gestor de contenido al panel de la web.
//
//   import micms from 'micms';
//   integrations: [micms({ layout: 'src/layouts/Admin.astro' })]
//
// Añade dos rutas que ejecuta el Worker (no se generan en estático):
//   <ruta>              el panel (formularios generados a partir de los esquemas)
//   <ruta>/api/<acción> estado · imagen · publicar
// y, al compilar, `_micms/version.json` con el commit publicado (para saber cuándo está en línea un cambio).
//
// IMPORTANTE: micms no tiene login propio. La ruta tiene que estar protegida por el de la web
// (en la Plantilla, el middleware protege todo /admin) y los POST, por la comprobación de origen.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAQUETE = fileURLToPath(new URL('./', import.meta.url));
const barras = (p) => p.replace(/\\/g, '/');

/**
 * @param {object} [o]
 * @param {string} [o.layout]     plantilla del panel de la web (recibe `title` y `actual="contenido"`). Por defecto, src/layouts/Admin.astro
 * @param {string} [o.carpeta]    carpeta del contenido, desde la raíz del repositorio. Por defecto, src/contenido
 * @param {string} [o.esquemas]   módulo que exporta ESQUEMAS ({ 'fichero.json': esquemaZod }). Por defecto, <carpeta>/esquemas.ts
 * @param {string} [o.marcadores] módulo que exporta MARCADORES ({ nombre: explicación }), opcional. Por defecto, <carpeta>/marcadores.ts si existe
 * @param {string} [o.ruta]       dirección del panel. Por defecto, /admin/contenido
 * @returns {import('astro').AstroIntegration}
 */
export default function micms(o = {}) {
  const carpeta = (o.carpeta ?? 'src/contenido').replace(/\/$/, '');
  const ruta = (o.ruta ?? '/admin/contenido').replace(/\/$/, '');

  return {
    name: 'micms',
    hooks: {
      'astro:config:setup': ({ config, injectRoute, updateConfig, logger }) => {
        const raiz = fileURLToPath(config.root);
        const abs = (p) => barras(resolve(raiz, p));
        const esquemas = abs(o.esquemas ?? `${carpeta}/esquemas.ts`);
        const layout = abs(o.layout ?? 'src/layouts/Admin.astro');
        const marcadores = o.marcadores ? abs(o.marcadores) : existsSync(abs(`${carpeta}/marcadores.ts`)) ? abs(`${carpeta}/marcadores.ts`) : null;
        for (const [que, f] of [['esquemas', esquemas], ['layout', layout]]) if (!existsSync(f)) throw new Error(`micms: no existe ${f} (opción «${que}»)`);
        if (!ruta.startsWith('/admin')) logger.warn(`La ruta ${ruta} no está dentro de /admin: comprueba que la protege el login de la web.`);

        const opciones = { carpeta, ruta, sitio: config.site ?? null };

        // Módulos virtuales: se resuelven desde la web, así Zod y Astro son los de la web (una sola copia).
        const virtuales = {
          'virtual:micms/config': `
import { z } from 'astro/zod';
import { ESQUEMAS } from ${JSON.stringify(esquemas)};
${marcadores ? `import { MARCADORES } from ${JSON.stringify(marcadores)};` : 'const MARCADORES = {};'}
z.config(z.locales.es());
export const OPCIONES = ${JSON.stringify(opciones)};
export { MARCADORES };
export const FICHEROS = Object.keys(ESQUEMAS);
export const ESQUEMAS_JSON = Object.fromEntries(
  Object.entries(ESQUEMAS).map(([k, e]) => [k, z.toJSONSchema(e, { io: 'input', unrepresentable: 'any' })]),
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

      // Commit con el que se ha compilado esta versión de la web. Cloudflare (Workers Builds) lo da en
      // WORKERS_CI_COMMIT_SHA; GitHub Actions, en GITHUB_SHA. Compilado a mano, null.
      'astro:build:done': async ({ dir, logger }) => {
        const commit = process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || null;
        const destino = new URL('_micms/', dir);
        await mkdir(destino, { recursive: true });
        await writeFile(new URL('version.json', destino), JSON.stringify({ commit, fecha: new Date().toISOString() }) + '\n');
        logger.info(`_micms/version.json (commit ${commit ?? 'desconocido: compilado a mano'})`);
      },
    },
  };
}
