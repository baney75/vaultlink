import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8192;
export const MAX_IMAGE_PIXELS = 32_000_000;

export type Crop = { x: number; y: number; width: number; height: number };

export function copyName(path: string, suffix: string, extension: string): string {
  const slash = path.lastIndexOf('/');
  const folder = slash < 0 ? '' : path.slice(0, slash + 1);
  const filename = path.slice(slash + 1);
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return `${folder}${stem} ${suffix}.${extension}`;
}

export function validateCopyPath(path: string, extension: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.split('/').some(p => p === '' || p === '.' || p === '..')) {
    throw new Error('Enter a relative vault path without empty or parent folders.');
  }
  if (!trimmed.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
    throw new Error(`The copy must end in .${extension}.`);
  }
  return trimmed;
}

export function validateImageSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`Image size must be positive, at most ${MAX_IMAGE_SIDE} px per side and ${MAX_IMAGE_PIXELS.toLocaleString()} pixels total.`);
  }
}

export function validateCrop(crop: Crop, width: number, height: number): void {
  validateImageSize(width, height);
  if ([crop.x, crop.y, crop.width, crop.height].some(v => !Number.isInteger(v)) || crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 || crop.x + crop.width > width || crop.y + crop.height > height) {
    throw new Error('Crop must be whole pixels inside the source image.');
  }
}

export type PdfChange =
  | { type: 'rotate'; page: number }
  | { type: 'delete'; page: number }
  | { type: 'text'; page: number; x: number; y: number; text: string; size: number }
  | { type: 'highlight'; page: number; x: number; y: number; width: number; height: number };

/** PDF coordinates have their origin at the bottom left. Changes are applied in order. */
export async function transformPdf(source: Uint8Array, changes: PdfChange[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source.slice(), { updateMetadata: false });
  if (pdf.getPageCount() < 1) throw new Error('This PDF has no pages.');
  let font: Awaited<ReturnType<PDFDocument['embedFont']>> | undefined;
  for (const change of changes) {
    if (!Number.isInteger(change.page) || change.page < 0 || change.page >= pdf.getPageCount()) throw new Error('Page is out of range.');
    if (change.type === 'delete') {
      if (pdf.getPageCount() === 1) throw new Error('A PDF must keep at least one page.');
      pdf.removePage(change.page);
      continue;
    }
    const page = pdf.getPage(change.page);
    if (change.type === 'rotate') {
      page.setRotation(degrees((page.getRotation().angle + 90) % 360));
    } else if (change.type === 'text') {
      if (!change.text.trim() || change.text.length > 500 || !Number.isFinite(change.size) || change.size < 6 || change.size > 72) throw new Error('Enter up to 500 characters at a text size from 6 to 72.');
      if (!Number.isFinite(change.x) || !Number.isFinite(change.y)) throw new Error('Invalid text position.');
      font ??= await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(change.text, { x: change.x, y: change.y, size: change.size, font, color: rgb(0.12, 0.22, 0.42), maxWidth: Math.max(20, page.getWidth() - change.x - 8) });
    } else {
      if (![change.x, change.y, change.width, change.height].every(Number.isFinite) || change.width <= 0 || change.height <= 0) throw new Error('Invalid highlight bounds.');
      page.drawRectangle({ x: change.x, y: change.y, width: change.width, height: change.height, color: rgb(1, 0.84, 0.12), opacity: 0.38, borderWidth: 0 });
    }
  }
  return pdf.save();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
