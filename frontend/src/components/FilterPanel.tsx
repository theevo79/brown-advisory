"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { FOCUS_PRESETS, FOCUS_METRICS } from "@/lib/constants";
import MarketCapSlider from "@/components/MarketCapSlider";
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
    valuationMetric?: string;
    valuationPercentileMin?: number;
    valuationPercentileMax?: number;
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


export default function FilterPanel({ onSubmit, loading }: FilterPanelProps) {
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("global_ex_us");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["pe_ratio", "roe"]);
  const [mcapMin, setMcapMin] = useState<number | undefined>(1e9);
  const [mcapMax, setMcapMax] = useState<number | undefined>(undefined);
  const [advMin, setAdvMin] = useState<string>("");
  const [throughCycleYears, setThroughCycleYears] = useState(10);
  const [minYears, setMinYears] = useState(5);
  const [focusMetric, setFocusMetric] = useState("");
  const [focusPreset, setFocusPreset] = useState(0);

  useEffect(() => {
    api.getRegions().then(setRegions).catch(console.error);
  }, []);

  const toggleMetric = (id: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleMcapChange = useCallback((min: number | undefined, max: number | undefined) => {
    setMcapMin(min);
    setMcapMax(max);
  }, []);

  const handleSubmit = () => {
    const fp = FOCUS_PRESETS[focusPreset];
    const hasFocus = focusMetric && fp.value !== "none";

    // Ensure focus metric is included in the metrics list
    let metricsToSend = [...selectedMetrics];
    if (hasFocus && focusMetric && !metricsToSend.includes(focusMetric)) {
      metricsToSend.push(focusMetric);
    }

    onSubmit({
      region: selectedRegion,
      metrics: metricsToSend,
      marketCapMin: mcapMin,
      marketCapMax: mcapMax,
      advMin: advMin ? parseFloat(advMin) * 1e6 : undefined,
      throughCycleYears,
      minYears,
      ...(hasFocus && focusMetric
        ? {
            valuationMetric: focusMetric,
            valuationPercentileMin: fp.min,
            valuationPercentileMax: fp.max,
          }
        : {}),
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
          <label className="block text-sm font-medium text-ba-navy mb-2">Market Cap Range</label>
          <MarketCapSlider
            minValue={mcapMin || 100e6}
            maxValue={mcapMax || null}
            onChange={handleMcapChange}
          />
        </div>

        {/* ADV */}
        <div>
          <label className="block text-sm font-medium text-ba-navy mb-2">Min ADV ($M/day)</label>
          <input
            type="number"
            value={advMin}
            onChange={(e) => setAdvMin(e.target.value)}
            placeholder="e.g. 1"
            disabled
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none bg-gray-50 text-gray-400 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1 italic">No ADV data available yet</p>
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

      {/* Focus filter */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <label className="block text-sm font-medium text-ba-navy mb-2">Focus Filter</label>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={focusMetric}
            onChange={(e) => setFocusMetric(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
          >
            <option value="">No focus filter</option>
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
                  className={`px-3 py-1.5 text-xs rounded ${
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

      {/* Submit */}
      <div className="mt-4 flex items-center gap-4">
        <button onClick={handleSubmit} disabled={loading || selectedMetrics.length === 0} className="ba-btn-primary disabled:opacity-50">
          {loading ? "Screening..." : "Run Screen"}
        </button>
        <span className="text-sm text-gray-400">
          {selectedMetrics.length} metric{selectedMetrics.length !== 1 ? "s" : ""} selected
          {focusMetric && FOCUS_PRESETS[focusPreset].value !== "none" && (
            <> | Focus: {FOCUS_METRICS.find((m) => m.id === focusMetric)?.name}, {FOCUS_PRESETS[focusPreset].label}</>
          )}
        </span>
      </div>
    </div>
  );
}
