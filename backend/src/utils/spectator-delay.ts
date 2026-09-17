/**
 * Returns the public release timestamp for one event in a game stream.
 * Every event receives the same offset from its own server receive time; the
 * previous timestamp is only used to preserve ordering for simultaneous
 * events, never to add the full delay again.
 */
export function calculateDelayedReleaseAt(
    receivedAtMs: number,
    delayMs: number,
    previousReleaseAtMs = 0,
): number {
    return Math.max(receivedAtMs + delayMs, previousReleaseAtMs + 1);
}
