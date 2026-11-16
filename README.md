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
  data/events-custom.json   Tus eventos propios (desde el panel)
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
3. Si algo cambió, lo guarda en el repo y republica la web en GitHub Pages.

Un vídeo nuevo aparece el lunes siguiente, o al momento con «Sincronizar ahora» en el panel.

## Puesta en marcha (una vez)

1. Crea un repositorio en GitHub (p. ej. `endutrak`) y sube esta carpeta a la rama `main`.
2. En el repo: **Settings → Pages → Source: GitHub Actions** y **Settings → Secrets → Actions → `EVENTS_ICS_URL`** con la URL del feed.
3. En **Actions**, ejecuta «Sincronizar y publicar» a mano la primera vez. La web quedará en https://endutrak.github.io/endutrak/.
4. Panel: entra en `…/admin.html`, pon `usuario/endutrak` y un **fine-grained token** con acceso solo a ese repo y permisos *Contents: Read and write* y *Actions: Read and write*. El token se queda únicamente en tu navegador.

## Dominio: endutrak.es

La web definitiva será **https://endutrak.es/** (ya está puesto como dirección canónica, `og:url` y datos estructurados en `site/index.html`).
Hasta conectarlo, funciona en https://endutrak.github.io/endutrak/. Para conectarlo:

1. En el registrador del dominio, DNS:
   - `A` de `endutrak.es` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` de `www` → `endutrak.github.io`
2. En el repo: **Settings → Pages → Custom domain → `endutrak.es`** y marcar **Enforce HTTPS** cuando esté disponible.
3. Cuando esté activo, el panel pasa a `https://endutrak.es/admin.html`.

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
