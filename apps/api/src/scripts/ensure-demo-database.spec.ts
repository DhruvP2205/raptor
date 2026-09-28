import { isSafeDatabaseIdentifier, parseDatabaseUrl } from './ensure-demo-database';

describe('parseDatabaseUrl', () => {
  it('extracts the target database name and points adminUrl at the postgres maintenance database', () => {
    const { adminUrl, targetDbName } = parseDatabaseUrl('postgresql://raptor:secret@postgres:5432/raptor_demo');
    expect(targetDbName).toBe('raptor_demo');
    expect(adminUrl).toBe('postgresql://raptor:secret@postgres:5432/postgres');
  });
});

describe('isSafeDatabaseIdentifier', () => {
  // Defense in depth — this value gets interpolated into a raw,
  // unparameterized `CREATE DATABASE` statement (Postgres has no
  // parameterized DDL for this).
  it('accepts a plain alphanumeric/underscore identifier', () => {
    expect(isSafeDatabaseIdentifier('raptor_demo')).toBe(true);
  });

  it('rejects an identifier containing a quote (SQL injection shape)', () => {
    expect(isSafeDatabaseIdentifier('raptor"; DROP DATABASE raptor; --')).toBe(false);
  });

  it('rejects an identifier containing a space', () => {
    expect(isSafeDatabaseIdentifier('raptor demo')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSafeDatabaseIdentifier('')).toBe(false);
  });
});
