import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [MembershipModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
