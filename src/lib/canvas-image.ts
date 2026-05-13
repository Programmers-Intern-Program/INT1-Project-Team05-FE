/** 제출 API용 JPEG 품질 (0~1). 용량·선명도 균형 */
const DEFAULT_JPEG_QUALITY = 0.82;

/** 제출 시 한 변 최대 픽셀 (비율 유지 축소). 그리기 캔버스는 더 크게 두고 전송만 줄임 */
const DEFAULT_MAX_EDGE = 512;

export type CompressCanvasOptions = {
  quality?: number;
  /** 비율 유지 축소. `null`이면 원본 크기 그대로 JPEG만 */
  maxEdge?: number | null;
};

function resolveSourceCanvas(
  canvas: HTMLCanvasElement,
  maxEdge: number | null,
): { canvas: HTMLCanvasElement; dispose: () => void } {
  if (
    maxEdge == null ||
    !Number.isFinite(maxEdge) ||
    maxEdge <= 0 ||
    (canvas.width <= maxEdge && canvas.height <= maxEdge)
  ) {
    return { canvas, dispose: () => {} };
  }

  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.min(maxEdge / w, maxEdge / h);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const temp = document.createElement("canvas");
  temp.width = tw;
  temp.height = th;
  const ctx = temp.getContext("2d");
  if (!ctx) {
    return { canvas, dispose: () => {} };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, tw, th);
  return {
    canvas: temp,
    dispose: () => {
      temp.width = 0;
      temp.height = 0;
    },
  };
}

/**
 * 제출용: (선택) 최대 변 기준 리사이즈 후 JPEG data URL.
 * 브라우저/캔버스 이슈 시 PNG로 폴백한다.
 * (히스토리/undo용 스냅샷에는 쓰지 말 것 — 누적 손실 방지)
 */
export function canvasToCompressedDataUrl(
  canvas: HTMLCanvasElement,
  qualityOrOptions?: number | CompressCanvasOptions,
): string {
  let quality = DEFAULT_JPEG_QUALITY;
  let maxEdge: number | null = DEFAULT_MAX_EDGE;

  if (typeof qualityOrOptions === "number") {
    quality = qualityOrOptions;
  } else if (qualityOrOptions != null) {
    if (qualityOrOptions.quality != null) quality = qualityOrOptions.quality;
    if (qualityOrOptions.maxEdge === null) maxEdge = null;
    else if (typeof qualityOrOptions.maxEdge === "number") {
      maxEdge = qualityOrOptions.maxEdge;
    }
  }

  const q =
    typeof quality === "number" && quality > 0 && quality <= 1
      ? quality
      : DEFAULT_JPEG_QUALITY;

  const { canvas: source, dispose } = resolveSourceCanvas(canvas, maxEdge);
  try {
    const out = source.toDataURL("image/jpeg", q);
    if (
      typeof out === "string" &&
      out.startsWith("data:image/jpeg") &&
      out.length > 64
    ) {
      return out;
    }
  } catch {
    /* noop */
  } finally {
    dispose();
  }
  return canvas.toDataURL("image/png");
}
