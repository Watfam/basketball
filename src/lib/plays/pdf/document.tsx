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
import { groupPlaysBySection, type ExportSection } from "../export/groups";
import type { ExportData, ExportPlay } from "../export/types";

const NAVY = "#0d1b33";

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 10, color: "#1c2333" },
  coverLogo: { width: 96, height: 96, marginBottom: 18 },
  coverTitle: { fontSize: 30, fontFamily: "Helvetica-Bold", color: NAVY, letterSpacing: 1 },
  coverSubtitle: { fontSize: 13, color: "#55607a", marginTop: 4, marginBottom: 28 },
  coverListItem: { fontSize: 14, marginBottom: 7, color: "#1c2333" },
  coverListNum: { fontFamily: "Helvetica-Bold", color: NAVY },
  coverSectionLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#55607a", letterSpacing: 1.5, marginTop: 12, marginBottom: 7 },
  coverSubsectionLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#8891a3", letterSpacing: 1, marginTop: 6, marginBottom: 4 },
  coverColumns: { flexDirection: "row", gap: 28 },
  coverColumn: { flex: 1 },
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

type CoverRow =
  | { kind: "section"; key: string; label: string }
  | { kind: "subsection"; key: string; label: string }
  | { kind: "play"; key: string; num: number; name: string };

/**
 * Flattened section → subsection → play rows, in display order, with continuous numbering across
 * the whole list. Flattening (rather than nesting views per section) is what makes the two-column
 * split below possible: react-pdf's layout has no multi-column primitive, so getting a long list
 * to flow across two side-by-side columns means splitting this same sequence of rows ourselves.
 */
function flattenCoverRows(groups: ExportSection<ExportPlay>[]): CoverRow[] {
  const rows: CoverRow[] = [];
  let nextNum = 1;
  groups.forEach((g) => {
    rows.push({ kind: "section", key: `s-${g.label}`, label: g.label });
    g.subgroups.forEach((sg) => {
      if (g.showSubLabels) rows.push({ kind: "subsection", key: `sub-${g.label}-${sg.label}`, label: sg.label });
      sg.plays.forEach((p) => rows.push({ kind: "play", key: p.id, num: nextNum++, name: p.name }));
    });
  });
  return rows;
}

function CoverRowText({ row }: { row: CoverRow }) {
  if (row.kind === "section") return <Text style={styles.coverSectionLabel}>{row.label.toUpperCase()}</Text>;
  if (row.kind === "subsection") return <Text style={styles.coverSubsectionLabel}>{row.label.toUpperCase()}</Text>;
  return (
    <Text style={styles.coverListItem}>
      <Text style={styles.coverListNum}>{row.num}. </Text>
      {row.name}
    </Text>
  );
}

// Above this many rows, a single centered column runs past one page's height and react-pdf splits
// it awkwardly across two — each half re-centered in whatever space it has, leaving a big gap under
// a short first page and the legend looking like it's floating on its own. Two columns keep it on
// one page instead.
const COVER_COLUMN_THRESHOLD = 12;

function CoverPage({ data, groups }: { data: ExportData; groups: ExportSection<ExportPlay>[] }) {
  const rows = flattenCoverRows(groups);
  const useColumns = rows.length > COVER_COLUMN_THRESHOLD;

  // Split as close to half-and-half as possible, but never leave a header row dangling alone at the
  // bottom of column one — push the break forward to the next play row when that would happen.
  let splitAt = Math.ceil(rows.length / 2);
  while (splitAt < rows.length && rows[splitAt - 1].kind !== "play") splitAt++;
  const columns = useColumns ? [rows.slice(0, splitAt), rows.slice(splitAt)] : [rows];

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={useColumns ? { flex: 1 } : { flex: 1, justifyContent: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (a PDF primitive), not an HTML <img>; it has no alt prop */}
        <Image src={data.team.logoDataUri} style={styles.coverLogo} />
        <Text style={styles.coverTitle}>{data.team.name.toUpperCase()}</Text>
        <Text style={styles.coverSubtitle}>{data.team.subtitle} — Playbook</Text>
        {useColumns ? (
          <View style={styles.coverColumns}>
            {columns.map((col, i) => (
              <View key={i} style={styles.coverColumn}>
                {col.map((row) => (
                  <CoverRowText key={row.key} row={row} />
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View>
            {rows.map((row) => (
              <CoverRowText key={row.key} row={row} />
            ))}
          </View>
        )}
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
  const ordered = groups.flatMap((g) => g.subgroups.flatMap((sg) => sg.plays.map((play) => ({ play, sectionLabel: g.label }))));
  return (
    <Document title={`${data.team.name} Playbook`} author={data.team.name}>
      <CoverPage data={data} groups={groups} />
      {ordered.map(({ play, sectionLabel }, i) => (
        <PlayPage key={play.id} team={data.team} play={play} index={i} sectionLabel={sectionLabel} />
      ))}
    </Document>
  );
}
