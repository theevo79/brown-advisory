"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import HeatmapGrid from "@/components/HeatmapGrid";
import LoadingSpinner from "@/components/LoadingSpinner";
import MarketCapSlider from "@/components/MarketCapSlider";
import { api } from "@/lib/api";
import { formatNumber, formatCurrency } from "@/lib/formatters";
import { FOCUS_PRESETS, FOCUS_METRICS } from "@/lib/constants";
import type { RegionInfo, PortfolioHolding } from "@/lib/types";

const METRICS = [
  { id: "cape", name: "CAPE" },
  { id: "pe_ratio", name: "P/E Ratio" },
  { id: "pb_ratio", name: "P/B Ratio" },
  { id: "ev_ebitda", name: "EV/EBITDA" },
  { id: "roe", name: "ROE" },
  { id: "ev_ebit_avg", name: "EV/EBIT Avg" },
];

const MOMENTUM_PERIODS = [
  { id: "", name: "None" },
  { id: "1m", name: "1 Month" },
  { id: "3m", name: "3 Months" },
  { id: "6m", name: "6 Months" },
  { id: "12m", name: "12 Months" },
];

type SortKey = "ticker" | "company_name" | "country" | "sector" | "market_cap" | "pe_ratio" | "pb_ratio" | "cape" | "roe" | "net_margin";
type SortDir = "asc" | "desc";

export default function HeatmapPage() {
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [region, setRegion] = useState("global_ex_us");
  const [metric, setMetric] = useState("pe_ratio");
  const [momentumPeriod, setMomentumPeriod] = useState("");
  const [colorMode, setColorMode] = useState<"metric" | "momentum">("metric");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [portfolioHeatmapData, setPortfolioHeatmapData] = useState<any>(null);
  const [focusMetric, setFocusMetric] = useState("");
  const [focusPreset, setFocusPreset] = useState(0);
  const [mcapMin, setMcapMin] = useState<number | undefined>(1e9);
  const [mcapMax, setMcapMax] = useState<number | undefined>(undefined);

  // Portfolio state
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioName, setPortfolioName] = useState("");

  // Stock table state
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [portfolioOnly, setPortfolioOnly] = useState(false);

  const handleMcapChange = useCallback((min: number | undefined, max: number | undefined) => {
    setMcapMin(min);
    setMcapMax(max);
  }, []);

  useEffect(() => {
    api.getRegions().then(setRegions).catch(console.error);
    // Auto-load BAIV portfolio
    (async () => {
      try {
        const portfolios = await api.listPortfolios();
        const baiv = portfolios.find((p) => p.name.includes("BAIV"));
        if (baiv) {
          const portfolio = await api.getPortfolio(baiv.id);
          setPortfolioHoldings(portfolio.holdings);
          setPortfolioName(baiv.name);
        }
      } catch {}
    })();
  }, []);

  // Build portfolio ticker set for highlighting (match both "AAPL.US" and "AAPL" formats)
  const portfolioTickers = useMemo(() => {
    const set = new Set<string>();
    for (const h of portfolioHoldings) {
      set.add(h.ticker);                          // "AAPL.US"
      set.add(h.ticker.split(".")[0]);             // "AAPL"
    }
    return set;
  }, [portfolioHoldings]);

  // Flatten all companies from heatmap data for the stock table
  const allStockRows = useMemo(() => {
    if (!heatmapData?.companies) return [];
    const rows: any[] = [];
    const seen = new Set<string>();
    for (const key of Object.keys(heatmapData.companies)) {
      const [country, ...sectorParts] = key.split("_");
      const sector = sectorParts.join("_");
      for (const c of heatmapData.companies[key]) {
        if (seen.has(c.ticker)) continue;
        seen.add(c.ticker);
        rows.push({
          ticker: c.ticker,
          company_name: c.company_name,
          country,
          sector,
          market_cap: c.market_cap,
          pe_ratio: c.pe_ratio,
          pb_ratio: c.pb_ratio,
          cape: c.cape,
          roe: c.roe,
          net_margin: c.net_margin,
          inPortfolio: portfolioTickers.has(c.ticker),
        });
      }
    }
    return rows;
  }, [heatmapData, portfolioTickers]);

  // Sorted + filtered rows
  const displayRows = useMemo(() => {
    let rows = portfolioOnly ? allStockRows.filter((r) => r.inPortfolio) : allStockRows;
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [allStockRows, sortKey, sortDir, portfolioOnly]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const fp = FOCUS_PRESETS[focusPreset];
      const hasFocus = focusMetric && fp.value !== "none";

      const marketRequest = {
        region,
        metric,
        through_cycle_years: 10,
        min_years: 5,
        market_cap_min: mcapMin,
        market_cap_max: mcapMax,
        momentum_period: momentumPeriod || undefined,
        ...(hasFocus && focusMetric
          ? {
              valuation_metric: focusMetric,
              valuation_percentile_min: fp.min,
              valuation_percentile_max: fp.max,
            }
          : {}),
      };

      // Fire both calls in parallel if we have portfolio holdings
      if (portfolioHoldings.length > 0) {
        const [marketResult, portfolioResult] = await Promise.all([
          api.getMarketHeatmap(marketRequest),
          api.getPortfolioHeatmap(
            portfolioHoldings.map((h) => ({ ticker: h.ticker, weight: h.weight })),
            metric,
            10,
            5,
            momentumPeriod || undefined
          ),
        ]);
        setHeatmapData(marketResult);
        setPortfolioHeatmapData(portfolioResult);
      } else {
        const marketResult = await api.getMarketHeatmap(marketRequest);
        setHeatmapData(marketResult);
        setPortfolioHeatmapData(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate heatmap");
      setHeatmapData(null);
      setPortfolioHeatmapData(null);
    } finally {
      setLoading(false);
    }
  };

  const hasPortfolio = portfolioHeatmapData && portfolioHeatmapData.countries?.length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ba-navy">Heatmap</h1>
        <p className="text-gray-500 mt-1">
          Country × Sector matrix with momentum-based conditional formatting.
          {portfolioName && (
            <span className="ml-2 px-2 py-0.5 bg-ba-navy text-white text-xs rounded">
              Portfolio: {portfolioName} ({portfolioHoldings.length} holdings)
            </span>
          )}
        </p>
      </div>

      {/* Controls */}
      <div className="ba-card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">Region</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
            >
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">Momentum Period</label>
            <select
              value={momentumPeriod}
              onChange={(e) => setMomentumPeriod(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
            >
              {MOMENTUM_PERIODS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">Color By</label>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as "metric" | "momentum")}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
              disabled={!momentumPeriod}
            >
              <option value="metric">Metric Value</option>
              <option value="momentum">Momentum Percentile</option>
            </select>
          </div>

          <button onClick={handleGenerate} disabled={loading} className="ba-btn-primary disabled:opacity-50">
            {loading ? "Generating..." : "Generate Heatmap"}
          </button>
        </div>

        {/* Market Cap Range */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <label className="block text-sm font-medium text-ba-navy mb-2">Market Cap Range</label>
          <div className="max-w-md">
            <MarketCapSlider
              minValue={mcapMin || 100e6}
              maxValue={mcapMax || null}
              onChange={handleMcapChange}
            />
          </div>
        </div>

        {/* Focus filter */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-ba-navy">Focus:</label>
            <select
              value={focusMetric}
              onChange={(e) => setFocusMetric(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-ba-accent outline-none"
            >
              <option value="">None</option>
              {FOCUS_METRICS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {focusMetric && (
              <div className="flex gap-1">
                {FOCUS_PRESETS.map((p, i) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setFocusPreset(i)}
                    className={`px-2.5 py-1 text-xs rounded ${
                      focusPreset === i
                        ? "bg-ba-navy text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Color legend */}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          <span>Color scale:</span>
          <span className="bg-green-600 text-white px-2 py-0.5 rounded">
            {colorMode === "momentum" ? "Top 20%" : "Cheapest"}
          </span>
          <span className="bg-green-200 text-green-900 px-2 py-0.5 rounded">
            {colorMode === "momentum" ? "60-80%" : "Cheap"}
          </span>
          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Neutral</span>
          <span className="bg-orange-200 text-orange-900 px-2 py-0.5 rounded">
            {colorMode === "momentum" ? "20-40%" : "Expensive"}
          </span>
          <span className="bg-red-500 text-white px-2 py-0.5 rounded">
            {colorMode === "momentum" ? "Bottom 20%" : "Most Expensive"}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && <LoadingSpinner message="Generating heatmap..." />}

      {/* Heatmaps — stacked vertically */}
      {!loading && heatmapData && heatmapData.countries.length > 0 && (
        <div className="space-y-6 mb-6">
          {/* Market heatmap */}
          <div className="ba-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">
                {heatmapData.total_companies} companies across {heatmapData.countries.length} countries and {heatmapData.sectors.length} sectors
                {focusMetric && FOCUS_PRESETS[focusPreset].value !== "none" && (
                  <span className="ml-2 px-2 py-0.5 bg-ba-navy text-white text-xs rounded">
                    Focus: {FOCUS_METRICS.find((m) => m.id === focusMetric)?.name} — {FOCUS_PRESETS[focusPreset].label}
                  </span>
                )}
              </p>
            </div>
            <HeatmapGrid
              title={hasPortfolio ? "Market" : undefined}
              countries={heatmapData.countries}
              sectors={heatmapData.sectors}
              matrix={heatmapData.matrix}
              counts={heatmapData.counts}
              companies={heatmapData.companies}
              metric={metric}
              momentumMatrix={heatmapData.momentum_matrix}
              colorMode={colorMode}
            />
          </div>

          {/* Portfolio heatmap */}
          {hasPortfolio && (
            <div className="ba-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">
                  {portfolioHeatmapData.total_companies} holdings across {portfolioHeatmapData.countries.length} countries and {portfolioHeatmapData.sectors.length} sectors
                </p>
              </div>
              <HeatmapGrid
                title={`Portfolio (${portfolioName})`}
                countries={portfolioHeatmapData.countries}
                sectors={portfolioHeatmapData.sectors}
                matrix={portfolioHeatmapData.matrix}
                counts={portfolioHeatmapData.counts}
                companies={portfolioHeatmapData.companies}
                metric={metric}
                momentumMatrix={portfolioHeatmapData.momentum_matrix}
                colorMode={colorMode}
                universeCompanies={heatmapData?.companies}
              />
            </div>
          )}
        </div>
      )}

      {!loading && heatmapData && heatmapData.countries.length === 0 && (
        <div className="ba-card text-center py-12 text-gray-400 mb-6">
          No data available for this region and metric combination.
        </div>
      )}

      {/* Stock Details Table */}
      {!loading && allStockRows.length > 0 && (
        <div className="ba-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg font-semibold text-ba-navy">
              Stock Details
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({displayRows.length} {portfolioOnly ? "portfolio" : "total"} stocks)
              </span>
            </h3>
            {portfolioTickers.size > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={portfolioOnly}
                  onChange={(e) => setPortfolioOnly(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Portfolio only
              </label>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b-2 border-ba-navy">
                  {([
                    { key: "ticker" as SortKey, label: "Ticker", align: "left" },
                    { key: "company_name" as SortKey, label: "Company", align: "left" },
                    { key: "country" as SortKey, label: "Country", align: "left" },
                    { key: "sector" as SortKey, label: "Sector", align: "left" },
                    { key: "market_cap" as SortKey, label: "Mkt Cap", align: "right" },
                    { key: "pe_ratio" as SortKey, label: "P/E", align: "right" },
                    { key: "pb_ratio" as SortKey, label: "P/B", align: "right" },
                    { key: "cape" as SortKey, label: "CAPE", align: "right" },
                    { key: "roe" as SortKey, label: "ROE", align: "right" },
                    { key: "net_margin" as SortKey, label: "Net Margin", align: "right" },
                  ]).map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-2 ${col.align === "right" ? "text-right" : "text-left"} text-ba-navy font-semibold cursor-pointer hover:bg-gray-50 select-none whitespace-nowrap`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}{sortIndicator(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr
                    key={row.ticker}
                    className={`border-b border-gray-100 hover:bg-ba-light ${
                      row.inPortfolio ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono font-medium text-ba-navy whitespace-nowrap">
                      {row.ticker}
                      {row.inPortfolio && (
                        <span className="ml-1 inline-block w-2 h-2 rounded-full bg-ba-accent" title="In portfolio" />
                      )}
                    </td>
                    <td className="px-3 py-1.5 max-w-[180px] truncate" title={row.company_name}>{row.company_name}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{row.country}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{row.sector}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{row.market_cap != null ? formatCurrency(row.market_cap) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{row.pe_ratio != null ? formatNumber(row.pe_ratio, 1) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{row.pb_ratio != null ? formatNumber(row.pb_ratio, 1) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{row.cape != null ? formatNumber(row.cape, 1) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{row.roe != null ? formatNumber(row.roe, 1) + "%" : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{row.net_margin != null ? formatNumber(row.net_margin, 1) + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
