import { mergeCustomPayload } from "./custom-payload.js";
import { parseSseJsonLine, streamChatToPort } from "./openai-compat-stream.js";

export function isResponsesUrl(url) {
    return /\/responses$/i.test(new URL(url).pathname);
}

export function streamResponsesRequest({
    requestId,
    port,
    state,
    url,
    headers,
    model,
    messages,
    reasoning,
    maxOutputTokens,
    showThoughts,
    customPayload,
    errorPrefix,
}) {
    const { body } = mergeCustomPayload({
        model,
        input: messages,
        stream: true,
        store: false,
        ...(reasoning && { reasoning }),
        ...(maxOutputTokens > 0 && { max_output_tokens: Math.floor(maxOutputTokens) }),
    }, customPayload);

    return streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix,
        requireDone: true,
        requestStream: async (signal) => ({
            response: await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal,
            }),
        }),
        parseLine(line) {
            const event = parseSseJsonLine(line);
            switch (event?.type) {
                case "response.output_text.delta":
                    return { content: event.delta };
                case "response.reasoning_summary_text.delta":
                case "response.reasoning_text.delta":
                    return showThoughts ? { thought: event.delta } : null;
                case "response.completed":
                    return { done: true };
                case "response.failed":
                case "response.incomplete":
                    throw new Error(
                        event.response?.error?.message ||
                        `${errorPrefix}: ${event.type} (${event.response?.incomplete_details?.reason || "unknown"})`,
                    );
                default:
                    return null;
            }
        },
    });
}
