import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { MembershipModule } from '../membership/membership.module';
import { VerificationModule } from '../verification/verification.module';
import { OrganizerSummaryController } from './organizer-summary.controller';
import { OrganizerSummaryService } from './organizer-summary.service';

@Module({
  imports: [AssignmentsModule, VerificationModule, MembershipModule],
  controllers: [OrganizerSummaryController],
  providers: [OrganizerSummaryService],
})
export class OrganizerSummaryModule {}
