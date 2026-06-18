import { useCallback, useEffect, useState } from "react";
import type { EngineerReport, RacePlan } from "../../../packages/engine/src";
import type { PitPlan } from "../../../packages/strategy/src";
import type { ReportDoc } from "../../../packages/storage/src";
import { useRepos } from "./storage/RepoProvider";

/**
 * Engineer history (D28), now backed by William's storage repos (Phase 2B).
 * Every generated report/plan is kept in `repos.reports` (an EntityRepo<ReportDoc>),
 * so the engineer section reads as a logbook of advice — ask, test, come back.
 *
 * UPGRADE: reportstore previously had no never-wipe discipline (a corrupt blob
 * read as `{reports:[]}`). Moving to the repo gives it parse-on-read +
 * quarantine for free — a corrupt report is stashed, never silently dropped.
 *
 * SavedReport stays structurally a ReportDoc ({ id, created_at, ...arbitrary }),
 * so consumers compile unchanged; the run_ids now reference repo ids that carry
 * outbox provenance.
 */

export interface SavedReport {
  id: string;
  created_at: string;
  kind: "report" | "race_plan" | "strategy";
  /** the run(s) the analysis was built from */
  run_ids: string[];
  run_label: string; // denormalized for list rendering
  notes?: string;
  report?: EngineerReport;
  plan?: RacePlan;
  strategy?: PitPlan;
}

export interface ReportsState {
  reports: SavedReport[]; // newest last
}

export function useReports(): {
  reports: ReportsState | null;
  addReport: (r: Omit<SavedReport, "id" | "created_at">) => void;
  deleteReport: (id: string) => void;
} {
  const repos = useRepos();
  const [reports, setReports] = useState<ReportsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await repos.reports.getAll();
      if (cancelled) return;
      const list = res.ok ? (res.values as unknown as SavedReport[]) : [];
      setReports({ reports: [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)) });
    })();
    return () => {
      cancelled = true;
    };
  }, [repos]);

  const addReport = useCallback(
    (r: Omit<SavedReport, "id" | "created_at">) => {
      const now = new Date().toISOString();
      const id = `rep-${Date.parse(now).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const doc: SavedReport = { ...r, id, created_at: now };
      setReports((prev) => (prev ? { reports: [...prev.reports, doc] } : prev));
      void repos.reports.put(doc as unknown as ReportDoc, now);
    },
    [repos],
  );

  const deleteReport = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      setReports((prev) => (prev ? { reports: prev.reports.filter((r) => r.id !== id) } : prev));
      void repos.reports.remove(id, now);
    },
    [repos],
  );

  return { reports, addReport, deleteReport };
}
