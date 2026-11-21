import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cardPrice } from './catalog.ts'
import { formatArs } from './stock.ts'
import {
  applyCatalog,
  availableFacets,
  availablePriceRanges,
  catalogOptionCounts,
  categoryChoices,
  filterCatalog,
  emptyCatalogQuery,
  isCatalogQueryActive,
  normalizeText,
  parseCatalogQuery,
  serializeCatalogQuery,
  sortCatalog,
  toCatalogItem,
  type CatalogItem,
} from './filters.ts'
function item(partial: Partial<CatalogItem> & Pick<CatalogItem, 'slug' | 'name'>): CatalogItem {
  return {
    slug: partial.slug,
    name: partial.name,
    price: partial.price ?? 1000,
    status: partial.status ?? 'disponible',
    hasStock: partial.hasStock ?? partial.status !== 'sin-stock',
    categorySlugs: partial.categorySlugs ?? [],
    sizes: partial.sizes ?? [],
    colors: partial.colors ?? [],
    date: partial.date ?? '2026-01-01T00:00:00.000Z',
  }
}

const body = item({
  slug: 'body-de-algodon',
  name: 'Body de algodón',
  price: 18900,
  categorySlugs: ['bodies', 'accesorios'],
  sizes: ['0-3 m', '3-6 m', '6-9 m', '9-12 m'],
  colors: [
    { name: 'Crudo', hex: '#F4E1C1' },
    { name: 'Rosa viejo', hex: '#C47A8A' },
    { name: 'Celeste', hex: '#9EC3E6' },
  ],
  date: '2026-03-01T00:00:00.000Z',
})

const gorrito = item({
  slug: 'gorrito',
  name: 'Gorrito',
  price: 7500,
  categorySlugs: ['accesorios'],
  sizes: ['Talle único'],
  colors: [{ name: 'Natural', hex: '#E6D5C3' }],
  date: '2026-02-01T00:00:00.000Z',
})

const manta = item({
  slug: 'manta',
  name: 'Manta',
  price: 24000,
  status: 'sin-stock',
  categorySlugs: ['bodies'],
  sizes: ['0-3 m', '3-6 m'],
  colors: [{ name: 'Gris', hex: '#BDBDBD' }],
  date: '2026-01-15T00:00:00.000Z',
})

const bordado = item({
  slug: 'body-bordado',
  name: 'Body bordado',
  price: 32000,
  status: 'pieza-unica',
  categorySlugs: ['bodies'],
  sizes: ['3-6 m'],
  colors: [{ name: 'Verde salvia', hex: '#8FA58B' }],
  date: '2026-03-01T00:00:00.000Z',
})

const catalogo = [body, gorrito, manta, bordado]

function slugs(items: readonly CatalogItem[]): string[] {
  return items.map((entry) => entry.slug)
}

describe('texto', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    assert.equal(normalizeText('  Álgodón   DE  '), 'algodon de')
    assert.equal(normalizeText('ÁÉÍÓÚáéíóúÑñ'), 'aeiouaeiounn')
    assert.equal(normalizeText('Body'), normalizeText('body'))
  })
})

describe('resumen', () => {
  it('usa el precio de la tarjeta, incluye variantes sin stock y prefiere publishedAt', () => {
    const product = toCatalogItem({
      slug: 'body-de-algodon',
      name: 'Body de algodón',
      base_price: 18900,
      pieza_unica: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      publishedAt: '2026-04-02T00:00:00.000Z',
      categories: [{ slug: 'bodies' }, { slug: 'bodies' }, { slug: 'accesorios' }],
      product_variants: [
        { size: '0-3 m', color: 'Crudo', color_hex: '#F4E1C1', stock_quantity: 4, price: null },
        { size: '3-6 m', color: 'Rosa viejo', color_hex: '#C47A8A', stock_quantity: 1, price: 19900 },
        { size: '6-9 m', color: 'Rosa viejo', color_hex: 'no-es-hex', stock_quantity: 0, price: null },
        { size: '  ', color: ' ', stock_quantity: 2, price: null },
      ],
    })

    assert.equal(product.price, 18900)
    assert.equal(product.price, cardPrice({
      base_price: 18900,
      pieza_unica: false,
      product_variants: [
        { size: '0-3 m', color: 'Crudo', stock_quantity: 4, price: null },
        { size: '3-6 m', color: 'Rosa viejo', stock_quantity: 1, price: 19900 },
        { size: '6-9 m', color: 'Rosa viejo', stock_quantity: 0, price: null },
        { size: '  ', color: ' ', stock_quantity: 2, price: null },
      ],
    }))
    assert.equal(product.status, 'disponible')
    assert.deepEqual(product.categorySlugs, ['bodies', 'accesorios'])
    assert.deepEqual(product.sizes, ['0-3 m', '3-6 m', '6-9 m'])
    assert.deepEqual(product.colors, [
      { name: 'Crudo', hex: '#F4E1C1' },
      { name: 'Rosa viejo', hex: '#C47A8A' },
    ])
    assert.equal(product.date, '2026-04-02T00:00:00.000Z')
  })

  it('un precio 0 puede ser el menor, y sin stock o pieza única no se pierden', () => {
    const agotada = toCatalogItem({
      slug: 'manta',
      name: 'Manta',
      base_price: 24000,
      pieza_unica: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      publishedAt: null,
      categories: [{ slug: 'bodies' }],
      product_variants: [
        { size: '0-3 m', color: 'Gris', color_hex: '#BDBDBD', stock_quantity: 0, price: 22000 },
        { size: '3-6 m', color: 'Gris', color_hex: '#AAAAAA', stock_quantity: 0, price: null },
      ],
    })
    assert.equal(agotada.price, 22000)
    assert.equal(agotada.status, 'sin-stock')
    assert.deepEqual(agotada.sizes, ['0-3 m', '3-6 m'])
    assert.deepEqual(agotada.colors, [{ name: 'Gris', hex: '#BDBDBD' }])
    assert.equal(agotada.date, '2026-01-01T00:00:00.000Z')

    const unica = toCatalogItem({
      slug: 'body-bordado',
      name: 'Body bordado',
      base_price: 32000,
      pieza_unica: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      product_variants: [
        { size: '3-6 m', color: 'Verde salvia', color_hex: '#8FA58B', stock_quantity: 1 },
      ],
    })
    assert.equal(unica.status, 'pieza-unica')
    assert.equal(unica.price, 32000)

    const cero = toCatalogItem({
      slug: 'oferta',
      name: 'Oferta',
      base_price: 1000,
      pieza_unica: false,
      product_variants: [
        { size: '0-3 m', color: 'Crudo', stock_quantity: 2, price: 0 },
        { size: '3-6 m', color: 'Rosa', stock_quantity: 2, price: 1000 },
      ],
    })
    assert.equal(cero.price, 0)
  })
})

describe('categorías y facetas', () => {
  it('deja afuera las inactivas y ordena por order y nombre', () => {
    assert.deepEqual(categoryChoices([
      { slug: 'accesorios', name: 'Accesorios', order: 2, active: true },
      { slug: 'bodies', name: 'Bodies', order: 1, active: true },
      { slug: 'oculta', name: 'Oculta', order: 0, active: false },
      { slug: 'zapatos', name: 'Zapatos', order: null, active: true },
      { slug: 'ajuar', name: 'Ajuar', order: 2, active: true },
      { slug: 'bodies', name: 'Bodies repetida', order: 1, active: true },
      { slug: ' ', name: 'Vacía', order: 0, active: true },
    ]), [
      { slug: 'bodies', name: 'Bodies' },
      { slug: 'accesorios', name: 'Accesorios' },
      { slug: 'ajuar', name: 'Ajuar' },
      { slug: 'zapatos', name: 'Zapatos' },
    ])
  })

  it('junta talles y colores presentes, también los que están sin stock', () => {
    const facets = availableFacets(catalogo)
    assert.deepEqual(facets.talles, ['0-3 m', '3-6 m', '6-9 m', '9-12 m', 'Talle único'])
    assert.deepEqual(facets.colores.map((color) => color.name), [
      'Crudo', 'Rosa viejo', 'Celeste', 'Natural', 'Gris', 'Verde salvia',
    ])

    const primero = availableFacets([
      item({ slug: 'a', name: 'A', colors: [{ name: 'Rosa', hex: '#111111' }] }),
      item({ slug: 'b', name: 'B', colors: [{ name: 'Rosa', hex: '#222222' }] }),
      item({ slug: 'c', name: 'C', colors: [{ name: 'Rosa', hex: 'mal' }] }),
    ])
    assert.deepEqual(primero.colores, [{ name: 'Rosa', hex: '#111111' }])
  })

  it('deriva hasta tres rangos de los precios reales del catálogo', () => {
    const ranges = availablePriceRanges(catalogo)
    assert.deepEqual(ranges.map(({ id, min, max }) => ({ id, min, max })), [
      { id: '0-7500', min: 0, max: 7500 },
      { id: '18900-18900', min: 18900, max: 18900 },
      { id: '24000-*', min: 24000, max: null },
    ])
    assert.equal(ranges[0].label, `Hasta ${formatArs(7500)}`)
    assert.deepEqual(availablePriceRanges([item({ slug: 'a', name: 'A', price: 100 })]), [])
  })

  it('cuenta opciones usando los productos y los demás filtros activos', () => {
    const counts = catalogOptionCounts(
      catalogo,
      {
        ...emptyCatalogQuery(),
        categorias: ['bodies'],
        soloConStock: true,
      },
      availablePriceRanges(catalogo),
      [
        { slug: 'bodies', name: 'Bodies' },
        { slug: 'accesorios', name: 'Accesorios' },
        { slug: 'sin-productos', name: 'Sin productos' },
      ],
    )

    assert.deepEqual(counts.categorias, { bodies: 2, accesorios: 2, 'sin-productos': 0 })
    assert.deepEqual(counts.talles, { '0-3 m': 1, '3-6 m': 2, '6-9 m': 1, '9-12 m': 1, 'Talle único': 0 })
    assert.deepEqual(counts.colores, {
      Crudo: 1,
      'Rosa viejo': 1,
      Celeste: 1,
      Natural: 0,
      Gris: 0,
      'Verde salvia': 1,
    })
    assert.deepEqual(counts.precios, {
      '0-7500': 0,
      '18900-18900': 1,
      '24000-*': 1,
    })
  })
})

describe('consulta', () => {
  it('lee la query, ignora vacíos y repetidos, y un orden desconocido vuelve al de siempre', () => {
    const query = parseCatalogQuery(
      '?q=+Body+&categoria=bodies&categoria=&categoria=bodies&categoria=accesorios&talle=0-3+m&talle=3-6+m&color=Rosa+viejo&orden=no-existe',
    )
    assert.equal(query.q, 'Body')
    assert.deepEqual(query.categorias, ['bodies', 'accesorios'])
    assert.deepEqual(query.talles, ['0-3 m', '3-6 m'])
    assert.deepEqual(query.colores, ['Rosa viejo'])
    assert.equal(query.orden, 'mas-nuevos')
    assert.equal(query.precio, null)
    assert.equal(query.soloConStock, false)
    assert.equal(isCatalogQueryActive(query), true)
    assert.equal(isCatalogQueryActive(parseCatalogQuery('')), false)
    assert.equal(isCatalogQueryActive(parseCatalogQuery('?orden=mas-nuevos')), false)
    assert.equal(isCatalogQueryActive(parseCatalogQuery('?orden=menor-precio')), true)
  })

  it('vuelve a armar la query y omite el orden por defecto', () => {
    const query = parseCatalogQuery('?color=Gris&talle=0-3%20m&categoria=bodies&q=manta&orden=mayor-precio')
    assert.equal(
      serializeCatalogQuery(query),
      '?q=manta&categoria=bodies&talle=0-3+m&color=Gris&orden=mayor-precio',
    )
    assert.equal(serializeCatalogQuery(parseCatalogQuery(serializeCatalogQuery(query))).includes('orden=mayor-precio'), true)
    assert.equal(serializeCatalogQuery({
      q: '  ',
      categorias: [],
      talles: [],
      colores: [],
      orden: 'mas-nuevos',
    }), '')
  })

  it('lee, serializa y limpia precio y disponibilidad', () => {
    const query = parseCatalogQuery('?precio=10000-20000&stock=1')
    assert.equal(query.precio, '10000-20000')
    assert.equal(query.soloConStock, true)
    assert.equal(serializeCatalogQuery(query), '?precio=10000-20000&stock=1')
    assert.equal(parseCatalogQuery('?precio=incorrecto&stock=0').precio, null)
    assert.equal(parseCatalogQuery('?precio=20000-10000').precio, null)
    assert.equal(parseCatalogQuery('?precio=10000-*').precio, '10000-*')
    assert.equal(isCatalogQueryActive(query), true)
  })
})

describe('filtrar', () => {
  it('combina AND entre secciones y OR dentro de cada una', () => {
    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: 'BODY',
      categorias: [],
      talles: [],
      colores: [],
      orden: 'mas-nuevos',
    })), ['body-de-algodon', 'body-bordado'])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: 'algodón',
      categorias: [],
      talles: [],
      colores: [],
      orden: 'mas-nuevos',
    })), ['body-de-algodon'])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: 'crudo',
      categorias: [],
      talles: [],
      colores: [],
      orden: 'mas-nuevos',
    })), [])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: '',
      categorias: ['bodies', 'accesorios'],
      talles: [],
      colores: [],
      orden: 'mas-nuevos',
    })), ['body-de-algodon', 'gorrito', 'manta', 'body-bordado'])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: '',
      categorias: [],
      talles: ['0-3 m', 'Talle único'],
      colores: [],
      orden: 'mas-nuevos',
    })), ['body-de-algodon', 'gorrito', 'manta'])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: '',
      categorias: ['bodies'],
      talles: ['Talle único'],
      colores: [],
      orden: 'mas-nuevos',
    })), [])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: '',
      categorias: [],
      talles: [],
      colores: ['Crudo', 'Gris'],
      orden: 'mas-nuevos',
    })), ['body-de-algodon', 'manta'])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: 'body',
      categorias: ['bodies'],
      talles: ['0-3 m'],
      colores: ['Crudo'],
      orden: 'mas-nuevos',
    })), ['body-de-algodon'])

    assert.deepEqual(slugs(filterCatalog(catalogo, {
      q: '',
      categorias: ['accesorios'],
      talles: [],
      colores: ['Gris'],
      orden: 'mas-nuevos',
    })), [])
  })

  it('la prenda sin stock sigue en el resultado', () => {
    const soloBodies = filterCatalog(catalogo, {
      q: '',
      categorias: ['bodies'],
      talles: [],
      colores: [],
      orden: 'mas-nuevos',
    })
    assert.ok(soloBodies.some((entry) => entry.slug === 'manta' && entry.status === 'sin-stock'))

    const porTalle = filterCatalog(catalogo, {
      q: '',
      categorias: [],
      talles: ['0-3 m'],
      colores: ['Gris'],
      orden: 'mas-nuevos',
    })
    assert.deepEqual(slugs(porTalle), ['manta'])
  })

  it('filtra por rangos de precio derivados del catálogo y solo con stock', () => {
    const ranges = availablePriceRanges(catalogo)
    assert.deepEqual(
      slugs(filterCatalog(catalogo, { ...emptyCatalogQuery(), precio: ranges[0].id })),
      ['gorrito'],
    )
    assert.deepEqual(
      slugs(filterCatalog(catalogo, { ...emptyCatalogQuery(), precio: ranges[2].id })),
      ['manta', 'body-bordado'],
    )

    const disponibles = filterCatalog(catalogo, { ...emptyCatalogQuery(), soloConStock: true })
    assert.deepEqual(slugs(disponibles), ['body-de-algodon', 'gorrito', 'body-bordado'])

    const piezaUnicaAgotada = item({
      slug: 'unica-agotada',
      name: 'Única agotada',
      status: 'pieza-unica',
      hasStock: false,
    })
    assert.deepEqual(
      slugs(filterCatalog([...catalogo, piezaUnicaAgotada], { ...emptyCatalogQuery(), soloConStock: true })),
      ['body-de-algodon', 'gorrito', 'body-bordado'],
    )
  })

  it('no reordena al filtrar y no toca la lista original', () => {
    const copia = [...catalogo]
    const filtrado = filterCatalog(catalogo, {
      q: '',
      categorias: ['bodies'],
      talles: [],
      colores: [],
      orden: 'menor-precio',
    })
    assert.deepEqual(slugs(filtrado), ['body-de-algodon', 'manta', 'body-bordado'])
    assert.deepEqual(catalogo, copia)
  })
})

describe('ordenar', () => {
  const empatados: CatalogItem[] = [
    item({ slug: 'a', name: 'A', price: 10, date: '2026-03-01T00:00:00.000Z' }),
    item({ slug: 'b', name: 'B', price: 5, date: '2026-01-01T00:00:00.000Z' }),
    item({ slug: 'c', name: 'C', price: 5, date: '2026-03-01T00:00:00.000Z' }),
    item({ slug: 'd', name: 'D', price: 10, date: '2026-02-01T00:00:00.000Z' }),
  ]

  it('más nuevos baja por fecha y el empate respeta el orden de entrada', () => {
    assert.deepEqual(slugs(sortCatalog(empatados, 'mas-nuevos')), ['a', 'c', 'd', 'b'])
    assert.deepEqual(slugs(sortCatalog([...empatados].reverse(), 'mas-nuevos')), ['c', 'a', 'd', 'b'])
  })

  it('menor y mayor precio usan el precio de la tarjeta y también son estables', () => {
    assert.deepEqual(slugs(sortCatalog(empatados, 'menor-precio')), ['b', 'c', 'a', 'd'])
    assert.deepEqual(slugs(sortCatalog(empatados, 'mayor-precio')), ['a', 'd', 'b', 'c'])
    assert.deepEqual(slugs(sortCatalog(catalogo, 'menor-precio')), [
      'gorrito', 'body-de-algodon', 'manta', 'body-bordado',
    ])
    assert.deepEqual(slugs(sortCatalog(catalogo, 'mayor-precio')), [
      'body-bordado', 'manta', 'body-de-algodon', 'gorrito',
    ])
  })

  it('cincuenta prendas que coinciden vuelven todas, no una página', () => {
    const cincuenta = Array.from({ length: 50 }, (_, index) => item({
      slug: `p-${index}`,
      name: `Prenda ${index}`,
      price: index % 5 === 0 ? 100 : 100 + index,
      date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    }))
    const todas = applyCatalog(cincuenta, {
      q: 'prenda',
      categorias: [],
      talles: [],
      colores: [],
      orden: 'menor-precio',
    })
    assert.equal(todas.length, 50)
    const precios = todas.map((entry) => entry.price)
    assert.deepEqual(precios, [...precios].sort((a, b) => a - b))
    const deCien = todas.filter((entry) => entry.price === 100).map((entry) => entry.slug)
    assert.deepEqual(deCien, ['p-0', 'p-5', 'p-10', 'p-15', 'p-20', 'p-25', 'p-30', 'p-35', 'p-40', 'p-45'])
  })
})
