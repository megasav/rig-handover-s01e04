// Plan morning-digest § 1. The contract every part of § 2 builds against (issue #1).

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string; // ISO 8601 with the log's offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job in a night.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—"
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  fails: number; // lines with status "fail"
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line that had one; null renders as "—"
  first: string; // `at` of the first line, as written in the log
  last: string; // `at` of the last line, as written in the log
};

// Lines per status, over the whole night (the board shows these beside each night).
export type NightCounts = Record<RunStatus, number>;

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; the page and the JSON use this order as is
  counts: NightCounts;
  badLines: number; // lines that did not parse; counted, never thrown
};

// null when runs/<night>.jsonl does not exist (or `night` is not YYYY-MM-DD): routes answer 404.
// An empty file is a Night with no rows ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
