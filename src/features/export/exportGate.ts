export function createExportGate() {
  let running = false;
  return {
    get isRunning() { return running; },
    async run(task: () => Promise<void>): Promise<boolean> {
      if (running) return false;
      running = true;
      try {
        await task();
        return true;
      } finally {
        running = false;
      }
    },
  };
}
