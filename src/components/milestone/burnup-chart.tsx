"use client";

import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";

/**
 * Burnup: scope vs closed over time. Two series, so a line chart — and a
 * legend plus direct end-labels, so identity never rests on color alone.
 *
 * Colors are validated against the dataviz six checks in both modes:
 *   light  #2563eb / #16a34a      dark  #3b82f6 / #16a34a
 * Series color lives on the marks only; all text wears ink tokens.
 */
export type BurnupPoint = { date: string; scope: number; closed: number };

const PAD = { top: 12, right: 56, bottom: 22, left: 30 };
const W = 720;
const H = 200;

/**
 * The query returns only days where something happened. A time axis needs a
 * value for every day, so carry the last known value forward.
 */
function densify(points: BurnupPoint[]): BurnupPoint[] {
  if (points.length === 0) return [];
  const out: BurnupPoint[] = [];
  const day = 86_400_000;
  const start = parseISO(points[0].date).getTime();
  const end = Math.max(
    parseISO(points[points.length - 1].date).getTime(),
    Date.now() - day,
  );

  let cursor = 0;
  let scope = 0;
  let closed = 0;
  for (let t = start; t <= end; t += day) {
    const iso = new Date(t).toISOString().slice(0, 10);
    while (cursor < points.length && points[cursor].date <= iso) {
      scope = points[cursor].scope;
      closed = points[cursor].closed;
      cursor += 1;
    }
    out.push({ date: iso, scope, closed });
  }
  return out;
}

export function BurnupChart({ points }: { points: BurnupPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => densify(points), [points]);

  if (data.length < 2) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Not enough history yet — the burnup appears once radars start closing.
      </p>
    );
  }

  const maxY = Math.max(...data.map((d) => d.scope), 1);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / maxY) * plotH;

  const line = (key: "scope" | "closed") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d[key])}`).join(" ");

  const last = data[data.length - 1];
  const ticks = [0, Math.round(maxY / 2), maxY].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fraction = (event.clientX - rect.left) / rect.width;
    const svgX = fraction * W;
    const index = Math.round(((svgX - PAD.left) / plotW) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, index)));
  }

  const active = hover === null ? null : data[hover];

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-[#2563eb] dark:bg-[#3b82f6]" />
          <span className="text-muted-foreground">Scope</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-[#16a34a]" />
          <span className="text-muted-foreground">Closed</span>
        </span>
      </figcaption>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: H }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Burnup: scope and closed radars over time"
        >
          {/* Recessive grid */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 6}
                y={y(tick) + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* Date bookends only — a label per point would be noise */}
          <text
            x={PAD.left}
            y={H - 6}
            className="fill-muted-foreground text-[9px]"
          >
            {format(parseISO(data[0].date), "d MMM")}
          </text>
          <text
            x={W - PAD.right}
            y={H - 6}
            textAnchor="end"
            className="fill-muted-foreground text-[9px]"
          >
            {format(parseISO(last.date), "d MMM")}
          </text>

          {active && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="stroke-muted-foreground"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <path
            d={line("scope")}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-[#2563eb] dark:stroke-[#3b82f6]"
          />
          <path
            d={line("closed")}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-[#16a34a]"
          />

          {/* Direct end labels, so the lines are identified without the legend */}
          <text
            x={W - PAD.right + 6}
            y={y(last.scope) + 3}
            className="fill-muted-foreground text-[9px]"
          >
            Scope {last.scope}
          </text>
          <text
            x={W - PAD.right + 6}
            y={y(last.closed) + 3}
            className="fill-muted-foreground text-[9px]"
          >
            Closed {last.closed}
          </text>

          {active && (
            <>
              {/* 2px surface ring keeps overlapping markers legible */}
              <circle
                cx={x(hover!)}
                cy={y(active.scope)}
                r={4}
                className="fill-[#2563eb] stroke-background dark:fill-[#3b82f6]"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(hover!)}
                cy={y(active.closed)}
                r={4}
                className="fill-[#16a34a] stroke-background"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {active && (
          <div
            className="bg-popover pointer-events-none absolute top-0 rounded-md border px-2 py-1.5 text-xs shadow-md"
            style={{
              left: `${(x(hover!) / W) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-medium">
              {format(parseISO(active.date), "d MMM yyyy")}
            </div>
            <div className="text-muted-foreground flex gap-3 tabular-nums">
              <span>Scope {active.scope}</span>
              <span>Closed {active.closed}</span>
            </div>
          </div>
        )}
      </div>
      {/* Every chart needs a non-visual path to the same numbers. */}
      <details className="text-xs">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
          View as table
        </summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">Scope</th>
              <th className="py-1 font-medium">Closed</th>
            </tr>
          </thead>
          <tbody>
            {data
              .filter(
                (point, index) =>
                  index === 0 ||
                  index === data.length - 1 ||
                  point.scope !== data[index - 1].scope ||
                  point.closed !== data[index - 1].closed,
              )
              .map((point) => (
                <tr key={point.date} className="border-t">
                  <td className="py-1">
                    {format(parseISO(point.date), "d MMM yyyy")}
                  </td>
                  <td className="py-1">{point.scope}</td>
                  <td className="py-1">{point.closed}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
