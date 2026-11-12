// Lays out the poster: one page of 24 by 36 inches. The page is designed on a canvas half that size (see CANVAS in posterBuild.ts) and
// scaled up by ZOOM, so every tile, chart and map written for the document is reused and comes out at poster size.
import { Document, Image, Link, Page, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import logoWhite from "../assets/logo-white.png";
import { site } from "../lib/site";
import { TYPE_LABEL } from "../lib/indicators";
import { PanelView, Qr, TileView } from "./Doc";
import { CANVAS, GRID, SHEET, ZOOM, type PosterModel } from "./posterBuild";
import { C, F } from "./theme";

const M = 22, GAP = 9, TILE_H = 48, HEAD = 62, FOOT = 24;
const body = (size: number, extra: object = {}) => ({ fontFamily: F.body, fontSize: size, color: C.ink, ...extra });
const display = (size: number, extra: object = {}) => ({ fontFamily: F.display, fontSize: size, color: C.navy, fontWeight: 700 as const, ...extra });

function Poster({ m }: { m: PosterModel }): ReactElement {
  const o = m.orientation;
  const { W, H } = CANVAS[o];
  const { cols, rows } = GRID[o];
  const { sel, cmp } = m.ctx;
  const bw = W - 2 * M;
  const perRow = 6;
  const tileRows = Math.ceil(m.tiles.length / perRow);
  const tilesTop = HEAD + 10;
  const tilesH = tileRows * TILE_H + (tileRows - 1) * 7;
  const gridTop = tilesTop + tilesH + 10;
  const gridH = H - FOOT - 8 - gridTop;
  const cw = (bw - GAP * (cols - 1)) / cols, ch = (gridH - GAP * (rows - 1)) / rows;
  const tw = (bw - 7 * (perRow - 1)) / perRow;
  const url = m.ctx.url;
  const type = TYPE_LABEL[sel.type] ?? sel.type;
  const name = `${sel.label}${cmp ? ` and ${cmp.label}` : ""}`;
  // Long names (two areas) shrink to stay on one line.
  const nameSize = Math.max(20, Math.min(30, (W - 2 * M - 60 - 230) / (name.length * 0.52)));
  const qr = HEAD - 10;
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `scale(${ZOOM})`, transformOrigin: "top left" }}>
      <View style={{ position: "absolute", left: 0, top: 0, width: W, height: HEAD, backgroundColor: C.navy }} />
      <Image src={logoWhite} style={{ position: "absolute", left: M, top: (HEAD - 28) / 2, width: 28, height: 28 }} />
      <View style={{ position: "absolute", left: M + 60, top: 0, height: HEAD, justifyContent: "center", width: W - 2 * M - 60 - 230 }}>
        <Text style={display(nameSize, { color: "#ffffff", lineHeight: 1.05 })}>{name}</Text>
        <Text style={body(8.2, { color: "#ffffff", opacity: 0.9, marginTop: 2 })}>Community profile · {type} · {m.ctx.v - 4}–{m.ctx.v} American Community Survey{cmp ? ` · ${cmp.label} in orange` : ""}</Text>
      </View>
      <View style={{ position: "absolute", right: M + qr + 8, top: 0, height: HEAD, width: 170, justifyContent: "center", alignItems: "flex-end" }}>
        <Text style={body(8.4, { color: "#ffffff", fontWeight: 600, textAlign: "right", lineHeight: 1.25 })}>Scan for the full, live profile</Text>
        <Text style={body(6.6, { color: "#ffffff", opacity: 0.8, textAlign: "right", lineHeight: 1.25 })}>every indicator, any map, trends and comparisons</Text>
      </View>
      <Link src={url} style={{ position: "absolute", right: M, top: 5, width: qr, height: qr }}><Qr url={url} size={qr} /></Link>

      <View style={{ position: "absolute", left: M, top: tilesTop, width: bw, flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {m.tiles.map((t) => <TileView key={t.label} t={t} w={tw} h={TILE_H} />)}
      </View>

      {m.cells.map(({ panel, col, row, cs, rs }) => (
        <View key={`${col}-${row}`} style={{ position: "absolute", left: M + col * (cw + GAP), top: gridTop + row * (ch + GAP) }}>
          <PanelView panel={panel} w={cw * cs + GAP * (cs - 1)} h={ch * rs + GAP * (rs - 1)} />
        </View>
      ))}

      <View style={{ position: "absolute", left: M, right: M, top: H - FOOT, height: FOOT, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 0.75, borderTopColor: C.border }}>
        <Link src={url} style={body(6.8, { color: C.sel })}>{url}</Link>
        <Text style={body(6.8, { color: C.muted })}>{site.title} · {m.generated}</Text>
      </View>
    </View>
  );
}

export function PosterDocument({ m }: { m: PosterModel }): ReactElement<DocumentProps> {
  const { sel, cmp } = m.ctx;
  const { W, H } = SHEET[m.orientation];
  return (
    <Document title={`${sel.label}${cmp ? ` and ${cmp.label}` : ""}: community profile poster`} author={site.organization || site.title} subject="Community profile poster" creator={site.title} language="en-US">
      <Page size={[W, H]} style={{ backgroundColor: C.white }}><Poster m={m} /></Page>
    </Document>
  );
}
