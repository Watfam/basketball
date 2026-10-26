"use client";

import { PlayCourt } from "@/components/plays/play-court";
import { computeContentBounds } from "@/lib/plays/bounds";
import type { Frame } from "@/lib/plays/types";

/** A small, static cover image for a play: its opening alignment, framed to wherever the whole play happens. */
export function PlayThumbnail({ frames }: { frames: Frame[] }) {
  const region = computeContentBounds(frames);
  return (
    <PlayCourt
      frame={frames[0]}
      tool="move"
      dragging={null}
      onTapPlayer={() => {}}
      onMovePlayer={() => {}}
      onDragStateChange={() => {}}
      onAddLine={() => {}}
      onEraseLine={() => {}}
      interactive={false}
      region={region}
    />
  );
}
