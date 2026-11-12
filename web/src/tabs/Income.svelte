<script lang="ts">
  import RateCard from "../components/RateCard.svelte";
  import ShareCard from "../components/ShareCard.svelte";
  import SubTabs from "../components/SubTabs.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { app } from "../lib/app.svelte";
  import { SPECS } from "../lib/specs";

  const SUBS = [{ id: "income", label: "Income" }, { id: "poverty", label: "Poverty and work" }];
  let sub = $state("income");
</script>

<div class="tab">
  {#if sub === "income"}
    <Tiles ids={["median_income", "low_income", "high_income", "snap"]} />
  {:else}
    <Tiles ids={["poverty", "unemployment", "labor_force", "snap"]} />
  {/if}
  <SubTabs items={SUBS} bind:active={sub} />
  {#if sub === "income"}
    <div class="g" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <ShareCard title="Household income" spec={SPECS.income} note="Dollars of each year, not adjusted for inflation." style="grid-row:1 / span 2" />
      <TrendCard title="Median household income" id="median_income" />
      <TrendCard title="Households on SNAP or public assistance" id="snap" />
      <TrendCard title="Households under $25,000" id="low_income" />
      <TrendCard title="Households at $100,000 or more" id="high_income" />
    </div>
  {:else}
    <div class="g" style="grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1fr)">
      <ShareCard title="Poverty status" spec={SPECS.poverty} />
      <RateCard title="Poverty by age" spec="povertyByAge" note="Share of each age group below the poverty level." style="grid-row:1 / span 2" />
      <ShareCard title="Industry of employed residents" spec={SPECS.residentIndustry} sort note="Where residents work, wherever the job is." style="grid-row:1 / span 2" />
      <TrendCard title="People below the poverty level" id="poverty" />
    </div>
  {/if}
</div>
