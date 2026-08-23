import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles } from '../../common/auth/roles.decorator'
import { UserRole } from '../../generated/prisma/client'
import { ListAuditLogsDto } from './dto/list-audit-logs.dto'
import { AuditLogDetailDto, AuditLogResponseDto } from './dto/audit-log-response.dto'
import { AuditLogsService } from './audit-logs.service'

/** Admin-only audit-log viewer (spec §26, §56) — read-only. */
@ApiTags('audit-logs')
@Roles(UserRole.ADMIN)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs (filter by action/user/entity/date range)' })
  @ApiOkResponse({ type: AuditLogResponseDto, isArray: true })
  async list(@Query() query: ListAuditLogsDto) {
    return this.auditLogsService.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an audit log with its old/new snapshots (spec §56)' })
  @ApiOkResponse({ type: AuditLogDetailDto })
  async getById(@Param('id') id: string): Promise<AuditLogDetailDto> {
    return this.auditLogsService.getById(id)
  }
}
