import React from "react";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { BrandBadgeGlyph } from "./BrandMark";
import type { EngineerReport } from "../../../../packages/engine/src";
import { colors } from "../theme";

/**
 * Shareable engineer-report poster (Strava/IG-style): an all-SVG card of the
 * verdict + confidence + one driving tip — the app's signature output, made
 * brag-worthy. Captured to PNG via the Svg ref's toDataURL() like ShareCard /
 * ProfileCard (no react-native-view-shot — not in Expo Go). 1080x1350 (4:5).
 */

const W = 1080;
const H = 1350;

function confTone(c: EngineerReport["confidence"]): string {
  return c === "high" ? colors.good : c === "medium" ? colors.warn : colors.sub;
}

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars`, ellipsised. */
function wrapText(s: string, maxChars: number, maxLines: number): string[] {
  const words = s.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && lines.join(" ").split(/\s+/).length < words.length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
  }
  return lines;
}

export const ReportCard = React.forwardRef<Svg, { report: EngineerReport; subtitle?: string }>(
  ({ report, subtitle }, ref) => {
    const isReport = report.kind === "report" && !!report.primary;
    const kicker = isReport
      ? report.primary!.setting.replace(/_/g, " ").toUpperCase()
      : report.kind === "refusal"
        ? "OUT OF MY LANE"
        : "STAY PUT";
    const verdict = isReport ? report.primary!.change : report.message ?? report.diagnosis;
    const mechanism = isReport ? report.primary!.mechanism : undefined;
    const tip = report.driving_tips[0];
    const cites = report.primary?.citations ?? [];

    const verdictLines = wrapText(verdict, 26, 4);
    const mechLines = mechanism ? wrapText(mechanism, 38, 3) : [];
    const tipLines = tip ? wrapText(tip, 40, 3) : [];

    return (
      <Svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={0} y={0} width={W} height={H} fill={colors.bg} />
        <Rect x={0} y={0} width={W} height={14} fill={colors.accent} />

        <SvgText x={64} y={120} fill={colors.accent} fontSize={34} fontWeight="800" letterSpacing={6}>
          RACE ENGINEER
        </SvgText>
        {subtitle ? (
          <SvgText x={64} y={172} fill={colors.sub} fontSize={30}>
            {subtitle.length > 46 ? `${subtitle.slice(0, 45)}…` : subtitle}
          </SvgText>
        ) : null}

        {/* verdict band */}
        <SvgText x={64} y={300} fill={colors.sub} fontSize={30} fontWeight="800" letterSpacing={3}>
          {kicker.length > 40 ? `${kicker.slice(0, 39)}…` : kicker}
        </SvgText>
        {verdictLines.map((line, i) => (
          <SvgText key={`v${i}`} x={64} y={372 + i * 78} fill={colors.accent} fontSize={64} fontWeight="900">
            {line}
          </SvgText>
        ))}

        {mechLines.map((line, i) => (
          <SvgText key={`m${i}`} x={64} y={720 + i * 50} fill={colors.text} fontSize={36}>
            {line}
          </SvgText>
        ))}

        {/* confidence + rules cited */}
        <Rect x={64} y={910} width={W - 128} height={140} rx={20} fill={colors.card} />
        <SvgText x={104} y={985} fill={confTone(report.confidence)} fontSize={52} fontWeight="900">
          {report.confidence.toUpperCase()}
        </SvgText>
        <SvgText x={104} y={1028} fill={colors.sub} fontSize={28} fontWeight="700">
          CONFIDENCE
        </SvgText>
        <SvgText x={W - 104} y={985} fill={colors.text} fontSize={52} fontWeight="900" textAnchor="end">
          {cites.length}
        </SvgText>
        <SvgText x={W - 104} y={1028} fill={colors.sub} fontSize={28} fontWeight="700" textAnchor="end">
          {cites.length === 1 ? "RULE CITED" : "RULES CITED"}
        </SvgText>

        {/* one driving tip */}
        {tipLines.length > 0 ? (
          <>
            <SvgText x={64} y={1130} fill={colors.sub} fontSize={28} fontWeight="800" letterSpacing={3}>
              🎮 DRIVE TIP
            </SvgText>
            {tipLines.map((line, i) => (
              <SvgText key={`t${i}`} x={64} y={1176 + i * 42} fill={colors.text} fontSize={32}>
                {line}
              </SvgText>
            ))}
          </>
        ) : null}

        {/* watermark + CTA */}
        <BrandBadgeGlyph x={56} y={H - 92} size={56} />
        <SvgText x={124} y={H - 52} fill={colors.text} fontSize={36} fontWeight="800">
          RaceLab
        </SvgText>
        <SvgText x={W - 64} y={H - 52} fill={colors.sub} fontSize={30} textAnchor="end">
          your AI race engineer · racelabrc.app
        </SvgText>
      </Svg>
    );
  },
);

ReportCard.displayName = "ReportCard";
