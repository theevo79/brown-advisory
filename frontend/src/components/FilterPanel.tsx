"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { RegionInfo } from "@/lib/types";

interface FilterPanelProps {
  onSubmit: (params: {
    region: string;
    metrics: string[];
    marketCapMin?: number;
    marketCapMax?: number;
    advMin?: number;
    throughCycleYears: number;
    minYears: number;
  }) => void;
  loading?: boolean;
}

const METRIC_GROUPS = {
  valuation: [
    { id: "pe_ratio", name: "P/E Ratio" },
    { id: "pb_ratio", name: "P/B Ratio" },
    { id: "ps_ratio", name: "P/S Ratio" },
    { id: "ev_ebitda", name: "EV/EBITDA" },
    { id: "ev_sales", name: "EV/Sales" },
    { id: "ev_ebit", name: "EV/EBIT" },
    { id: "ev_fcf", name: "EV/FCF" },
  ],
  through_cycle: [
    { id: "cape", name: "CAPE" },
    { id: "cape_real", name: "CAPE (Real)" },
    { id: "ev_nopat_avg", name: "EV/NOPAT Avg" },
    { id: "ev_ebit_avg", name: "EV/EBIT Avg" },
  ],
  profitability: [
    { id: "roe", name: "ROE" },
    { id: "roa", name: "ROA" },
    { id: "ebit_margin", name: "EBIT Margin" },
    { id: "net_margin", name: "Net Margin" },
  ],
  financial_health: [
    { id: "current_ratio", name: "Current Ratio" },
    { id: "debt_to_equity", name: "Debt/Equity" },
  ],
};

const MARKET_CAP_PRESETS = [
  { label: "All", min: undefined, max: undefined },
  { label: "Mega (>$200B)", min: 200e9, max: undefined },
  { label: "Large ($10B-$200B)", min: 10e9, max: 200e9 },
  { label: "Mid ($2B-$10B)", min: 2e9, max: 10e9 },
  { label: "Small (<$2B)", min: undefined, max: 2e9 },
];

export default function FilterPanel({ onSubmit, loading }: FilterPanelProps) {
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("dm_us");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["pe_ratio", "roe"]);
  const [marketCapPreset, setMarketCapPreset] = useState(0);
  const [advMin, setAdvMin] = useState<string>("");
  const [throughCycleYears, setThroughCycleYears] = useState(10);
  const [minYears, setMinYears] = useState(5);

  useEffect(() => {
    api.getRegions().then(setRegions).catch(console.error);
  }, []);

  const toggleMetric = (id: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    const preset = MARKET_CAP_PRESETS[marketCapPreset];
    onSubmit({
      region: selectedRegion,
      metrics: selectedMetrics,
      marketCapMin: preset.min,
      marketCapMax: preset.max,
      advMin: advMin ? parseFloat(advMin) * 1e6 : undefined,
      throughCycleYears,
      minYears,
    });
  };

  return (
    <div className="ba-card mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Region */}
        <div>
          <label className="block text-sm font-medium text-ba-navy mb-2">Region</label>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Market Cap */}
        <div>
          <label className="block text-sm font-medium text-ba-navy mb-2">Market Cap</label>
          <select
            value={marketCapPreset}
            onChange={(e) => setMarketCapPreset(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
          >
            {MARKET_CAP_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* ADV */}
        <div>
          <label className="block text-sm font-medium text-ba-navy mb-2">Min ADV ($M/day)</label>
          <input
            type="number"
            value={advMin}
            onChange={(e) => setAdvMin(e.target.value)}
            placeholder="e.g. 1"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
          />
        </div>

        {/* Through-cycle config */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-ba-navy mb-2">Avg Years</label>
            <select
              value={throughCycleYears}
              onChange={(e) => setThroughCycleYears(parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
            >
              {[3, 5, 7, 10].map((y) => (
                <option key={y} value={y}>{y}yr</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-ba-navy mb-2">Min Years</label>
            <select
              value={minYears}
              onChange={(e) => setMinYears(parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
            >
              {[2, 3, 5].map((y) => (
                <option key={y} value={y}>{y}yr</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-ba-navy mb-2">Metrics</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(METRIC_GROUPS).map(([group, metrics]) => (
            <div key={group}>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
                {group.replace("_", " ")}
              </p>
              <div className="space-y-1">
                {metrics.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMetrics.includes(m.id)}
                      onChange={() => toggleMetric(m.id)}
                      className="rounded border-gray-300 text-ba-accent focus:ring-ba-accent"
                    />
                    <span className={selectedMetrics.includes(m.id) ? "text-ba-navy font-medium" : "text-gray-500"}>
                      {m.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="mt-4 flex items-center gap-4">
        <button onClick={handleSubmit} disabled={loading || selectedMetrics.length === 0} className="ba-btn-primary disabled:opacity-50">
          {loading ? "Screening..." : "Run Screen"}
        </button>
        <span className="text-sm text-gray-400">
          {selectedMetrics.length} metric{selectedMetrics.length !== 1 ? "s" : ""} selected
        </span>
      </div>
    </div>
  );
}
