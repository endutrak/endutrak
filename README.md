# endutrak — web

Web estática (sin servidor ni base de datos) con:

- **Calendario de eventos off-road** sincronizado automáticamente desde un feed iCal (su URL va en el secret `EVENTS_ICS_URL`, nunca en el código).
- **Vídeos y shorts** del canal [@endutrak](https://www.youtube.com/@endutrak), que se añaden solos cuando subes algo nuevo.
- **Panel** (`/admin.html`) para destacar u ocultar vídeos, añadir enlaces a mano y crear eventos propios.

## Estructura

```
brand/                      Originales en alta (logos, intro). No se publican.
site/                       Lo que se publica
  index.html                Web pública
  admin.html                Panel de administración
  assets/css, js, img, video
  data/events.json          Eventos (lo genera el robot, no editar a mano)
  (eventos propios: base de datos «Eventos» de Notion)
  data/videos.json          Vídeos y shorts (robot + panel)
scripts/
  sync-events.mjs           feed iCal (EVENTS_ICS_URL) → events.json
  sync-youtube.mjs          RSS del canal → videos.json
  geocode.mjs               lugar del evento → coordenadas y comunidad (OpenStreetMap)
  geocache.json             caché de ubicaciones (cada lugar se busca una vez)
  geo-overrides.json        correcciones manuales de ubicación (por lugar o por organizador)
.github/workflows/sync-deploy.yml   Robot: cada semana sincroniza y publica
```

## Cómo funciona la automatización

GitHub Actions ejecuta el workflow **una vez a la semana (lunes ~7:00)**, al guardar desde el panel y cuando pulses «Sincronizar ahora»:

1. Descarga el feed de eventos (URL guardada en el secret `EVENTS_ICS_URL`).
2. Lee el RSS público del canal de YouTube (sin API key) y añade vídeos/shorts nuevos.
3. Si algo cambió, lo guarda en el repo y guarda el cambio y Cloudflare republica la web sola.

Un vídeo nuevo aparece el lunes siguiente, o al momento con «Sincronizar ahora» en el panel.

## Puesta en marcha (una vez)

1. Crea un repositorio en GitHub (p. ej. `endutrak`) y sube esta carpeta a la rama `main`.
2. En el repo: **Settings → Secrets → Actions → `EVENTS_ICS_URL`** con la URL del feed.
3. En Cloudflare: **Workers & Pages** → conecta el repo, rama `main`, sin build command y directorio de salida `site`. Cada commit (también los del bot semanal) redespliega solo. GitHub Pages no se usa.
4. En **Actions**, ejecuta «Sincronizar y publicar» a mano la primera vez.
5. Panel: entra en `https://endutrak.es/admin.html`, pon `endutrak/endutrak` y un **fine-grained token** con acceso solo a ese repo y permisos *Contents: Read and write* y *Actions: Read and write*. El token se queda únicamente en tu navegador.

## Dominio: endutrak.es

La web es **https://endutrak.es/** (dirección canónica, `og:url` y datos estructurados en `site/index.html`). El DNS está en Cloudflare; `dns/endutrak.es.zone.txt` (local, no se sube) sirve para importar la zona. Los registros de `@` y `www` hacia el proyecto de Cloudflare se crean en **Settings → Domains & Routes → Custom domain**.

## SEO

`scripts/build-seo.mjs` genera, a partir de `site/data`, páginas estáticas que los buscadores leen sin JavaScript:
`/eventos/` (listado por meses y zonas), `/eventos/<evento>/` (una por evento, con datos estructurados `Event`),
`/eventos/zona/<comunidad>/`, `sitemap.xml` y `robots.txt`; y actualiza en `index.html` los datos estructurados
(web, canal, próximos eventos, vídeos) y los enlaces a zonas del pie. Lo ejecuta el workflow después de sincronizar;
no edites a mano lo que hay entre `<!-- seo:… -->` ni la carpeta `site/eventos/`.

## Notion

Todo lo que gestiono a mano vive en la página «Bases de datos Endutrak» de Notion:

- **Eventos**: mis eventos y las propuestas del formulario. Solo salen en la web los que tienen Estado = **Publicado**
  (`scripts/notion.mjs` → `sync-events.mjs`, cada día o con «Sincronizar ahora»).
- **Patrocinadores**: propuestas del formulario «Quiero ser patrocinador».
- **Montajes**: peticiones de la sección «Edito tu motolog» (formulario «Quiero mi vídeo»): datos de contacto, zona,
  tipo de vídeo, material y qué ofrece a cambio (finde rodando juntos, otro intercambio o pago).
- **Rutas**: las rutas de mis vídeos con su GPX. Con cada vídeo nuevo del canal (no shorts) la sincronización crea
  un borrador sin publicar con título, fecha, enlace y primer párrafo de la descripción. Si el vídeo es de una ruta,
  arrastro el GPX y marco Publicada; si no, lo borro (no vuelve a crearse: `scripts/rutas-borradores.json`).
  Las que tienen **Publicada** marcada se descargan cada día
  (`scripts/sync-routes.mjs`) a `site/gpx/` con un nombre difícil de adivinar. Si la ruta tiene el enlace del **Vídeo**,
  sale un botón «Descargar GPX» en ese vídeo de la web. Enlace directo para YouTube/Instagram:
  `https://endutrak.es/#gpx=<id-del-vídeo>` (o el id de la ruta que aparece en `site/data/rutas.json`).
- **Suscriptores**: quien descarga un GPX deja su email; el Worker lo guarda aquí (sin duplicar: si repite, se le
  añade la ruta) y devuelve el enlace al archivo. La casilla **Novedades** indica si aceptó recibir avisos.
  El enlace del GPX solo lo conoce el Worker (`worker/rutas.json`, generado por la sincronización).

Los formularios envían a `POST /api/form`, que atiende el Worker de Cloudflare (`worker/index.js`, configurado en
`wrangler.jsonc` junto con la web estática de `site/`) y crea la fila en Notion.

El token de la conexión de Notion (con acceso solo a esa página) está en tres sitios, nunca en el repo:
secreto `NOTION_TOKEN` del Worker en Cloudflare, secret `NOTION_TOKEN` del repo en GitHub (sincronización) y `.env` / `.dev.vars` en local.

## Patrocinadores

Los logos salen de `site/data/sponsors.json`. Sube el logo (PNG/SVG/WebP, mejor sin fondo) a `site/assets/img/sponsors/` y añade una entrada:

```json
{ "sponsors": [ { "name": "Marca", "logo": "assets/img/sponsors/marca.png", "url": "https://marca.com" } ] }
```

Con la lista vacía se muestra «Próximamente». El botón «Quiero ser patrocinador» guarda la propuesta en Notion (ver «Formularios → Notion»).

## Mapa de eventos

La vista **Mapa** usa las coordenadas que añade `sync-events.mjs` (geocodificación con OpenStreetMap/Nominatim) y el mapa base gris de Esri.
Si un evento aparece en un sitio equivocado o no aparece, añade una corrección en `scripts/geo-overrides.json`:

- `byQuery`: clave = texto del lugar o nombre del evento → `{ lat, lng, region, province }`
- `byOrganizer`: base del organizador, usada como «zona aprox.» cuando el evento no indica lugar

## Probar en local

```bash
node --env-file=.env scripts/sync-events.mjs   # .env con EVENTS_ICS_URL=… (no se sube)
node scripts/sync-youtube.mjs
cd site && python -m http.server 8000   # http://localhost:8000
```

## Notas

- GitHub pausa los workflows programados tras 60 días sin actividad en el repo; si pasa, basta con pulsar «Enable workflow» en Actions.
- Para cambiar de canal: variable `YT_CHANNEL_ID` o la constante en `scripts/sync-youtube.mjs`.
