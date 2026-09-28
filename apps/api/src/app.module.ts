import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { MailModule } from './mail/mail.module';
import { MembershipModule } from './membership/membership.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AuditModule,
    AuthModule,
    EventsModule,
    MembershipModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
