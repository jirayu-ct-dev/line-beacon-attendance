import { Module } from '@nestjs/common'
import { StudentsController } from './students.controller'
import { StudentsImportService } from './students-import.service'
import { StudentsService } from './students.service'

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, StudentsImportService],
})
export class StudentsModule {}
