const SEGMENTS = 12;

// A pixel-art spinning ring: gold pixel-squares arranged in a circle, with a
// bright segment that chases around (stepped timing for a retro, ticking feel).
export function LoadingRing({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="centered">
      <div className="pixel-ring" role="status" aria-label="Loading">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            style={{
              transform: `rotate(${(i * 360) / SEGMENTS}deg) translateY(-38px)`,
              animationDelay: `${(i * 1.2) / SEGMENTS}s`,
            }}
          />
        ))}
      </div>
      <p className="subtitle">{label}</p>
    </div>
  );
}
