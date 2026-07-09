export type DeriveStatusTextArgs = {
  status: string;
  statusIsError: boolean;
  frameLabel: string | null;
};

// Errors take priority over any stale playback label: once a research run or
// replay load fails, the raw error message must stay visible even if a
// previously loaded replay (and its frame label) is still around.
export function deriveStatusText({ status, statusIsError, frameLabel }: DeriveStatusTextArgs): string {
  if (statusIsError) {
    return status;
  }
  if (frameLabel === null) {
    return status;
  }
  return frameLabel;
}
