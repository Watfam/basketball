import { avatarTone, initials } from "@/lib/basketball/avatar";

export function Avatar({ id, name, size = 44 }: { id: string; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold tracking-wide text-white"
      style={{ width: size, height: size, background: avatarTone(id), fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}
