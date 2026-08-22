import type { LocationQuery } from 'vue-router'

/**
 * Server-side table state (design doc §6.3): page / pageSize / search / filters /
 * sort / order, all synced to the URL query so views are shareable and survive
 * refresh. The composable is transport-agnostic — the page feeds `queryParams`
 * to its fetch call and refetches whenever it changes.
 *
 * Changing a filter, the search text, the sort or the page size resets to
 * page 1 (the result set changed). Back/forward navigation re-reads the state
 * from the URL.
 */
export interface UseDataTableOptions {
  /** Default sort field (an API whitelist value, e.g. 'created_at'). */
  defaultSort?: string
  defaultOrder?: 'asc' | 'desc'
  defaultPageSize?: number
  /** Filter keys with their unset value, e.g. { status: '', year: '' }. */
  filters?: Record<string, string>
  /** Search debounce in ms. */
  debounceMs?: number
}

const parseIntParam = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback
}

const isFilterActive = (value: string | undefined): value is string => value != null && value !== ''

export const useDataTable = (options: UseDataTableOptions = {}) => {
  const {
    defaultSort = 'created_at',
    defaultOrder = 'desc',
    defaultPageSize = 20,
    debounceMs = 300,
  } = options

  const route = useRoute()
  const router = useRouter()

  const filterDefaults = options.filters ?? {}
  const filterKeys = Object.keys(filterDefaults)

  // Initial state from the URL (deep links / refresh).
  const page = ref(parseIntParam(route.query.page, 1))
  const pageSize = ref(parseIntParam(route.query.pageSize, defaultPageSize))
  const search = ref(typeof route.query.search === 'string' ? route.query.search : '')
  const searchInput = ref(search.value)
  const sort = ref(typeof route.query.sort === 'string' ? route.query.sort : defaultSort)
  const order = ref<'asc' | 'desc'>(
    route.query.order === 'asc' || route.query.order === 'desc' ? route.query.order : defaultOrder,
  )
  const filters = reactive(
    Object.fromEntries(
      filterKeys.map((key) => [
        key,
        typeof route.query[key] === 'string' && route.query[key] !== '' ? (route.query[key] as string) : filterDefaults[key],
      ]),
    ),
  )

  /** Request params for the list endpoint (refetch whenever this changes). */
  const queryParams = computed<Record<string, string | number>>(() => {
    const params: Record<string, string | number> = {
      page: page.value,
      pageSize: pageSize.value,
      sort: sort.value,
      order: order.value,
    }
    if (search.value) params.search = search.value
    for (const [key, value] of Object.entries(filters)) {
      if (isFilterActive(value)) params[key] = value
    }
    return params
  })

  /** True when a search text or filter is applied (drives "no result" vs "no data"). */
  const hasActiveFilters = computed(
    () => search.value !== '' || Object.values(filters).some((value) => isFilterActive(value)),
  )

  // --- mutations -----------------------------------------------------------

  const setPage = (value: number): void => {
    page.value = value
  }

  const setPageSize = (value: number): void => {
    pageSize.value = value
    page.value = 1
  }

  const setFilter = (key: string, value: string): void => {
    filters[key] = value
    page.value = 1
  }

  const sortBy = (field: string): void => {
    if (sort.value === field) {
      order.value = order.value === 'asc' ? 'desc' : 'asc'
    } else {
      sort.value = field
      order.value = 'asc'
    }
    page.value = 1
  }

  const resetFilters = (): void => {
    search.value = ''
    searchInput.value = ''
    for (const key of filterKeys) filters[key] = filterDefaults[key]
    page.value = 1
  }

  // --- debounced search ------------------------------------------------------

  if (import.meta.client) {
    let searchTimer: ReturnType<typeof setTimeout> | undefined
    watch(searchInput, (value) => {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        const next = value.trim()
        if (next !== search.value) {
          search.value = next
          page.value = 1
        }
      }, debounceMs)
    })
    onUnmounted(() => clearTimeout(searchTimer))
  }

  // --- URL sync (client only; SSR renders from the initial state) -----------

  const buildQuery = (): LocationQuery => {
    // Preserve query params this table does not manage (e.g. ?tab=).
    const next: LocationQuery = {}
    const managed = new Set(['page', 'pageSize', 'search', 'sort', 'order', ...filterKeys])
    for (const [key, value] of Object.entries(route.query)) {
      if (!managed.has(key)) next[key] = value
    }
    // Defaults are omitted to keep URLs clean.
    if (page.value !== 1) next.page = String(page.value)
    if (pageSize.value !== defaultPageSize) next.pageSize = String(pageSize.value)
    if (search.value) next.search = search.value
    if (sort.value !== defaultSort) next.sort = sort.value
    if (order.value !== defaultOrder) next.order = order.value
    for (const [key, value] of Object.entries(filters)) {
      if (isFilterActive(value)) next[key] = value
    }
    return next
  }

  const applyQuery = (query: LocationQuery): void => {
    const assignments: (() => void)[] = [
      () => (page.value = parseIntParam(query.page, 1)),
      () => (pageSize.value = parseIntParam(query.pageSize, defaultPageSize)),
      () => {
        const value = typeof query.search === 'string' ? query.search : ''
        if (search.value !== value) {
          search.value = value
          searchInput.value = value
        }
      },
      () => (sort.value = typeof query.sort === 'string' ? query.sort : defaultSort),
      () =>
        (order.value =
          query.order === 'asc' || query.order === 'desc' ? query.order : defaultOrder),
      ...filterKeys.map((key) => () => {
        const value =
          typeof query[key] === 'string' && query[key] !== '' ? (query[key] as string) : filterDefaults[key]
        if (filters[key] !== value) filters[key] = value
      }),
    ]
    for (const assign of assignments) assign()
  }

  if (import.meta.client) {
    // state → URL
    watch(queryParams, () => {
      const next = buildQuery()
      if (JSON.stringify(next) !== JSON.stringify(route.query)) {
        router.replace({ query: next })
      }
    })
    // URL → state (back/forward). Assignments converge: applying the query that
    // the state itself produced is a no-op.
    watch(
      () => route.query,
      (query) => applyQuery(query),
    )
  }

  return {
    page,
    pageSize,
    search,
    searchInput,
    filters,
    sort,
    order,
    queryParams,
    hasActiveFilters,
    setPage,
    setPageSize,
    setFilter,
    sortBy,
    resetFilters,
  }
}
