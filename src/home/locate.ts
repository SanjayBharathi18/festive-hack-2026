export type Located = { lat: number; lng: number };
export type LocateProblem = "denied" | "failed";
export type LocateError = Error & { code: LocateProblem };

export type PositionSource = {
  getCurrentPosition(
    found: (position: {
      coords: { latitude: number; longitude: number };
    }) => void,
    failed: (error: { code: number }) => void,
    options: {
      enableHighAccuracy: boolean;
      timeout: number;
      maximumAge: number;
    },
  ): void;
};

export const locateTimeoutMs = 10_000;
const permissionDenied = 1;

// The browser asks for the place only after the buyer presses Use my
// location. The place goes to the server rounded to about 100 m: the
// distances on the page are whole kilometres.
export function locate(
  source: PositionSource | undefined,
  { signal }: { signal?: AbortSignal } = {},
): Promise<Located> {
  return new Promise((resolve, reject) => {
    if (source === undefined) {
      reject(locateError("failed"));
      return;
    }
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
    source.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: roundTo(coords.latitude, 3),
          lng: roundTo(coords.longitude, 3),
        }),
      (error) =>
        reject(
          locateError(error.code === permissionDenied ? "denied" : "failed"),
        ),
      {
        enableHighAccuracy: false,
        timeout: locateTimeoutMs,
        maximumAge: 600_000,
      },
    );
  });
}

export function isLocateError(error: unknown): error is LocateError {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "denied" || error.code === "failed")
  );
}

function locateError(code: LocateProblem): LocateError {
  return Object.assign(new Error(`The location is ${code}.`), { code });
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
