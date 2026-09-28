import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { GithubTokensModule } from './github-tokens/github-tokens.module';
import { MailModule } from './mail/mail.module';
import { MarkdownModule } from './markdown/markdown.module';
import { MembershipModule } from './membership/membership.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrizesModule } from './prizes/prizes.module';
import { QueuesModule } from './queues/queues.module';
import { RedisModule } from './redis/redis.module';
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
  ],
  controllers: [AppController],
})
export class AppModule {}
