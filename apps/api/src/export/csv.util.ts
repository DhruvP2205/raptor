import { stringify } from 'csv-stringify';
import type { Response } from 'express';

export type CsvValue = string | number | boolean | null | undefined;

// Section 15, docs/design/18-csv-export.md — RFC 4180-style quoting via
// a real library (never hand-rolled string joining, the mistake the
// original single-export version made), UTF-8, header row every time,
// streamed to the response rather than fully buffered into one string
// first. The row data itself still comes from one Prisma query result
// (this project has no DB-cursor-to-HTTP pipeline, and building one
// would be a much bigger investment than this feature needs) — what
// streams is the CSV *encoding*, not a claim that Postgres itself is
// read incrementally.
export function streamCsv(
  res: Response,
  filename: string,
  columns: string[],
  rows: CsvValue[][],
): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stringifier = stringify({ header: true, columns });
  stringifier.pipe(res);
  for (const row of rows) {
    stringifier.write(row.map((v) => (v === null || v === undefined ? '' : v)));
  }
  stringifier.end();
}
