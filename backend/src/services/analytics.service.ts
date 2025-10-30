export async function trackEvent(event: string, payload: Record<string, any>) {
  try {
    const url = process.env.USAGE_ANALYTICS_WEBHOOK_URL;
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload, ts: new Date().toISOString(), env: process.env.APP_ENV || process.env.NODE_ENV }),
    });
  } catch {
    // best effort only
  }
}


