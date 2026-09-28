import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuditModule } from './audit/audit.module';
import { CalibrationModule } from './calibration/calibration.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { GithubTokensModule } from './github-tokens/github-tokens.module';
import { MailModule } from './mail/mail.module';
import { MarkdownModule } from './markdown/markdown.module';
import { MembershipModule } from './membership/membership.module';
import { NormalizationModule } from './normalization/normalization.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrizesModule } from './prizes/prizes.module';
import { QueuesModule } from './queues/queues.module';
import { RedisModule } from './redis/redis.module';
import { ResultsModule } from './results/results.module';
import { RubricCriteriaModule } from './rubric-criteria/rubric-criteria.module';
import { ScoringModule } from './scoring/scoring.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { TeamsModule } from './teams/teams.module';
import { TracksModule } from './tracks/tracks.module';
import { UploadsModule } from './uploads/uploads.module';
import { VerificationModule } from './verification/verification.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    MarkdownModule,
    RedisModule,
    QueuesModule,
    AuditModule,
    CalibrationModule,
    AuthModule,
    EventsModule,
    MembershipModule,
    AdminModule,
    GithubTokensModule,
    TracksModule,
    PrizesModule,
    UploadsModule,
    TeamsModule,
    SubmissionsModule,
    VerificationModule,
    AssignmentsModule,
    RubricCriteriaModule,
    ScoringModule,
    NormalizationModule,
    ResultsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
