import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFArray, PDFDocument, StandardFonts } from 'pdf-lib';
import { copyName, transformPdf, validateCopyPath, validateCrop, validateImageSize } from '../src/lib/attachments';

async function fixturePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([300, 400]).drawText('Original text', { x: 20, y: 350, font, size: 12 });
  pdf.addPage([300, 400]);
  return new Uint8Array(await pdf.save());
}

test('PDF transformation preserves input and writes real pages, rotation, text and highlight', async () => {
  const original = await fixturePdf();
  const sourceSnapshot = original.slice();
  const output = await transformPdf(original, [
    { type: 'rotate', page: 0 },
    { type: 'text', page: 0, x: 40, y: 280, text: 'New note', size: 16 },
    { type: 'highlight', page: 0, x: 35, y: 270, width: 120, height: 22 },
    { type: 'delete', page: 1 },
  ]);
  assert.deepEqual(original, sourceSnapshot);
  const pdf = await PDFDocument.load(output);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getPage(0).getRotation().angle, 90);
  const content = pdf.getPage(0).node.Contents();
  assert.ok(content instanceof PDFArray);
  assert.equal(content.size(), 4, 'original stream plus drawing streams for both added annotations');
  assert.ok(output.length > original.length / 2, 'a real PDF was saved');
});

test('last PDF page cannot be deleted', async () => {
  const first = await transformPdf(await fixturePdf(), [{ type: 'delete', page: 1 }]);
  await assert.rejects(transformPdf(first, [{ type: 'delete', page: 0 }]), /at least one page/);
});

test('copy paths stay relative, use the selected format, and preserve original name', () => {
  assert.equal(copyName('folder/scan.pdf', 'annotated', 'pdf'), 'folder/scan annotated.pdf');
  assert.equal(validateCopyPath('folder/scan annotated.pdf', 'pdf'), 'folder/scan annotated.pdf');
  assert.throws(() => validateCopyPath('../scan.pdf', 'pdf'), /relative vault path/);
  assert.throws(() => validateCopyPath('scan.jpg', 'png'), /end in .png/);
});

test('image crop and output bounds reject invalid or oversized geometry', () => {
  assert.doesNotThrow(() => validateCrop({ x: 20, y: 5, width: 80, height: 45 }, 100, 50));
  assert.throws(() => validateCrop({ x: 20, y: 5, width: 81, height: 45 }, 100, 50), /inside the source/);
  assert.throws(() => validateImageSize(8192, 8192), /pixels total/);
  assert.throws(() => validateImageSize(Number.NaN, 40), /Image size/);
});
