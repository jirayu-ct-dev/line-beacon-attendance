import { PartialType } from '@nestjs/swagger'
import { CreateStudentDto } from './create-student.dto'

/** PATCH semantics: every field optional; omitted fields keep their current value. */
export class UpdateStudentDto extends PartialType(CreateStudentDto) {}
