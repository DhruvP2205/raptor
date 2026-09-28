import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { encryptGithubToken, parseGithubTokenKey } from '@raptor/crypto';
import type { GithubToken } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGithubTokenDto } from './dto/create-github-token.dto';

type PublicGithubToken = Omit<GithubToken, 'tokenEncrypted'>;

// Module 6 (Submission Verification) — see
// docs/stages/06-submission-verification.md Section 5. Admin-only
// (SiteAdminGuard at the controller); never surfaced to organizers.
// This service only ever encrypts — decryption happens exclusively in
// apps/worker, right before the GitHub API call that needs the
// plaintext, per D96 in docs/DECISIONS.md.
@Injectable()
export class GithubTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actingAdminUserId: string, dto: CreateGithubTokenDto): Promise<PublicGithubToken> {
    const key = this.getEncryptionKey();
    const tokenEncrypted = encryptGithubToken(dto.token, key);

    const created = await this.prisma.githubToken.create({
      data: { tokenEncrypted, label: dto.label },
    });

    // Role/token management is exactly what CLAUDE.md's principle 5
    // calls out — metadata never includes the token value or its
    // ciphertext, only which token (by id/label) was added.
    await this.audit.record(actingAdminUserId, 'GITHUB_TOKEN_ADDED', {
      tokenId: created.id,
      label: created.label,
    });

    return this.toPublic(created);
  }

  async list(): Promise<PublicGithubToken[]> {
    const tokens = await this.prisma.githubToken.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return tokens.map((t) => this.toPublic(t));
  }

  async revoke(actingAdminUserId: string, id: string): Promise<PublicGithubToken> {
    const updated = await this.prisma.githubToken.update({
      where: { id },
      data: { isValid: false, revokedAt: new Date() },
    });

    await this.audit.record(actingAdminUserId, 'GITHUB_TOKEN_REVOKED', {
      tokenId: updated.id,
      label: updated.label,
    });

    return this.toPublic(updated);
  }

  private getEncryptionKey(): Buffer {
    const hexKey = process.env.GITHUB_TOKEN_KEY;
    if (!hexKey) {
      // Unlike APP_SECRET (which degrades gracefully to a null ipHash),
      // there's no safe degraded mode for a token this service is about
      // to persist unencrypted otherwise — fail loud instead.
      throw new InternalServerErrorException(
        'GITHUB_TOKEN_KEY is not configured — cannot add a GitHub token without an encryption key.',
      );
    }
    return parseGithubTokenKey(hexKey);
  }

  private toPublic(token: GithubToken): PublicGithubToken {
    const { tokenEncrypted: _tokenEncrypted, ...rest } = token;
    return rest;
  }
}
