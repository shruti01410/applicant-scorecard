const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = ['.pdf', '.doc', '.docx'];

function extOf(file) {
  const n = (file && file.name) || '';
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i).toLowerCase() : '';
}

export function validateResumeFileClient(file) {
  const ext = extOf(file);
  if (!ALLOWED.includes(ext)) {
    return { ok: false, message: 'This file type isn\'t supported. Please upload a CV or resume in PDF, DOC, or DOCX format.' };
  }
  if (file.size > MAX_SIZE) {
    return { ok: false, message: 'File is larger than the 10 MB limit. Please compress or choose a smaller file.' };
  }
  return { ok: true };
}
