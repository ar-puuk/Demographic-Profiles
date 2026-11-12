// Names and defaults from data/meta/app.json (written by the pipeline's export step from config/config.yml), so nothing here is
// specific to one state or organisation. The values below are only what shows before that file loads.
import { dataUrl } from "./db";

export interface Site {
  title: string;
  organization: string;
  default_type: string;
  defaults: Record<string, string>;
  benchmarks: string[];
  outside_id: string;
  state: { abbr: string; fips: string; name: string };
}

export const site: Site = {
  title: "Community Profiles", organization: "", default_type: "state", defaults: {}, benchmarks: [], outside_id: "other", state: { abbr: "", fips: "", name: "" },
};

export async function loadSite(): Promise<void> {
  Object.assign(site, await (await fetch(dataUrl("meta/app.json"))).json());
}
