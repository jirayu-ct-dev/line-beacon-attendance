import type { VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { useDataTable } from '~/composables/useDataTable'

/**
 * The composable is transport-agnostic: these tests only cover state + URL
 * behaviour, no $api involved. The Nuxt router is real, so URL assertions poll
 * the route until the (async) navigation lands.
 */
interface MountedTable {
  wrapper: VueWrapper
  table: ReturnType<typeof useDataTable>
  query: () => Record<string, unknown>
  cleanup: () => Promise<void>
}

let mounted: MountedTable | undefined

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const mountTable = async (): Promise<MountedTable> => {
  let table!: ReturnType<typeof useDataTable>
  let query!: MountedTable['query']
  let cleanup!: MountedTable['cleanup']
  const wrapper = await mountSuspended({
    setup() {
      table = useDataTable({ filters: { status: '', year: '' }, defaultSort: 'created_at', debounceMs: 20 })
      const route = useRoute()
      const router = useRouter()
      query = () => route.query
      cleanup = async () => {
        await router.replace({ path: '/', query: {} })
      }
      return {}
    },
    template: '<div />',
  })
  await flushPromises()
  mounted = { wrapper, table, query, cleanup }
  return mounted
}

const waitFor = async (assertion: () => void): Promise<void> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await sleep(20)
    }
  }
  throw lastError
}

afterEach(async () => {
  await mounted?.cleanup()
  mounted?.wrapper.unmount()
  mounted = undefined
})

describe('useDataTable', () => {
  it('changing a filter resets the page to 1 and is reflected in the URL', async () => {
    const { table, query } = await mountTable()

    table.setPage(3)
    await waitFor(() => expect(query()).toMatchObject({ page: '3' }))

    table.setFilter('status', 'ACTIVE')
    expect(table.page.value).toBe(1)
    await waitFor(() => {
      expect(query()).toMatchObject({ status: 'ACTIVE' })
      expect(query()).not.toHaveProperty('page')
    })
  })

  it('debounced search resets the page to 1 and lands in the URL', async () => {
    const { table, query } = await mountTable()

    table.setPage(2)
    await waitFor(() => expect(query()).toMatchObject({ page: '2' }))

    table.searchInput.value = 'somchai'
    expect(table.search.value).toBe('') // still debounced
    await waitFor(() => expect(table.search.value).toBe('somchai'))
    expect(table.page.value).toBe(1)
    await waitFor(() => {
      expect(query()).toMatchObject({ search: 'somchai' })
      expect(query()).not.toHaveProperty('page')
    })
    expect(table.hasActiveFilters.value).toBe(true)
  })

  it('changing the page size resets the page to 1', async () => {
    const { table, query } = await mountTable()

    table.setPage(4)
    await waitFor(() => expect(query()).toMatchObject({ page: '4' }))
    table.setPageSize(50)

    expect(table.page.value).toBe(1)
    expect(table.pageSize.value).toBe(50)
    await waitFor(() => {
      expect(query()).toMatchObject({ pageSize: '50' })
      expect(query()).not.toHaveProperty('page')
    })
  })

  it('sortBy toggles direction and switching fields resets the page to 1', async () => {
    const { table, query } = await mountTable()

    expect(table.sort.value).toBe('created_at')
    expect(table.order.value).toBe('desc')

    table.sortBy('created_at')
    expect(table.order.value).toBe('asc')

    table.setPage(5)
    await waitFor(() => expect(query()).toMatchObject({ page: '5', order: 'asc' }))
    table.sortBy('student_code')

    expect(table.sort.value).toBe('student_code')
    expect(table.order.value).toBe('asc')
    expect(table.page.value).toBe(1)
    await waitFor(() => expect(query()).toMatchObject({ sort: 'student_code', order: 'asc' }))
  })

  it('queryParams exposes the request params with defaults applied', async () => {
    const { table } = await mountTable()

    expect(table.queryParams.value).toEqual({
      page: 1,
      pageSize: 20,
      sort: 'created_at',
      order: 'desc',
    })

    table.setFilter('year', '3')
    table.setPage(2)
    expect(table.queryParams.value).toMatchObject({ year: '3', page: 2 })
  })

  it('resetFilters clears search and filters', async () => {
    const { table, query } = await mountTable()

    table.setFilter('status', 'INACTIVE')
    table.searchInput.value = 'jaidee'
    await waitFor(() => expect(table.search.value).toBe('jaidee'))
    await waitFor(() => expect(query()).toMatchObject({ status: 'INACTIVE', search: 'jaidee' }))
    expect(table.hasActiveFilters.value).toBe(true)

    table.resetFilters()
    await waitFor(() => {
      expect(query()).not.toHaveProperty('status')
      expect(query()).not.toHaveProperty('search')
    })

    expect(table.search.value).toBe('')
    expect(table.searchInput.value).toBe('')
    expect(table.filters.status).toBe('')
    expect(table.hasActiveFilters.value).toBe(false)
  })
})
