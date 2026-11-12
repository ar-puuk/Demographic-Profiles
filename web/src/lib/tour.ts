// The guided tour of the homepage (Driver.js, loaded on demand). It offers itself on every visit to the overview until the visitor
// chooses "Don't show this again", which is remembered on this device; "Take a tour" in the navbar clears that choice and starts
// it again. Skip, Escape and the last step's Done only close it for this visit. The tour points at controls and changes nothing,
// except that the topic-tabs step opens the People tab (they are not on the overview) and the tour then returns to the overview.
import { tick, untrack } from "svelte";
import { app } from "./app.svelte";

const KEY = "utah-profiles-tour-off";

type Step = { tab: "overview" | "people"; target: string; title: string; text: string; side?: "top" | "bottom" | "left" | "right" };

const STEPS: Step[] = [
  { tab: "overview", target: '[data-tour="search"]', title: "Pick an area", text: "Search or browse counties, cities, regions and more. Everything on the page follows the area you choose.", side: "bottom" },
  { tab: "overview", target: '[data-tour="map"]', title: "The overview map", text: "Every area of the same kind, shaded by one variable. Hover for the value and its trend, click to select, hold Shift and click to compare.", side: "right" },
  { tab: "overview", target: '[data-tour="map-layer"]', title: "Census tracts", text: "This is not a geography filter. Turn it on to draw the same variable for the small census tracts instead of whole counties or cities, for a finer look.", side: "bottom" },
  { tab: "overview", target: '[data-tour="map-vars"]', title: "Change what it shows", text: "Choose the variable that colours the map. Add a second one to see where two things overlap.", side: "top" },
  { tab: "overview", target: '[data-tour="map-expand"]', title: "Expand the map", text: "Open the map full screen for a closer look. Press Esc or the same button to come back.", side: "left" },
  { tab: "overview", target: '[data-tour="rail"]', title: "Categories", text: "Move between people, households, housing, income, education, jobs, commuting and the full indicator table.", side: "right" },
  { tab: "people", target: '[data-tour="subtabs"]', title: "Topics within a category", text: "Each category splits into topics. This is the People tab; the others work the same way.", side: "bottom" },
  { tab: "people", target: '[data-tour="compare"]', title: "Compare two areas", text: "Put a second area next to this one in every chart, table and map. The year slider and Play sit on the right.", side: "bottom" },
  { tab: "people", target: '[data-tour="report"]', title: "Download a PDF report", text: "A designed profile of the chosen area, as a letter-size document or a 24 × 36 in poster.", side: "bottom" },
];

export const tourOff = (): boolean => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};
const setOff = (off: boolean) => {
  try { off ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch { /* the choice just is not remembered */ }
};

const visible = (el: Element | null): el is HTMLElement => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const settle = async () => { await tick(); await new Promise<void>((r) => requestAnimationFrame(() => r())); };
async function showTab(tab: Step["tab"]) {
  if (app.page) app.page = "";
  if (app.tab !== tab) { app.go(tab); await settle(); }
}

let running = false;

export async function startTour() {
  if (running || !app.ready) return;
  running = true;
  try {
    const [{ driver }] = await Promise.all([import("driver.js"), import("driver.js/dist/driver.css")]);
    app.picker = null;
    await showTab("overview");
    window.scrollTo?.(0, 0);
    await settle();
    // Overview steps whose target is not on screen (hidden at this width, say) are left out. The People steps are always kept: the
    // topic tabs, the compare button and the report button exist whenever that tab is open.
    const live = STEPS.filter((s) => s.tab !== "overview" || visible(document.querySelector(s.target)));
    if (!live.length) return;

    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let finished!: () => void;
    const done = new Promise<void>((r) => (finished = r));
    // A click while a step change is under way is ignored, and a step change that finishes after the tour was closed does nothing.
    let moving = false, closed = false;
    // Every way out (Skip, Don't show again, Done, the close button, Esc, a click on the dimmed page) ends up here.
    const close = () => { if (closed) return; closed = true; clearInterval(watch); d.destroy(); finished(); };
    const go = async (i: number) => {
      if (moving || closed) return;
      moving = true;
      try {
        await showTab(live[i].tab);
        if (!closed) d.drive(i);
      } finally { moving = false; }
    };
    // Content above a target can still change height after the step opens (the tab's figures load), which would leave the highlight a
    // few pixels off, so the target is watched and the highlight re-measured whenever it moves.
    let last = "";
    const watch = setInterval(() => {
      const i = d.getActiveIndex();
      const r = i == null ? null : document.querySelector(live[i].target)?.getBoundingClientRect();
      const now = r ? [r.top, r.left, r.width, r.height].map((n) => n.toFixed(1)).join() : "";
      if (now !== last) { last = now; if (r) d.refresh(); }
    }, 150);
    const d = driver({
      animate: !calm, smoothScroll: !calm, allowClose: true, allowKeyboardControl: true, overlayOpacity: 0.55, stagePadding: 6, stageRadius: 10,
      showProgress: true, progressText: "{{current}} of {{total}}", nextBtnText: "Next", prevBtnText: "Back", doneBtnText: "Done",
      steps: live.map((s) => ({ element: s.target, popover: { title: s.title, description: s.text, side: s.side ?? "bottom", align: "start" as const } })),
      onNextClick: () => { const i = d.getActiveIndex() ?? 0; if (moving) return; if (i >= live.length - 1) close(); else void go(i + 1); },
      onPrevClick: () => { const i = d.getActiveIndex() ?? 0; if (i > 0) void go(i - 1); },
      onPopoverRender: (pop) => {
        const row = document.createElement("div");
        row.className = "tour-opt";
        const skip = document.createElement("button");
        skip.type = "button";
        skip.textContent = "Skip tour";
        skip.onclick = close;
        const never = document.createElement("button");
        never.type = "button";
        never.textContent = "Don't show this again";
        never.onclick = () => { setOff(true); close(); };
        row.append(skip, never);
        pop.wrapper.append(row);
      },
      onDestroyStarted: close,
    });
    d.drive(0);
    await done;
    await showTab("overview");
  } catch (e) {
    console.error("The tour could not start", e);
  } finally {
    running = false;
  }
}

// "Take a tour": clears the "don't show again" choice, so the tour is offered on every visit again, and starts it now.
export function replayTour() {
  setOff(false);
  void startTour();
}

// Called once the app is ready. Offers the tour on the overview only, unless this device opted out. Returns a cleanup for the effect.
export function autoStartTour(): () => void {
  return untrack(() => {
    if (tourOff() || app.tab !== "overview" || app.page) return () => {};
    const t = setTimeout(() => { if (!app.picker && app.tab === "overview" && !app.page) void startTour(); }, 900);
    return () => clearTimeout(t);
  });
}
