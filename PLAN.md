# Gestor de contenido para webs Astro

Un panel sencillo para que el cliente cambie **textos, imágenes y SEO** de su web sin tocar el diseño. La web sigue siendo Astro estático: rápida, con las imágenes optimizadas al compilar y sin base de datos para el contenido.

Repositorio (público): https://github.com/Bellit/micms. Se prueba primero en la **Plantilla Landing Reservas**, que ya tiene panel `/admin` con login en Cloudflare.

---

## 1. Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Dónde vive el contenido | Ficheros **JSON** en `src/contenido/` dentro del repo de cada web | Un programa puede leerlos y escribirlos sin riesgo (un `.ts` no). Git da historial y vuelta atrás gratis. |
| Cómo se sabe qué se puede editar | Un **esquema Zod** por fichero (`src/contenido/esquemas.ts`) con etiqueta, ayuda, longitud máxima y tipo de cada campo | El gestor genera los formularios a partir del esquema. No hay que «adivinar» dónde hay texto leyendo los `.astro`. |
| Qué no se puede editar | Diseño: colores, tipografías, logo, estructura y orden de secciones (`src/config/marca.ts`), y datos técnicos (dominio, Turnstile, `indexable`, tipo de negocio para buscadores) | Así el cliente no puede romper la web. Lo cambias tú. |
| Cómo se publica | El panel hace un **commit** en el repo del cliente con la API de GitHub (token guardado como secreto del Worker). Cloudflare vuelve a compilar y publicar en 1–2 min. | La web sigue siendo estática. El cliente no necesita cuenta de GitHub. |
| Base de datos para el contenido | **No.** D1 solo para reservas. | Renderizar en el servidor haría perder la velocidad y la optimización de imágenes. |
| CMS existente (Keystatic, Decap, Tina) | **No**, uno propio y pequeño | Esos piden cuenta de GitHub al cliente o pagar su nube. Ya tenemos login y panel; el gestor es otra pestaña del mismo `/admin`, en castellano. |
| Content collections de Astro | **No** por ahora | Son para colecciones (blog, productos). Aquí el contenido son ficheros sueltos que también leen el Worker (correos) y los scripts de Node. JSON + Zod da la misma validación sin cambiar las plantillas. |
| Nombre de la carpeta | `src/contenido/` | `src/content/` lo reserva Astro para sus colecciones. |

---

## 2. La convención (regla para toda web nueva)

1. **Ningún texto, foto ni dato del cliente escrito en un `.astro`.** Todo sale de `src/contenido/*.json`.
2. Cada JSON tiene su esquema en `src/contenido/esquemas.ts`. Cada campo lleva:
   - `etiqueta`: cómo se llama en el panel («Titular de la portada»).
   - `ayuda` (opcional): una frase de ayuda.
   - **longitud máxima** (`max`): la que cabe en el diseño sin romperlo.
   - para listas, **mínimo y máximo de elementos**.
   - para fotos: **proporción**, **ancho mínimo** y **texto alternativo obligatorio**.
3. Las fotos van en `src/contenido/imagenes/` y el JSON solo guarda el nombre del fichero. Astro las optimiza al compilar.
4. Los textos que dependen de otros datos usan **marcadores**: `{servicio}`, `{corto}`, `{minutos}`, `{precio}`. Así, si el cliente cambia el precio, cambia en todas partes.
5. Los titulares admiten `*subrayado*` y `[píldora]` (ya existía).
6. `npm test` comprueba: que los JSON cumplen el esquema, que no queda nada del cliente fuera de `src/config/` y `src/contenido/`, y que no hay marcadores desconocidos.
7. `astro build` también valida el contenido: si un JSON no cumple el esquema, la web no se publica y el error dice qué campo falla.

Ficheros:

| Fichero | Qué tiene | ¿Lo edita el cliente? |
|---|---|---|
| `src/contenido/negocio.json` | Nombre, profesional, contacto, dirección, servicio (nombre, duración, precio, modalidades) y SEO (frase, descripción) | Sí |
| `src/contenido/portada.json` | Todos los textos de la portada, menú, pie y legales | Sí |
| `src/contenido/fotos.json` + `imagenes/` | Fotos y sus textos alternativos | Sí |
| `src/contenido/esquemas.ts` | Esquemas (qué se puede editar y con qué límites) | No |
| `src/config/negocio.ts` | Datos técnicos + carga `negocio.json` | No |
| `src/config/marca.ts` | Colores, tipografías, logo | No |
| `src/config/textos.ts` | Frases derivadas del servicio (concordancia de género) | No |

---

## 3. Fases

### Fase 0 · Convención en la Plantilla ✔ hecha (2026-11-24)
Plantilla 0.5.0, en `main` (commit `26acf08`). 74 pruebas en verde y `astro check` sin errores. Las páginas compiladas son idénticas byte a byte a las de la 0.4.0. Si un JSON no cumple su esquema, el build se para con el campo exacto («portada.json → hero.franjas.0: Máximo 16 caracteres»).

- Pasar `contenido.ts`, los datos editables de `negocio.ts` y `fotos.ts` a JSON en `src/contenido/`.
- Esquemas Zod con etiquetas y límites.
- `src/config/*.ts` siguen exportando lo mismo (`NEGOCIO`, `SERVICIO`, `CONTENIDO`, `FOTOS`), así las plantillas `.astro` no cambian.
- Validación en `astro build` y en `npm test`.
- Resultado: la web se ve **exactamente igual**.

### Fase 1 · Primera versión del gestor (`/admin/contenido`) ✔ hecha (2026-11-24, micms 0.1.0)
Cómo se usa: [README.md](README.md). En la Plantilla (0.6.0) hay 14 pruebas de extremo a extremo con un Worker de verdad y un GitHub falso, y lo he probado a mano en el navegador, en ordenador y en móvil.

Además de lo previsto:
- `og.png` se regenera en cada build (`npm run build` = `node scripts/marca.mjs && astro build`).
- Al cambiar una foto, el panel pide revisar su descripción.
- Las fotos que el contenido deja de usar se borran del repositorio en el mismo commit.
- `_micms/version.json` con el commit compilado: el panel sabe cuándo el cambio ya está en línea.

**Distribución (decidido 2026-11-24):** `micms` es un repositorio **público** y cada web lo instala con una versión fija: `npm install github:Bellit/micms#v0.1.0`. Para actualizar una web, se cambia la etiqueta. Por eso aquí no puede haber nada privado: ni datos de clientes, ni claves, ni rutas del ordenador.

Para trabajar en micms y probarlo en una web a la vez, en esa web: `npm install "micms@file:../Gestor Web"`. Antes de hacer commit, se vuelve a la etiqueta.

Plan inicial:
- Paquete reutilizable (integración de Astro) que añade las rutas del panel.
- Lee los esquemas (`z.toJSONSchema()`) y genera un formulario por fichero: textos, textos largos, números, interruptores, listas (añadir, quitar, reordenar dentro de los límites).
- Contadores de caracteres con el máximo del esquema.
- Subida de fotos: recorte a la proporción pedida, aviso si es pequeña, texto alternativo obligatorio.
- SEO: título, descripción y **vista previa de cómo sale en Google**.
- «Publicar»: valida con el esquema en el Worker y hace un solo commit con todos los cambios (API de GitHub: `git/trees` + `git/commits`). Secretos: `GITHUB_TOKEN` (token de grano fino, solo ese repo, permiso de contenidos) y `GITHUB_REPO`.
- Estado de la publicación («Publicando…» → «Publicado»).

### Fase 1b · Para cualquier web Astro ✔ hecha (2026-11-26, micms 0.2.0)
Auditoría de portabilidad: cualquier adaptador (`astro:env/server`), login propio con `MICMS_CLAVE`, página propia sin layout, `base` y `trailingSlash`, errores claros al compilar y desplegable para `z.enum`. Requisitos en [COMPATIBILIDAD.md](COMPATIBILIDAD.md), prompt para adaptar una web en [PROMPT-ADAPTAR.md](PROMPT-ADAPTAR.md) y web de ejemplo en `ejemplo/` con 27 comprobaciones de extremo a extremo. La Plantilla pasa sus 88 pruebas con `acceso: 'web'`.

**micms 0.3.0 (2026-11-26):** pestaña «Instalación» en el panel: diagnóstico en el momento (secretos, GitHub, caducidad del token, contenido, fotos, publicación automática), configuración, requisitos y el prompt para adaptar otra web con botón de copiar. 36 comprobaciones en `ejemplo/`.

### Fase 2 · Seguridad al editar
- Probar con un repositorio y un Cloudflare reales (token de grano fino + Workers Builds) y medir cuánto tarda en salir un cambio.
- **Vista previa** antes de publicar: los cambios van a una rama `borrador` y Cloudflare genera una URL de prueba. «Publicar» la fusiona con `main`.
- **Historial** con «Deshacer» (lista de commits del contenido).
- **Clic para editar**: en la vista previa, cada texto lleva `data-campo="portada.hero.entradilla"`; al hacer clic se abre ese campo.

### Fase 3 · Extras para comercios
- **Aviso temporal** con fechas («Cerrado por vacaciones del 1 al 15»).
- Horario de apertura en un solo sitio → pie, contacto y datos para buscadores (`openingHours`).
- Multidioma: un campo por idioma.
- Correo para ti cada vez que un cliente publica.

### Fase 4 · Llevarlo a otras webs
- Aplicar la convención a las demás webs Astro y a las nuevas.
- Las webs que no están hechas con Astro habría que pasarlas a Astro antes.

---

## 4. Riesgos y cómo se cubren

| Riesgo | Cómo se cubre |
|---|---|
| El cliente escribe un texto larguísimo y rompe la maqueta | `max` en el esquema, validado en el panel, en el Worker y en `astro build` |
| Un commit deja la web rota | `astro build` falla antes de publicar y la web anterior sigue en línea |
| Conflicto entre un cambio tuyo y uno del cliente | El cliente solo toca `src/contenido/`; tú, el resto. Al actualizar la plantilla (`git merge`) gana lo del cliente en `src/contenido/` |
| Token de GitHub filtrado | Token de grano fino limitado a un repo y solo a contenidos; se guarda como secreto del Worker, nunca en el código |
| Fotos enormes | Límite de tamaño al subir y optimización de Astro al compilar |
