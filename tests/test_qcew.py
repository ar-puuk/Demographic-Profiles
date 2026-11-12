"""The committed QCEW files: the state benchmark exists and agrees with its counties."""
import duckdb
import pytest

from pipeline.paths import DATA
from pipeline.util import load_config


def q(sql: str):
    return duckdb.sql(sql.replace("{d}", (DATA / "qcew").as_posix())).fetchall()


def test_state_levels_are_configured_for_the_state_file():
    qc = load_config()["qcew"]
    assert qc["state_agglvl"] == [50, 51, 54] and qc["agglvl"] == [70, 71, 74]


def test_state_file_has_every_year_and_sector():
    years, sectors = q("SELECT count(DISTINCT year), count(DISTINCT industry) FROM '{d}/state.parquet'")[0]
    assert years == len(load_config()["qcew"]["years"]) and sectors >= 20


def test_state_total_employment_matches_its_counties_each_year():
    rows = q("""
        SELECT s.year, s.value, c.total FROM '{d}/state.parquet' s
        JOIN (SELECT year, sum(value) AS total FROM '{d}/county.parquet'
              WHERE ownership = '0' AND industry = '10' AND variable = 'employment' GROUP BY year) c USING (year)
        WHERE s.ownership = '0' AND s.industry = '10' AND s.variable = 'employment'""")
    assert len(rows) == len(load_config()["qcew"]["years"])
    for year, state, counties in rows:
        assert state == pytest.approx(counties, rel=0.001), year      # BLS rounds each county, so allow a rounding gap
