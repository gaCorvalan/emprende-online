/**
 * Búsqueda, filtros y orden del catálogo.
 * Sin red ni Astro: el precio es el de la tarjeta (`cardPrice`).
 *
 * Entre secciones el filtro es AND. Dentro de una sección, OR.
 * Sin stock no se esconde: si coincide, entra.
 */

import { cardPrice } from './catalog.ts'
import { formatArs, productStatus, totalStock, type ProductStatus, type StockVariant } from './stock.ts'

export const CATALOG_SORTS = ['mas-nuevos', 'menor-precio', 'mayor-precio'] as const

export type CatalogSort = (typeof CATALOG_SORTS)[number]

export interface CatalogColor {
  name: string
  hex: string | null
}

/** Resumen que viaja en la página. Alcanza para filtrar y ordenar. */
export interface CatalogItem {
  slug: string
  name: string
  price: number
  status: ProductStatus
  hasStock: boolean
  categorySlugs: string[]
  sizes: string[]
  colors: CatalogColor[]
  /** publishedAt, o createdAt si no hay fecha de publicación. */
  date: string
}

export interface CatalogQuery {
  q: string
  categorias: string[]
  talles: string[]
  colores: string[]
  /** Identificador dinámico min-max derivado de los precios del catálogo. */
  precio: string | null
  soloConStock: boolean
  orden: CatalogSort
}

export interface CatalogPriceRange {
  id: string
  min: number
  max: number | null
  label: string
}

export interface CatalogOptionCounts {
  categorias: Record<string, number>
  talles: Record<string, number>
  colores: Record<string, number>
  precios: Record<string, number>
}

export interface CatalogItemSource {
  slug: string
  name: string
  base_price: number
  pieza_unica: boolean
  createdAt?: string | null
  publishedAt?: string | null
  categories?: readonly { slug: string }[] | null
  product_variants?: readonly StockVariant[] | null
}

export interface CatalogCategorySource {
  slug: string
  name: string
  order?: number | null
  active?: boolean
}

const HEX = /^#[0-9A-Fa-f]{6}$/

export function emptyCatalogQuery(): CatalogQuery {
  return {
    q: '',
    categorias: [],
    talles: [],
    colores: [],
    precio: null,
    soloConStock: false,
    orden: 'mas-nuevos',
  }
}

/** Minúsculas, sin tildes, espacios de más afuera y adentro. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCatalogSort(value: string | null): value is CatalogSort {
  return CATALOG_SORTS.some((sort) => sort === value)
}

function parsePriceRangeId(value: string | null): { min: number, max: number | null } | null {
  if (!value) return null
  const match = /^(\d+)-(\d+|\*)$/.exec(value)
  if (!match) return null
  const min = Number(match[1])
  const max = match[2] === '*' ? null : Number(match[2])
  if (!Number.isSafeInteger(min) || (max !== null && (!Number.isSafeInteger(max) || max < min))) return null
  return { min, max }
}

function unique(values: readonly string[]): string[] {
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || result.includes(trimmed)) continue
    result.push(trimmed)
  }
  return result
}

export function colorHex(value: string | null | undefined): string | null {
  if (value && HEX.test(value)) return value
  return null
}

/**
 * Arma el resumen. El precio es el menor de la tarjeta.
 * Talle y color salen de las variantes, aunque no tengan stock.
 */
export function toCatalogItem(source: CatalogItemSource): CatalogItem {
  const variants = source.product_variants ?? []
  const stockProduct = {
    base_price: source.base_price,
    pieza_unica: source.pieza_unica,
    product_variants: variants,
  }
  const sizes: string[] = []
  const colors: CatalogColor[] = []

  for (const variant of variants) {
    const size = variant.size.trim()
    if (size && !sizes.includes(size)) sizes.push(size)
    const name = variant.color.trim()
    if (name && !colors.some((color) => color.name === name)) {
      colors.push({ name, hex: colorHex(variant.color_hex) })
    }
  }

  const categorySlugs: string[] = []
  for (const category of source.categories ?? []) {
    const slug = category.slug.trim()
    if (slug && !categorySlugs.includes(slug)) categorySlugs.push(slug)
  }

  return {
    slug: source.slug,
    name: source.name,
    price: cardPrice(stockProduct),
    status: productStatus(stockProduct),
    hasStock: totalStock(stockProduct) > 0,
    categorySlugs,
    sizes,
    colors,
    date: source.publishedAt || source.createdAt || '',
  }
}

/** Categorías activas del CMS, por `order` y después por nombre. */
export function categoryChoices(
  categories: readonly CatalogCategorySource[],
): { slug: string, name: string }[] {
  return categories
    .filter((category) => category.active !== false && category.slug.trim() && category.name.trim())
    .map((category) => ({
      slug: category.slug.trim(),
      name: category.name.trim(),
      order: category.order ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es') || a.slug.localeCompare(b.slug, 'es'))
    .filter((category, index, list) => list.findIndex((entry) => entry.slug === category.slug) === index)
    .map(({ slug, name }) => ({ slug, name }))
}

/** Talles y colores que aparecen en alguna variante. El primero gana el hex. */
export function availableFacets(items: readonly CatalogItem[]): { talles: string[], colores: CatalogColor[] } {
  const talles: string[] = []
  const colores: CatalogColor[] = []
  for (const item of items) {
    for (const size of item.sizes) {
      if (!talles.includes(size)) talles.push(size)
    }
    for (const color of item.colors) {
      if (!colores.some((entry) => entry.name === color.name)) {
        colores.push({ name: color.name, hex: colorHex(color.hex) })
      }
    }
  }
  return { talles, colores }
}

/**
 * Divide los precios observados en hasta tres grupos contiguos por cuantiles.
 * Los límites nacen de valores reales; no hay escalones de precio de ejemplo.
 */
export function availablePriceRanges(items: readonly CatalogItem[]): CatalogPriceRange[] {
  const prices = [...new Set(items.map((item) => item.price).filter(Number.isFinite))]
    .sort((a, b) => a - b)
  if (prices.length < 2) return []

  const groupCount = Math.min(3, prices.length)
  const groups: number[][] = []
  for (let index = 0; index < groupCount; index += 1) {
    const start = Math.floor(index * prices.length / groupCount)
    const end = Math.floor((index + 1) * prices.length / groupCount)
    groups.push(prices.slice(start, end))
  }

  return groups.map((group, index) => {
    const min = index === 0 ? 0 : group[0]
    const max = index === groupCount - 1 ? null : group[group.length - 1]
    const previousMax = index > 0 ? groups[index - 1][groups[index - 1].length - 1] : null
    const label = index === 0
      ? `Hasta ${formatArs(max ?? group[group.length - 1])}`
      : index === groupCount - 1
        ? `Más de ${formatArs(previousMax ?? group[0])}`
        : `${formatArs(min)} a ${formatArs(max ?? group[group.length - 1])}`
    const id = `${min}-${max === null ? '*' : max}`
    return { id, min, max, label }
  })
}

export function parseCatalogQuery(search: string): CatalogQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const orden = params.get('orden')
  const precio = params.get('precio')
  return {
    q: (params.get('q') ?? '').trim(),
    categorias: unique(params.getAll('categoria')),
    talles: unique(params.getAll('talle')),
    colores: unique(params.getAll('color')),
    precio: parsePriceRangeId(precio) ? precio : null,
    soloConStock: params.get('stock') === '1',
    orden: isCatalogSort(orden) ? orden : 'mas-nuevos',
  }
}

/** Vacío si no hay nada que contar. `orden` solo entra si no es el de siempre. */
export function serializeCatalogQuery(query: CatalogQuery): string {
  const params = new URLSearchParams()
  const q = query.q.trim()
  if (q) params.set('q', q)
  for (const slug of unique(query.categorias)) params.append('categoria', slug)
  for (const size of unique(query.talles)) params.append('talle', size)
  for (const color of unique(query.colores)) params.append('color', color)
  if (query.precio && parsePriceRangeId(query.precio)) params.set('precio', query.precio)
  if (query.soloConStock) params.set('stock', '1')
  if (query.orden !== 'mas-nuevos') params.set('orden', query.orden)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function isCatalogQueryActive(query: CatalogQuery): boolean {
  return query.q.trim() !== ''
    || query.categorias.length > 0
    || query.talles.length > 0
    || query.colores.length > 0
    || query.precio !== null
    || query.soloConStock
    || query.orden !== 'mas-nuevos'
}

/** Deja el orden de entrada. No mira el stock. */
export function filterCatalog(items: readonly CatalogItem[], query: CatalogQuery): CatalogItem[] {
  const q = normalizeText(query.q)
  const priceRange = parsePriceRangeId(query.precio)
  return items.filter((item) => {
    if (q && !normalizeText(item.name).includes(q)) return false
    if (query.categorias.length > 0 && !query.categorias.some((slug) => item.categorySlugs.includes(slug))) {
      return false
    }
    if (query.talles.length > 0 && !query.talles.some((size) => item.sizes.includes(size))) return false
    if (query.colores.length > 0 && !query.colores.some((color) => item.colors.some((entry) => entry.name === color))) {
      return false
    }
    if (priceRange && (item.price < priceRange.min || (priceRange.max !== null && item.price > priceRange.max))) {
      return false
    }
    if (query.soloConStock && !item.hasStock) return false
    return true
  })
}

function withoutFacet(query: CatalogQuery, facet: keyof CatalogOptionCounts): CatalogQuery {
  const copy = { ...query }
  if (facet === 'categorias') copy.categorias = []
  else if (facet === 'talles') copy.talles = []
  else if (facet === 'colores') copy.colores = []
  else copy.precio = null
  return copy
}

/**
 * Cuenta cada alternativa en vivo, respetando el resto de los filtros y
 * dejando fuera solamente la selección de esa misma faceta.
 */
export function catalogOptionCounts(
  items: readonly CatalogItem[],
  query: CatalogQuery,
  priceRanges: readonly CatalogPriceRange[],
  categories: readonly { slug: string, name: string }[],
): CatalogOptionCounts {
  const categoryItems = filterCatalog(items, withoutFacet(query, 'categorias'))
  const sizeItems = filterCatalog(items, withoutFacet(query, 'talles'))
  const colorItems = filterCatalog(items, withoutFacet(query, 'colores'))
  const priceItems = filterCatalog(items, withoutFacet(query, 'precios'))

  return {
    categorias: Object.fromEntries(categories.map(({ slug }) => [
      slug,
      categoryItems.filter((item) => item.categorySlugs.includes(slug)).length,
    ])),
    talles: Object.fromEntries(availableFacets(items).talles.map((size) => [
      size,
      sizeItems.filter((item) => item.sizes.includes(size)).length,
    ])),
    colores: Object.fromEntries(availableFacets(items).colores.map(({ name }) => [
      name,
      colorItems.filter((item) => item.colors.some((color) => color.name === name)).length,
    ])),
    precios: Object.fromEntries(priceRanges.map(({ id, min, max }) => [
      id,
      priceItems.filter((item) => item.price >= min && (max === null || item.price <= max)).length,
    ])),
  }
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Empate: se queda el que venía antes. */
export function sortCatalog(items: readonly CatalogItem[], orden: CatalogSort): CatalogItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      let diff = 0
      if (orden === 'menor-precio') diff = a.item.price - b.item.price
      else if (orden === 'mayor-precio') diff = b.item.price - a.item.price
      else diff = timestamp(b.item.date) - timestamp(a.item.date)
      if (diff !== 0) return diff
      return a.index - b.index
    })
    .map((entry) => entry.item)
}

export function applyCatalog(items: readonly CatalogItem[], query: CatalogQuery): CatalogItem[] {
  return sortCatalog(filterCatalog(items, query), query.orden)
}
