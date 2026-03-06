"use client";

import { useState, useEffect } from "react";
import HeatmapGrid from "@/components/HeatmapGrid";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import type { RegionInfo } from "@/lib/types";

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

export default function HeatmapPage() {
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [region, setRegion] = useState("dm_us");
  const [metric, setMetric] = useState("pe_ratio");
  const [momentumPeriod, setMomentumPeriod] = useState("");
  const [colorMode, setColorMode] = useState<"metric" | "momentum">("metric");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);

  useEffect(() => {
    api.getRegions().then(setRegions).catch(console.error);
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getMarketHeatmap({
        region,
        metric,
        through_cycle_years: 10,
        min_years: 5,
        momentum_period: momentumPeriod || undefined,
      });
      setHeatmapData(response);
    } catch (err: any) {
      setError(err.message || "Failed to generate heatmap");
      setHeatmapData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ba-navy">Heatmap</h1>
        <p className="text-gray-500 mt-1">Country x Sector matrix with momentum-based conditional formatting.</p>
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

      {!loading && heatmapData && heatmapData.countries.length > 0 && (
        <div className="ba-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              {heatmapData.total_companies} companies across {heatmapData.countries.length} countries and {heatmapData.sectors.length} sectors
            </p>
          </div>
          <HeatmapGrid
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
      )}

      {!loading && heatmapData && heatmapData.countries.length === 0 && (
        <div className="ba-card text-center py-12 text-gray-400">
          No data available for this region and metric combination.
        </div>
      )}
    </div>
  );
}
