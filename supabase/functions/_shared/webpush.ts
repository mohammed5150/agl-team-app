// Shared by send-push and send-emergency: send one Web Push payload to a
// batch of subscriptions, dropping any that have expired. Pulled out once a
// second function (send-emergency) needed the exact same batch-send logic —
// see supabase/functions/_shared/http.ts for why a relative import, not an
// HTTP call between functions, is how this project shares Edge Function code.

import webpush from "npm:web-push@3.6.7";

export function configureVapid(subject: string, publicKey: string, privateKey: string) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send `payload` (already JSON.stringify'd) to every row in `subs`,
 * concurrently. A subscription whose endpoint has expired (404/410) is
 * deleted from `push_subscriptions`; any other failure is counted but the
 * subscription is left alone — it might recover.
 */
export async function sendToSubscriptions(
  sb: any, subs: PushSubscriptionRow[], payload: string,
): Promise<{ sent: number; failed: number; removed: number }> {
  let sent = 0, failed = 0;
  const removed: string[] = [];

  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        await sb.from("push_subscriptions").delete().eq("id", s.id);
        removed.push(s.id);
      } else {
        failed++;
        console.error("[webpush]", code, e?.body || e?.message);
      }
    }
  }));

  return { sent, failed, removed: removed.length };
}
