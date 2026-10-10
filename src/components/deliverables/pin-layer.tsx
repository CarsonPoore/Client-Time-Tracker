"use client";
import { hasPin, pinFromClick } from "@/lib/revisions";
import type { CommentRow } from "@/lib/types";

export function PinLayer({ src, alt, comments, onPick, picked }: {
  src: string; alt: string; comments: CommentRow[];
  onPick: ((p: { x: number; y: number }) => void) | null; picked: { x: number; y: number } | null;
}) {
  const pins = comments.filter(hasPin);
  return (
    <div className="relative inline-block max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={`max-h-[70vh] max-w-full ${onPick ? "cursor-crosshair" : ""}`}
        onClick={onPick ? (e) => onPick(pinFromClick(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())) : undefined} />
      {pins.map((c, i) => (
        <a key={c.id} href={`#comment-${c.id}`} aria-label={`Pin ${i + 1}: go to comment`}
          className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-royal text-xs text-white ring-2 ring-white"
          style={{ left: `${c.pin_x}%`, top: `${c.pin_y}%` }}>{i + 1}</a>
      ))}
      {picked && <span aria-hidden className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-royal bg-white/70"
        style={{ left: `${picked.x}%`, top: `${picked.y}%` }} />}
    </div>
  );
}
