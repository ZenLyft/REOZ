'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string;
  url: string;
  read_at: string | null;
  created_at: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ToBase64Url(buf: ArrayBuffer | null | undefined): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function syncAppBadge(count: number) {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (c?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(count);
    } else if (typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge();
    }
  } catch {
    // Ignore unsupported badge contexts
  }
}

export function PwaPushControl() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [devicesCount, setDevicesCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isIosBrowserTab, setIsIosBrowserTab] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const syncedEndpointRef = useRef<string | null>(null);

  const loadFeed = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data?.success) {
        const list = Array.isArray(data.notifications) ? data.notifications : [];
        const unread = Number(data.unreadCount || 0);
        setNotifications(list);
        setUnreadCount(unread);
        setVapidPublicKey(data.vapidPublicKey || null);
        setDevicesCount(Number(data.subscribedDevicesCount || 0));
        syncAppBadge(unread);
        return data.vapidPublicKey || null;
      }
    } catch {
      // Ignore transient network failures
    }
    return null;
  }, []);

  // Poll every 10s & refresh on visibility/focus + Settings custom event
  useEffect(() => {
    loadFeed();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadFeed();
      }
    }, 10000);
    const onFocus = () => void loadFeed();
    const onPushUpdated = () => void loadFeed();
    window.addEventListener('focus', onFocus);
    window.addEventListener('reoz-notifications-updated', onPushUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('reoz-notifications-updated', onPushUpdated);
    };
  }, [loadFeed]);

  // Register Service Worker & silently keep existing push subscription synced with active VAPID key
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const navStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
    setIsIosBrowserTab(isIos && !navStandalone && !displayStandalone);

    if ('Notification' in window) {
      setPermissionState(Notification.permission);
    } else {
      setPermissionState('unsupported');
    }

    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then(async (reg) => {
        const existing = await reg.pushManager?.getSubscription();
        if (!existing) return;

        // Ensure server VAPID key matches existing subscription or re-subscribe cleanly
        const currentKey = uint8ToBase64Url(existing.options?.applicationServerKey);
        if (vapidPublicKey && currentKey && currentKey !== vapidPublicKey) {
          await existing.unsubscribe().catch(() => {});
          const fresh = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
          const json = fresh.toJSON();
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, silent: true }),
          });
          setIsSubscribed(true);
          syncedEndpointRef.current = json.endpoint || null;
          return;
        }

        setIsSubscribed(true);
        const json = existing.toJSON();
        if (json.endpoint && json.keys && syncedEndpointRef.current !== json.endpoint) {
          syncedEndpointRef.current = json.endpoint;
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, silent: true }),
          }).catch(() => {});
          void loadFeed();
        }
      })
      .catch(() => {});
  }, [vapidPublicKey, loadFeed]);

  async function enableIphonePush() {
    setBusy(true);
    setFeedback(null);
    try {
      if (isIosBrowserTab || !('Notification' in window)) {
        setFeedback('On iPhone: tap Safari Share (□↑) → Add to Home Screen, then open REOZ from your Home Screen and tap Enable Alerts.');
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setFeedback('Push notifications require Safari Home Screen PWA (iOS 16.4+) or modern Chrome/Edge/Safari.');
        return;
      }

      let activeVapidKey = vapidPublicKey;
      if (!activeVapidKey) {
        activeVapidKey = await loadFeed();
      }
      if (!activeVapidKey) {
        setFeedback('Could not load server push key. Please retry in a moment.');
        return;
      }

      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== 'granted') {
        setFeedback('Notification permission denied — allow Notifications in iPhone Settings → REOZ or browser site settings.');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        const existingKey = uint8ToBase64Url(existing.options?.applicationServerKey);
        if (existingKey && existingKey !== activeVapidKey) {
          await existing.unsubscribe().catch(() => {});
        }
      }

      const activeSub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(activeVapidKey),
        }));

      const subJson = activeSub.toJSON();
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        syncedEndpointRef.current = subJson.endpoint || null;
        setIsSubscribed(true);
        setFeedback(
          data.pushedCount > 0
            ? 'Paired & live lock-screen test alert pushed to this device!'
            : 'Device paired in database! Tap Send Test Alert to verify push delivery.'
        );
        await loadFeed();
      } else {
        setFeedback(data.error || 'Could not save push subscription.');
      }
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Unable to enable push notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    setUnreadCount(0);
    syncAppBadge(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
  }

  async function markOneRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => {
      const next = Math.max(0, prev - 1);
      syncAppBadge(next);
      return next;
    });
    void fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
  }

  async function sendTestPush() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setFeedback(data.error || 'Failed to send test notification.');
        return;
      }

      if (data.pushedCount > 0) {
        setFeedback(`Delivered lock-screen push to ${data.pushedCount} paired device(s)!`);
      } else if (Array.isArray(data.errors) && data.errors.length > 0) {
        setFeedback(`Saved to feed; push warning: ${data.errors[0]}`);
      } else if (data.totalDevices > 0) {
        setFeedback('Saved in Alerts feed. Re-tap Enable Push Alerts if OS token expired.');
      } else {
        setFeedback('Saved in Alerts feed! Tap Enable Push Alerts on your iPhone PWA / browser for OS banners.');
      }

      // Also display local notification immediately when open & granted as visual reinforcement
      if (
        'Notification' in window &&
        Notification.permission === 'granted' &&
        data.pushedCount === 0 &&
        'serviceWorker' in navigator
      ) {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          await reg
            .showNotification('REOZ Autopilot Test Alert', {
              body: 'Live notification channel verified for discovery, 1st cold WhatsApp & Founder approvals.',
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `reoz-local-test-${Date.now()}`,
            })
            .catch(() => {});
        }
      }

      await loadFeed();
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Test alert failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadFeed();
        }}
        className="relative flex items-center gap-1.5 rounded-xl border border-[#D0D5DD] bg-[#FFFFFF] px-3 py-2 text-xs font-bold text-[#151B2B] hover:bg-[#ECEFF3] active:scale-[0.97] transition"
        aria-label="Founder Notifications"
      >
        <svg className="w-4 h-4 text-[#151B2B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        <span className="hidden md:inline">Alerts</span>
        {unreadCount > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF6B35] px-1 text-[10px] font-black text-[#FFFFFF]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-outside backdrop for smooth dismissal on iPhone & Desktop */}
          <div
            className="fixed inset-0 z-40 bg-[#151B2B]/20 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-x-3 top-[calc(4.4rem+env(safe-area-inset-top))] sm:inset-x-auto sm:absolute sm:right-0 sm:top-12 z-50 sm:w-[400px] rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 border-b border-[#E4E7EC] bg-[#F5F6F8] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-black text-[#151B2B]">
                      Founder iPhone & Web Alerts
                    </span>
                  </div>
                  <div className="text-[11px] text-[#667085] mt-0.5">
                    {devicesCount > 0 || isSubscribed
                      ? `${Math.max(1, devicesCount)} paired device(s) • Push & feed ready`
                      : permissionState === 'denied'
                        ? 'Permission blocked in device settings'
                        : 'Ready to pair this device for live alerts'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[11px] font-bold text-[#FF6B35] hover:text-[#E05220]"
                    >
                      Mark Read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="sm:hidden rounded-lg px-2 py-1 text-xs font-bold text-[#667085] hover:bg-[#ECEFF3]"
                    aria-label="Close alerts"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {isIosBrowserTab && (
                <div className="rounded-lg border border-[#FFCBB8] bg-[#FFF1EC] px-2.5 py-2 text-[11px] text-[#E05220] font-medium leading-snug">
                  iPhone lock-screen step: Tap Safari <strong>Share (□↑)</strong> → <strong>Add to Home Screen</strong>, then open the <strong>REOZ</strong> Home Screen app and tap Enable.
                </div>
              )}

              <div className="flex items-center gap-2">
                {!isSubscribed ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={enableIphonePush}
                    className="flex-1 rounded-xl bg-[#FF6B35] hover:bg-[#E05220] px-3 py-2 text-[11px] font-bold text-[#FFFFFF] transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy ? 'Enabling...' : 'Enable Push Alerts'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendTestPush}
                    className="flex-1 rounded-xl bg-[#151B2B] hover:bg-[#2B313C] px-3 py-2 text-[11px] font-bold text-[#F5F6F8] transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy ? 'Sending...' : 'Send Test Alert'}
                  </button>
                )}

                {!isSubscribed && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendTestPush}
                    className="rounded-xl border border-[#D0D5DD] bg-[#FFFFFF] px-2.5 py-2 text-[11px] font-bold text-[#151B2B] hover:bg-[#ECEFF3] transition active:scale-[0.98]"
                    title="Send test alert to feed & paired devices"
                  >
                    Test
                  </button>
                )}

                <Link
                  href="/dashboard/settings"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-[#D0D5DD] bg-[#FFFFFF] px-2.5 py-2 text-[11px] font-bold text-[#151B2B] hover:bg-[#ECEFF3] transition"
                >
                  Access
                </Link>
              </div>

              {feedback && (
                <div className="rounded-lg bg-[#FFFFFF] border border-[#E4E7EC] px-2.5 py-1.5 text-[11px] font-semibold text-[#151B2B]">
                  {feedback}
                </div>
              )}
            </div>

            <div className="max-h-[55vh] sm:max-h-80 overflow-y-auto overscroll-contain divide-y divide-[#ECEFF3]">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#667085] space-y-2">
                  <p>
                    No alerts yet. Every discovery, autonomous 1st cold WhatsApp, and reply permission will appear here live.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendTestPush}
                    className="inline-flex items-center rounded-lg bg-[#FFF1EC] border border-[#FFCBB8] px-3 py-1.5 text-[11px] font-bold text-[#E05220] hover:bg-[#FFE3D8] transition"
                  >
                    Send Live Test Alert
                  </button>
                </div>
              ) : (
                notifications.map((item) => (
                  <Link
                    key={item.id}
                    href={item.url || '/dashboard/approvals'}
                    onClick={() => {
                      if (!item.read_at) void markOneRead(item.id);
                      setOpen(false);
                    }}
                    className={`block p-3.5 hover:bg-[#F5F6F8] active:bg-[#ECEFF3] transition ${
                      !item.read_at ? 'bg-[#FFF1EC]/45' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#151B2B]">{item.title}</span>
                      {!item.read_at && (
                        <span className="h-2 w-2 rounded-full bg-[#FF6B35] shrink-0" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#525A6B] leading-snug">{item.body}</p>
                    <span className="mt-1 block text-[10px] text-[#667085]">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
