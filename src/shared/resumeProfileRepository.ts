let mutationQueue: Promise<void> = Promise.resolve();

/** Global FIFO for every resumeProfileLibrary read-modify-write transaction. */
export function withResumeProfileMutation<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(fn, fn);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}
