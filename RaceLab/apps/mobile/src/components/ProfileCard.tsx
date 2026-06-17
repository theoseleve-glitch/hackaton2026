import React from "react";
import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";
import type { DriverProfile } from "../../../../packages/social/src";
import { colors } from "../theme";

/**
 * The shareable "athlete card" (Strava/IG-style): an all-SVG poster of a
 * driver's identity + career palmarès. Rendered with react-native-svg so the
 * parent can capture it to PNG via the Svg ref's toDataURL() — no
 * react-native-view-shot (which isn't in Expo Go). Fixed 1080x1350 (4:5, the
 * social-feed sweet spot). Same ref/capture contract as ShareCard.
 */

const W = 1080;
const H = 1350;

const LEVEL_LABEL: Record<NonNullable<DriverProfile["level"]>, string> = {
  beginner: "Beginner",
  club: "Club",
  regional: "Regional",
  pro: "Pro",
};

export const ProfileCard = React.forwardRef<Svg, { profile: DriverProfile }>(({ profile }, ref) => {
  const { handle, level, country, home_track, classes, career } = profile;

  const initial = (handle.trim()[0] ?? "?").toUpperCase();

  const metaLine = [
    level ? LEVEL_LABEL[level] : undefined,
    country,
    home_track,
  ]
    .filter(Boolean)
    .join(" · ");

  const classesLine = classes && classes.length ? classes.join(" · ") : undefined;

  const bestLapLine =
    career?.best_lap_s !== undefined
      ? `best ${career.best_lap_s.toFixed(2)}s${career.best_lap_track ? ` — ${truncate(career.best_lap_track, 22)}` : ""}`
      : undefined;

  // PALMARÈS stat triplet — big numbers, gold for wins like ShareCard's result.
  const stats: ReadonlyArray<{ label: string; value: number; gold?: boolean }> = [
    { label: "🏆 WINS", value: career?.wins ?? 0, gold: true },
    { label: "PODIUMS", value: career?.podiums ?? 0 },
    { label: "RACES", value: career?.races ?? 0 },
  ];

  const avatarCx = 200;
  const avatarCy = 300;
  const avatarR = 130;

  return (
    <Svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Rect x={0} y={0} width={W} height={H} fill={colors.bg} />
      <Rect x={0} y={0} width={W} height={14} fill={colors.accent} />

      <SvgText x={64} y={120} fill={colors.accent} fontSize={34} fontWeight="800" letterSpacing={6}>
        DRIVER CARD
      </SvgText>

      {/* avatar disc — initial-only, kept SVG-only even when avatar_uri exists */}
      <Circle cx={avatarCx} cy={avatarCy} r={avatarR} fill={colors.cardAlt} stroke={colors.accent} strokeWidth={8} />
      <SvgText
        x={avatarCx}
        y={avatarCy + 60}
        fill={colors.text}
        fontSize={160}
        fontWeight="900"
        textAnchor="middle"
      >
        {initial}
      </SvgText>

      <SvgText x={376} y={262} fill={colors.text} fontSize={84} fontWeight="900">
        {truncate(`@${handle}`, 16)}
      </SvgText>
      {metaLine ? (
        <SvgText x={376} y={328} fill={colors.sub} fontSize={34}>
          {truncate(metaLine, 30)}
        </SvgText>
      ) : null}
      {classesLine ? (
        <SvgText x={376} y={388} fill={colors.accent} fontSize={32} fontWeight="700">
          {truncate(classesLine, 30)}
        </SvgText>
      ) : null}

      {/* PALMARÈS band */}
      <SvgText x={64} y={560} fill={colors.sub} fontSize={32} fontWeight="800" letterSpacing={4}>
        PALMARÈS
      </SvgText>
      <Rect x={64} y={596} width={W - 128} height={300} rx={24} fill={colors.card} />
      {stats.map((s, i) => {
        const cellW = (W - 128) / 3;
        const cx = 64 + cellW * i + cellW / 2;
        return (
          <React.Fragment key={s.label}>
            <SvgText
              x={cx}
              y={760}
              fill={s.gold ? "#FFD700" : colors.text}
              fontSize={120}
              fontWeight="900"
              textAnchor="middle"
            >
              {s.value}
            </SvgText>
            <SvgText x={cx} y={840} fill={colors.sub} fontSize={34} fontWeight="700" textAnchor="middle">
              {s.label}
            </SvgText>
          </React.Fragment>
        );
      })}

      {career?.runs !== undefined ? (
        <SvgText x={64} y={988} fill={colors.text} fontSize={40} fontWeight="800">
          {career.runs}
          <SvgText fill={colors.sub} fontSize={34} fontWeight="400">
            {" "}
            runs logged
          </SvgText>
        </SvgText>
      ) : null}

      {bestLapLine ? (
        <SvgText x={64} y={1056} fill="#FFD700" fontSize={44} fontWeight="900">
          ⏱ {bestLapLine}
        </SvgText>
      ) : null}

      {/* watermark + footer — copied treatment from ShareCard */}
      <Circle cx={88} cy={H - 64} r={16} fill={colors.accent} />
      <SvgText x={120} y={H - 52} fill={colors.text} fontSize={36} fontWeight="800">
        RaceLab
      </SvgText>
      <SvgText x={W - 64} y={H - 52} fill={colors.sub} fontSize={30} textAnchor="end">
        racelab.app
      </SvgText>
    </Svg>
  );
});

ProfileCard.displayName = "ProfileCard";

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
