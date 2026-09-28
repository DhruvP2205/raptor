import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { MailModule } from './mail/mail.module';
import { MarkdownModule } from './markdown/markdown.module';
import { MembershipModule } from './membership/membership.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrizesModule } from './prizes/prizes.module';
import { RedisModule } from './redis/redis.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { TeamsModule } from './teams/teams.module';
import { TracksModule } from './tracks/tracks.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    MarkdownModule,
    RedisModule,
    AuditModule,
    AuthModule,
    EventsModule,
    MembershipModule,
    AdminModule,
    TracksModule,
    PrizesModule,
    UploadsModule,
    TeamsModule,
    SubmissionsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
