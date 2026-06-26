import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFCheckBox } from "pdf-lib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const doc = await PDFDocument.load(
  readFileSync(join(ROOT, "chassis", "1-8-nitro-buggy", "kyosho", "inferno_MP11", "MP11_EditableSetupSheet.pdf")),
);
console.log(`page size: ${doc.getPage(0).getWidth()} x ${doc.getPage(0).getHeight()}`);
for (const field of doc.getForm().getFields()) {
  if (!(field instanceof PDFCheckBox)) continue;
  const r = field.acroField.getWidgets()[0].getRectangle();
  console.log(`${field.getName()}\tx=${Math.round(r.x)}\ty=${Math.round(r.y)}`);
}
