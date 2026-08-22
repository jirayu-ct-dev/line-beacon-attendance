import { Module } from '@nestjs/common'
import { BeaconLogsController } from './beacon-logs.controller'
import { BeaconLogsService } from './beacon-logs.service'

@Module({
  controllers: [BeaconLogsController],
  providers: [BeaconLogsService],
})
export class BeaconLogsModule {}
