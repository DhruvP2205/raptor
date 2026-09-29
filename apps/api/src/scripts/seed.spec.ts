import { main } from './seed';

describe('seed FIXTURES_IMPORT switch (Module 24, A5)', () => {
  const originalFixturesImport = process.env.FIXTURES_IMPORT;
  const originalFixturesPath = process.env.FIXTURES_PATH;

  afterEach(() => {
    process.env.FIXTURES_IMPORT = originalFixturesImport;
    process.env.FIXTURES_PATH = originalFixturesPath;
    jest.restoreAllMocks();
  });

  it('skips entirely, before any I/O, when FIXTURES_IMPORT=false', async () => {
    process.env.FIXTURES_IMPORT = 'false';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const code = await main();

    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('FIXTURES_IMPORT=false — skipping fixture import and seeded sessions entirely.'),
    );
  });

  it('proceeds past the switch when FIXTURES_IMPORT is unset (default true)', async () => {
    delete process.env.FIXTURES_IMPORT;
    // Points at a file that doesn't exist so this reaches the existing
    // "no fixtures file — skipping" branch instead of opening a real
    // database connection — proves the FIXTURES_IMPORT=false branch was
    // NOT the one taken, without needing Postgres in this test.
    process.env.FIXTURES_PATH = '/nonexistent/fixtures.json';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const code = await main();

    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No fixtures file at'));
  });

  it('proceeds past the switch when FIXTURES_IMPORT=true explicitly', async () => {
    process.env.FIXTURES_IMPORT = 'true';
    process.env.FIXTURES_PATH = '/nonexistent/fixtures.json';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const code = await main();

    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No fixtures file at'));
  });
});
