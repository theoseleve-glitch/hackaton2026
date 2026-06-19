import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
// SDK 56 keeps the classic file API under /legacy (the bare import is the new File API)
import { cacheDirectory, EncodingType, writeAsStringAsync } from "expo-file-system/legacy";
import type { SharedPayload } from "../../../packages/social/src";
import { payloadToLink, serializePayload } from "../../../packages/social/src";

/**
 * Sharing IO (offline slice): wraps the OS share sheet, clipboard, file export
 * and PNG export around a packages/social SharedPayload. The deep link is the
 * growth primitive (D10) — it upgrades to a hosted racelabrc.app/s/<id> URL once
 * the backend lands; nothing here touches the advice path (D18).
 */

function safeName(name: string): string {
  return (name || "setup").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "setup";
}

/** OS share sheet with the import deep link as text (WhatsApp / Messages / …). */
export async function shareLink(p: SharedPayload): Promise<void> {
  const link = payloadToLink(p);
  await Share.share({
    message: `My ${p.car.brand} ${p.car.model} setup "${p.setup.name}" on RaceLab 🏁\n${link}`,
  });
}

export async function copyLink(p: SharedPayload): Promise<void> {
  await Clipboard.setStringAsync(payloadToLink(p));
}

/** Export the payload as a portable .griplab file via the OS share sheet. */
export async function shareFile(p: SharedPayload): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = `${cacheDirectory}${safeName(p.setup.name)}.griplab`;
  await writeAsStringAsync(uri, serializePayload(p), { encoding: EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Share setup file" });
  return true;
}

/** Share a captured PNG (base64, no data: prefix) via the OS share sheet. */
export async function sharePng(base64: string, name: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = `${cacheDirectory}${safeName(name)}.png`;
  await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share setup card" });
  return true;
}
