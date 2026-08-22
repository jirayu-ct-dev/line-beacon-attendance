import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/**
 * Pagination convention shared by all list endpoints.
 *
 * Spec §48 defines only the response envelope ({ success, data }) and does not
 * prescribe a pagination shape, so every paginated endpoint uses this one:
 *
 *   GET /api/v1/<resource>?page=1&pageSize=20&search=abc&sort=created_at&order=desc
 *
 *   → data: { items: T[], total: number, page: number, pageSize: number }
 *
 * - `search` semantics (which columns it matches) and the `sort` field whitelist
 *   are defined per endpoint by extending this DTO.
 * - `order` defaults to `desc` so the default sort (`created_at`) is newest-first.
 */
export class PaginationDto {
  @ApiProperty({ required: false, default: 1, minimum: 1, description: 'หมายเลขหน้า (เริ่มที่ 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100, description: 'จำนวนรายการต่อหน้า' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number

  @ApiProperty({ required: false, description: 'คำค้นหา (contains, ไม่สนตัวพิมพ์เล็ก-ใหญ่)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string

  @ApiProperty({ required: false, description: 'ฟิลด์ที่ใช้เรียงลำดับ (whitelist กำหนดที่แต่ละ endpoint)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string

  @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc'
}

/** Standard paginated list payload returned as `data` (see PaginationDto above). */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Resolved pagination defaults (page/pageSize always set, order defaults to desc). */
export function resolvePagination(query: PaginationDto): { page: number; pageSize: number; order: 'asc' | 'desc' } {
  return {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
    order: query.order ?? 'desc',
  }
}
