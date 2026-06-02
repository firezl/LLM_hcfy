import { postTranslateError, safePostMessage } from "../port-utils.js";

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
        return JSON.parse(payload);
    } catch (err) {
        return null;
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
        errorPrefix = "请求",
        requestStream,
        parseLine,
    } = options || {};

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const result = await requestStream(controller.signal);

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
                `${errorPrefix} 请求失败`,
            );
            return;
        }

        if (!res.ok) {
            const textErr = await res.text();
            postTranslateError(
                port,
                state,
                requestId,
                `${errorPrefix} 请求失败: ${textErr || `${res.status} ${res.statusText}`}`,
            );
            return;
        }

        if (!res.body) {
            postTranslateError(port, state, requestId, "响应不包含可读流");
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let carry = "";

        while (!done) {
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
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

        safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
    } catch (err) {
        const aborted = err && err.name === "AbortError";
        if (!aborted && state.connected) {
            postTranslateError(
                port,
                state,
                requestId,
                err && err.message ? err.message : String(err),
            );
        }
    } finally {
        state.controllers.delete(requestId);
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
    } = options || {};

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix,
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
