# micms

Gestor de contenido para webs Astro. Desde un panel, el cliente cambia **textos, fotos y SEO**, sin tocar el diseño. Al pulsar «Publicar», los cambios se guardan en el repositorio de GitHub de la web y el alojamiento (Cloudflare, Netlify, Vercel…) vuelve a compilarla y publicarla.

- La web sigue siendo **estática**: no hay base de datos para el contenido.
- Los formularios se **generan solos** a partir de los esquemas Zod de la web (`src/contenido/esquemas.ts`): etiquetas, ayudas, límites de caracteres, número de elementos de las listas, proporción y tamaño mínimo de las fotos.
- **Nada se rompe:** se valida en el navegador, en el servidor antes de guardar y otra vez en `astro build`. Si algo no cumple, no se publica.
- **Nada se pisa:** cada publicación es un commit encima del que se abrió. Si alguien ha publicado entretanto, se avisa y no se guarda.
- El cliente **no necesita cuenta de GitHub**: el servidor usa un token guardado como secreto.
- Funciona con cualquier adaptador de Astro, con webs en una subcarpeta (`base`) y con barra final (`trailingSlash`).

El plan completo, con las fases, está en [PLAN.md](PLAN.md).

## Qué necesita la web

**[COMPATIBILIDAD.md](COMPATIBILIDAD.md)**: la lista exacta de requisitos, los tipos de campo que se pueden editar y la comprobación final. En resumen:

- Astro 7 o posterior, en un repositorio de GitHub que se publica solo al hacer commit.
- Un adaptador de servidor (`@astrojs/cloudflare`, `node`, `netlify` o `vercel`). Con GitHub Pages no funciona.
- Todo lo editable en `src/contenido/*.json`, con su esquema Zod en `src/contenido/esquemas.ts` (`export const ESQUEMAS`) y las fotos en `src/contenido/imagenes/`.

¿La web no cumple? **[PROMPT-ADAPTAR.md](PROMPT-ADAPTAR.md)** es un prompt para que una IA la adapte sin cambiar cómo se ve. Web mínima de ejemplo: [`ejemplo/`](ejemplo/).

### Metadatos de los esquemas (`.meta()`)

| Clave | Para qué |
|---|---|
| `etiqueta` | Nombre del campo, de la sección o de la pestaña |
| `ayuda` | Frase de ayuda debajo del campo |
| `tipo` | `linea` · `parrafo` · `titular` (vista previa de `*subrayado*` y `[píldora]`) · `email` · `telefono` · `url` · `imagen` |
| `imagen` | `{ proporcion, minAncho, transparente }`: la foto se recorta al centro con esa proporción en el navegador. Si es pequeña, se rechaza. Si `transparente`, solo PNG |
| `ocultarSi` | No muestra el campo si el campo hermano con ese nombre está marcado |
| `google` | En la raíz de un fichero: `{ titulo, descripcion }` con `{campo}`. Muestra cómo se verá en Google |

Lo demás sale del propio esquema: `max` → contador y límite, `min`/`max` de listas → añadir y quitar, `.nullable()` → casilla para activar el bloque, `.optional()` → campo que puede quedar vacío, listas de números → una línea separada por `;`.

## Instalación

```bash
npm install github:Bellit/micms#v0.3.0
```

```js
// astro.config.mjs
import micms from 'micms';
export default defineConfig({
  adapter: cloudflare(),
  integrations: [micms()],
});
```

| Opción | Por defecto | Qué es |
|---|---|---|
| `acceso` | `'propio'` | `'propio'`: micms pide su clave (`MICMS_CLAVE`). `'web'`: la ruta la protege el login de la web |
| `layout` | página propia | Plantilla del panel de la web (recibe `title` y `actual="contenido"`) |
| `ruta` | `/admin/contenido` | Dirección del gestor (sin la `base` de la web) |
| `carpeta` | `src/contenido` | Carpeta de los JSON; las fotos, en `<carpeta>/imagenes` |
| `esquemas` | `<carpeta>/esquemas.ts` | Módulo que exporta `ESQUEMAS` |
| `marcadores` | `<carpeta>/marcadores.ts` si existe | Módulo que exporta `MARCADORES` |

Si la web ya tiene un panel con login (como la Plantilla Landing Reservas): `micms({ acceso: 'web', layout: 'src/layouts/Admin.astro' })`, la pestaña «Contenido» en el menú del panel y, en Cloudflare, `run_worker_first` con `/admin/*`.

### Pestaña «Instalación»

En el propio panel, junto a las pestañas del contenido. Comprueba en el momento:
- si están los secretos (sin mostrar su valor);
- si GitHub acepta el token, si existe la rama y cuándo caduca el token;
- si cada JSON está en el repositorio y cumple su esquema, y si falta alguna foto;
- si la web publicada sale del último commit (publicación automática).

Si algo falla, dice cómo arreglarlo. También muestra la configuración, los requisitos de la web y el prompt de [PROMPT-ADAPTAR.md](PROMPT-ADAPTAR.md) con un botón para copiarlo. Si el contenido no llega a cargar (por ejemplo, porque falta el token), el aviso de error tiene un botón «Comprobar la instalación».

### Acceso (login propio)

Con `acceso: 'propio'`, el gestor pide una clave: el secreto `MICMS_CLAVE` (mínimo 12 caracteres). La sesión es una cookie firmada (`HttpOnly`, `SameSite=Strict`, solo para la ruta del gestor) que dura 12 horas. Cambiar la clave cierra todas las sesiones. Cada intento fallido tarda 1 segundo. Sin `MICMS_CLAVE`, el gestor no se abre y dice qué falta.

### Conectar con GitHub

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
   - Repository access: **solo el repositorio de esa web**.
   - Permissions → Repository → **Contents: Read and write**. Nada más.
   - Caducidad: la más larga que permita tu cuenta, y apúntala para renovarlo.
2. Guarda los secretos (nunca en el código ni en el chat):
   - **Cloudflare:** `npx wrangler secret put MICMS_CLAVE`, `… GITHUB_TOKEN` y `… GITHUB_REPO` (`usuario/repositorio`). En local, en `.dev.vars`.
   - **Netlify, Vercel o Node:** como variables de entorno del servidor.
   - Opcional: `GITHUB_RAMA` si no es `main`.
3. Conecta la publicación al repositorio. En Cloudflare: el Worker → Settings → **Builds**, con build command `npm run build` y deploy command `npx wrangler deploy`.

Para saber cuándo un cambio ya está en línea, la compilación escribe `/_micms/version.json` con el commit. Lo toma de `WORKERS_CI_COMMIT_SHA` (Cloudflare Workers Builds), `CF_PAGES_COMMIT_SHA`, `COMMIT_REF` (Netlify), `VERCEL_GIT_COMMIT_SHA` o `GITHUB_SHA`. Si la web se compila a mano, el panel avisa de que los cambios se verán en la próxima publicación.

## Cómo funciona

| Ruta | Qué hace |
|---|---|
| `GET <ruta>` | El panel (`src/paginas/panel.astro` + `src/cliente/panel.ts`) |
| `GET <ruta>/api/estado` | Último commit, esquemas en JSON (`z.toJSONSchema`), datos de cada fichero y fotos que hay |
| `GET <ruta>/api/imagen?archivo=&ref=` | Una foto del repositorio, para verla en el panel |
| `GET <ruta>/api/diagnostico` | Estado de la instalación (pestaña «Instalación»). Funciona aunque falte GitHub |
| `POST <ruta>/api/publicar` | `{ base, ficheros, fotos }` → valida y hace un solo commit (API de Git de GitHub: blobs, tree, commit y avance de la rama sin forzar) |
| `POST <ruta>/api/entrar` · `salir` | Login propio (formulario; lo protege la comprobación de origen de Astro) |

Todo menos «entrar» exige sesión. Las respuestas llevan `X-Robots-Tag: noindex` y no se guardan en caché.

Al publicar:
- Solo se guardan los ficheros que cambian.
- Las fotos nuevas se suben si se usan.
- Las fotos que el contenido deja de usar se borran del repositorio. Las demás no se tocan.
- Las fotos subidas se comprueban por sus primeros bytes y no pueden pasar de 5 MB cada una (20 MB por publicación).

Zod y los esquemas se cargan desde la web mediante un módulo virtual (`virtual:micms/config`), así hay una sola copia de Zod y de Astro. Los secretos se leen con `astro:env/server`, que funciona con cualquier adaptador.

## Pruebas

- `npm test`: lectura de esquemas.
- `cd ejemplo && npm install && npm test`: compila la web de ejemplo (adaptador Node, `base` y barra final), arranca el servidor con un GitHub falso y prueba de extremo a extremo el login, la seguridad, la lectura, la validación, la publicación, los conflictos y las fotos (36 comprobaciones, con la pestaña «Instalación»).
- `micms/pruebas` exporta `githubFalso()`, un servidor que imita la API de GitHub que usa micms. La Plantilla lo usa en `tests/contenido.test.mjs` para probar el panel y la API con un Worker de verdad: acceso, lectura, publicar, validación, conflictos y fotos.
