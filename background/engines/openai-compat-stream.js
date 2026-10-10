import { t, tDetail } from "../i18n.js";
import { isRequestCancelled } from "../fetch-utils.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";

export const DEFAULT_STREAM_FIRST_BYTE_TIMEOUT_MS = 15000;
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 25000;

/**
 * Which timeout should be armed for a stream lifecycle event.
 * `null` means clear the timer (stream finished or stopped).
 *
 * @param {"start"|"headers"|"chunk"|"done"} event
 * @returns {"firstByte"|"idle"|null}
 */
export function nextStreamTimerPhase(event) {
    if (event === "start") {
        return "firstByte";
    }
    if (event === "headers" || event === "chunk") {
        return "idle";
    }
    return null;
}

/**
 * Decide whether an aborted/failed stream should stay silent or emit TRANSLATE_ERROR.
 * User cancel and disconnect stay silent. Timeouts are errors so the auto chain can fall back.
 *
 * @param {{ timedOut?: boolean, timeoutPhase?: string, cancelled?: boolean, connected?: boolean, errorName?: string }} input
 * @returns {{ action: "silent"|"error", errorKey: string }}
 */
export function classifyStreamFailure({
    timedOut = false,
    timeoutPhase = "firstByte",
    cancelled = false,
    connected = true,
    errorName = "",
} = {}) {
    if (cancelled || connected === false) {
        return { action: "silent", errorKey: "" };
    }
    if (timedOut) {
        return {
            action: "error",
            errorKey:
                timeoutPhase === "idle"
                    ? "translate.stream.idleTimeout"
                    : "translate.stream.firstByteTimeout",
        };
    }
    if (errorName === "AbortError") {
        return { action: "silent", errorKey: "" };
    }
    return { action: "error", errorKey: "" };
}

function createAbortError() {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    return error;
}

function withSignal(promise, signal) {
    if (!signal) {
        return promise;
    }
    if (signal.aborted) {
        return Promise.reject(createAbortError());
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
            if (settled) {
                return;
            }
            settled = true;
            signal.removeEventListener("abort", onAbort);
            fn(value);
        };
        const onAbort = () => finish(reject, createAbortError());
        signal.addEventListener("abort", onAbort, { once: true });
        Promise.resolve(promise).then(
            (value) => finish(resolve, value),
            (err) => finish(reject, err),
        );
    });
}

function resolveTimeoutMs(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    const ms = Number(value);
    return Number.isFinite(ms) ? ms : fallback;
}

export function parseSseJsonLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed || !trimmed.startsWith("data:")) {
        return null;
    }

    const payload = trimmed.substring(5).trim();
    if (!payload || payload === "[DONE]") {
        return null;
    }

    try {
        const parsed = JSON.parse(payload);
        if (parsed?.error) {
            throw new Error(parsed.error.message || JSON.stringify(parsed.error));
        }
        if (parsed?.code && parsed?.message) {
            throw new Error(`${parsed.code}: ${parsed.message}`);
        }
        return parsed;
    } catch (err) {
        if (err instanceof SyntaxError) {
            return null;
        }
        throw err;
    }
}

export function extractChoiceDelta(payload) {
    return payload?.choices?.[0]?.delta || null;
}

/**
 * Generic streaming pump shared by all chat engines.
 *
 * It owns the boilerplate that used to be duplicated across every engine:
 * AbortController registration, fetch error handling, the read/decode/split
 * loop, posting TRANSLATE_THOUGHT/CHUNK/DONE, and controller cleanup.
 *
 * @param {object} options
 * @param {string} options.requestId
 * @param {object} options.port
 * @param {object} options.state
 * @param {string} [options.errorPrefix] engine label used in error messages
 * @param {number} [options.firstByteTimeoutMs] time from fetch start until response headers. Default 15000.
 * @param {number} [options.idleTimeoutMs] max quiet time between body chunks. Default 25000.
 * @param {(signal: AbortSignal) => Promise<{ response?: Response, error?: string }>} options.requestStream
 *        Performs the fetch (and any retry logic). Return `{ response }` with a
 *        ready-to-stream Response, or `{ error }` with a fully-formed message.
 * @param {(line: string) => (Delta | Delta[] | null)} options.parseLine
 *        Maps one raw line to one or more deltas. Delta = { content?, thought?, done? }.
 */
export async function streamChatToPort(options) {
    const {
        requestId,
        port,
        state,
        errorPrefix = "",
        requestStream,
        parseLine,
    } = options || {};
    const firstByteTimeoutMs = resolveTimeoutMs(
        options?.firstByteTimeoutMs,
        DEFAULT_STREAM_FIRST_BYTE_TIMEOUT_MS,
    );
    const idleTimeoutMs = resolveTimeoutMs(
        options?.idleTimeoutMs,
        DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    );
    const prefix = errorPrefix || t("translate.stream.defaultPrefix");

    const controller = new AbortController();
    let timer = null;
    let timedOut = false;
    let timeoutPhase = "firstByte";

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const armTimer = (event) => {
        const phase = nextStreamTimerPhase(event);
        clearTimer();
        if (!phase) {
            return;
        }
        timeoutPhase = phase;
        const ms = phase === "idle" ? idleTimeoutMs : firstByteTimeoutMs;
        if (!Number.isFinite(ms) || ms <= 0) {
            return;
        }
        timer = setTimeout(() => {
            timedOut = true;
            timeoutPhase = phase;
            if (!controller.signal.aborted) {
                controller.abort();
            }
        }, ms);
    };

    if (state?.controllers) {
        state.controllers.set(requestId, controller);
    }

    try {
        if (isRequestCancelled(state, requestId) || state?.connected === false) {
            return;
        }

        armTimer("start");
        const result = await withSignal(
            Promise.resolve().then(() => requestStream(controller.signal)),
            controller.signal,
        );

        if (result && result.error) {
            postTranslateError(port, state, requestId, result.error);
            return;
        }

        const res = result && result.response;
        if (!res) {
            postTranslateError(
                port,
                state,
                requestId,
                t("translate.stream.requestFailed", { prefix }),
            );
            return;
        }

        // Response headers arrived: stop the first-byte timer and watch for a stalled body.
        armTimer("headers");

        if (!res.ok) {
            const textErr = await withSignal(res.text(), controller.signal);
            postTranslateError(
                port,
                state,
                requestId,
                tDetail("translate.stream.requestFailedDetail", {
                    prefix,
                    error: textErr || `${res.status} ${res.statusText}`,
                }),
            );
            return;
        }

        if (!res.body) {
            postTranslateError(
                port,
                state,
                requestId,
                t("translate.stream.noReadableBody"),
            );
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let carry = "";

        while (!done) {
            const { value, done: streamDone } = await withSignal(
                reader.read(),
                controller.signal,
            );
            done = streamDone;
            if (value && value.byteLength) {
                armTimer("chunk");
            }
            if (!value) {
                continue;
            }

            carry += decoder.decode(value, { stream: true });
            const lines = carry.split("\n");
            carry = lines.pop() || "";

            for (const line of lines) {
                const parsed = parseLine(line);
                if (!parsed) {
                    continue;
                }

                const deltas = Array.isArray(parsed) ? parsed : [parsed];
                for (const delta of deltas) {
                    if (!delta) {
                        continue;
                    }

                    if (delta.thought) {
                        const ok = safePostMessage(port, state, {
                            type: "TRANSLATE_THOUGHT",
                            requestId,
                            content: delta.thought,
                        });
                        if (!ok) {
                            return;
                        }
                    }

                    if (delta.content) {
                        const ok = safePostMessage(port, state, {
                            type: "TRANSLATE_CHUNK",
                            requestId,
                            content: delta.content,
                        });
                        if (!ok) {
                            return;
                        }
                    }

                    if (delta.done) {
                        done = true;
                        break;
                    }
                }

                if (done) {
                    break;
                }
            }
        }

        // 处理流结束后 carry 中可能残留的最后一行（无尾部换行的 SSE data 行）
        if (carry.trim()) {
            const parsed = parseLine(carry);
            if (parsed) {
                const deltas = Array.isArray(parsed) ? parsed : [parsed];
                for (const delta of deltas) {
                    if (!delta) {
                        continue;
                    }
                    if (delta.thought) {
                        safePostMessage(port, state, {
                            type: "TRANSLATE_THOUGHT",
                            requestId,
                            content: delta.thought,
                        });
                    }
                    if (delta.content) {
                        safePostMessage(port, state, {
                            type: "TRANSLATE_CHUNK",
                            requestId,
                            content: delta.content,
                        });
                    }
                }
            }
        }

        armTimer("done");
        safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
    } catch (err) {
        const decision = classifyStreamFailure({
            timedOut,
            timeoutPhase,
            cancelled: isRequestCancelled(state, requestId),
            connected: state?.connected !== false,
            errorName: err && err.name ? err.name : "",
        });
        if (decision.action === "error" && state?.connected) {
            const message = decision.errorKey
                ? t(decision.errorKey)
                : err && err.message
                  ? err.message
                  : String(err);
            postTranslateError(port, state, requestId, message);
        }
    } finally {
        clearTimer();
        if (state?.controllers?.get(requestId) === controller) {
            state.controllers.delete(requestId);
        }
    }
}

export async function streamOpenAICompatRequest(options) {
    const {
        requestId,
        port,
        state,
        url,
        headers,
        body,
        errorPrefix,
        includeThoughts = true,
        extractDelta = extractChoiceDelta,
        firstByteTimeoutMs,
        idleTimeoutMs,
    } = options || {};

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix,
        firstByteTimeoutMs,
        idleTimeoutMs,
        requestStream: async (signal) => ({
            response: await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal,
            }),
        }),
        parseLine: (line) => {
            const payload = parseSseJsonLine(line);
            if (!payload) {
                return null;
            }

            const delta = extractDelta(payload);
            if (!delta) {
                return null;
            }

            const out = {};
            if (includeThoughts && delta.reasoning_content) {
                out.thought = delta.reasoning_content;
            }
            if (delta.content) {
                out.content = delta.content;
            }
            return out;
        },
    });
}
