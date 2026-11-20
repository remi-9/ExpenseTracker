// The coin (lib/logo.ts) as the header logo, and as the picture inside the
// generated app icons.
import { ImageResponse } from "next/og";
import { logoPixels, placeOnTile } from "@/lib/logo";

/** The coin, drawn crisp at any size. Decorative: the app name always sits beside it. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {logoPixels().map(({ x, y, color }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
      ))}
    </svg>
  );
}

/**
 * The coin as a PNG of `size`, for the icon routes. `tile` paints the background
 * (phone home screens cannot show see-through icons) and `fill` leaves a margin.
 */
export function logoImage(size: number, { tile, fill = 1 }: { tile?: string; fill?: number } = {}) {
  const { scale, offset } = placeOnTile(size, fill);
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: size, height: size, background: tile ?? "transparent" }}>
        {logoPixels().map(({ x, y, color }) => (
          <div
            key={`${x}-${y}`}
            style={{
              position: "absolute",
              left: offset + x * scale,
              top: offset + y * scale,
              width: scale,
              height: scale,
              background: color,
            }}
          />
        ))}
      </div>
    ),
    { width: size, height: size },
  );
}
