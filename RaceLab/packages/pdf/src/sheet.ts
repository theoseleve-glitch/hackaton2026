import { PDFDocument } from "pdf-lib";

/**
 * RaceLab PDF export — the importable core (D12: fill the manufacturer's
 * AcroForm sheet from setup JSON via the chassis pdf_map; fill, never redraw).
 *
 * This is the pure library the app's "export setup sheet" button calls. It is
 * deliberately I/O-free: the caller supplies the PDF BYTES and the values; this
 * returns new bytes + a fill-report. fill.ts is a thin CLI over it.
 *
 * NEVER fail closed on one field. A manufacturer can re-save the sheet and
 * rename a widget, or a part/notes string can overflow the fixed font — a bare
 * pdf-lib call would throw and emit NOTHING. Here every field is attempted in
 * isolation: failures are recorded in `skipped` and the rest of the sheet still
 * fills, so the racer gets a near-complete sheet + a list of what to write by
 * hand, not a broken button.
 */

export interface PdfMap {
  pdf_source: string;
  /** canonical setup key (e.g. "setup.front_shock_oil") → AcroForm text field name. */
  text: Record<string, string>;
  /** "canonical=value" (e.g. "setup.wing=plastic") → AcroForm checkbox name. */
  checkbox: Record<string, string>;
}

export type FillSkipReason = "missing_field" | "wrong_type" | "unknown_checkbox" | "set_failed";

export interface FillSkip {
  /** The canonical key (text) or the check key (checkbox) that did not apply. */
  field: string;
  /** The AcroForm widget name the map pointed at (absent for unknown_checkbox). */
  acroform_name?: string;
  reason: FillSkipReason;
  /** Trimmed underlying error message, for set_failed. */
  detail?: string;
}

export interface FillResult {
  /** The filled (and, by default, flattened) PDF bytes. */
  bytes: Uint8Array;
  /** Count of fields successfully written. */
  filled: number;
  /** Every field that could not be applied, with a reason — never thrown. */
  skipped: FillSkip[];
}

export interface FillOptions {
  /** Text field font size (the MP11 sheet needs a small fixed size). Default 7. */
  fontSize?: number;
  /** Bake values into the page so the export is a document, not an editable form.
   *  Default true. */
  flatten?: boolean;
}

function classify(e: unknown): { reason: FillSkipReason; detail: string } {
  const msg = e instanceof Error ? e.message : String(e);
  if (/no (form )?field|does not exist/i.test(msg)) return { reason: "missing_field", detail: msg };
  if (/is of type|not a|expected/i.test(msg)) return { reason: "wrong_type", detail: msg };
  return { reason: "set_failed", detail: msg };
}

/**
 * Fill a manufacturer AcroForm sheet from setup JSON via its chassis pdf_map.
 * Pure + I/O-free: bytes in, bytes + fill-report out. Per-field errors are
 * recorded and skipped — one drifted map entry or one oversized value never
 * aborts the whole export.
 */
export async function fillSheet(
  pdfBytes: Uint8Array | ArrayBuffer,
  map: PdfMap,
  values: Record<string, string | number>,
  checks: readonly string[] = [],
  opts: FillOptions = {},
): Promise<FillResult> {
  const doc = await PDFDocument.load(pdfBytes);
  const form = doc.getForm();
  const fontSize = opts.fontSize ?? 7;
  const skipped: FillSkip[] = [];
  let filled = 0;

  for (const [canonical, fieldName] of Object.entries(map.text)) {
    const value = values[canonical];
    if (value === undefined) continue; // not provided — not a failure
    try {
      const field = form.getTextField(fieldName); // throws if absent / wrong type
      field.setFontSize(fontSize);
      field.setText(String(value)); // throws on overflow
      filled++;
    } catch (e) {
      const { reason, detail } = classify(e);
      skipped.push({ field: canonical, acroform_name: fieldName, reason, detail });
    }
  }

  for (const key of checks) {
    const fieldName = map.checkbox[key];
    if (!fieldName) {
      // The map has no box for this canonical=value option (e.g. a catalog
      // option not yet mapped) — record it, never silently imply a default.
      skipped.push({ field: key, reason: "unknown_checkbox" });
      continue;
    }
    try {
      form.getCheckBox(fieldName).check();
      filled++;
    } catch (e) {
      const { reason, detail } = classify(e);
      skipped.push({ field: key, acroform_name: fieldName, reason, detail });
    }
  }

  if (opts.flatten !== false) form.flatten();
  const bytes = await doc.save();
  return { bytes, filled, skipped };
}
