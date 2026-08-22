import { describe, it, expect, afterEach } from "vitest";
import { buildWorkbook } from "../scripts/monthly-report.mjs";

// previousMonth/monthRange/anyDateInRange aren't exported (only used
// internally by buildWorkbook/runMonthlyReport) — exercised indirectly below
// through buildWorkbook's actual filtering behavior, which is what matters.

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function fakeSupabase({ employees = [], leave_requests = [], overtime_requests = [] }) {
  const byTable = { employees, leave_requests, overtime_requests };
  globalThis.fetch = async (url) => {
    const table = Object.keys(byTable).find(t => url.includes(`/rest/v1/${t}`));
    const rows = table ? byTable[table] : [];
    return {
      ok: true,
      json: async () => rows,
    };
  };
}

describe("buildWorkbook", () => {
  it("rejects a malformed --month", async () => {
    fakeSupabase({});
    await expect(buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026/08" }))
      .rejects.toThrow(/YYYY-MM/);
  });

  it("includes every employee on the roster sheet regardless of month", async () => {
    fakeSupabase({
      employees: [{ id: "EMP-001", name: "A" }, { id: "EMP-002", name: "B" }],
    });
    const { workbook, counts } = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-08" });
    expect(counts.employees).toBe(2);
    expect(workbook.getWorksheet("Roster (current)").rowCount).toBe(3); // header + 2
  });

  it("keeps a leave request applied for in-month even if it starts in another month", async () => {
    fakeSupabase({
      leave_requests: [
        { id: "LR-001", applied_on: "2026-08-15T10:00:00Z", start_date: "2026-09-05" },
      ],
    });
    const { counts } = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-08" });
    expect(counts.leave).toBe(1);
  });

  it("keeps a leave request starting in-month even if it was applied for earlier", async () => {
    fakeSupabase({
      leave_requests: [
        { id: "LR-002", applied_on: "2026-07-20T10:00:00Z", start_date: "2026-08-01" },
      ],
    });
    const { counts } = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-08" });
    expect(counts.leave).toBe(1);
  });

  it("excludes a leave request with no date in the target month", async () => {
    fakeSupabase({
      leave_requests: [
        { id: "LR-003", applied_on: "2026-06-01T10:00:00Z", start_date: "2026-06-05" },
      ],
    });
    const { counts } = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-08" });
    expect(counts.leave).toBe(0);
  });

  it("does not crash on a row with null dates", async () => {
    fakeSupabase({
      leave_requests: [{ id: "LR-004", applied_on: null, start_date: null }],
      overtime_requests: [{ id: "OT-001", applied_on: null, work_date: null }],
    });
    const { counts } = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-08" });
    expect(counts.leave).toBe(0);
    expect(counts.overtime).toBe(0);
  });

  it("filters overtime the same way as leave — applied or worked in month", async () => {
    fakeSupabase({
      overtime_requests: [
        { id: "OT-010", applied_on: "2026-08-02T00:00:00Z", work_date: "2026-07-30" },
        { id: "OT-011", applied_on: "2026-07-02T00:00:00Z", work_date: "2026-08-30" },
        { id: "OT-012", applied_on: "2026-06-02T00:00:00Z", work_date: "2026-06-30" },
      ],
    });
    const { counts } = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-08" });
    expect(counts.overtime).toBe(2);
  });

  it("names the leave and overtime sheets after the target month", async () => {
    fakeSupabase({});
    const { workbook } = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-08" });
    expect(workbook.getWorksheet("Leave 2026-08")).toBeTruthy();
    expect(workbook.getWorksheet("Overtime 2026-08")).toBeTruthy();
  });

  it("handles the December-to-January month boundary correctly when filtering", async () => {
    fakeSupabase({
      leave_requests: [{ id: "LR-005", applied_on: "2026-01-31T23:59:59Z", start_date: null }],
    });
    const jan = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2026-01" });
    expect(jan.counts.leave).toBe(1);
    const dec = await buildWorkbook({ supabaseUrl: "https://x", supabaseKey: "k", month: "2025-12" });
    expect(dec.counts.leave).toBe(0);
  });
});
