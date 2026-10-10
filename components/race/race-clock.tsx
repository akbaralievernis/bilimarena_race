import { URGENT_SECONDS, formatClock } from "@/lib/race/timer";

const clockIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1em] shrink-0">
    <circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M12 9v4l2.5 2.5M9.5 2.5h5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/**
 * Countdown of a timed race. `big` is the projector size. The screen-reader
 * text is announced only on whole minutes and in the last minute's milestones.
 */
export function RaceClock({ seconds, big = false }: { seconds: number; big?: boolean }) {
  const urgent = seconds <= URGENT_SECONDS;
  const over = seconds === 0;
  const tone = over
    ? "bg-danger-soft text-danger"
    : urgent
      ? "bg-danger-soft text-danger animate-pulse motion-reduce:animate-none"
      : "bg-sun-soft text-ink";
  const size = big ? "gap-4 px-8 py-4 text-6xl xl:text-7xl" : "gap-2 px-3.5 py-2 text-lg";
  return (
    <p
      className={`inline-flex items-center rounded-2xl font-display font-bold tabular-nums ${tone} ${size}`}
      role="timer"
      aria-label={over ? "Время гонки вышло" : `Осталось ${formatClock(seconds)}`}
    >
      {clockIcon}
      <span>{over ? "Время вышло" : formatClock(seconds)}</span>
    </p>
  );
}
