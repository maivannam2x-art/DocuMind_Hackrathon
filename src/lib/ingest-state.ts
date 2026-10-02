export const TERMINAL_INGEST_ERRORS = new Set([
  "PDF_TOO_MANY_PAGES",
  "FILE_TOO_LARGE",
  "VISION_FILE_TOO_LARGE",
  "EMBEDDED_MEDIA_TOO_LARGE",
  "EMBEDDED_IMAGE_TOO_LARGE",
  "EXTRACTED_TEXT_TOO_LONG",
  "UNSUPPORTED_FILE_TYPE",
  "FILE_CONTENT_MISMATCH",
  "EMPTY_FILE",
]);
export function ingestBlocked(
  inputs: Array<{ metadata?: Record<string, unknown> | null }>,
) {
  return inputs.some((i) =>
    TERMINAL_INGEST_ERRORS.has(String(i.metadata?.errorCode ?? "")),
  );
}
