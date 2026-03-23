/**
 * ReminderBanner — shows upcoming/overdue task deadlines at the top of the app.
 */
import type { Reminder } from '../lib/types';

interface Props {
  reminders: Reminder[];
  onDismiss: (taskId: string) => void;
}

function formatTimeLeft(hours: number): { label: string; urgent: boolean } {
  if (hours < 0) {
    const h = Math.abs(Math.round(hours));
    return { label: `Overdue by ${h}h`, urgent: true };
  }
  if (hours < 1) {
    return { label: `Due in <1h`, urgent: true };
  }
  if (hours < 24) {
    return { label: `Due in ${Math.round(hours)}h`, urgent: hours < 6 };
  }
  const days = Math.floor(hours / 24);
  return { label: `Due in ${days}d`, urgent: false };
}

export function ReminderBanner({ reminders, onDismiss }: Props) {
  if (reminders.length === 0) return null;

  return (
    <div className="reminder-banner-container">
      {reminders.map((r) => {
        const { label, urgent } = formatTimeLeft(r.hoursUntilDue);
        return (
          <div key={r.taskId} className={`reminder-banner ${urgent ? 'reminder-urgent' : 'reminder-upcoming'}`}>
            <span className="reminder-icon">{urgent ? '🚨' : '⏰'}</span>
            <span className="reminder-text">
              <strong>{r.taskTitle}</strong>
              {r.subjectName && <span className="reminder-subject"> · {r.subjectName}</span>}
              <span className="reminder-time"> — {label}</span>
            </span>
            <button className="reminder-dismiss" onClick={() => onDismiss(r.taskId)} aria-label="Dismiss reminder">
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
