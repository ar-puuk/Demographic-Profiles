<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { theme } from "../lib/theme.svelte";
  import Logo from "./Logo.svelte";
  import { site } from "../lib/site";
  import Icon from "./Icon.svelte";
  import ReportButton from "./ReportButton.svelte";
  import { replayTour } from "../lib/tour";

  const themeName = $derived(theme.pref === "system" ? "Auto" : theme.pref === "light" ? "Light" : "Dark");
  const themeIcon = $derived(theme.pref === "system" ? "monitor" : theme.pref === "light" ? "sun" : "moon");
</script>

<header class="nav">
  <Logo size={30} />
  <h1 class="brand">{site.title}</h1>
  <span class="draft" title="Not every number has been checked yet" aria-label="Draft: not every number has been checked yet">DRAFT</span>
  <button class="field-btn" id="area-field" data-tour="search" aria-haspopup="dialog" aria-expanded={app.picker === "area"} onclick={() => (app.picker = app.picker === "area" ? null : "area")}>
    <Icon name="search" size={15} />
    {#if app.selected}<span class="chip-area"><i class="dot sel"></i>{app.selected.label}</span>{/if}
    <span class="grow">Search or browse areas</span>
    <Icon name="chevron" size={15} />
  </button>
  <div class="spacer"></div>
  <ReportButton />
  <button class="btn-ghost" onclick={replayTour} title="Take a quick tour of the profiles"><Icon name="help" size={15} /><span>Tour</span></button>
  <button class="btn-ghost" onclick={() => (app.page = app.page === "methods" ? "" : "methods")}><Icon name="info" size={15} /><span>{app.page === "methods" ? "Back to the data" : "Documentation"}</span></button>
  <button class="btn-ghost" onclick={() => theme.cycle()} aria-label="Theme: {themeName}" title="Theme: {themeName} (click to change)"><Icon name={themeIcon} size={15} /></button>
  <a class="btn-ghost" href="https://github.com/ar-puuk/Demographic-Profiles" target="_blank" rel="noopener" aria-label="Source code and data on GitHub" title="Source code and data on GitHub"><Icon name="github" size={15} /></a>
</header>
