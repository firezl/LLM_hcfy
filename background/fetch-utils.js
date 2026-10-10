import { tDetail } from "./i18n.js";
import { postTranslateError } from "./port-utils.js";

export const DEFAULT_FETCH_TIMEOUT_MS = 20000;

export function isAbortError(err) {
    return Boolean(err && err.name === "AbortError");
}

export function isFetchTimeoutError(err) {
    return Boolean(
        err &&
            (err.name === "TimeoutError" ||
                err.code === "FETCH_TIMEOUT" ||
                err.timedOut === true),
    );
}

export function isRequestCancelled(state, requestId) {
    if (!state || requestId === undefined || requestId === null || requestId === "") {
        return false;
    }
    return state.cancelled instanceof Set && state.cancelled.has(requestId);
}

/**
 * User cancel and port disconnect abort the request without a translate error.
 * Timeout errors use TimeoutError / FETCH_TIMEOUT and must still surface.
 */
export function isUserAbortError(err) {
    return isAbortError(err) && !isFetchTimeoutError(err);
}

export function createFetchTimeoutError(message) {
    const error = new Error(message || tDetail("translate.fetch.timeout"));
    error.name = "TimeoutError";
    error.code = "FETCH_TIMEOUT";
    error.timedOut = true;
    return error;
}

function createAbortError() {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    return error;
}

export function reportTranslateFailure(port, state, requestId, err) {
    if (!state?.connected || isUserAbortError(err)) {
        return;
    }
    const message = err && err.message ? err.message : String(err);
    postTranslateError(port, state, requestId, message);
}

/**
 * Fetch with a timeout and optional cancel registration.
 * Caller `init.signal` is merged into the internal AbortController.
 * On timeout, throws an error with name TimeoutError and code FETCH_TIMEOUT.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ timeoutMs?: number, requestId?: string, state?: object }} [options]
 */
export async function fetchWithTimeout(url, init, options) {
    const timeoutMs = Object.prototype.hasOwnProperty.call(options || {}, "timeoutMs")
        ? Number(options.timeoutMs)
        : DEFAULT_FETCH_TIMEOUT_MS;
    const requestId = options?.requestId;
    const state = options?.state;
    const controller = new AbortController();
    let timedOut = false;
    let timer = null;

    if (isRequestCancelled(state, requestId) || state?.connected === false) {
        throw createAbortError();
    }

    if (requestId && state?.controllers) {
        state.controllers.set(requestId, controller);
    }

    const callerSignal = init?.signal;
    const abortFromCaller = () => {
        if (!controller.signal.aborted) {
            controller.abort();
        }
    };

    if (callerSignal) {
        if (callerSignal.aborted) {
            abortFromCaller();
        } else {
            callerSignal.addEventListener("abort", abortFromCaller, { once: true });
        }
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
            timedOut = true;
            if (!controller.signal.aborted) {
                controller.abort();
            }
        }, timeoutMs);
    }

    try {
        if (controller.signal.aborted && !timedOut) {
            throw createAbortError();
        }
        return await fetch(url, {
            ...(init || {}),
            signal: controller.signal,
        });
    } catch (err) {
        if (
            timedOut &&
            !isRequestCancelled(state, requestId) &&
            state?.connected !== false
        ) {
            throw createFetchTimeoutError();
        }
        throw err;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
        if (callerSignal) {
            callerSignal.removeEventListener("abort", abortFromCaller);
        }
        if (requestId && state?.controllers?.get(requestId) === controller) {
            state.controllers.delete(requestId);
        }
    }
}
