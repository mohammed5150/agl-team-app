import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, TABLES } from "../scripts/backup-supabase.mjs";

const URL_ = "https://proj.supabase.co";
const KEY = "service-role-key";
const NOW = new Date("2026-08-10T01:00:00.000Z");

let out;
let realFetch;
let realEnv;

// The suite must not read the ambient environment. Both of these are set on a
// GitHub Actions runner, so a test that only overrode one of them passed
// locally and failed in CI against the runner's real commit SHA.
const REVISION_VARS = ["GITHUB_SHA", "GIT_REVISION"];

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "agl-backup-"));
  realFetch = globalThis.fetch;
  realEnv = Object.fromEntries(REVISION_VARS.map(k => [k, process.env[k]]));
  for (const k of REVISION_VARS) delete process.env[k];
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(realEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(out, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Fetch double.
 * @param {object} data table -> array of rows
 * @param {Set<string>} missing tables that answer 404
 */
function stubFetch(data, missing = new Set()) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const table = url.match(/\/rest\/v1\/(\w+)/)[1];
    if (missing.has(table)) {
      return {
        ok: false, status: 404,
        text: async () => `{"message":"Could not find the table 'public.${table}'"}`,
      };
    }
    const offset = Number(url.match(/offset=(\d+)/)?.[1] || 0);
    const limit = Number(url.match(/limit=(\d+)/)?.[1] || 1000);
    const rows = (data[table] || []).slice(offset, offset + limit);
    return { ok: true, status: 200, json: async () => rows };
  };
  return calls;
}

// Tables the base schema always has. Marking one of these absent is not a
// valid scenario — the script is right to fail on it, which is the point of
// the "required table missing" case below.
const REQUIRED = ["employees", "leave_requests", "announcements", "notifications"];
const OPTIONAL_TABLES = TABLES.filter(t => !REQUIRED.includes(t));

/** Every optional table absent, so a case only has to name what it cares about. */
const absentOptional = () => new Set(OPTIONAL_TABLES);

const oneRow = t => ({ [t]: [{ id: "X-1" }] });

describe("a backup writes every table it finds", () => {
  it("writes one JSON file per table plus a manifest", async () => {
    stubFetch(
      { employees: [{ id: "EMP-001", name: "A" }], leave_requests: [{ id: "LR-001" }] },
      absentOptional()
    );

    const { dir, manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });

    expect(existsSync(join(dir, "employees.json"))).toBe(true);
    expect(existsSync(join(dir, "leave_requests.json"))).toBe(true);
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    expect(manifest.tables).toMatchObject({ employees: 1, leave_requests: 1 });
  });

  it("names the directory after the moment it was taken", async () => {
    stubFetch(oneRow("employees"), absentOptional());
    const { dir } = await backup({ url: URL_, key: KEY, out, now: NOW });
    expect(dir).toContain("2026-08-10T01-00-00-000Z");
  });

  it("records the source project and when it was taken", async () => {
    stubFetch(oneRow("employees"), absentOptional());
    const { manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });
    expect(manifest.source).toBe(URL_);
    expect(manifest.takenAt).toBe(NOW.toISOString());
  });

  describe("the schema revision, so a restore knows which migrations the data came from", () => {
    it("takes GITHUB_SHA when the backup runs in CI", async () => {
      stubFetch(oneRow("employees"), absentOptional());
      process.env.GITHUB_SHA = "ci1234";
      const { manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });
      expect(manifest.gitRevision).toBe("ci1234");
    });

    it("falls back to GIT_REVISION for a manual run", async () => {
      stubFetch(oneRow("employees"), absentOptional());
      process.env.GIT_REVISION = "abc1234";
      const { manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });
      expect(manifest.gitRevision).toBe("abc1234");
    });

    it("prefers GITHUB_SHA when both are set", async () => {
      stubFetch(oneRow("employees"), absentOptional());
      process.env.GITHUB_SHA = "ci1234";
      process.env.GIT_REVISION = "abc1234";
      const { manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });
      expect(manifest.gitRevision).toBe("ci1234");
    });

    it("records null rather than guessing when neither is set", async () => {
      stubFetch(oneRow("employees"), absentOptional());
      const { manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });
      expect(manifest.gitRevision).toBeNull();
    });
  });

  it("writes readable JSON, not a single line", async () => {
    stubFetch({ employees: [{ id: "EMP-001" }] }, absentOptional());
    const { dir } = await backup({ url: URL_, key: KEY, out, now: NOW });
    const raw = readFileSync(join(dir, "employees.json"), "utf8");
    expect(raw).toContain("\n");
    expect(JSON.parse(raw)).toEqual([{ id: "EMP-001" }]);
  });
});

describe("paging", () => {
  it("reads past the 1000-row PostgREST cap", async () => {
    // The bug this guards against: a single unpaged GET returns the first
    // 1000 rows and calls itself a backup. audit_log crosses that within
    // weeks, so the failure would be silent and permanent.
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `AL-${i}` }));
    stubFetch({ audit_log: rows }, new Set(OPTIONAL_TABLES.filter(t => t !== "audit_log")));

    const { dir, manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });

    expect(manifest.tables.audit_log).toBe(2500);
    expect(JSON.parse(readFileSync(join(dir, "audit_log.json"), "utf8"))).toHaveLength(2500);
  });

  it("stops as soon as a short page comes back", async () => {
    const calls = stubFetch(
      { employees: Array.from({ length: 10 }, (_, i) => ({ id: i })) },
      absentOptional()
    );
    await backup({ url: URL_, key: KEY, out, now: NOW });
    expect(calls.filter(c => c.includes("/employees")).length).toBe(1);
  });

  it("orders every request, so paging cannot repeat or skip a row", async () => {
    const calls = stubFetch(oneRow("employees"), absentOptional());
    await backup({ url: URL_, key: KEY, out, now: NOW });
    for (const c of calls) expect(c).toMatch(/order=/);
  });

  it("orders the tables with no id column by their real key", async () => {
    const calls = stubFetch(
      { push_subscriptions: [{ endpoint: "https://x" }], approved_team_logins: [{ email: "a@b.c" }] },
      new Set(OPTIONAL_TABLES.filter(t => !["push_subscriptions", "approved_team_logins"].includes(t)))
    );
    await backup({ url: URL_, key: KEY, out, now: NOW });
    expect(calls.find(c => c.includes("push_subscriptions"))).toContain("order=endpoint");
    expect(calls.find(c => c.includes("approved_team_logins"))).toContain("order=email");
  });
});

describe("a partial backup fails loudly", () => {
  it("skips an optional table that is not in this project", async () => {
    stubFetch(oneRow("employees"), absentOptional());
    const { manifest } = await backup({ url: URL_, key: KEY, out, now: NOW });
    expect(manifest.skipped.overtime_requests).toMatch(/not present/);
    expect(manifest.tables.overtime_requests).toBeUndefined();
  });

  it("fails when a REQUIRED table is missing, rather than reporting success", async () => {
    // A "successful" backup that quietly lost the roster is the worst
    // possible outcome, because nobody looks again until the restore.
    stubFetch({}, new Set(["employees"]));
    await expect(backup({ url: URL_, key: KEY, out, now: NOW })).rejects.toThrow(/employees/);
  });

  it("fails on any non-404 error, even for an optional table", async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 500, text: async () => "internal error",
    });
    await expect(backup({ url: URL_, key: KEY, out, now: NOW })).rejects.toThrow(/500/);
  });

  it("fails when the whole export is empty", async () => {
    // A wrong key, a wrong URL and a paused project all produce zero rows and
    // would otherwise exit 0 and look fine for months.
    // Every table reachable, every table empty — what a wrong key, a wrong
    // URL or a paused project actually looks like.
    stubFetch({}, absentOptional());
    await expect(backup({ url: URL_, key: KEY, out, now: NOW }))
      .rejects.toThrow(/no rows at all/);
  });
});

describe("credentials", () => {
  it("refuses to run without both the URL and the key", async () => {
    for (const [url, key] of [[null, KEY], [URL_, null], [null, null]]) {
      await expect(backup({ url, key, out, now: NOW })).rejects.toThrow(/SUPABASE_URL/);
    }
  });

  it("explains why the service role key specifically is required", async () => {
    // Not a convenience: a backup taken through an end-user session would
    // omit every row RLS hides from that user and restore a truncated roster.
    await expect(backup({ url: URL_, key: null, out, now: NOW }))
      .rejects.toThrow(/RLS/);
  });

  it("sends the key as both apikey and bearer, as PostgREST expects", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts) => {
      seen.push(opts.headers);
      return { ok: true, status: 200, json: async () => (url.includes("employees") ? [{ id: 1 }] : []) };
    };
    await backup({ url: URL_, key: KEY, out, now: NOW });
    expect(seen[0].apikey).toBe(KEY);
    expect(seen[0].Authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("table coverage", () => {
  it("backs up every table the portal writes to", async () => {
    for (const t of [
      "employees", "leave_requests", "overtime_requests",
      "announcements", "notifications", "push_subscriptions",
    ]) {
      expect(TABLES).toContain(t);
    }
  });

  it("backs up the audit trails too, so history survives a project loss", async () => {
    expect(TABLES).toContain("audit_log");
    expect(TABLES).toContain("profile_unlock_audit");
  });

  it("puts employees first, since everything else references emp_id", () => {
    expect(TABLES[0]).toBe("employees");
  });

  it("lets a caller narrow the set", async () => {
    stubFetch(oneRow("employees"), absentOptional());
    const { dir } = await backup({ url: URL_, key: KEY, out, tables: ["employees"], now: NOW });
    expect(readdirSync(dir).sort()).toEqual(["employees.json", "manifest.json"]);
  });
});
