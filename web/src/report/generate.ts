// Entry point of the report. The PDF renderer, fonts and layout are loaded with a dynamic import the first time someone asks for a
// report, so none of it weighs on the app's initial load.
import { pdf } from "@react-pdf/renderer";
import { slug } from "../lib/format";
import { buildReport } from "./build";
import { ReportDocument } from "./Doc";
import type { Ctx, Orientation } from "./model";
import { PosterDocument } from "./Poster";
import { buildPoster } from "./posterBuild";
import { registerFonts } from "./theme";

export type { Ctx, Orientation };
/** The document is a multi-page report on US Letter; the poster is one page of 24 by 36 inches. */
export type Format = "document" | "poster";

export interface GenerateOptions { orientation: Orientation; format?: Format; progress?: (done: number, total: number, label: string) => void }

export async function generateReport(ctx: Ctx, { orientation, format = "document", progress }: GenerateOptions): Promise<{ blob: Blob; filename: string; pages: number }> {
  registerFonts();
  const names = [ctx.sel, ...(ctx.cmp ? [ctx.cmp] : [])].map((r) => slug(r.label)).join("-vs-");
  if (format === "poster") {
    const poster = await buildPoster(ctx, { orientation, progress });
    if (ctx.signal?.aborted) throw new DOMException("Report cancelled", "AbortError");
    progress?.(1, 1, "Laying out the poster");
    const blob = await pdf(PosterDocument({ m: poster })).toBlob();
    return { blob, filename: `Community-Profile_${names}_${ctx.v}_poster_${orientation}.pdf`, pages: 1 };
  }
  const model = await buildReport(ctx, { orientation, progress });
  if (ctx.signal?.aborted) throw new DOMException("Report cancelled", "AbortError");
  progress?.(1, 1, "Laying out pages");
  const blob = await pdf(ReportDocument({ m: model })).toBlob();
  return { blob, filename: `Community-Profile_${names}_${ctx.v}_${orientation}.pdf`, pages: model.pages.length + 1 };
}
