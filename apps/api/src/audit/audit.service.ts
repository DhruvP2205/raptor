import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Append-only — see CLAUDE.md's non-negotiable principle 5. This is
// the only write path into AuditLog; nothing else in the codebase
// should INSERT into it directly, and nothing ever UPDATEs or DELETEs
// a row here.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actorUserId: string,
    action: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { actorUserId, action, metadataJson: metadata },
    });
  }
}
