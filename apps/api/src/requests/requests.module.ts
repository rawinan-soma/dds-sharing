import { Module } from '@nestjs/common';
import { ReferenceDataModule } from '../reference/reference-data.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [ReferenceDataModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
