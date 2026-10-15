import type { LessonView } from "@/lib/basketball/drill-session-view";

/**
 * The Film Room lesson that goes with a shooting drill, shown on the drill's own card: watch, then do the drill. It reads the lesson the Film Room
 * already has (nothing is copied), says when the lesson is only a related one, and says when no video is linked yet instead of showing a dead button.
 */
export function DrillLesson({ lesson }: { lesson: LessonView }) {
  return (
    <div className="mt-3 rounded-xl border border-[var(--data-cyan)]/30 bg-[var(--data-cyan)]/5 px-3.5 py-3">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--data-cyan)]">
        {lesson.basis === "linked" ? "Lesson for this drill" : "Related lesson"}
        {lesson.watched ? " · watched" : ""}
      </p>
      <p className="mt-1 text-sm font-bold leading-snug text-foreground">{lesson.title}</p>
      {lesson.watchFor.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {lesson.watchFor.slice(0, 3).map((item) => (
            <li key={item} className="text-xs leading-relaxed text-foreground-dim">
              {item}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2">
        {lesson.url ? (
          // Always an external link in a new tab: the workout is still sitting here when the player comes back.
          <a href={lesson.url} target="_blank" rel="noopener noreferrer" className="-my-3 inline-flex items-center py-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--data-cyan)] transition-colors hover:opacity-80">
            Watch the lesson ↗
          </a>
        ) : (
          <p className="text-[11px] text-foreground-mute">No video is linked to this lesson yet. You can add one in the Film Room after your workout.</p>
        )}
      </div>
    </div>
  );
}
