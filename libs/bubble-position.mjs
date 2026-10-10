/**
 * Place a floating box inside the viewport, near an anchor rectangle.
 * Coordinates are viewport pixels. The default spot is the anchor's
 * bottom-right: (anchor.x + gap, anchor.y + anchor.height + gap).
 * `anchor.x` is the horizontal anchor (selection right edge), not the
 * left plus width.
 * @param {{ x: number, y: number, width?: number, height?: number }} anchor
 * @param {number} boxWidth
 * @param {number} boxHeight
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {number} [margin=8]
 * @param {number} [gap=8]
 * @returns {{ left: number, top: number }}
 */
export function placeFloatingBox(
    anchor,
    boxWidth,
    boxHeight,
    viewportWidth,
    viewportHeight,
    margin = 8,
    gap = 8,
) {
    const anchorX = Number(anchor?.x) || 0;
    const anchorY = Number(anchor?.y) || 0;
    const anchorHeight = Math.max(0, Number(anchor?.height) || 0);
    const width = Math.max(0, Number(boxWidth) || 0);
    const height = Math.max(0, Number(boxHeight) || 0);
    const viewW = Number(viewportWidth) || 0;
    const viewH = Number(viewportHeight) || 0;
    const safeMargin = Number.isFinite(margin) ? margin : 8;
    const safeGap = Number.isFinite(gap) ? gap : 8;

    let left = anchorX + safeGap;
    let top = anchorY + anchorHeight + safeGap;
    if (top + height > viewH - safeMargin) {
        top = anchorY - safeGap - height;
    }

    return {
        left: clampAxis(left, width, viewW, safeMargin),
        top: clampAxis(top, height, viewH, safeMargin),
    };
}

function clampAxis(value, size, viewport, margin) {
    const min = margin;
    const max = viewport - margin - size;
    if (!(max >= min)) {
        return margin;
    }
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
