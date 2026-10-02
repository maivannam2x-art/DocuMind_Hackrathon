export class RequestFailure extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export async function waitForRetry(ms: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Paused", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function resumableLoop<T>(
  step: () => Promise<T>,
  done: (value: T) => boolean,
  onStep: (value: T) => void,
  signal: AbortSignal,
  maxSteps = 1200,
) {
  let errors = 0;
  for (let i = 0; i < maxSteps; i++) {
    signal.throwIfAborted();
    try {
      const value = await step();
      errors = 0;
      onStep(value);
      if (done(value)) return value;
      const delay = (value as { waitMs?: number }).waitMs;
      await waitForRetry(Math.min(15000, Math.max(300, delay ?? 300)), signal);
    } catch (error) {
      if (signal.aborted) throw new DOMException("Paused", "AbortError");
      if (
        !(error instanceof RequestFailure) ||
        ![429, 502, 503, 504].includes(error.status) ||
        errors >= 4
      )
        throw error;
      errors++;
      await waitForRetry(
        Math.min(60000, Math.max(error.retryAfter * 1000, 1000 * 2 ** errors)),
        signal,
      );
    }
  }
  throw new Error(
    "Đã đạt giới hạn lượt xử lý trong phiên này. Tiến độ đã lưu; bấm Tiếp tục để chạy phần còn lại.",
  );
}
