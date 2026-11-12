<script lang="ts">
  // The app mark: a hexagon holding three rising bars. It takes its colours from the theme, so it needs no dark variant.
  // Keep the geometry in step with public/favicon.svg and scripts/make-logo.py.
  let { size = 30 }: { size?: number } = $props();
</script>

<svg class="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <path d="M16 1 29 8.5v15L16 31 3 23.5v-15z" fill="var(--accent)" />
  <g fill="var(--accent-text)">
    <rect x="9.5" y="17" width="3.5" height="5" rx=".8" />
    <rect x="14.25" y="13.5" width="3.5" height="8.5" rx=".8" />
    <rect x="19" y="10" width="3.5" height="12" rx=".8" />
  </g>
</svg>

<style>
  .logo-mark { flex: none; display: block; }
</style>
