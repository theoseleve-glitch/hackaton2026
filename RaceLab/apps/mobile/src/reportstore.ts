import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import type { EngineerReport } from "../../../packages/engine/src";
import type { RacePlan } from "../../../packages/engine/src/planner";
import type { PitPlan } from "../../../packages/strategy/src";

/**
 * Engineer history (D28): every generated report/plan is kept, so the
 * engineer section reads as a logbook of advice — ask, test, come back.
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

const STORAGE_KEY = "racelab:engineer-reports";

export function useReports(): {
  reports: ReportsState | null;
  addReport: (r: Omit<SavedReport, "id" | "created_at">) => void;
  deleteReport: (id: string) => void;
} {
  const [reports, setReports] = useState<ReportsState | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) {
          setReports({ reports: [] });
          return;
        }
        try {
          const parsed = JSON.parse(raw) as ReportsState;
          setReports(Array.isArray(parsed.reports) ? parsed : { reports: [] });
        } catch {
          setReports({ reports: [] });
        }
      })
      .catch(() => setReports({ reports: [] }));
  }, []);

  useEffect(() => {
    if (reports) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reports)).catch(() => {});
    }
  }, [reports]);

  const addReport = useCallback((r: Omit<SavedReport, "id" | "created_at">) => {
    const now = new Date().toISOString();
    const id = `rep-${Date.parse(now).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setReports((prev) =>
      prev ? { reports: [...prev.reports, { ...r, id, created_at: now }] } : prev,
    );
  }, []);

  const deleteReport = useCallback((id: string) => {
    setReports((prev) => (prev ? { reports: prev.reports.filter((r) => r.id !== id) } : prev));
  }, []);

  return { reports, addReport, deleteReport };
}
