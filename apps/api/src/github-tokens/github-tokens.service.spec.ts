import { InternalServerErrorException } from '@nestjs/common';
import { GithubTokensService } from './github-tokens.service';

function makePrisma() {
  return {
    githubToken: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

describe('GithubTokensService', () => {
  const originalKey = process.env.GITHUB_TOKEN_KEY;

  afterEach(() => {
    process.env.GITHUB_TOKEN_KEY = originalKey;
  });

  it('encrypts the token and never returns tokenEncrypted', async () => {
    process.env.GITHUB_TOKEN_KEY = 'a'.repeat(64);
    const prisma = makePrisma();
    prisma.githubToken.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'tok-1', label: data.label, tokenEncrypted: data.tokenEncrypted, isValid: true }),
    );
    const service = new GithubTokensService(prisma, makeAudit() as any);

    const result = await service.create('admin-1', { label: 'Token A', token: 'ghp_secret123' });

    expect(prisma.githubToken.create).toHaveBeenCalled();
    const createdData = prisma.githubToken.create.mock.calls[0][0].data;
    expect(createdData.tokenEncrypted).not.toContain('ghp_secret123');
    expect(result).not.toHaveProperty('tokenEncrypted');
  });

  it('audit-logs the token id/label only, never the value or ciphertext', async () => {
    process.env.GITHUB_TOKEN_KEY = 'a'.repeat(64);
    const prisma = makePrisma();
    prisma.githubToken.create.mockResolvedValue({
      id: 'tok-1',
      label: 'Token A',
      tokenEncrypted: 'ciphertext-value',
    });
    const audit = makeAudit();
    const service = new GithubTokensService(prisma, audit as any);

    await service.create('admin-1', { label: 'Token A', token: 'ghp_secret123' });

    const metadata = audit.record.mock.calls[0][2];
    expect(JSON.stringify(metadata)).not.toContain('ghp_secret123');
    expect(JSON.stringify(metadata)).not.toContain('ciphertext-value');
  });

  it('fails loud when GITHUB_TOKEN_KEY is not configured', async () => {
    delete process.env.GITHUB_TOKEN_KEY;
    const prisma = makePrisma();
    const service = new GithubTokensService(prisma, makeAudit() as any);

    await expect(
      service.create('admin-1', { label: 'Token A', token: 'ghp_secret123' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(prisma.githubToken.create).not.toHaveBeenCalled();
  });

  it('list() never includes tokenEncrypted', async () => {
    const prisma = makePrisma();
    prisma.githubToken.findMany.mockResolvedValue([
      { id: 'tok-1', label: 'Token A', tokenEncrypted: 'secret-cipher', isValid: true },
    ]);
    const service = new GithubTokensService(prisma, makeAudit() as any);

    const result = await service.list();
    expect(result[0]).not.toHaveProperty('tokenEncrypted');
  });

  it('revoke() sets isValid false and revokedAt', async () => {
    const prisma = makePrisma();
    prisma.githubToken.update.mockResolvedValue({
      id: 'tok-1',
      label: 'Token A',
      isValid: false,
      revokedAt: new Date(),
      tokenEncrypted: 'secret-cipher',
    });
    const service = new GithubTokensService(prisma, makeAudit() as any);

    const result = await service.revoke('admin-1', 'tok-1');

    expect(prisma.githubToken.update).toHaveBeenCalledWith({
      where: { id: 'tok-1' },
      data: { isValid: false, revokedAt: expect.any(Date) },
    });
    expect(result).not.toHaveProperty('tokenEncrypted');
  });
});
