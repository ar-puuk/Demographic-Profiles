"""Command line entry point: `uv run profiles <command>`."""
from __future__ import annotations

import argparse

from dotenv import load_dotenv

from .paths import ROOT


def main(argv: list[str] | None = None) -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(prog="profiles", description="Utah community profiles data pipeline")
    parser.add_argument("command", choices=["boundaries", "audit", "validate", "acs", "geographies", "crosswalk", "aggregate", "pep", "lodes", "qcew", "qa", "export", "all"],
                        help="boundaries: snapshot ArcGIS boundaries; audit: compare with counties; "
                             "validate: check ACS tables; acs: pull ACS tables; geographies: build the "
                             "geography registry; crosswalk: Decennial block weights and block group shares; "
                             "aggregate: ACS tables for WFRC areas; pep: annual population estimates; lodes: jobs, workers and commute flows; "
                             "qcew: county employment and wages by industry; "
                             "qa: crosswalk checks; export: web-ready map geometry; all: everything")
    parser.add_argument("--refresh", action="store_true", help="ignore cached raw downloads and fetch again")
    args = parser.parse_args(argv)

    # Imported here so `--help` stays fast and a missing key only matters for stages that need it.
    from . import acs, aggregate, audit, boundaries, crosswalk, export, geographies, lodes, pep, qa, qcew

    con = None
    if args.command in ("boundaries", "all"):
        con = boundaries.run(args.refresh)
    if args.command in ("audit", "all"):
        audit.run(args.refresh, con)
    if args.command == "validate":
        acs.validate(args.refresh)
    if args.command in ("acs", "all"):
        acs.run(args.refresh)
    if args.command in ("geographies", "all"):
        geographies.run(args.refresh)
    if args.command in ("crosswalk", "all"):
        crosswalk.run(args.refresh)
    if args.command in ("aggregate", "all"):
        aggregate.run(args.refresh)
    if args.command in ("pep", "all"):
        pep.run(args.refresh)
    if args.command in ("lodes", "all"):
        lodes.run(args.refresh)
    if args.command in ("qcew", "all"):
        qcew.run(args.refresh)
    if args.command in ("export", "all"):
        export.run(args.refresh)
    if args.command in ("qa", "all"):
        qa.run(args.refresh)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
