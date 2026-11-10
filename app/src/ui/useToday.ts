import { useEffect, useState } from 'react';
import { todayISO, type ISODate } from '../core/dates';

/** Today's date, refreshed when the app comes back to the foreground so an open tab survives midnight. */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, []);
  return today;
}
