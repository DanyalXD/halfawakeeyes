// Coalesce change notifications while a report is loading; never apply a stopped subscription's response.
export function createLiveAnalytics({subscribe, fetchReport, onReport, onError, onLoading}) {
  let current = null;
  function refresh() {
    const session = current;
    if (!session) return Promise.resolve();
    session.pending = true;
    if (session.running) return session.running;
    session.running = (async () => {
      onLoading(true);
      try {
        while (current === session && session.pending) {
          session.pending = false;
          try {
            const report = await fetchReport();
            if (current === session) onReport(report);
          } catch (error) {
            if (current === session) onError(error);
          }
        }
      } finally {
        session.running = null;
        if (current === session) onLoading(false);
      }
    })();
    return session.running;
  }
  function stop() {
    const session = current;
    current = null;
    session?.unsubscribe?.();
    onLoading(false);
  }
  function start() {
    if (!current) current = {pending:false, running:null, unsubscribe:null};
    const session = current;
    if (!session.unsubscribe) {
      session.unsubscribe = subscribe(() => { if (current === session) void refresh(); }, error => {
        if (current !== session) return;
        session.unsubscribe?.();
        session.unsubscribe = null;
        onError(error);
      });
    }
    return refresh();
  }
  return {start, refresh, stop};
}
