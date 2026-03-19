"use client";

import { useState, useEffect } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import TickerSearch from "@/components/TickerSearch";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/formatters";
import { CHART_COLORS } from "@/lib/constants";
import type { ConstructionHolding, ConstructionResponse, BucketDelta, HoldingImpact } from "@/lib/types";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface EditableRow {
  ticker: string;
  current_weight: number;
  new_weight: number;
}

export default function ConstructionPage() {
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [originalRows, setOriginalRows] = useState<EditableRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [newTicker, setNewTicker] = useState("");

  useEffect(() => {
    // Auto-load BAIV portfolio as the starting point
    (async () => {
      try {
        const portfolios = await api.listPortfolios();
        const baiv = portfolios.find((p) => p.name.includes("BAIV"));
        if (baiv) {
          const portfolio = await api.getPortfolio(baiv.id);
          const loaded = portfolio.holdings.map((h) => ({
            ticker: h.ticker,
            current_weight: h.weight,
            new_weight: h.weight,
          }));
          setRows(loaded);
          setOriginalRows(loaded);
        }
      } catch {}
      setInitialLoading(false);
    })();
  }, []);
  const [newWeight, setNewWeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConstructionResponse | null>(null);
  type DeltaView = "sector" | "country" | "marketcap" | "valuation" | "profitability";
  const [deltaView, setDeltaView] = useState<DeltaView>("sector");

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
    setRows(originalRows.map((r) => ({ ...r, new_weight: r.current_weight })));
    setResult(null);
  };

  const handleExportTrades = () => {
    if (!result) return;
    const trades = result.holdings.filter((h) => h.delta !== 0);
    if (trades.length === 0) return;
    const header = "Ticker,Company,Current Weight,New Weight,Delta";
    const csvRows = trades.map((h) =>
      `${h.ticker},"${h.company_name}",${h.current_weight.toFixed(2)},${h.new_weight.toFixed(2)},${h.delta.toFixed(2)}`
    );
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trades.csv";
    a.click();
    URL.revokeObjectURL(url);
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

  if (initialLoading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-ba-navy">Portfolio Construction</h1>
          <p className="text-gray-500 mt-1">Loading portfolio...</p>
        </div>
        <LoadingSpinner message="Loading BAIV portfolio..." />
      </div>
    );
  }

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
          <TickerSearch
            value={newTicker}
            onChange={setNewTicker}
            onSelect={(t) => {
              const wt = parseFloat(newWeight) || 5;
              setRows([...rows, { ticker: t, current_weight: 0, new_weight: wt }]);
              setNewTicker("");
              setNewWeight("");
            }}
            placeholder="Add ticker..."
            className="flex-1"
          />
          <input
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            placeholder="New Wt%"
            type="number"
            className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:border-ba-accent outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") addRow();
            }}
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
          {/* Export button */}
          <div className="flex justify-end">
            <button
              onClick={handleExportTrades}
              className="ba-btn text-xs py-1"
              disabled={!result.holdings.some((h) => h.delta !== 0)}
            >
              Export Trades CSV
            </button>
          </div>

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

          {/* Concentration + Weighted Metrics */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Concentration & Weighted Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
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
            <div className="overflow-x-auto pt-3 border-t border-gray-100">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ba-navy">
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Metric</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">Current</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">New</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Wtd P/E", cur: result.current_weighted_pe, nw: result.weighted_pe, suffix: "x" },
                    { label: "Wtd CAPE", cur: result.current_weighted_cape, nw: result.weighted_cape, suffix: "x" },
                    { label: "Wtd P/B", cur: result.current_weighted_pb, nw: result.weighted_pb, suffix: "x" },
                    { label: "Wtd ROE", cur: result.current_weighted_roe, nw: result.weighted_roe, suffix: "%" },
                    { label: "Wtd Net Margin", cur: result.current_weighted_net_margin, nw: result.weighted_net_margin, suffix: "%" },
                  ].map((m) => {
                    const delta = m.cur != null && m.nw != null ? m.nw - m.cur : null;
                    return (
                      <tr key={m.label} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-ba-navy font-medium">{m.label}</td>
                        <td className="px-3 py-2 text-right">{m.cur != null ? formatNumber(m.cur, 1) + m.suffix : "N/A"}</td>
                        <td className="px-3 py-2 text-right font-semibold">{m.nw != null ? formatNumber(m.nw, 1) + m.suffix : "N/A"}</td>
                        <td className={`px-3 py-2 text-right font-medium ${delta != null ? getDeltaColor(delta) : "text-gray-400"}`}>
                          {delta != null ? (delta > 0 ? "+" : "") + formatNumber(delta, 1) + m.suffix : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Exposure Changes with chart views */}
          <div className="ba-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">Exposure Changes</h3>
              <div className="flex gap-1 flex-wrap">
                {(["sector", "country", "marketcap", "valuation", "profitability"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDeltaView(v)}
                    className={`px-3 py-1 text-xs rounded ${
                      deltaView === v ? "bg-ba-navy text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {v === "marketcap" ? "Mkt Cap" : v === "profitability" ? "Profit" : v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sector / Country / Market Cap views */}
            {(deltaView === "sector" || deltaView === "country" || deltaView === "marketcap") && (() => {
              const deltas =
                deltaView === "sector" ? result.sector_deltas :
                deltaView === "country" ? result.country_deltas :
                result.market_cap_deltas;
              const chartData = deltas
                .filter((d) => d.current_weight > 0 || d.new_weight > 0)
                .map((d) => ({ name: d.name, Current: +d.current_weight.toFixed(1), New: +d.new_weight.toFixed(1) }));

              return (
                <div>
                  {/* Grouped bar chart */}
                  {chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 32)}>
                      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip formatter={(val) => `${val}%`} />
                        <Legend />
                        <Bar dataKey="Current" fill="#a9cce3" />
                        <Bar dataKey="New" fill="#163963" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  {/* Delta table */}
                  <div className="overflow-x-auto mt-4">
                    {renderDeltaTable(deltas)}
                  </div>
                </div>
              );
            })()}

            {/* Valuation / Profitability distribution views */}
            {(deltaView === "valuation" || deltaView === "profitability") && (() => {
              const buildDistChart = (metric: keyof HoldingImpact, label: string, suffix: string) => {
                // Get all holdings that have this metric (include both current and new)
                const allItems = result.holdings
                  .filter((h) => (h.current_weight > 0 || h.new_weight > 0) && h[metric] != null)
                  .map((h) => ({ value: h[metric] as number, currentWt: h.current_weight, newWt: h.new_weight }));
                if (allItems.length === 0) return null;

                const values = allItems.map((i) => i.value);
                const min = Math.min(...values);
                const max = Math.max(...values);
                const range = max - min || 1;
                const numBins = Math.min(8, allItems.length);
                const binSize = range / numBins;

                const bins = Array.from({ length: numBins }, (_, i) => {
                  const lo = min + i * binSize;
                  const hi = i === numBins - 1 ? max + 0.01 : min + (i + 1) * binSize;
                  const binItems = allItems.filter((it) => it.value >= lo && it.value < hi);
                  const currentWt = binItems.reduce((s, it) => s + it.currentWt, 0);
                  const newWt = binItems.reduce((s, it) => s + it.newWt, 0);
                  return {
                    range: `${formatNumber(lo, 0)}-${formatNumber(hi, 0)}${suffix === "%" ? "%" : ""}`,
                    Current: +currentWt.toFixed(1),
                    New: +newWt.toFixed(1),
                    count: binItems.length,
                  };
                }).filter((b) => b.Current > 0 || b.New > 0);

                const curItems = allItems.filter((i) => i.currentWt > 0);
                const newItems = allItems.filter((i) => i.newWt > 0);
                const curWtdAvg = curItems.length > 0
                  ? curItems.reduce((s, i) => s + i.value * i.currentWt, 0) / curItems.reduce((s, i) => s + i.currentWt, 0)
                  : null;
                const newWtdAvg = newItems.length > 0
                  ? newItems.reduce((s, i) => s + i.value * i.newWt, 0) / newItems.reduce((s, i) => s + i.newWt, 0)
                  : null;

                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-ba-navy">{label}</h4>
                      <span className="text-xs text-gray-500">
                        {curWtdAvg != null && <>Cur Avg: {formatNumber(curWtdAvg, 1)}{suffix}</>}
                        {curWtdAvg != null && newWtdAvg != null && " \u2192 "}
                        {newWtdAvg != null && <>New Avg: {formatNumber(newWtdAvg, 1)}{suffix}</>}
                        {" | "}{allItems.length} holdings
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={bins} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} label={{ value: "Wt%", angle: -90, position: "insideLeft", fontSize: 10 }} />
                        <Tooltip formatter={(val: any) => `${val}%`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Current" fill="#a9cce3" />
                        <Bar dataKey="New" fill="#163963" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              };

              const metrics = deltaView === "valuation"
                ? [
                    { key: "pe_ratio" as keyof HoldingImpact, label: "P/E Ratio", suffix: "x" },
                    { key: "cape_ratio" as keyof HoldingImpact, label: "CAPE Ratio", suffix: "x" },
                    { key: "pb_ratio" as keyof HoldingImpact, label: "P/B Ratio", suffix: "x" },
                  ]
                : [
                    { key: "roe" as keyof HoldingImpact, label: "ROE", suffix: "%" },
                    { key: "net_margin" as keyof HoldingImpact, label: "Net Margin", suffix: "%" },
                  ];

              return (
                <div className="space-y-6">
                  {metrics.map((m) => buildDistChart(m.key, m.label, m.suffix))}
                </div>
              );
            })()}
          </div>

          {/* Holdings impact detail */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Holdings Impact</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ba-navy">
                    <th className="px-2 py-2 text-left text-ba-navy font-semibold">Ticker</th>
                    <th className="px-2 py-2 text-left text-ba-navy font-semibold">Company</th>
                    <th className="px-2 py-2 text-left text-ba-navy font-semibold">Sector</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Current</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Pro-Rata</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">New</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Delta</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Alpha</th>
                  </tr>
                </thead>
                <tbody>
                  {result.holdings.map((h) => (
                    <tr key={h.ticker} className={`border-b border-gray-100 ${
                      h.current_weight === 0 ? "bg-green-50" : h.new_weight === 0 ? "bg-red-50" : ""
                    }`}>
                      <td className="px-2 py-2 font-mono font-medium text-ba-navy">{h.ticker}</td>
                      <td className="px-2 py-2 text-gray-600 max-w-[180px] truncate">{h.company_name}</td>
                      <td className="px-2 py-2 text-gray-500">{h.sector || "-"}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(h.current_weight, 1)}%</td>
                      <td className="px-2 py-2 text-right text-gray-400">{h.pro_rata_weight != null ? formatNumber(h.pro_rata_weight, 1) + "%" : "-"}</td>
                      <td className="px-2 py-2 text-right font-medium">{formatNumber(h.new_weight, 1)}%</td>
                      <td className={`px-2 py-2 text-right font-medium ${getDeltaColor(h.delta)}`}>
                        {h.delta !== 0 ? (h.delta > 0 ? "+" : "") + formatNumber(h.delta, 1) + "%" : "-"}
                      </td>
                      <td className={`px-2 py-2 text-right font-medium ${h.alpha != null ? getDeltaColor(h.alpha) : "text-gray-400"}`}>
                        {h.alpha != null && Math.abs(h.alpha) > 0.01 ? (h.alpha > 0 ? "+" : "") + formatNumber(h.alpha, 1) + "%" : "-"}
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
