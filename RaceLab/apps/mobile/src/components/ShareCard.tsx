import React from "react";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { BrandBadgeGlyph } from "./BrandMark";
import type { SharedPayload } from "../../../../packages/social/src";
import { colors } from "../theme";

/**
 * The "post your setup" card (Strava/IG-style): an all-SVG poster of a setup +
 * its conditions + result. Rendered with react-native-svg so the parent can
 * capture it to PNG via the Svg ref's toDataURL() — no react-native-view-shot
 * (which isn't in Expo Go). Fixed 1080x1350 (4:5, the social-feed sweet spot).
 */

const W = 1080;
const H = 1350;

export const ShareCard = React.forwardRef<Svg, { payload: SharedPayload }>(({ payload }, ref) => {
  const { setup, car, context, comment } = payload;
  // up to 6 headline setup values, humanized — a card is a teaser, not a sheet
  const rows = Object.entries(setup.values)
    .filter(([, v]) => v !== "" && v !== undefined && v !== null)
    .slice(0, 6)
    .map(([k, v]) => [k.replace(/_/g, " "), String(v)] as const);

  const resultLine =
    context?.result?.position !== undefined
      ? `P${context.result.position}${context.result.entrants ? ` / ${context.result.entrants}` : ""}`
      : context?.result?.best_lap_s !== undefined
        ? `best ${context.result.best_lap_s.toFixed(2)}s`
        : undefined;

  return (
    <Svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Rect x={0} y={0} width={W} height={H} fill={colors.bg} />
      <Rect x={0} y={0} width={W} height={14} fill={colors.accent} />

      <SvgText x={64} y={130} fill={colors.accent} fontSize={34} fontWeight="800" letterSpacing={6}>
        {car.brand.toUpperCase()}
      </SvgText>
      <SvgText x={64} y={210} fill={colors.text} fontSize={72} fontWeight="900">
        {truncate(car.model, 22)}
      </SvgText>
      <SvgText x={64} y={268} fill={colors.sub} fontSize={32}>
        {[car.scale, car.power, car.category.replace(/_/g, " ")].filter(Boolean).join(" · ")}
      </SvgText>

      {context?.track_name ? (
        <SvgText x={64} y={356} fill={colors.text} fontSize={40} fontWeight="700">
          {truncate(context.track_name, 28)}
          {context.surface ? <SvgText fill={colors.sub} fontSize={32}>{`   ${context.surface}`}</SvgText> : null}
        </SvgText>
      ) : null}
      {resultLine ? (
        <SvgText x={64} y={420} fill="#FFD700" fontSize={48} fontWeight="900">
          🏁 {resultLine}
        </SvgText>
      ) : null}

      {rows.map(([k, v], i) => {
        const y = 540 + i * 110;
        return (
          <React.Fragment key={k}>
            <Rect x={64} y={y - 56} width={W - 128} height={92} rx={16} fill={colors.card} />
            <SvgText x={92} y={y} fill={colors.sub} fontSize={34}>
              {truncate(k, 26)}
            </SvgText>
            <SvgText x={W - 92} y={y} fill={colors.text} fontSize={40} fontWeight="800" textAnchor="end">
              {truncate(v, 16)}
            </SvgText>
          </React.Fragment>
        );
      })}

      {comment ? (
        <SvgText x={64} y={H - 150} fill={colors.sub} fontSize={30} fontStyle="italic">
          {truncate(`"${comment}"`, 48)}
        </SvgText>
      ) : null}

      <BrandBadgeGlyph x={56} y={H - 92} size={56} />
      <SvgText x={124} y={H - 52} fill={colors.text} fontSize={36} fontWeight="800">
        RaceLab
      </SvgText>
      <SvgText x={W - 64} y={H - 52} fill={colors.sub} fontSize={30} textAnchor="end">
        racelabrc.app
      </SvgText>
    </Svg>
  );
});

ShareCard.displayName = "ShareCard";

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
