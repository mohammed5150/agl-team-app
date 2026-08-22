import { describe, it, expect } from "vitest";
import {
  leaveSubmitted, leaveActioned, overtimeSubmitted, overtimeActioned,
  employeeInvited, bulkInvited, profileFinalized, errorAlert,
} from "../src/slackEvents.js";

describe("slack event text", () => {
  it("describes a new leave request", () => {
    expect(leaveSubmitted("Nisar Ahmed", "Annual", 3))
      .toBe("📅 New leave: Nisar Ahmed - Annual (3d)");
  });

  it("wraps a leave workflow message with the leave emoji", () => {
    expect(leaveActioned("Annual APPROVED ✅")).toBe("📅 Annual APPROVED ✅");
  });

  it("describes a new overtime request", () => {
    expect(overtimeSubmitted("Bv4 Haris", 4, "2026-08-22"))
      .toBe("🕐 New overtime: Bv4 Haris - 4h on 2026-08-22");
  });

  it("wraps an overtime workflow message with the overtime emoji", () => {
    expect(overtimeActioned("Overtime 4h on 2026-08-22 APPROVED ✅"))
      .toBe("🕐 Overtime 4h on 2026-08-22 APPROVED ✅");
  });

  it("describes a single invite", () => {
    expect(employeeInvited("New Joiner", "new.joiner@adbsafegate.com"))
      .toBe("👋 New joiner invited: New Joiner (new.joiner@adbsafegate.com)");
  });

  it("pluralizes a bulk invite summary", () => {
    expect(bulkInvited(1)).toBe("👋 Bulk import: 1 new joiner invited");
    expect(bulkInvited(5)).toBe("👋 Bulk import: 5 new joiners invited");
  });

  it("describes a profile finalization", () => {
    expect(profileFinalized("Nisar Ahmed")).toBe("✅ Nisar Ahmed finalized their profile");
  });

  it("formats an error alert with its route", () => {
    expect(errorAlert("error", "leave", "Cannot read properties of undefined"))
      .toBe("🚨 [error] leave: Cannot read properties of undefined");
  });

  it("omits the route prefix when there is no route", () => {
    expect(errorAlert("sync", "", "save failed")).toBe("🚨 [sync] save failed");
    expect(errorAlert("sync", null, "save failed")).toBe("🚨 [sync] save failed");
  });

  it("never includes an employee identity", () => {
    const text = errorAlert("error", "profile", "failed for emp-014");
    expect(text).not.toMatch(/emp_id|email|role/);
  });
});
