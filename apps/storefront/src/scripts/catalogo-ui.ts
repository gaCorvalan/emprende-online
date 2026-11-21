/**
 * Búsqueda, filtros y orden del catálogo en el navegador.
 * La query vive en la URL y el catálogo completo se calcula con datos del CMS.
 */

import { prendasLabel, showingLabel } from '../lib/catalog.ts'
import {
  applyCatalog,
  availableFacets,
  availablePriceRanges,
  catalogOptionCounts,
  emptyCatalogQuery,
  isCatalogQueryActive,
  isCatalogSort,
  parseCatalogQuery,
  serializeCatalogQuery,
  type CatalogCategorySource,
  type CatalogItem,
  type CatalogPriceRange,
  type CatalogQuery,
  type CatalogSort,
} from '../lib/filters.ts'

const ORDENES: { id: CatalogSort, label: string }[] = [
  { id: 'mas-nuevos', label: 'Más nuevos' },
  { id: 'menor-precio', label: 'Menor precio' },
  { id: 'mayor-precio', label: 'Mayor precio' },
]

interface CategoryChoice extends CatalogCategorySource {
  imageUrl?: string | null
  imageAlt?: string
}

interface Payload {
  items: CatalogItem[]
  categories: CategoryChoice[]
}

type Draft = Pick<
  CatalogQuery,
  'categorias' | 'talles' | 'colores' | 'precio' | 'soloConStock' | 'orden'
>

const SECTION_OPEN = 'flex flex-col items-start'
const SECTION_CLOSED = 'hidden'
const CHECK_ON = 'flex size-6 shrink-0 items-center justify-center rounded-chico bg-acento text-acento-texto'
const CHECK_OFF = 'size-6 shrink-0 rounded-chico border-2 border-borde-control bg-superficie'
const PILL_ON = 'inline-flex h-11 shrink-0 items-center justify-center rounded-medio border-2 border-acento bg-acento px-4 texto-etiqueta text-acento-texto'
const PILL_OFF = 'inline-flex h-11 shrink-0 items-center justify-center rounded-medio border border-borde-control bg-superficie px-4 texto-etiqueta text-texto'

function ordenLabel(orden: CatalogSort): string {
  return ORDENES.find((entry) => entry.id === orden)?.label ?? 'Más nuevos'
}

function safeHex(value: string | null | undefined): string | null {
  return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : null
}

function filterCount(query: CatalogQuery): number {
  return query.categorias.length
    + query.talles.length
    + query.colores.length
    + Number(query.precio !== null)
    + Number(query.soloConStock)
    + Number(query.orden !== 'mas-nuevos')
}

function focusable(root: ParentNode): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')
  return [...nodes].filter((node) =>
    !node.closest('[hidden]')
    && node.getAttribute('tabindex') !== '-1'
    && !node.hasAttribute('disabled'),
  )
}

export function initCatalogo(): void {
  const root = document.querySelector<HTMLElement>('[data-catalogo]')
  if (!root || root.dataset.listo === '1') return

  const datos = document.getElementById('catalogo-datos')
  const input = root.querySelector<HTMLInputElement>('[data-buscar]')
  const server = root.querySelector<HTMLElement>('[data-servidor]')
  const client = root.querySelector<HTMLElement>('[data-cliente]')
  const shortcuts = root.querySelector<HTMLElement>('[data-atajos]')
  const chips = root.querySelector<HTMLElement>('[data-chips]')
  const chipList = root.querySelector<HTMLElement>('[data-chips-lista]')
  const count = root.querySelector<HTMLElement>('[data-cuenta]')
  const showing = root.querySelector<HTMLElement>('[data-mostrando]')
  const gridWrap = root.querySelector<HTMLElement>('[data-grilla-wrap]')
  const grid = root.querySelector<HTMLElement>('[data-grilla]')
  const empty = root.querySelector<HTMLElement>('[data-vacio]')
  const emptyTitle = root.querySelector<HTMLElement>('[data-vacio-titulo]')
  const emptyHelp = root.querySelector<HTMLElement>('[data-vacio-ayuda]')
  const openButton = root.querySelector<HTMLButtonElement>('[data-abrir]')
  const filterBadge = root.querySelector<HTMLElement>('[data-filtros-cuenta]')
  const panel = root.querySelector<HTMLElement>('[data-panel]')
  const dialog = root.querySelector<HTMLElement>('#catalogo-dialog')
  const options = root.querySelector<HTMLElement>('[data-opciones]')
  const applyButton = root.querySelector<HTMLButtonElement>('[data-aplicar]')
  const closeButton = root.querySelector<HTMLButtonElement>('[data-cerrar]')
  const template = root.querySelector<HTMLTemplateElement>('[data-tarjetas]')

  if (
    !datos?.textContent || !input || !server || !client || !shortcuts || !chips || !chipList
    || !count || !showing || !gridWrap || !grid || !empty || !emptyTitle || !emptyHelp
    || !openButton || !filterBadge || !panel || !dialog || !options || !applyButton
    || !closeButton || !template
  ) {
    return
  }

  let payload: Payload
  try {
    payload = JSON.parse(datos.textContent) as Payload
  } catch {
    return
  }
  if (!Array.isArray(payload.items) || !Array.isArray(payload.categories)) return

  root.dataset.listo = '1'

  const items = payload.items
  const categories = payload.categories
  const facets = availableFacets(items)
  const priceRanges: CatalogPriceRange[] = availablePriceRanges(items)
  const cards = new Map<string, HTMLAnchorElement>()
  for (const holder of template.content.querySelectorAll<HTMLElement>('[data-slug]')) {
    const slug = holder.dataset.slug
    const link = holder.querySelector('a')
    if (slug && link) cards.set(slug, link)
  }

  let searchPushed = false
  let draft: Draft = { categorias: [], talles: [], colores: [], precio: null, soloConStock: false, orden: 'mas-nuevos' }
  const openSections = new Set(['categoria', 'talle'])

  function draftQuery(): CatalogQuery {
    return {
      q: input.value,
      categorias: [...draft.categorias],
      talles: [...draft.talles],
      colores: [...draft.colores],
      precio: draft.precio,
      soloConStock: draft.soloConStock,
      orden: draft.orden,
    }
  }

  function writeQuery(query: CatalogQuery, mode: 'search' | 'push'): void {
    const next = serializeCatalogQuery(query)
    if (next === location.search) return
    const url = `${location.pathname}${next}${location.hash}`
    if (mode === 'search' && searchPushed) history.replaceState(null, '', url)
    else history.pushState(null, '', url)
    searchPushed = mode === 'search'
  }

  function updateFilterBadge(query: CatalogQuery): void {
    const total = filterCount(query)
    filterBadge.textContent = String(total)
    filterBadge.hidden = total === 0
    openButton.setAttribute(
      'aria-label',
      total === 0 ? 'Filtrar y ordenar' : `Filtrar y ordenar, ${total} filtros activos`,
    )
  }

  function paintChips(query: CatalogQuery): void {
    const entries: { tipo: string, valor: string, label: string }[] = []
    for (const slug of query.categorias) {
      const category = categories.find((entry) => entry.slug === slug)
      entries.push({ tipo: 'categoria', valor: slug, label: category?.name || slug })
    }
    for (const size of query.talles) entries.push({ tipo: 'talle', valor: size, label: size })
    for (const color of query.colores) entries.push({ tipo: 'color', valor: color, label: color })
    const range = priceRanges.find((entry) => entry.id === query.precio)
    if (range) entries.push({ tipo: 'precio', valor: range.id, label: range.label })
    if (query.soloConStock) entries.push({ tipo: 'stock', valor: '1', label: 'Solo con stock' })
    if (query.orden !== 'mas-nuevos') {
      entries.push({ tipo: 'orden', valor: query.orden, label: ordenLabel(query.orden) })
    }

    chipList.replaceChildren()
    if (entries.length === 0) {
      chips.hidden = true
      return
    }

    for (const entry of entries) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'inline-flex h-11 shrink-0 items-center gap-2 rounded-pastilla bg-acento-suave px-4 texto-etiqueta text-texto'
      button.dataset.chip = entry.tipo
      button.dataset.valor = entry.valor
      button.setAttribute('aria-label', `Quitar ${entry.label}`)
      const name = document.createElement('span')
      name.textContent = entry.label
      const mark = document.createElement('span')
      mark.setAttribute('aria-hidden', 'true')
      mark.className = 'text-texto'
      mark.textContent = '×'
      button.append(name, mark)
      chipList.append(button)
    }

    const clear = document.createElement('button')
    clear.type = 'button'
    clear.className = 'inline-flex h-11 shrink-0 items-center px-2 texto-etiqueta text-acento'
    clear.dataset.limpiar = 'chips'
    clear.textContent = 'Limpiar'
    chipList.append(clear)
    chips.hidden = false
  }

  function render(query: CatalogQuery): void {
    updateFilterBadge(query)
    shortcuts.hidden = isCatalogQueryActive(query) || categories.length === 0

    if (!isCatalogQueryActive(query)) {
      server.hidden = false
      client.hidden = true
      chips.hidden = true
      chipList.replaceChildren()
      grid.replaceChildren()
      return
    }

    server.hidden = true
    client.hidden = false
    const results = applyCatalog(items, query)
    count.textContent = prendasLabel(results.length)
    showing.textContent = showingLabel(results.length, results.length)
    paintChips(query)

    if (results.length === 0) {
      gridWrap.hidden = true
      grid.replaceChildren()
      showing.hidden = true
      emptyTitle.textContent = query.q.trim()
        ? `No encontramos “${query.q.trim()}”`
        : 'No encontramos prendas con esos filtros'
      emptyHelp.textContent = 'Probá con otro nombre o sacá algún filtro (tocá la X o “Limpiar”). También podés mirar todo el catálogo.'
      empty.hidden = false
      return
    }

    empty.hidden = true
    showing.hidden = false
    gridWrap.hidden = false
    const fragment = document.createDocumentFragment()
    for (const item of results) {
      const card = cards.get(item.slug)
      if (!card) continue
      const li = document.createElement('li')
      li.className = 'min-w-0'
      li.append(card.cloneNode(true))
      fragment.append(li)
    }
    grid.replaceChildren(fragment)
  }

  function optionCounts() {
    return catalogOptionCounts(items, draftQuery(), priceRanges, categories)
  }

  function refreshCategoryCounts(): void {
    const counts = optionCounts().categorias
    for (const label of options.querySelectorAll<HTMLElement>('[data-cantidad-categoria]')) {
      const slug = label.dataset.cantidadCategoria
      if (slug) label.textContent = String(counts[slug] ?? 0)
    }
  }

  function updateCount(): void {
    const query = draftQuery()
    applyButton.textContent = `Ver ${prendasLabel(applyCatalog(items, query).length)}`
    updateFilterBadge({
      ...query,
      categorias: [...draft.categorias],
      talles: [...draft.talles],
      colores: [...draft.colores],
      precio: draft.precio,
      soloConStock: draft.soloConStock,
      orden: draft.orden,
    })
    refreshCategoryCounts()
  }

  function appendSection(
    id: string,
    title: string,
    summary: string,
    renderBody: () => HTMLElement,
  ): void {
    const isOpen = openSections.has(id)
    const section = document.createElement('section')
    section.className = SECTION_OPEN

    const header = document.createElement('button')
    header.type = 'button'
    header.dataset.seccion = id
    header.className = 'flex h-14 w-full items-center gap-3 border-b border-borde text-left'
    header.setAttribute('aria-expanded', String(isOpen))
    header.setAttribute('aria-controls', `filtro-opciones-${id}`)

    const texts = document.createElement('span')
    texts.className = 'flex min-w-0 flex-1 flex-col gap-[2px] overflow-hidden'
    const heading = document.createElement('span')
    heading.className = 'truncate texto-etiqueta text-texto'
    heading.textContent = title
    const subtitle = document.createElement('span')
    subtitle.className = 'truncate texto-cuerpo-chico text-texto-secundario'
    subtitle.textContent = summary
    texts.append(heading, subtitle)

    const chevron = document.createElement('img')
    chevron.src = isOpen ? '/filtro-v2/cerrar-seccion.svg' : '/filtro-v2/abrir-seccion.svg'
    chevron.width = 24
    chevron.height = 24
    chevron.alt = ''
    chevron.setAttribute('aria-hidden', 'true')
    header.append(texts, chevron)

    const body = renderBody()
    body.id = `filtro-opciones-${id}`
    body.hidden = !isOpen
    body.classList.add(isOpen ? 'flex' : SECTION_CLOSED)
    section.append(header, body)
    options.append(section)
  }

  function choiceButton(
    label: string,
    type: string,
    value: string,
    selected: boolean,
    radio = false,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.tipo = type
    button.dataset.valor = value
    if (radio) {
      button.setAttribute('role', 'radio')
      button.setAttribute('aria-checked', String(selected))
    } else {
      button.setAttribute('aria-pressed', String(selected))
    }
    button.append(document.createTextNode(label))
    return button
  }

  function paintOptions(): void {
    options.replaceChildren()
    const counts = optionCounts()

    if (categories.length > 0) {
      const selectedNames = categories
        .filter((category) => draft.categorias.includes(category.slug))
        .map((category) => category.name)
      appendSection(
        'categoria',
        'Categoría',
        selectedNames.length > 0 ? selectedNames.join(' · ') : 'Todas',
        () => {
          const body = document.createElement('div')
          body.className = 'flex w-full flex-col items-start pt-1 pb-4'
          for (const category of categories) {
            const selected = draft.categorias.includes(category.slug)
            const button = document.createElement('button')
            button.type = 'button'
            button.dataset.tipo = 'categoria'
            button.dataset.valor = category.slug
            button.setAttribute('role', 'checkbox')
            button.setAttribute('aria-checked', String(selected))
            button.className = 'flex h-12 w-full items-center gap-3 text-left'

            const check = document.createElement('span')
            check.className = selected ? CHECK_ON : CHECK_OFF
            check.setAttribute('aria-hidden', 'true')
            if (selected) {
              const mark = document.createElement('img')
              mark.src = '/filtro-v2/check.svg'
              mark.width = 16
              mark.height = 16
              mark.alt = ''
              check.append(mark)
            }
            const name = document.createElement('span')
            name.className = selected ? 'min-w-0 flex-1 truncate texto-etiqueta text-texto' : 'min-w-0 flex-1 truncate texto-cuerpo text-texto'
            name.textContent = category.name
            const amount = document.createElement('span')
            amount.dataset.cantidadCategoria = category.slug
            amount.className = 'shrink-0 texto-cuerpo-chico text-texto-secundario'
            amount.textContent = String(counts.categorias[category.slug] ?? 0)
            button.append(check, name, amount)
            body.append(button)
          }
          return body
        },
      )
    }

    if (facets.talles.length > 0) {
      const selected = draft.talles
      appendSection(
        'talle',
        'Talle / edad',
        selected.length > 0 ? selected.join(' · ') : 'Todas las edades',
        () => {
          const body = document.createElement('div')
          body.className = 'flex w-full gap-2 overflow-x-auto pt-3 pb-4'
          for (const size of facets.talles) {
            const chosen = selected.includes(size)
            const button = choiceButton(size, 'talle', size, chosen)
            button.className = chosen ? PILL_ON : PILL_OFF
            button.setAttribute('role', 'checkbox')
            button.setAttribute('aria-checked', String(chosen))
            body.append(button)
          }
          return body
        },
      )
    }

    if (facets.colores.length > 0) {
      const selected = draft.colores
      appendSection(
        'color',
        'Color',
        selected.length > 0 ? selected.join(' · ') : 'Todos',
        () => {
          const body = document.createElement('div')
          body.className = 'grid w-full grid-cols-4 gap-x-[18px] gap-y-3 pt-3 pb-4'
          for (const color of facets.colores) {
            const chosen = selected.includes(color.name)
            const button = document.createElement('button')
            button.type = 'button'
            button.dataset.tipo = 'color'
            button.dataset.valor = color.name
            button.className = 'flex w-[76px] flex-col items-center gap-1'
            button.setAttribute('aria-pressed', String(chosen))
            button.setAttribute('aria-label', `${color.name}${chosen ? ', seleccionado' : ''}`)

            const ring = document.createElement('span')
            ring.className = chosen
              ? 'flex size-[52px] items-center justify-center rounded-pastilla border-2 border-texto'
              : 'flex size-[52px] items-center justify-center rounded-pastilla border-2 border-transparent'
            const swatch = document.createElement('span')
            swatch.className = 'size-12 rounded-pastilla border border-borde-control'
            const hex = safeHex(color.hex)
            if (hex) swatch.style.backgroundColor = hex
            else swatch.classList.add('bg-superficie-hundida')
            ring.append(swatch)

            const name = document.createElement('span')
            name.className = chosen
              ? 'max-w-full truncate texto-cuerpo-chico font-semibold text-texto'
              : 'max-w-full truncate texto-cuerpo-chico text-texto-secundario'
            name.textContent = color.name
            button.append(ring, name)
            body.append(button)
          }
          return body
        },
      )
    }

    appendSection(
      'precio',
      'Precio',
      priceRanges.find((range) => range.id === draft.precio)?.label ?? 'Cualquier precio',
      () => {
        const body = document.createElement('div')
        body.className = 'flex w-full flex-wrap gap-2 pt-3 pb-4'
        for (const range of priceRanges) {
          const selected = draft.precio === range.id
          const button = choiceButton(range.label, 'precio', range.id, selected)
          button.className = selected ? PILL_ON : PILL_OFF
          body.append(button)
        }
        return body
      },
    )

    appendSection(
      'disponibilidad',
      'Disponibilidad',
      draft.soloConStock ? 'Solo con stock' : 'Todas',
      () => {
        const body = document.createElement('div')
        body.className = 'flex w-full flex-col items-start pb-4'
        const row = document.createElement('button')
        row.type = 'button'
        row.dataset.tipo = 'stock'
        row.dataset.valor = '1'
        row.setAttribute('role', 'switch')
        row.setAttribute('aria-checked', String(draft.soloConStock))
        row.className = 'flex h-14 w-full items-center gap-3 text-left'

        const text = document.createElement('span')
        text.className = 'flex min-w-0 flex-1 flex-col gap-[2px]'
        const title = document.createElement('span')
        title.className = 'texto-cuerpo text-texto'
        title.textContent = 'Solo con stock'
        const help = document.createElement('span')
        help.className = 'texto-cuerpo-chico text-texto-secundario'
        help.textContent = 'Oculta las prendas agotadas'
        text.append(title, help)

        const toggle = document.createElement('span')
        toggle.className = 'h-8 w-[52px] shrink-0'
        toggle.setAttribute('aria-hidden', 'true')
        const switchImage = document.createElement('img')
        switchImage.src = draft.soloConStock ? '/filtro-v2/stock-on.svg' : '/filtro-v2/stock-off.svg'
        switchImage.width = 52
        switchImage.height = 32
        switchImage.alt = ''
        toggle.append(switchImage)
        row.append(text, toggle)
        body.append(row)
        return body
      },
    )

    appendSection(
      'orden',
      'Ordenar',
      ordenLabel(draft.orden),
      () => {
        const body = document.createElement('div')
        body.className = 'flex w-full flex-col items-start pt-1 pb-4'
        const group = document.createElement('div')
        group.className = 'flex w-full flex-col'
        group.setAttribute('role', 'radiogroup')
        group.setAttribute('aria-label', 'Ordenar')
        for (const order of ORDENES) {
          const selected = draft.orden === order.id
          const button = choiceButton(order.label, 'orden', order.id, selected, true)
          button.className = 'flex h-12 w-full items-center gap-3 text-left'
          const radio = document.createElement('span')
          radio.className = 'flex size-6 shrink-0 items-center justify-center'
          radio.setAttribute('aria-hidden', 'true')
          if (selected) {
            const radioImage = document.createElement('img')
            radioImage.src = '/filtro-v2/radio-on.svg'
            radioImage.width = 24
            radioImage.height = 24
            radioImage.alt = ''
            radio.append(radioImage)
          } else {
            radio.className = 'size-6 shrink-0 rounded-pastilla border-2 border-borde-control'
          }
          const label = document.createElement('span')
          label.className = selected ? 'texto-etiqueta text-texto' : 'texto-cuerpo text-texto'
          label.textContent = order.label
          button.replaceChildren(radio, label)
          group.append(button)
        }
        body.append(group)
        return body
      },
    )
  }

  function lockPage(locked: boolean): void {
    document.documentElement.classList.toggle('overflow-hidden', locked)
    document.body.classList.toggle('overflow-hidden', locked)
  }

  function closePanel(): void {
    const wasOpen = !panel.hidden
    panel.hidden = true
    lockPage(false)
    openButton.setAttribute('aria-expanded', 'false')
    updateFilterBadge(parseCatalogQuery(location.search))
    if (wasOpen) openButton.focus()
  }

  function openPanel(): void {
    const query = parseCatalogQuery(location.search)
    draft = {
      categorias: [...query.categorias],
      talles: [...query.talles],
      colores: [...query.colores],
      precio: query.precio,
      soloConStock: query.soloConStock,
      orden: query.orden,
    }
    paintOptions()
    updateCount()
    panel.hidden = false
    lockPage(true)
    openButton.setAttribute('aria-expanded', 'true')
    closeButton.focus()
  }

  function restoreOptionFocus(type: string, value: string): void {
    const button = [...options.querySelectorAll<HTMLButtonElement>('button[data-tipo]')]
      .find((entry) => entry.dataset.tipo === type && entry.dataset.valor === value)
    button?.focus()
  }

  function choose(button: HTMLButtonElement): void {
    const type = button.dataset.tipo
    const value = button.dataset.valor
    if (!type || !value) return
    const scrollTop = options.scrollTop

    if (type === 'orden') {
      if (!isCatalogSort(value)) return
      draft.orden = value
    } else if (type === 'categoria') {
      draft.categorias = draft.categorias.includes(value)
        ? draft.categorias.filter((entry) => entry !== value)
        : [...draft.categorias, value]
    } else if (type === 'talle') {
      draft.talles = draft.talles.includes(value)
        ? draft.talles.filter((entry) => entry !== value)
        : [...draft.talles, value]
    } else if (type === 'color') {
      draft.colores = draft.colores.includes(value)
        ? draft.colores.filter((entry) => entry !== value)
        : [...draft.colores, value]
    } else if (type === 'precio') {
      draft.precio = draft.precio === value ? null : value
    } else if (type === 'stock') {
      draft.soloConStock = !draft.soloConStock
    } else {
      return
    }

    paintOptions()
    options.scrollTop = scrollTop
    restoreOptionFocus(type, value)
    updateCount()
  }

  root.querySelector('[data-buscar-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
  })

  input.addEventListener('input', () => {
    const query = parseCatalogQuery(location.search)
    query.q = input.value
    writeQuery(query, 'search')
    render(parseCatalogQuery(location.search))
    if (!panel.hidden) updateCount()
  })

  openButton.addEventListener('click', () => {
    if (panel.hidden) openPanel()
    else closePanel()
  })

  closeButton.addEventListener('click', closePanel)
  root.querySelector('[data-fondo]')?.addEventListener('click', closePanel)

  root.querySelector('[data-limpiar-panel]')?.addEventListener('click', () => {
    draft = { categorias: [], talles: [], colores: [], precio: null, soloConStock: false, orden: 'mas-nuevos' }
    paintOptions()
    updateCount()
  })

  applyButton.addEventListener('click', () => {
    const query = draftQuery()
    writeQuery(query, 'push')
    render(parseCatalogQuery(location.search))
    closePanel()
  })

  chipList.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest('button')
    if (!button || !chipList.contains(button)) return
    const query = parseCatalogQuery(location.search)
    if (button.dataset.limpiar === 'chips') {
      query.categorias = []
      query.talles = []
      query.colores = []
      query.precio = null
      query.soloConStock = false
      query.orden = 'mas-nuevos'
    } else if (button.dataset.chip === 'categoria') {
      query.categorias = query.categorias.filter((entry) => entry !== button.dataset.valor)
    } else if (button.dataset.chip === 'talle') {
      query.talles = query.talles.filter((entry) => entry !== button.dataset.valor)
    } else if (button.dataset.chip === 'color') {
      query.colores = query.colores.filter((entry) => entry !== button.dataset.valor)
    } else if (button.dataset.chip === 'precio') {
      query.precio = null
    } else if (button.dataset.chip === 'stock') {
      query.soloConStock = false
    } else if (button.dataset.chip === 'orden') {
      query.orden = 'mas-nuevos'
    } else {
      return
    }
    writeQuery(query, 'push')
    render(parseCatalogQuery(location.search))
    const next = chipList.querySelector('button')
    if (next instanceof HTMLElement) next.focus()
    else input.focus()
  })

  root.querySelector('[data-limpiar-todo]')?.addEventListener('click', () => {
    if (location.pathname !== '/') {
      location.assign('/')
      return
    }
    input.value = ''
    writeQuery(emptyCatalogQuery(), 'push')
    render(emptyCatalogQuery())
    input.focus()
  })

  shortcuts.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-atajo]')
    const slug = button?.dataset.atajo
    if (!button || !slug) return
    const query = parseCatalogQuery(location.search)
    query.categorias = query.categorias.includes(slug) ? [] : [slug]
    writeQuery(query, 'push')
    render(parseCatalogQuery(location.search))
  })

  options.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>('button')
    if (!target || !options.contains(target)) return
    if (target.dataset.seccion) {
      const id = target.dataset.seccion
      if (openSections.has(id)) openSections.delete(id)
      else openSections.add(id)
      paintOptions()
      options.querySelector<HTMLButtonElement>(`[data-seccion="${id}"]`)?.focus()
      return
    }
    if (target.dataset.tipo) choose(target)
  })

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[role="radio"]')
      if (!button || (event.key !== 'ArrowRight' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp')) return
      const radios = [...(button.closest('[role="radiogroup"]')?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])]
      const index = radios.indexOf(button)
      if (index < 0 || radios.length === 0) return
      const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
      const next = radios[(index + delta + radios.length) % radios.length]
      event.preventDefault()
      choose(next)
      return
    }

    const nodes = focusable(dialog)
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault()
      closePanel()
    }
  })

  window.addEventListener('popstate', () => {
    searchPushed = false
    const wasOpen = !panel.hidden
    panel.hidden = true
    lockPage(false)
    openButton.setAttribute('aria-expanded', 'false')
    const query = parseCatalogQuery(location.search)
    input.value = query.q
    render(query)
    if (wasOpen) openButton.focus()
  })

  const initial = parseCatalogQuery(location.search)
  input.value = initial.q
  render(initial)
}
