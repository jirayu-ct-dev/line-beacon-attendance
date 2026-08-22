import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthUser, CurrentUser } from '../../common/auth/current-user.decorator'
import { Roles } from '../../common/auth/roles.decorator'
import { StudentStatus, UserRole } from '../../generated/prisma/client'
import { CreateStudentDto } from './dto/create-student.dto'
import { ListStudentsDto } from './dto/list-students.dto'
import { StudentResponseDto } from './dto/student-response.dto'
import { UpdateStudentDto } from './dto/update-student.dto'
import { ImportApplyResult, ImportPreviewResult, StudentsImportService } from './students-import.service'
import { StudentsService } from './students.service'

/** Admin-only student management (spec §27, §29, §35) — JWT guard is global. */
@ApiTags('students')
@Roles(UserRole.ADMIN)
@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly importService: StudentsImportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List students (paginated; search by code/name, filter by status/year)' })
  @ApiOkResponse({ type: StudentResponseDto, isArray: true })
  async list(@Query() query: ListStudentsDto) {
    return this.studentsService.list(query)
  }

  @Post('import/preview')
  @ApiOperation({
    summary: 'Validate a CSV/XLSX import file without writing anything (spec §8)',
    description:
      'Multipart field "file". Header: student_code,first_name,last_name,birth_date,year[,email] — max 1000 rows.',
  })
  @UseInterceptors(FileInterceptor('file')) // multer default storage = memory
  async importPreview(@UploadedFile() file?: Express.Multer.File): Promise<ImportPreviewResult> {
    return this.importService.preview(requireFile(file))
  }

  @Post('import')
  @ApiOperation({
    summary: 'Import a CSV/XLSX file (re-validates, then applies the valid rows)',
    description:
      'Multipart field "file". Existing student_code rows are updated (upsert); invalid rows are skipped and reported.',
  })
  @UseInterceptors(FileInterceptor('file')) // multer default storage = memory
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportApplyResult> {
    return this.importService.apply(requireFile(file), user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a student by id' })
  @ApiOkResponse({ type: StudentResponseDto })
  async getById(@Param('id') id: string): Promise<StudentResponseDto> {
    return this.studentsService.getById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a student' })
  @ApiOkResponse({ type: StudentResponseDto })
  async create(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser): Promise<StudentResponseDto> {
    return this.studentsService.create(dto, user.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a student (no hard delete — spec §35)' })
  @ApiOkResponse({ type: StudentResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StudentResponseDto> {
    return this.studentsService.update(id, dto, user.id)
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable a student (status INACTIVE — this is the "delete", spec §35)' })
  @ApiOkResponse({ type: StudentResponseDto })
  async disable(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<StudentResponseDto> {
    return this.studentsService.setStatus(id, StudentStatus.INACTIVE, user.id)
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable a student (status ACTIVE)' })
  @ApiOkResponse({ type: StudentResponseDto })
  async enable(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<StudentResponseDto> {
    return this.studentsService.setStatus(id, StudentStatus.ACTIVE, user.id)
  }
}

function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new BadRequestException('ไม่พบไฟล์ กรุณาแนบไฟล์ .csv หรือ .xlsx ในฟิลด์ file')
  return file
}
