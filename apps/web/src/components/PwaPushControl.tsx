'use client';

import { useCallback, useEffect, useState } from 'react';
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PwaPushControl() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [devicesCount, setDevicesCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isIosBrowserTab, setIsIosBrowserTab] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data?.success) {
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setUnreadCount(Number(data.unreadCount || 0));
        setVapidConfigured(Boolean(data.vapidConfigured));
        setVapidPublicKey(data.vapidPublicKey || null);
        setDevicesCount(Number(data.subscribedDevicesCount || 0));
      }
    } catch {
      // Ignore transient load failures
    }
  }, []);

  useEffect(() => {
    loadFeed();
    const timer = setInterval(loadFeed, 30000);
    return () => clearInterval(timer);
  }, [loadFeed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const navStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
    setIsIosBrowserTab(isIos && !navStandalone && !displayStandalone);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(async (reg) => {
          const existing = await reg.pushManager?.getSubscription();
          if (existing) setIsSubscribed(true);
        })
        .catch(() => {});
    }
  }, []);

  async function enableIphonePush() {
    setBusy(true);
    setFeedback(null);
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setFeedback('On iPhone: tap Share -> Add to Home Screen first, then open REOZ app.');
        return;
      }

      if (!vapidPublicKey) {
        setFeedback('Add NEXT_PUBLIC_VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY env vars for iOS lock-screen push.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setFeedback('Notification permission denied in browser settings.');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const appKey = urlBase64ToUint8Array(vapidPublicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey.buffer as ArrayBuffer,
      });

      const subJson = sub.toJSON();
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
        setIsSubscribed(true);
        setFeedback('iPhone PWA Alerts Active!');
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
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
  }

  async function sendTestPush() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await res.json();
      setFeedback(
        data.pushedCount > 0
          ? `Sent alert to ${data.pushedCount} iPhone/PWA device(s)!`
          : 'Saved in feed (pair iPhone Home Screen PWA to receive lock-screen push).'
      );
      await loadFeed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) loadFeed();
        }}
        className="relative flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-bold text-[#151B2B] hover:bg-[#ECEFF3] transition"
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
        <div className="fixed inset-x-4 top-18 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 z-50 sm:w-96 rounded-2xl border border-[#E4E7EC] bg-[#FFFFFF] shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-[#E4E7EC] bg-[#F5F6F8] space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-[#151B2B]">
                  Founder iPhone PWA Feed
                </div>
                <div className="text-[11px] text-[#667085]">
                  {devicesCount > 0 || isSubscribed
                    ? `${Math.max(1, devicesCount)} paired device(s) • Real-time alerts`
                    : vapidConfigured
                      ? 'Tap below to pair this iPhone / browser'
                      : 'VAPID keys needed for lock-screen iOS push'}
                </div>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] font-bold text-[#FF6B35] hover:text-[#E05220]"
                >
                  Mark Read
                </button>
              )}
            </div>

            {isIosBrowserTab && (
              <div className="rounded-lg border border-[#FFCBB8] bg-[#FFF1EC] px-2.5 py-2 text-[11px] text-[#E05220] font-medium">
                iPhone step: Tap Safari <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open REOZ from your Home Screen and tap Enable Alerts.
              </div>
            )}

            <div className="flex items-center gap-2">
              {!isSubscribed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={enableIphonePush}
                  className="flex-1 rounded-lg bg-[#FF6B35] hover:bg-[#E05220] px-3 py-1.5 text-[11px] font-bold text-[#FFFFFF] transition disabled:opacity-50"
                >
                  {busy ? 'Pairing...' : 'Enable iPhone Push Alerts'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={sendTestPush}
                  className="flex-1 rounded-lg bg-[#151B2B] hover:bg-[#2B313C] px-3 py-1.5 text-[11px] font-bold text-[#F5F6F8] transition disabled:opacity-50"
                >
                  {busy ? 'Sending...' : 'Send Test iPhone Alert'}
                </button>
              )}
              <Link
                href="/dashboard/settings"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[#D0D5DD] bg-[#FFFFFF] px-2.5 py-1.5 text-[11px] font-bold text-[#151B2B] hover:bg-[#ECEFF3]"
              >
                Access
              </Link>
            </div>

            {feedback && (
              <div className="text-[11px] font-semibold text-[#151B2B]">{feedback}</div>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#ECEFF3]">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#667085]">
                No notifications yet. Every discovery, autonomous 1st cold WhatsApp, and reply permission will appear here.
              </div>
            ) : (
              notifications.map((item) => (
                <Link
                  key={item.id}
                  href={item.url || '/dashboard/approvals'}
                  onClick={() => setOpen(false)}
                  className={`block p-3.5 hover:bg-[#F5F6F8] transition ${
                    !item.read_at ? 'bg-[#FFF1EC]/40' : ''
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
      )}
    </div>
  );
}

