'use client';
import { useEffect } from 'react';

/** イベントページが表示されたら閲覧を1回記録する（管理画面のアナリティクス用） */
export default function ViewBeacon({ eventId }: { eventId: number }) {
  useEffect(() => {
    fetch('/api/views', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }), keepalive: true }).catch(() => {});
  }, [eventId]);
  return null;
}
