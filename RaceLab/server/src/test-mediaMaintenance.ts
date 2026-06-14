/**
 * media-maintenance worker test — the two pure planning functions exercised
 * directly (no HTTP, no Postgres, no clock; `now`/`ttl` injected). Assertion
 * style mirrors src/test-media.ts / src/test-server.ts. Run from RaceLab/server:
 *
 *   npx tsx src/test-mediaMaintenance.ts
 *
 * Covers (per the worker brief):
 *   exifStripPlan — shared jpeg/webp -> strip; non-shared -> no strip;
 *                   pdf (shared) -> no strip; + casing/charset normalization,
 *                   png (raster but no GPS), non-shared raster.
 *   presignSweep  — unconfirmed-old -> swept; confirmed -> kept; recent -> kept;
 *                   boundary at EXACTLY ttl -> kept; just-over -> swept;
 *                   bad created_at / bad now / bad ttl -> fail-safe (kept);
 *                   input order preserved.
 */

import {
  exifStripPlan,
  presignSweep,
  type MediaDescriptor,
  type PresignRow,
} from "./workers/mediaMaintenance";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ═══ exifStripPlan ═══════════════════════════════════════════════════════════

console.log("— exifStripPlan: shared raster must strip GPS —");
{
  const jpeg = exifStripPlan({ mime: "image/jpeg", shared: true });
  check("shared jpeg -> strip", jpeg.strip === true && jpeg.reason === "shared_raster_strip_gps");

  const webp = exifStripPlan({ mime: "image/webp", shared: true });
  check("shared webp -> strip", webp.strip === true && webp.reason === "shared_raster_strip_gps");

  // casing + charset parameter must not let GPS slip through the gate
  const upper = exifStripPlan({ mime: "IMAGE/JPEG", shared: true });
  check("shared JPEG uppercase still strips", upper.strip === true);
  const param = exifStripPlan({ mime: "image/jpeg; charset=binary", shared: true });
  check("shared jpeg with ;charset param still strips", param.strip === true);
  const spaced = exifStripPlan({ mime: "  image/webp  ", shared: true });
  check("shared webp with surrounding whitespace still strips", spaced.strip === true);
}

console.log("\n— exifStripPlan: pdf is shared but carries no EXIF GPS —");
{
  const pdf = exifStripPlan({ mime: "application/pdf", shared: true });
  check("shared pdf -> no strip", pdf.strip === false && pdf.reason === "mime_carries_no_exif_gps");

  // png is raster but has no EXIF GPS tag — no strip needed
  const png = exifStripPlan({ mime: "image/png", shared: true });
  check("shared png -> no strip (no EXIF GPS)", png.strip === false && png.reason === "mime_carries_no_exif_gps");
}

console.log("\n— exifStripPlan: non-shared media never strips (regardless of mime) —");
{
  const privJpeg = exifStripPlan({ mime: "image/jpeg", shared: false });
  check("non-shared jpeg -> no strip", privJpeg.strip === false && privJpeg.reason === "not_shared");

  const privWebp = exifStripPlan({ mime: "image/webp", shared: false });
  check("non-shared webp -> no strip", privWebp.strip === false && privWebp.reason === "not_shared");

  const privPdf = exifStripPlan({ mime: "application/pdf", shared: false });
  check("non-shared pdf -> no strip", privPdf.strip === false && privPdf.reason === "not_shared");

  // `shared` is checked FIRST: a raster + GPS-bearing mime that is NOT shared is
  // still "not_shared", never "shared_raster_strip_gps"
  check("non-shared takes precedence over raster mime", privJpeg.reason === "not_shared");
}

// ═══ presignSweep ════════════════════════════════════════════════════════════

const NOW = "2026-06-13T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const TTL = 60 * 60 * 1000; // 1h

/** A row created `ageMs` before NOW. */
function rowAged(id: string, ageMs: number, confirmed: boolean): PresignRow {
  return { id, created_at: new Date(NOW_MS - ageMs).toISOString(), confirmed };
}

console.log("\n— presignSweep: unconfirmed + old is reclaimed —");
{
  const rows: PresignRow[] = [rowAged("old-1", TTL + 1, false)];
  const swept = presignSweep(rows, NOW, TTL);
  check("unconfirmed older than ttl -> swept", swept.length === 1 && swept[0] === "old-1");
}

console.log("\n— presignSweep: confirmed + recent are kept —");
{
  const confirmedOld = rowAged("conf-old", TTL * 10, true); // very old but CONFIRMED
  const recentUnconf = rowAged("recent", TTL - 1, false); // unconfirmed but young
  const swept = presignSweep([confirmedOld, recentUnconf], NOW, TTL);
  check("confirmed-old -> kept (never swept)", !swept.includes("conf-old"));
  check("unconfirmed-recent -> kept", !swept.includes("recent"));
  check("nothing swept when only confirmed/recent", swept.length === 0);
}

console.log("\n— presignSweep: boundary at exactly ttl —");
{
  const exactly = rowAged("at-ttl", TTL, false); // age === ttl
  const justOver = rowAged("over-ttl", TTL + 1, false); // age === ttl + 1ms
  const justUnder = rowAged("under-ttl", TTL - 1, false);
  const swept = presignSweep([exactly, justOver, justUnder], NOW, TTL);
  check("age == ttl -> KEPT (strict >, still in window)", !swept.includes("at-ttl"));
  check("age == ttl+1 -> swept", swept.includes("over-ttl"));
  check("age == ttl-1 -> kept", !swept.includes("under-ttl"));
}

console.log("\n— presignSweep: input order preserved, only abandoned returned —");
{
  const rows: PresignRow[] = [
    rowAged("a-conf", TTL * 5, true), // kept (confirmed)
    rowAged("b-old", TTL + 1000, false), // swept
    rowAged("c-recent", 10, false), // kept (recent)
    rowAged("d-old", TTL + 5000, false), // swept
  ];
  const swept = presignSweep(rows, NOW, TTL);
  check("returns abandoned ids in input order", JSON.stringify(swept) === JSON.stringify(["b-old", "d-old"]));
}

console.log("\n— presignSweep: fail-safe on bad data (never reclaim) —");
{
  // unparseable created_at -> kept (don't delete quota on garbage)
  const badCreated: PresignRow = { id: "bad-ts", created_at: "not-a-date", confirmed: false };
  check("unparseable created_at -> kept", presignSweep([badCreated], NOW, TTL).length === 0);

  // unparseable now -> sweep nothing
  const realOld = rowAged("old", TTL + 1, false);
  check("bad now -> sweeps nothing", presignSweep([realOld], "garbage", TTL).length === 0);

  // negative / non-finite ttl -> sweep nothing
  check("negative ttl -> sweeps nothing", presignSweep([realOld], NOW, -1).length === 0);
  check("NaN ttl -> sweeps nothing", presignSweep([realOld], NOW, NaN).length === 0);
  check("Infinity ttl -> sweeps nothing (no finite window)", presignSweep([realOld], NOW, Infinity).length === 0);

  // ttl === 0: any positive-age unconfirmed row is past the window
  check("ttl 0 -> any aged unconfirmed swept", presignSweep([realOld], NOW, 0)[0] === "old");

  // empty input -> empty result
  check("empty rows -> empty result", presignSweep([], NOW, TTL).length === 0);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(
  failures === 0 ? "\nMEDIA-MAINTENANCE: all checks passed" : `\nMEDIA-MAINTENANCE: ${failures} failures`,
);
if (failures > 0) process.exitCode = 1;
