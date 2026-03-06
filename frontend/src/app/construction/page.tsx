"use client";

import { useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/formatters";
import type { ConstructionHolding, ConstructionResponse, BucketDelta } from "@/lib/types";

interface EditableRow {
  ticker: string;
  current_weight: number;
  new_weight: number;
}

export default function ConstructionPage() {
  const [rows, setRows] = useState<EditableRow[]>([
    { ticker: "MSFT.US", current_weight: 20, new_weight: 20 },
    { ticker: "GOOGL.US", current_weight: 15, new_weight: 15 },
    { ticker: "WMT.US", current_weight: 12, new_weight: 12 },
    { ticker: "9988.HK", current_weight: 10, new_weight: 10 },
  ]);
  const [newTicker, setNewTicker] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConstructionResponse | null>(null);
  const [deltaView, setDeltaView] = useState<"sector" | "country">("sector");

  const handleAnalyze = async () => {
    const valid = rows.filter((r) => r.ticker.trim());
    if (valid.length === 0) {
      setError("Add at least one holding");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const holdings: ConstructionHolding[] = valid.map((r) => ({
        ticker: r.ticker,
        current_weight: r.current_weight,
        new_weight: r.new_weight,
      }));
      const response = await api.analyzeConstruction(holdings);
      setResult(response);
    } catch (err: any) {
      setError(err.message || "Analysis failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => {
    if (!newTicker.trim()) return;
    const wt = parseFloat(newWeight) || 5;
    setRows([...rows, { ticker: newTicker.trim().toUpperCase(), current_weight: 0, new_weight: wt }]);
    setNewTicker("");
    setNewWeight("");
  };

  const removeRow = (idx: number) => {
    // Set new_weight to 0 to track removal impact
    const updated = [...rows];
    updated[idx] = { ...updated[idx], new_weight: 0 };
    setRows(updated);
  };

  const deleteRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: "ticker" | "current_weight" | "new_weight", value: string) => {
    const updated = [...rows];
    if (field === "ticker") {
      updated[idx] = { ...updated[idx], ticker: value.toUpperCase() };
    } else {
      updated[idx] = { ...updated[idx], [field]: parseFloat(value) || 0 };
    }
    setRows(updated);
  };

  const proRateToTarget = (target: number) => {
    const currentTotal = rows.reduce((s, r) => s + r.new_weight, 0);
    if (currentTotal === 0) return;
    const factor = target / currentTotal;
    setRows(rows.map((r) => ({ ...r, new_weight: Math.round(r.new_weight * factor * 100) / 100 })));
  };

  const resetWeights = () => {
    setRows(rows.map((r) => ({ ...r, new_weight: r.current_weight })));
    setResult(null);
  };

  const currentTotal = rows.reduce((s, r) => s + r.current_weight, 0);
  const newTotal = rows.reduce((s, r) => s + r.new_weight, 0);

  const getDeltaColor = (delta: number) => {
    if (delta > 0.5) return "text-green-600";
    if (delta < -0.5) return "text-red-600";
    return "text-gray-400";
  };

  const renderDeltaTable = (deltas: BucketDelta[]) => (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b-2 border-ba-navy">
          <th className="px-3 py-2 text-left text-ba-navy font-semibold">Bucket</th>
          <th className="px-3 py-2 text-right text-ba-navy font-semibold">Current</th>
          <th className="px-3 py-2 text-right text-ba-navy font-semibold">New</th>
          <th className="px-3 py-2 text-right text-ba-navy font-semibold">Delta</th>
        </tr>
      </thead>
      <tbody>
        {deltas.filter((d) => d.current_weight > 0 || d.new_weight > 0).map((d) => (
          <tr key={d.name} className="border-b border-gray-100">
            <td className="px-3 py-2 text-ba-navy">{d.name}</td>
            <td className="px-3 py-2 text-right">{formatNumber(d.current_weight, 1)}%</td>
            <td className="px-3 py-2 text-right">{formatNumber(d.new_weight, 1)}%</td>
            <td className={`px-3 py-2 text-right font-medium ${getDeltaColor(d.delta)}`}>
              {d.delta > 0 ? "+" : ""}{formatNumber(d.delta, 1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ba-navy">Portfolio Construction</h1>
        <p className="text-gray-500 mt-1">
          Build and modify portfolios with real-time impact analysis.
        </p>
      </div>

      {/* Editable holdings table */}
      <div className="ba-card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif text-lg font-semibold text-ba-navy">Holdings</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Current: {formatNumber(currentTotal, 1)}%</span>
            <span className={`font-medium ${Math.abs(newTotal - 100) < 0.5 ? "text-green-600" : "text-orange-500"}`}>
              New: {formatNumber(newTotal, 1)}%
            </span>
            <button onClick={() => proRateToTarget(100)} className="ba-btn text-xs py-0.5">Pro-rate to 100%</button>
            <button onClick={resetWeights} className="ba-btn text-xs py-0.5">Reset</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ba-navy">
                <th className="px-3 py-2 text-left text-ba-navy font-semibold">Ticker</th>
                <th className="px-3 py-2 text-right text-ba-navy font-semibold w-28">Current Wt%</th>
                <th className="px-3 py-2 text-right text-ba-navy font-semibold w-28">New Wt%</th>
                <th className="px-3 py-2 text-right text-ba-navy font-semibold w-24">Delta</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const delta = r.new_weight - r.current_weight;
                return (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-3 py-1">
                      <input
                        value={r.ticker}
                        onChange={(e) => updateRow(i, "ticker", e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1 font-mono text-sm focus:border-ba-accent outline-none"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        value={r.current_weight}
                        onChange={(e) => updateRow(i, "current_weight", e.target.value)}
                        type="number"
                        step="0.1"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:border-ba-accent outline-none"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <input
                        value={r.new_weight}
                        onChange={(e) => updateRow(i, "new_weight", e.target.value)}
                        type="number"
                        step="0.1"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:border-ba-accent outline-none bg-blue-50"
                      />
                    </td>
                    <td className={`px-3 py-1 text-right font-medium ${getDeltaColor(delta)}`}>
                      {delta !== 0 ? (delta > 0 ? "+" : "") + formatNumber(delta, 1) + "%" : "-"}
                    </td>
                    <td className="px-3 py-1 text-center">
                      <button onClick={() => deleteRow(i)} className="text-gray-300 hover:text-red-500">&times;</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
          <input
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="Add ticker..."
            className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:border-ba-accent outline-none"
            onKeyDown={(e) => e.key === "Enter" && addRow()}
          />
          <input
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            placeholder="New Wt%"
            type="number"
            className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:border-ba-accent outline-none"
            onKeyDown={(e) => e.key === "Enter" && addRow()}
          />
          <button onClick={addRow} className="ba-btn text-xs py-1">Add</button>
        </div>

        <div className="mt-4">
          <button onClick={handleAnalyze} disabled={loading} className="ba-btn-primary disabled:opacity-50">
            {loading ? "Analyzing..." : "Analyze Impact"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && <LoadingSpinner message="Analyzing portfolio impact..." />}

      {!loading && result && (
        <div className="space-y-6">
          {/* Impact summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Additions", value: result.num_additions, color: "text-green-600" },
              { label: "Removals", value: result.num_removals, color: "text-red-600" },
              { label: "Changes", value: result.num_changes, color: "text-orange-500" },
              { label: "Total Delta", value: `${formatNumber(result.new_total - result.current_total, 1)}%`, color: getDeltaColor(result.new_total - result.current_total) },
            ].map((card) => (
              <div key={card.label} className="ba-card text-center py-3">
                <p className="text-xs text-gray-400 uppercase">{card.label}</p>
                <p className={`text-xl font-semibold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Concentration comparison */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Concentration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase">Current Top 10</p>
                <p className="text-lg font-semibold text-ba-navy">{formatNumber(result.current_top10, 1)}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">New Top 10</p>
                <p className={`text-lg font-semibold ${getDeltaColor(result.new_top10 - result.current_top10)}`}>
                  {formatNumber(result.new_top10, 1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Current HHI</p>
                <p className="text-lg font-semibold text-ba-navy">{formatNumber(result.current_hhi, 0)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">New HHI</p>
                <p className={`text-lg font-semibold ${getDeltaColor(result.new_hhi - result.current_hhi)}`}>
                  {formatNumber(result.new_hhi, 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Bucket deltas */}
          <div className="ba-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">Exposure Changes</h3>
              <div className="flex gap-1">
                {(["sector", "country"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDeltaView(v)}
                    className={`px-3 py-1 text-xs rounded ${
                      deltaView === v ? "bg-ba-navy text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              {renderDeltaTable(deltaView === "sector" ? result.sector_deltas : result.country_deltas)}
            </div>
          </div>

          {/* Holdings impact detail */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Holdings Impact</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ba-navy">
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Ticker</th>
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Company</th>
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Sector</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">Current</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">New</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {result.holdings.map((h) => (
                    <tr key={h.ticker} className={`border-b border-gray-100 ${
                      h.current_weight === 0 ? "bg-green-50" : h.new_weight === 0 ? "bg-red-50" : ""
                    }`}>
                      <td className="px-3 py-2 font-mono font-medium text-ba-navy">{h.ticker}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{h.company_name}</td>
                      <td className="px-3 py-2 text-gray-500">{h.sector || "-"}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(h.current_weight, 1)}%</td>
                      <td className="px-3 py-2 text-right">{formatNumber(h.new_weight, 1)}%</td>
                      <td className={`px-3 py-2 text-right font-medium ${getDeltaColor(h.delta)}`}>
                        {h.delta !== 0 ? (h.delta > 0 ? "+" : "") + formatNumber(h.delta, 1) + "%" : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
