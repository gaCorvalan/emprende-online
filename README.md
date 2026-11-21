# Plataforma de comercio online

Monorepo (repositorio `emprende-online`) para la plataforma de comercio online. El nombre de producto todavía está por definirse. La tienda y el CMS se mantienen como aplicaciones independientes y se despliegan por separado.

## Aplicaciones

- [`apps/storefront`](apps/storefront/README.md): tienda pública estática hecha con Astro. Lee los datos del CMS durante el build.
- [`apps/cms`](apps/cms/README.md): panel y API de contenido hechos con Strapi.

No hay dependencias compartidas ni un workspace de npm en la raíz: cada aplicación conserva su propio `package.json`, lockfile, comandos y configuración de despliegue.

## Requisitos

Node.js 22.23.4 o más nuevo, compatible con ambas aplicaciones. Cada app también conserva su propio `.nvmrc`.

## Desarrollo local

Primero levantá el CMS:

```bash
cd apps/cms
nvm use
npm ci
cp .env.example .env
npm run develop
```

En otra terminal, levantá la tienda:

```bash
cd apps/storefront
nvm use
npm ci
STRAPI_URL=http://localhost:1337 npm run dev
```

El panel del CMS queda en `http://localhost:1337/admin`; la API, en `http://localhost:1337/api`; y la tienda, en `http://localhost:4321`.

## Pruebas y builds

Desde `apps/storefront`:

```bash
npm test
npm run build
```

Desde `apps/cms`:

```bash
npm run build
```

Los despliegues deben configurarse por separado desde sus respectivas carpetas. La tienda necesita `STRAPI_URL` para generar el catálogo; el CMS mantiene su propia configuración de base de datos, almacenamiento y secretos.

## Historial

Se conservaron los historiales de ambos repositorios al trasladar sus archivos a `apps/storefront` y `apps/cms`. Los hashes de los commits cambian porque las rutas se reescribieron. Los repositorios originales de GitHub no se modificaron.
