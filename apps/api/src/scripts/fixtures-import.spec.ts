import {
  SYNTHESIZED_PLACEHOLDER,
  clampScoreValue,
  dedupScoresForTeam,
  disambiguateTeamName,
  humanizeEmailLocalPart,
  pickKeptProject,
  resolveSubmissionFields,
  splitWeightsEvenly,
  FixtureProject,
  FixtureScore,
} from './fixtures-import';

describe('pickKeptProject', () => {
  it('keeps the single project when there is only one', () => {
    const projects: FixtureProject[] = [
      { id: 'p1', team: 't1', title: 'A', submitted_at: '2026-01-01T00:00:00Z' },
    ];
    const { kept, discarded } = pickKeptProject(projects);
    expect(kept.id).toBe('p1');
    expect(discarded).toHaveLength(0);
  });

  it('keeps the latest submitted_at and discards the rest — real fixture case', () => {
    const projects: FixtureProject[] = [
      { id: 'prj_07', team: 'tm_07', title: 'Old', submitted_at: '2026-03-01T04:29:00Z' },
      { id: 'prj_41', team: 'tm_07', title: 'New', submitted_at: '2026-03-01T17:57:00Z' },
    ];
    const { kept, discarded } = pickKeptProject(projects);
    expect(kept.id).toBe('prj_41');
    expect(discarded.map((p) => p.id)).toEqual(['prj_07']);
  });

  it('generalizes past two entries — keeps the single latest of three', () => {
    const projects: FixtureProject[] = [
      { id: 'p1', team: 't1', title: 'A', submitted_at: '2026-01-01T00:00:00Z' },
      { id: 'p2', team: 't1', title: 'B', submitted_at: '2026-01-03T00:00:00Z' },
      { id: 'p3', team: 't1', title: 'C', submitted_at: '2026-01-02T00:00:00Z' },
    ];
    const { kept, discarded } = pickKeptProject(projects);
    expect(kept.id).toBe('p2');
    expect(discarded.map((p) => p.id).sort()).toEqual(['p1', 'p3']);
  });
});

describe('dedupScoresForTeam', () => {
  const score = (judge: string, project: string): FixtureScore => ({
    judge,
    project,
    criteria: { functionality: 3 },
  });

  it('a judge who scored both entries keeps only the kept-project score — real fixture case', () => {
    const scores = [score('jdg_19', 'prj_07'), score('jdg_19', 'prj_41')];
    const result = dedupScoresForTeam(scores, 'prj_41');
    expect(result).toHaveLength(1);
    expect(result[0].project).toBe('prj_41');
  });

  it('a judge who only scored the discarded entry keeps that single score-set', () => {
    const scores = [score('jdg_01', 'prj_07')];
    const result = dedupScoresForTeam(scores, 'prj_41');
    expect(result).toHaveLength(1);
    expect(result[0].project).toBe('prj_07');
  });

  it('a judge who only scored the kept entry is unaffected', () => {
    const scores = [score('jdg_18', 'prj_41')];
    const result = dedupScoresForTeam(scores, 'prj_41');
    expect(result).toHaveLength(1);
    expect(result[0].project).toBe('prj_41');
  });

  it('mixed real-fixture case: 3 scored both, 2 scored one side each', () => {
    const scores = [
      score('jdg_19', 'prj_07'),
      score('jdg_19', 'prj_41'),
      score('jdg_21', 'prj_07'),
      score('jdg_21', 'prj_41'),
      score('jdg_26', 'prj_07'),
      score('jdg_26', 'prj_41'),
      score('jdg_01', 'prj_07'),
      score('jdg_12', 'prj_07'),
      score('jdg_18', 'prj_41'),
    ];
    const result = dedupScoresForTeam(scores, 'prj_41');
    expect(result).toHaveLength(6); // one per distinct judge, no duplicates
    const byJudge = new Map(result.map((s) => [s.judge, s.project]));
    expect(byJudge.get('jdg_19')).toBe('prj_41');
    expect(byJudge.get('jdg_21')).toBe('prj_41');
    expect(byJudge.get('jdg_26')).toBe('prj_41');
    expect(byJudge.get('jdg_01')).toBe('prj_07');
    expect(byJudge.get('jdg_12')).toBe('prj_07');
    expect(byJudge.get('jdg_18')).toBe('prj_41');
  });
});

describe('disambiguateTeamName', () => {
  it('leaves a unique name untouched', () => {
    expect(disambiguateTeamName('NorthKiln', new Set())).toBe('NorthKiln');
  });

  it('suffixes the second occurrence of a duplicate name', () => {
    const used = new Set(['StillTrail']);
    expect(disambiguateTeamName('StillTrail', used)).toBe('StillTrail (2)');
  });

  it('suffixes the third occurrence past an already-used (2)', () => {
    const used = new Set(['StillTrail', 'StillTrail (2)']);
    expect(disambiguateTeamName('StillTrail', used)).toBe('StillTrail (3)');
  });
});

describe('splitWeightsEvenly', () => {
  it('splits the real fixture 3-key case as 33/33/34', () => {
    expect(splitWeightsEvenly(3)).toEqual([33, 33, 34]);
  });

  it('always sums to exactly 100', () => {
    for (const n of [1, 2, 3, 4, 5, 7, 11]) {
      expect(splitWeightsEvenly(n).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('returns an empty array for zero criteria', () => {
    expect(splitWeightsEvenly(0)).toEqual([]);
  });
});

describe('clampScoreValue', () => {
  it('passes an in-range integer through unchanged', () => {
    expect(clampScoreValue(42)).toBe(42);
  });

  it('clamps a negative value to 0 rather than rejecting', () => {
    expect(clampScoreValue(-5)).toBe(0);
  });

  it('clamps an out-of-range value to 100', () => {
    expect(clampScoreValue(250)).toBe(100);
  });

  it('rounds a non-integer to satisfy the Int column', () => {
    expect(clampScoreValue(3.7)).toBe(4);
  });
});

describe('resolveSubmissionFields', () => {
  // Section 3/6 — a real fixture project always has title/summary/
  // repo_url (confirmed: 0 of the real file's 41 projects omit
  // summary), so this path is never exercised by a live run. Doc
  // Section 6 still requires it be tested.
  it('passes through title/summary/repo_url unchanged when all present', () => {
    const project: FixtureProject = {
      id: 'p1',
      team: 't1',
      title: 'Real Title',
      summary: 'Real summary.',
      repo_url: 'https://example.org/repo/1',
      submitted_at: '2026-01-01T00:00:00Z',
    };
    expect(resolveSubmissionFields(project)).toEqual({
      title: 'Real Title',
      description: 'Real summary.',
      repoUrl: 'https://example.org/repo/1',
    });
  });

  it('substitutes the synthesized placeholder for a missing summary, not null/empty', () => {
    const project: FixtureProject = {
      id: 'p2',
      team: 't1',
      title: 'Real Title',
      submitted_at: '2026-01-01T00:00:00Z',
    };
    const fields = resolveSubmissionFields(project);
    expect(fields.description).toBe(SYNTHESIZED_PLACEHOLDER);
  });

  it('substitutes the synthesized placeholder for a missing repo_url, not null/empty', () => {
    const project: FixtureProject = {
      id: 'p3',
      team: 't1',
      title: 'Real Title',
      summary: 'Real summary.',
      submitted_at: '2026-01-01T00:00:00Z',
    };
    const fields = resolveSubmissionFields(project);
    expect(fields.repoUrl).toBe(SYNTHESIZED_PLACEHOLDER);
  });

  it('the placeholder is visually distinguishable from real content', () => {
    const project: FixtureProject = { id: 'p4', team: 't1', title: 'T', submitted_at: '2026-01-01T00:00:00Z' };
    const fields = resolveSubmissionFields(project);
    expect(fields.description).toContain('synthesized');
    expect(fields.description).not.toBe('');
  });
});

describe('humanizeEmailLocalPart', () => {
  it('capitalizes a simple local part', () => {
    expect(humanizeEmailLocalPart('priya1@example.org')).toBe('Priya1');
  });

  it('splits on dots/underscores/hyphens into separate words', () => {
    expect(humanizeEmailLocalPart('member1_1@example.org')).toBe('Member1 1');
  });
});
