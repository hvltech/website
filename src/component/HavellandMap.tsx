import { useEffect, useId, useRef } from "react";
import pearLogo from "../assets/logo/logo_no_text.svg";
import {
  HQ,
  MAP_ATTRIBUTION,
  MAP_HEIGHT,
  MAP_WIDTH,
  mapPaths,
  project,
  roadBetween,
  tour,
  townPoint,
  towns,
  type TownId,
} from "../data/havelland";

type HavellandMapProps = {
  label: string;
  nextStop?: TownId;
  /** e.g. "Next dinner: Falkensee · 7 Oct" — shown as the map legend. */
  legend?: string;
  hqLabel: string;
  motion: boolean;
  /** Stops with a scheduled dinner link to its Meetup page. */
  links?: Partial<Record<TownId, { href: string; label: string }>>;
};

export default function HavellandMap({ label, nextStop, legend, hqLabel, motion, links = {} }: HavellandMapProps) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [hqX, hqY] = townPoint(HQ);
  const [havelX, havelY] = project([12.255, 52.7]);
  const [berlinX, berlinY] = project([13.255, 52.49]);
  const hq = towns.find((town) => town.id === HQ)!;
  // Stops before the next dinner are done. With no dinner on Meetup yet, past months count as done.
  const nextIndex = tour.findIndex((stop) => stop.town === nextStop);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const done = nextIndex >= 0 ? nextIndex : tour.filter((stop) => stop.month < thisMonth).length;
  // The roads driven so far, plus the one to the next dinner.
  const legs = tour.slice(1, nextIndex >= 0 ? nextIndex + 1 : done).map((stop, i) => ({
    ...roadBetween(tour[i].town, stop.town),
    upcoming: i + 1 === nextIndex,
  }));
  const nextLeg = legs.find((leg) => leg.upcoming);

  useEffect(() => {
    if (motion) svg.current?.unpauseAnimations();
    else svg.current?.pauseAnimations();
  }, [motion]);

  return (
    <svg
      ref={svg}
      className="havel-map"
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern id={`${id}-dots`} width="15" height="15" patternUnits="userSpaceOnUse">
          <rect x="7" y="7" width="2" height="2" style={{ fill: "var(--map-dots)" }} />
        </pattern>
        <mask id={`${id}-reveal`} maskUnits="userSpaceOnUse">
          {legs.map((leg) => (
            <path key={leg.line} d={leg.line} className="route-reveal" pathLength={1} />
          ))}
        </mask>
      </defs>

      <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${id}-dots)`} />

      <g className="map-land" shapeRendering="crispEdges">
        <path d={mapPaths.border} fill="#000" transform="translate(3 3)" opacity=".16" />
        <path d={mapPaths.border} style={{ fill: "var(--map-border)" }} />
        <path d={mapPaths.land} style={{ fill: "var(--map-land)" }} />
        <path d={mapPaths.forest} style={{ fill: "var(--map-forest)" }} />
        <path d={mapPaths.canal} style={{ fill: "var(--map-canal)" }} />
        <path d={mapPaths.water} style={{ fill: "var(--map-water)" }} />
      </g>
      <g mask={`url(#${id}-reveal)`} shapeRendering="crispEdges">
        {legs.map((leg) => (
          <path key={leg.cells} d={leg.cells} className={`map-road ${leg.upcoming ? "is-upcoming" : ""}`} />
        ))}
      </g>

      <text className="map-river-label" x={havelX} y={havelY}>
        Havel
      </text>
      <text className="map-berlin" x={berlinX} y={berlinY} textAnchor="middle">
        Berlin
      </text>
      <g className="map-compass" transform={`translate(${MAP_WIDTH - 22} 26)`} shapeRendering="crispEdges">
        <path d="M-3-14h6v4h3v4h3v4h-6v14h-6v-14h-6v-4h3v-4h3z" style={{ fill: "var(--map-border)" }} />
        <text y="26" textAnchor="middle">
          N
        </text>
      </g>
      <text className="map-attribution" x={MAP_WIDTH - 6} y={MAP_HEIGHT - 6} textAnchor="end">
        {MAP_ATTRIBUTION}
      </text>
      {legend && (
        <g transform={`translate(18 ${MAP_HEIGHT - 12})`}>
          <NextFlag />
          <text className="map-legend" x="24" y="-8">
            {legend}
          </text>
        </g>
      )}

      {nextLeg && (
        <rect className="map-rider" x="-3.5" y="-3.5" width="7" height="7" shapeRendering="crispEdges">
          <animateMotion dur="6s" begin="2s" repeatCount="indefinite" path={nextLeg.line} />
        </rect>
      )}

      {tour.map((stop, index) => {
        if (stop.town === HQ) return null;
        const town = towns.find((t) => t.id === stop.town)!;
        const [x, y] = townPoint(stop.town);
        const isNext = stop.town === nextStop;
        const isDone = index < done;
        const link = links[stop.town];
        const marker = (
          <g
            className={`map-town ${isNext ? "is-next" : isDone ? "is-done" : "is-planned"} ${town.minor && !isNext ? "is-minor" : ""}`}
            style={{ animationDelay: `${1.2 + index * 0.14}s` }}
          >
            {isNext ? (
              <NextBadge name={town.name} x={x} />
            ) : isDone ? (
              <>
                <rect x="-7" y="-7" width="14" height="14" className="town-dot" shapeRendering="crispEdges" />
                <path className="town-check" d="M-5 0h3v2h2v-3h2v-3h3v3h-2v3h-2v3h-3v-3h-3z" shapeRendering="crispEdges" />
              </>
            ) : (
              <rect x="-4" y="-4" width="8" height="8" className="town-dot" shapeRendering="crispEdges" />
            )}
            {!isNext && (
              <text x={town.label.dx} y={town.label.dy} textAnchor={town.label.anchor}>
                {town.name}
              </text>
            )}
          </g>
        );
        return (
          <g key={stop.town} transform={`translate(${x} ${y})`}>
            {link ? (
              // The tour list next to the map carries the same links for keyboards and screen readers.
              <a className="map-stop-link" href={link.href} aria-label={link.label} tabIndex={-1}>
                {marker}
              </a>
            ) : (
              marker
            )}
          </g>
        );
      })}

      <g transform={`translate(${hqX} ${hqY})`}>
        <g className="map-hq">
          <rect className="hq-pulse" x="-14" y="-14" width="28" height="28" />
          <g className="hq-pear">
            <path
              className="hq-badge"
              shapeRendering="crispEdges"
              d="M-6-52h12v6h6v8h6v10h4v22h-4v8h-6v6h-6v4h-12v-4h-6v-6h-6v-8h-4v-22h4v-10h6v-8h6z"
            />
            <image href={pearLogo} x="-17" y="-50" width="34" height="49" />
          </g>
          <text className="hq-label" x={hq.label.dx} y={hq.label.dy - 10}>
            Falkensee
          </text>
          <text className="hq-tag" x={hq.label.dx} y={hq.label.dy + 8}>
            {hqLabel}
          </text>
          {nextStop === HQ && (
            <g transform="translate(12 -38)">
              <NextFlag />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

/** The next stop: a pixel badge with the town name, pointing at the town, with the flag planted on top.
 * `x` is the town's position, so the badge can stay inside the map near the edges. */
function NextBadge({ name, x }: { name: string; x: number }) {
  const width = Math.round(name.length * 9.6 + 20);
  const left = Math.round(Math.min(Math.max(-width / 2, 6 - x), MAP_WIDTH - 6 - x - width));
  const top = -48;
  // Outline of badge and pointer in one path, so the pointer has no seam.
  const outline = `M${left} ${top}h${width}v26H6l-6 8l-6-8H${left}z`;
  return (
    <g className="next-badge">
      <rect x="-5" y="-5" width="10" height="10" className="town-dot" shapeRendering="crispEdges" />
      <path d={outline} className="badge-shadow" transform="translate(3 3)" shapeRendering="crispEdges" />
      <path d={outline} className="badge-plate" shapeRendering="crispEdges" />
      <text x={left + width / 2} y={top + 19} textAnchor="middle">
        {name}
      </text>
      <g transform={`translate(${left + 8} ${top + 6})`}>
        <NextFlag />
      </g>
    </g>
  );
}

function NextFlag() {
  return (
    <g className="next-flag" shapeRendering="crispEdges">
      <rect x="-1" y="-30" width="3" height="24" fill="#6b4b3a" />
      <path d="M2-30h14v3h4v8h-4v3H2z" fill="#d0643b" />
    </g>
  );
}
