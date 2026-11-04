import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeFloatingBox } from "../libs/bubble-position.mjs";
import "../content/modules/ui.js";

describe("placeFloatingBox", () => {
    it("places the box at the anchor bottom-right when it fits", () => {
        assert.deepEqual(
            placeFloatingBox(
                { x: 16, y: 24, width: 10, height: 12 },
                80,
                30,
                640,
                480,
            ),
            { left: 24, top: 44 },
        );
    });

    it("clamps the right edge and flips above when the bottom-right overflows", () => {
        assert.deepEqual(
            placeFloatingBox(
                { x: 760, y: 540, width: 10, height: 20 },
                200,
                100,
                800,
                600,
            ),
            { left: 592, top: 432 },
        );
    });

    it("flips above the anchor when there is not enough room below", () => {
        assert.deepEqual(
            placeFloatingBox(
                { x: 40, y: 250, width: 80, height: 16 },
                120,
                80,
                400,
                300,
            ),
            { left: 48, top: 162 },
        );
    });

    it("clamps to the left margin when the anchor is off the left edge", () => {
        assert.deepEqual(
            placeFloatingBox(
                { x: -30, y: 40, width: 20, height: 10 },
                100,
                40,
                500,
                400,
            ),
            { left: 8, top: 58 },
        );
    });

    it("sticks to the top-left margin when the box is larger than the viewport", () => {
        assert.deepEqual(
            placeFloatingBox(
                { x: 5, y: 5, width: 0, height: 0 },
                100,
                80,
                40,
                30,
            ),
            { left: 8, top: 8 },
        );
    });
});

it("keeps the bubble at the trigger point when the selection extends offscreen", (t) => {
    let onResize;
    globalThis.window = {
        innerWidth: 800,
        innerHeight: 600,
        getSelection: () => ({
            rangeCount: 1,
            getRangeAt: () => ({
                getBoundingClientRect: () => ({
                    top: 100, bottom: 900, width: 300, height: 800,
                }),
            }),
        }),
    };
    globalThis.ResizeObserver = class {
        constructor(callback) {
            onResize = callback;
        }
        observe() {}
    };
    t.after(() => {
        delete globalThis.window;
        delete globalThis.ResizeObserver;
    });

    const app = {};
    globalThis.JYT_CS_UI.install(app);
    let height = 60;
    const bubble = {
        style: {},
        dataset: {},
        getBoundingClientRect: () => ({ width: 200, height }),
    };

    app.positionBubble(bubble, 300, 240);
    assert.equal(bubble.style.left, "308px");
    assert.equal(bubble.style.top, "248px");

    height = 140;
    onResize();
    assert.equal(bubble.style.top, "248px");
});
