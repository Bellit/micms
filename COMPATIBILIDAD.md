# Requisitos para que una web funcione con micms

Esta es la lista exacta. Si una web cumple **todos** los puntos obligatorios, basta con instalar micms y añadirlo a `astro.config.mjs`. Si no, usa el prompt de [PROMPT-ADAPTAR.md](PROMPT-ADAPTAR.md) para que una IA la adapte.

Ejemplo completo y mínimo que cumple todo: la carpeta [`ejemplo/`](ejemplo/).

---

## 1. Obligatorios

### 1.1 Proyecto y publicación

| # | Requisito | Cómo comprobarlo |
|---|---|---|
| 1 | **Astro 7 o posterior** | `package.json` → `"astro": "^7…"` |
| 2 | El código está en un **repositorio de GitHub**, y la rama que se publica es `main` (o se indica en `GITHUB_RAMA`) | `git remote -v` |
| 3 | La web se **publica sola al hacer commit** en esa rama (Cloudflare Workers Builds, Cloudflare Pages, Netlify o Vercel conectados al repositorio) | Un commit cualquiera se ve en la web al cabo de unos minutos sin hacer nada |
| 4 | Tiene un **adaptador de servidor**: `@astrojs/cloudflare` (recomendado), `@astrojs/node`, `@astrojs/netlify` o `@astrojs/vercel`. Las páginas siguen siendo estáticas; solo el gestor se ejecuta en el servidor | `astro.config.mjs` → `adapter: …` |
| 5 | **No** se publica en un alojamiento solo estático (GitHub Pages, FTP, un hosting que solo sirve ficheros). Ahí el gestor no puede ejecutarse | — |

Si falta el adaptador, `astro build` se para con este mensaje: «micms necesita un adaptador de servidor…».

### 1.2 Contenido

| # | Requisito |
|---|---|
| 6 | **Todo lo que el cliente pueda cambiar** está en ficheros **JSON** dentro de `src/contenido/`: textos, datos de contacto, horarios, precios, nombres de fotos y sus descripciones, título y descripción para Google |
| 7 | **Ningún texto editable escrito a mano** en los `.astro`, `.ts`, `.md` ni en componentes. Las páginas solo leen los JSON |
| 8 | Las **fotos editables** están en `src/contenido/imagenes/`, con nombres en minúsculas, sin espacios ni acentos (`[a-z0-9-]`) y extensión `.jpg`, `.jpeg`, `.png`, `.webp` o `.avif`. En el JSON solo va el nombre del fichero (`"foto": "local.jpg"`) |
| 9 | Las páginas cargan las fotos con `import.meta.glob('../contenido/imagenes/*', { eager: true })` (o equivalente) y las pintan con `<Image>` / `<Picture>` de `astro:assets`, así se optimizan al compilar |
| 10 | Cada foto tiene su **texto alternativo** en el JSON, junto al nombre |

### 1.3 Esquemas

| # | Requisito |
|---|---|
| 11 | Existe `src/contenido/esquemas.ts` y **exporta `ESQUEMAS`**: un objeto con el nombre de cada JSON y su esquema. Ej.: `export const ESQUEMAS = { 'portada.json': Portada, 'negocio.json': Negocio }` |
| 12 | Los esquemas usan **Zod de `astro/zod`** (`import { z } from 'astro/zod'`), nunca el paquete `zod` aparte |
| 13 | Cada JSON de `src/contenido/` tiene su esquema, y cada esquema, su JSON |
| 14 | Cada campo de texto tiene **`.max(n)`** con la longitud que cabe en el diseño sin romperlo, y `.min(1)` si no puede quedar vacío |
| 15 | Cada lista tiene **`.min(n)` y `.max(n)`** de elementos según lo que admite el diseño |
| 16 | Cada campo lleva **`.meta({ etiqueta: '…' })`** con un nombre que entienda el cliente («Titular de la portada», no `heroTitle`). Si hace falta, `ayuda: '…'` |
| 17 | Los campos de foto llevan `.meta({ tipo: 'imagen', imagen: { proporcion, minAncho } })` con la proporción y el ancho mínimo que necesita el diseño |
| 18 | Las páginas **validan el contenido al compilar**: `Esquema.parse(json)` antes de usarlo. Así, si un JSON no cumple, la web no se publica y la versión anterior sigue en línea |

Si `esquemas.ts` no exporta `ESQUEMAS`, `astro build` se para y lo dice. Si importa `zod` en vez de `astro/zod`, avisa.

### 1.4 Configuración de Astro

| # | Requisito |
|---|---|
| 19 | No hay otra página ni ruta en la dirección del gestor (por defecto `/admin/contenido`) |
| 20 | `security.checkOrigin` no está desactivado (viene activado por defecto) |

`base` (web en una subcarpeta) y `trailingSlash` (barra final) **sí están soportados**.

---

## 2. Qué se puede editar (tipos de campo)

| En el esquema | En el panel |
|---|---|
| `z.string().max(n)` | Línea de texto con contador. Con `max > 90` o `tipo: 'parrafo'`, caja de varias líneas |
| `z.string()` + `tipo: 'titular'` | Texto con vista previa de `*subrayado*` y `[píldora]` |
| `z.string()` + `tipo: 'email' \| 'telefono' \| 'url'` | Campo del tipo correspondiente |
| `z.string()` + `tipo: 'imagen'` | Subida de foto con recorte a la proporción |
| `z.enum([...])` | Desplegable. Nombres legibles con `.meta({ opciones: { valor: 'Texto' } })` |
| `z.number()` / `z.int()` con `min`/`max` | Número |
| `z.boolean()` | Casilla |
| `z.object({...})` | Grupo (en la raíz, sección plegable) |
| `z.array(...)` con `min`/`max` | Lista: añadir, quitar y reordenar dentro de los límites |
| `z.array(z.number())` | Una línea con números separados por `;` |
| `.nullable()` | Casilla para activar o quitar el bloque |
| `.optional()` o `z.string().max(n).or(z.literal(''))` | Campo que puede quedar vacío |
| `.meta({ ocultarSi: 'campo' })` | No se muestra si el campo hermano está marcado |
| `.meta({ google: { titulo, descripcion } })` en la raíz | Vista previa de Google con `{campo}` |

**No usar en `src/contenido/`**, porque el panel no sabe pintarlos: uniones de tipos distintos (`z.union([z.string(), z.number()])`), `z.record`, `z.date()` (usa un texto con formato) y `z.tuple`. Lo que no deba tocar el cliente tampoco va en `src/contenido/`: se queda en el código.

Marcadores opcionales: `src/contenido/marcadores.ts` exporta `MARCADORES = { precio: 'Precio del servicio' }`. El panel los explica, y la web sustituye `{precio}` en los textos.

---

## 3. Instalación en una web que cumple

```bash
npm install github:Bellit/micms#v0.3.0
```

```js
// astro.config.mjs
import micms from 'micms';
export default defineConfig({
  adapter: cloudflare(),        // o node(), netlify(), vercel()
  integrations: [micms()],
});
```

### Secretos

| Nombre | Qué es | Obligatorio |
|---|---|---|
| `MICMS_CLAVE` | Clave para entrar en el gestor, mínimo 12 caracteres | Sí, salvo con `acceso: 'web'` |
| `GITHUB_TOKEN` | Token de grano fino de GitHub: **solo el repositorio de la web** y **solo «Contents: Read and write»** | Sí |
| `GITHUB_REPO` | `usuario/repositorio` | Sí |
| `GITHUB_RAMA` | Rama que se publica, si no es `main` | No |

Dónde se guardan:
- **Cloudflare:** `npx wrangler secret put NOMBRE` (y en local, en `.dev.vars`, que nunca se sube).
- **Netlify / Vercel:** en el panel del sitio, como variables de entorno.
- **Node:** variables de entorno del servidor.

Nunca en el código ni en `wrangler.jsonc`.

### Si la web ya tiene un panel con login

```js
micms({ acceso: 'web', layout: 'src/layouts/Admin.astro' })
```

Con `acceso: 'web'` micms no pide clave: **el login de la web tiene que proteger la ruta del gestor y su API** (`/admin/contenido` y `/admin/contenido/api/*`). `layout` es la plantilla de ese panel; recibe `title` y `actual="contenido"`.

### Cloudflare con recursos estáticos

Si `wrangler.jsonc` tiene `assets` con `run_worker_first`, incluye la ruta del gestor (por ejemplo `"/admin/*"`). Si no, Cloudflare sirve la web y nunca llega al gestor.

---

## 4. Comprobación final

1. `npm run build` termina sin errores y escribe `_micms/version.json`.
2. En el panel, la pestaña **«Instalación»** no muestra nada en rojo. Si algo falla, dice qué y cómo arreglarlo.
3. Al abrir `/admin/contenido` sale la pantalla para entrar. Con la clave, el panel muestra una pestaña por JSON.
4. Al cambiar un texto y pulsar «Publicar», aparece en GitHub un commit «Contenido: …». A los uno o dos minutos, el panel dice «¡Publicado!» y la web muestra el cambio.
5. Si se escribe un texto más largo que el máximo, el panel lo marca y no publica.
