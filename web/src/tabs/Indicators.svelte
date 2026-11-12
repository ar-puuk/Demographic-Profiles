<script lang="ts">
  import DataTable from "../components/DataTable.svelte";
  import { app } from "../lib/app.svelte";
  import { indicatorValues, lodesValues } from "../lib/data";
  import { FORMATS, METHODS, fmtFlagged, fmtInt, slug, toCsv } from "../lib/format";
  import { INDICATORS } from "../lib/indicators";

  const rows = $derived.by(async () => {
    const refs = app.refs, v = app.v, db = app.db!, sel = app.selected!, cmp = app.compare, year = Math.min(v, app.lodesLatest);
    const [results, jobs] = await Promise.all([Promise.all(INDICATORS.map((ind) => indicatorValues(db, ind, refs, v))), lodesValues(db, "wac", refs, year)]);
    const cell = (ind: (typeof INDICATORS)[number], map: Map<string, any>, id: string) => {
      const x = map.get(id);
      if (x?.value == null) return { value: "", moe: "", how: "" };
      const f = FORMATS[ind.format];
      return { value: fmtFlagged(f, x.value, x.flag), moe: x.moe == null ? "" : `±${f(x.moe)}`, how: METHODS[x.method as keyof typeof METHODS].label };
    };
    const out = INDICATORS.map((ind, i) => {
      const a = cell(ind, results[i], sel.id), b = cmp ? cell(ind, results[i], cmp.id) : null;
      return { group: ind.group, indicator: ind.label, area: sel.label, value: a.value, moe: a.moe, how: a.how, compare_area: cmp?.label ?? "", compare_value: b?.value ?? "", compare_moe: b?.moe ?? "", compare_how: b?.how ?? "", year: String(v) };
    });
    out.push({
      group: "Jobs", indicator: "Jobs located here", area: sel.label, value: fmtInt(jobs.get(`${sel.id}|C000`)), moe: "", how: METHODS.aggregated.label,
      compare_area: cmp?.label ?? "", compare_value: cmp ? fmtInt(jobs.get(`${cmp.id}|C000`)) : "", compare_moe: "", compare_how: cmp ? METHODS.aggregated.label : "", year: `${year} (LODES8)`,
    });
    return out;
  });

  // On screen each area is one column ("value ±margin"); the CSV keeps every field separate.
  const shown = $derived.by(async () => {
    const data = await rows;
    const join = (v: string, m: string) => (v ? (m ? `${v} ${m}` : v) : "–");
    return data.map((r) => ({
      group: r.group, indicator: r.indicator, a: join(r.value, r.moe), b: join(r.compare_value, r.compare_moe),
      how: r.how && r.compare_how && r.how !== r.compare_how ? `${r.how} / ${r.compare_how}` : r.how || r.compare_how, year: r.year,
    }));
  });

  const columns = $derived.by(() => {
    const cols: { key: string; label: string; align?: "right" }[] = [{ key: "indicator", label: "Indicator" }, { key: "a", label: app.selected?.label ?? "Value", align: "right" }];
    if (app.compare) cols.push({ key: "b", label: app.compare.label, align: "right" });
    cols.push({ key: "how", label: "How it was made" }, { key: "year", label: "Year" });
    return cols;
  });

  function download(data: Record<string, string>[]) {
    const keys = ["group", "indicator", "area", "value", "moe", "how", "compare_area", "compare_value", "compare_moe", "compare_how", "year"];
    const url = URL.createObjectURL(new Blob([toCsv(data, keys)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(app.selected?.label ?? "area")}-${app.v}-profile.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<section class="pn" style="height:100%" aria-label="All indicators">
  <div class="pn-head">
    <h3>All indicators for {app.selected?.label}, {app.v}</h3>
    {#await rows then data}<button class="btn" onclick={() => download(data)}>Download CSV</button>{/await}
  </div>
  <div class="pn-body">
    {#await rows}
      <div class="loading" aria-busy="true"></div>
    {:then}
      {#await shown then data}<DataTable {columns} rows={data} groupKey="group" caption="All indicators" />{/await}
    {:catch e}
      <p class="error" role="alert">Could not load the indicators: {e instanceof Error ? e.message : e}</p>
    {/await}
  </div>
  <p class="src">Each value is followed by its margin of error at the 90 percent confidence level, where one is published. Source: {app.acs}; jobs from LEHD LODES8.</p>
</section>
