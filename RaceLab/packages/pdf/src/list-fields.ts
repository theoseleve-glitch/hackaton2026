import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from "pdf-lib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pdfPath =
  process.argv[2] ??
  join(ROOT, "chassis", "1-8-nitro-buggy", "kyosho", "inferno_MP11", "MP11_EditableSetupSheet.pdf");

const doc = await PDFDocument.load(readFileSync(pdfPath));
const form = doc.getForm();

for (const field of form.getFields()) {
  const name = field.getName();
  let kind = "other";
  let extra = "";
  if (field instanceof PDFTextField) kind = "text";
  else if (field instanceof PDFCheckBox) kind = "checkbox";
  else if (field instanceof PDFRadioGroup) {
    kind = "radio";
    extra = ` options=[${field.getOptions().join("|")}]`;
  } else if (field instanceof PDFDropdown) {
    kind = "dropdown";
    extra = ` options=[${field.getOptions().join("|")}]`;
  }
  console.log(`${kind}\t${name}${extra}`);
}
