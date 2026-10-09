import { needsSecondRead } from './barcode';

/**
 * How long a code must be out of view before it counts again. The window
 * restarts on every sighting, so an item held in front of the camera is one
 * scan however long it stays there; taking it away and presenting it again
 * (or the next identical packet) is a new one.
 */
export const SCAN_COOLDOWN_MS = 1200;

/** Two reads of a non-self-checking code must be this close to confirm it. */
export const CONFIRM_WINDOW_MS = 700;

export interface ScanGate {
  /** True when this detection is a new scan to act on. */
  offer: (code: string, type: string | undefined, busy: boolean) => boolean;
  /** Forget everything, e.g. when the scanner regains focus. */
  reset: () => void;
}

/**
 * Turns the camera's stream of detections into deliberate scans.
 *
 * `onBarcodeScanned` fires on every frame that contains a code — many times a
 * second, and sometimes with a misread from a blurred frame:
 *
 *  - A code acted on is remembered with the time it was last seen; while it
 *    keeps appearing, it keeps being ignored.
 *  - A code whose format carries no check digit (Code 39, Codabar…) is only
 *    accepted after two matching reads, which filters single-frame misreads.
 *  - Nothing is accepted while `busy`, and nothing new is remembered either, so
 *    a second product presented during a lookup is picked up as soon as the
 *    lookup ends instead of being lost.
 *
 * Plain closure rather than a hook so the timing rules can be tested with a
 * fake clock.
 */
export const createScanGate = (clock: () => number = Date.now): ScanGate => {
  const lastSeen = new Map<string, number>();
  let candidate: { code: string; at: number } | null = null;

  return {
    offer: (code, type, busy) => {
      const now = clock();

      const previous = lastSeen.get(code);
      if (previous !== undefined && now - previous < SCAN_COOLDOWN_MS) {
        lastSeen.set(code, now); // still in view: extend, never re-accept
        return false;
      }

      if (busy) return false;

      if (needsSecondRead(type)) {
        if (!candidate || candidate.code !== code || now - candidate.at > CONFIRM_WINDOW_MS) {
          candidate = { code, at: now };
          return false;
        }
      }

      candidate = null;
      lastSeen.set(code, now);

      // Keep the map to the codes that could still be in view.
      if (lastSeen.size > 32) {
        for (const [known, at] of lastSeen) if (now - at > SCAN_COOLDOWN_MS) lastSeen.delete(known);
      }

      return true;
    },

    reset: () => {
      lastSeen.clear();
      candidate = null;
    },
  };
};
