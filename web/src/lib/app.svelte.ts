// Application state: the chosen area, comparison and year, the lookups loaded once, and the URL hash that mirrors them.
import { geojson, lodesYears, qcewYears, registry, acsVintages, type Geography } from "./data";
import { openDb, type Db } from "./db";
import { formatHash, parseHash } from "./hash";
import { GEO_TYPES, type GeoType } from "./indicators";
import { loadSite, site } from "./site";
import type { AreaRef } from "./specs";

export const TABS = [
  { id: "overview", label: "Overview", icon: "layout" },
  { id: "people", label: "People", icon: "users" },
  { id: "households", label: "Households", icon: "home-users" },
  { id: "housing", label: "Housing", icon: "house" },
  { id: "income", label: "Income and poverty", icon: "wallet" },
  { id: "education", label: "Education", icon: "cap" },
  { id: "jobs", label: "Jobs and economy", icon: "briefcase" },
  { id: "commute", label: "Commute", icon: "route" },
  { id: "indicators", label: "Indicators", icon: "table" },
] as const;

export const displayName = (g: Geography) => (g.geo_type === "state" ? site.state.name : g.geo_name);

class App {
  db = $state.raw<Db>();
  geos = $state.raw<Geography[]>([]);
  vintages = $state.raw<number[]>([]);
  lodesYears = $state.raw<number[]>([]);
  qcewYears = $state.raw<number[]>([]);
  error = $state("");
  type = $state<GeoType>("state");
  id = $state("");
  cmp = $state("");
  v = $state(0);
  tab = $state("overview");
  sub = $state(""); // the sub-tab inside the current tab; empty means its first
  page = $state("");
  picker = $state<null | "area" | "compare">(null);

  byId = $derived(new Map(this.geos.map((g) => [g.geo_id, g])));
  selectedGeo = $derived(this.byId.get(this.id));
  compareGeo = $derived(this.cmp ? this.byId.get(this.cmp) : undefined);
  selected = $derived<AreaRef | undefined>(this.selectedGeo && { id: this.selectedGeo.geo_id, type: this.selectedGeo.geo_type, label: displayName(this.selectedGeo) });
  compare = $derived<AreaRef | undefined>(this.compareGeo && { id: this.compareGeo.geo_id, type: this.compareGeo.geo_type, label: displayName(this.compareGeo) });
  refs = $derived<AreaRef[]>([this.selected, this.compare].filter((r): r is AreaRef => !!r));
  typeInfo = $derived(GEO_TYPES.find((t) => t.id === this.type)!);
  years = $derived(this.vintages);
  latestVintage = $derived(this.vintages.at(-1) ?? 0);
  lodesLatest = $derived(this.lodesYears.at(-1) ?? 0);
  qcewLatest = $derived(this.qcewYears.at(-1) ?? 0);
  ready = $derived(!!this.db && this.geos.length > 0 && this.v > 0);
  // The ACS 5-year estimate behind the year shown, worded for source lines.
  acs = $derived(`${this.v - 4}–${this.v} American Community Survey`);
  names = $derived(new Map(this.geos.map((g) => [g.geo_id, g.geo_name])));

  // Load steps finished so far, shown on the splash screen.
  loaded = $state<string[]>([]);

  async init() {
    const done = <T,>(step: string) => (x: T) => { this.loaded = [...this.loaded, step]; return x; };
    try {
      this.db = await openDb();
      this.loaded = ["engine"];
      await loadSite();
      this.loaded = [...this.loaded, "site"];
      const [geos, vintages, ly, qy] = await Promise.all([
        registry(this.db).then(done("areas")),
        acsVintages(this.db).then(done("census")),
        lodesYears(this.db).then(done("jobs")),
        qcewYears(this.db).then(done("wages")),
      ]);
      this.geos = geos;
      this.vintages = vintages;
      this.lodesYears = ly;
      this.qcewYears = qy;
      this.readHash();
      window.addEventListener("hashchange", () => this.readHash());
      geojson("state"); // warm the cache for the silhouette
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  readHash() {
    const h = parseHash(location.hash);
    const geo = h.id ? this.byId.get(h.id) : undefined;
    const type = (geo?.geo_type ?? (GEO_TYPES.some((t) => t.id === h.type) ? h.type : site.default_type)) as GeoType;
    this.type = type;
    this.id = geo?.geo_id ?? this.byId.get(site.defaults[type] ?? "")?.geo_id ?? this.geos.find((g) => g.geo_type === type)?.geo_id ?? "";
    this.cmp = h.cmp && h.cmp !== this.id && this.byId.has(h.cmp) ? h.cmp : "";
    this.tab = TABS.some((t) => t.id === h.tab) ? h.tab! : "overview";
    this.sub = h.sub ?? "";
    this.page = h.page ?? "";
    this.v = this.years.includes(h.v ?? 0) ? h.v! : this.years.at(-1) ?? this.latestVintage;
  }

  writeHash() {
    const next = formatHash({ type: this.type, id: this.id, cmp: this.cmp, v: this.v, tab: this.tab, sub: this.sub, page: this.page });
    if (next !== location.hash) history.replaceState(null, "", next);
  }

  // Switch the main tab; each tab opens on its first sub-tab.
  go(tab: string) {
    if (tab === this.tab) return;
    this.tab = tab;
    this.sub = "";
  }

  select(id: string) {
    const geo = this.byId.get(id);
    if (!geo) return;
    this.type = geo.geo_type;
    this.id = id;
    if (this.cmp === id) this.cmp = "";
    if (!this.years.includes(this.v)) this.v = this.years.at(-1) ?? this.v;
  }

  setCompare(id: string) {
    this.cmp = id === this.id ? "" : id;
    if (!this.years.includes(this.v)) this.v = this.years.at(-1) ?? this.v;
  }
}

export const app = new App();
