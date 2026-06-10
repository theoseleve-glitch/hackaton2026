import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const doc = await PDFDocument.load(readFileSync(join(ROOT, "MP11_EditableSetupSheet.pdf")));
const form = doc.getForm();

for (const field of form.getFields()) {
  if (field instanceof PDFTextField) {
    try {
      field.setFontSize(5);
      field.setText(field.getName().replace("Text", "T"));
    } catch {
      /* some fields reject long text */
    }
  } else if (field instanceof PDFCheckBox) {
    field.check();
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out", "probe.pdf");
writeFileSync(out, await doc.save());
console.log(`wrote ${out}`);
