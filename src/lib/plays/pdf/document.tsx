/**
 * The printable playbook PDF — modeled on the varsity team's own "Lightning BLOB" book (a cover
 * page listing every play, then one page per play: a header bar, a bold title, a grid of numbered
 * court diagrams, a legend repeated at the bottom). No animation — a PDF is static by nature, same
 * as the reference document — but every diagram is a real, to-scale court built from the exact same
 * play data and geometry math as the live app and the HTML export, not a hand-drawn approximation.
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PlayDiagram, computeExportRegion } from "./court";
import { PLAYER_COLORS, DEFENSE_COLOR, BALL_COLOR } from "./colors";
import { groupPlaysBySection } from "../export/groups";
import type { ExportData, ExportPlay } from "../export/types";

const NAVY = "#0d1b33";

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 10, color: "#1c2333" },
  coverLogo: { width: 96, height: 96, marginBottom: 18 },
  coverTitle: { fontSize: 30, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 1 },
  coverSubtitle: { fontSize: 13, color: "#55607a", marginTop: 4, marginBottom: 28 },
  coverListItem: { fontSize: 14, marginBottom: 7, color: "#1c2333" },
  coverListNum: { fontFamily: "Helvetica-Bold", color: NAVY },
  coverSection: { marginBottom: 16 },
  coverSectionLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#55607a", letterSpacing: 1.5, marginBottom: 7 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: "auto", paddingTop: 14, borderTop: "1 solid #d8dbe3" },
  legendSwatch: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  legendSwatchText: { fontSize: 8, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  legendLabel: { fontSize: 8, color: "#55607a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `2 solid ${NAVY}`, paddingBottom: 6, marginBottom: 14 },
  headerText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 0.5 },
  playTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "center", marginBottom: 4 },
  playVs: { fontSize: 10, color: "#55607a", textAlign: "center", marginBottom: 4 },
  playAbout: { fontSize: 9, color: "#3a4256", textAlign: "center", marginBottom: 14, lineHeight: 1.4, paddingHorizontal: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: { width: "48.5%", border: "1 solid #d8dbe3", borderRadius: 4, padding: 8 },
  cellCaption: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  cellNum: { width: 16, height: 16, borderRadius: 8, backgroundColor: NAVY, color: "#fff", fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center" },
  cellNote: { fontSize: 8.5, color: "#3a4256", marginTop: 4, lineHeight: 1.35 },
  keysBox: { marginTop: 14, padding: 10, backgroundColor: "#f2f4f8", borderRadius: 4 },
  keysTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 5, letterSpacing: 0.5 },
  keyLine: { fontSize: 8.5, color: "#3a4256", marginBottom: 3, lineHeight: 1.3 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36 },
});

function Legend() {
  return (
    <View style={styles.legendRow} fixed>
      {(["O1", "O2", "O3", "O4", "O5"] as const).map((id) => (
        <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View style={[styles.legendSwatch, { backgroundColor: PLAYER_COLORS[id] }]}>
            <Text style={styles.legendSwatchText}>{id.slice(1)}</Text>
          </View>
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <View style={[styles.legendSwatch, { backgroundColor: DEFENSE_COLOR }]}>
          <Text style={styles.legendSwatchText}>X</Text>
        </View>
        <Text style={styles.legendLabel}>Defense</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <View style={[styles.legendSwatch, { backgroundColor: BALL_COLOR, borderRadius: 8 }]} />
        <Text style={styles.legendLabel}>Ball</Text>
      </View>
      <Text style={styles.legendLabel}>— Cut/move    - - Pass    + Screen</Text>
    </View>
  );
}

function CoverPage({ data, groups }: { data: ExportData; groups: { label: string; plays: ExportPlay[] }[] }) {
  // Numbered once, up front, rather than mutated during render — each group starts where the last
  // one's running count left off, so the cover's numbering matches the per-play page numbers exactly.
  let nextNum = 1;
  const numberedGroups = groups.map((g) => {
    const numbered = g.plays.map((p) => ({ p, num: nextNum++ }));
    return { label: g.label, numbered };
  });

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (a PDF primitive), not an HTML <img>; it has no alt prop */}
        <Image src={data.team.logoDataUri} style={styles.coverLogo} />
        <Text style={styles.coverTitle}>{data.team.name.toUpperCase()}</Text>
        <Text style={styles.coverSubtitle}>{data.team.subtitle} — Playbook</Text>
        <View>
          {numberedGroups.map((g) => (
            <View key={g.label} style={styles.coverSection} wrap={false}>
              <Text style={styles.coverSectionLabel}>{g.label.toUpperCase()}</Text>
              {g.numbered.map(({ p, num }) => (
                <Text key={p.id} style={styles.coverListItem}>
                  <Text style={styles.coverListNum}>{num}. </Text>
                  {p.name}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </View>
      <Text style={{ fontSize: 8, color: "#8891a3", textAlign: "center" }}>
        Generated {new Date(data.generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      </Text>
      <Legend />
    </Page>
  );
}

function PlayPage({ team, play, index, sectionLabel }: { team: ExportData["team"]; play: ExportPlay; index: number; sectionLabel: string }) {
  const region = computeExportRegion(play.frames);
  const chunks: typeof play.frames[] = [];
  for (let i = 0; i < play.frames.length; i += 4) chunks.push(play.frames.slice(i, i + 4));

  return (
    <>
      {chunks.map((chunk, pageIdx) => (
        <Page key={pageIdx} size="LETTER" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.headerText}>
              {team.name.toUpperCase()} · {sectionLabel.toUpperCase()}
            </Text>
            <Text style={styles.headerText}>
              Play {index + 1}: {play.name.toUpperCase()}
              {chunks.length > 1 ? ` (${pageIdx + 1}/${chunks.length})` : ""}
            </Text>
          </View>
          {pageIdx === 0 && (
            <>
              <Text style={styles.playTitle}>
                {play.categoryLabel}: &#8220;{play.name}&#8221;
              </Text>
              <Text style={styles.playVs}>{play.vs}</Text>
              <Text style={styles.playAbout}>{play.about}</Text>
            </>
          )}
          <View style={styles.grid}>
            {chunk.map((frame, i) => {
              const stepNum = pageIdx * 4 + i;
              return (
                <View key={stepNum} style={styles.cell} wrap={false}>
                  <View style={styles.cellCaption}>
                    <Text style={styles.cellNum}>{stepNum === 0 ? "•" : stepNum}</Text>
                    <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY }}>{stepNum === 0 ? "SET" : `STEP ${stepNum}`}</Text>
                  </View>
                  <PlayDiagram frame={frame} region={region} />
                  <Text style={styles.cellNote}>{frame.note}</Text>
                </View>
              );
            })}
          </View>
          {pageIdx === chunks.length - 1 && play.keys.length > 0 && (
            <View style={styles.keysBox}>
              <Text style={styles.keysTitle}>COACHING POINTS</Text>
              {play.keys.map((k, i) => (
                <Text key={i} style={styles.keyLine}>
                  {"•"} {k}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.footer} fixed>
            <Legend />
          </View>
        </Page>
      ))}
    </>
  );
}

export function PlaybookPdfDocument({ data }: { data: ExportData }) {
  const groups = groupPlaysBySection(data.plays);
  const ordered = groups.flatMap((g) => g.plays.map((play) => ({ play, sectionLabel: g.label })));
  return (
    <Document title={`${data.team.name} Playbook`} author={data.team.name}>
      <CoverPage data={data} groups={groups} />
      {ordered.map(({ play, sectionLabel }, i) => (
        <PlayPage key={play.id} team={data.team} play={play} index={i} sectionLabel={sectionLabel} />
      ))}
    </Document>
  );
}
