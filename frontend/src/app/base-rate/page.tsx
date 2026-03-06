"use client";

import { useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/formatters";
import type { BaseRateResponse } from "@/lib/types";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const METRICS = [
  { value: "revenue_growth", label: "Revenue Growth (%)" },
  { value: "roe", label: "Return on Equity (%)" },
  { value: "roa", label: "Return on Assets (%)" },
  { value: "roic", label: "Return on Invested Capital (%)" },
  { value: "net_margin", label: "Net Profit Margin (%)" },
  { value: "ebit_margin", label: "EBIT Margin (%)" },
  { value: "current_ratio", label: "Current Ratio" },
  { value: "debt_to_equity", label: "Debt/Equity Ratio" },
];

const YEAR_OPTIONS = [5, 10, 15, 20];

export default function BaseRatePage() {
  const [ticker, setTicker] = useState("");
  const [metric, setMetric] = useState("roe");
  const [peerSelection, setPeerSelection] = useState("sector");
  const [customPeers, setCustomPeers] = useState("");
  const [years, setYears] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BaseRateResponse | null>(null);

  const handleAnalyze = async () => {
    if (!ticker.trim()) {
      setError("Please enter a ticker");
      return;
    }
    if (!ticker.includes(".")) {
      setError("Invalid format. Use SYMBOL.EXCHANGE (e.g., MSFT.US)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request: any = {
        ticker: ticker.trim().toUpperCase(),
        metric,
        peer_selection: peerSelection,
        years,
      };

      if (peerSelection === "custom" && customPeers.trim()) {
        request.custom_peers = customPeers
          .split(/[,\n]/)
          .map((t: string) => t.trim().toUpperCase())
          .filter((t: string) => t.length > 0);
      }

      const response = await api.analyzeBaseRate(request);
      setResult(response);
    } catch (err: any) {
      setError(err.message || "Failed to analyze base rate");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const isValidNumber = (val: any): val is number =>
    val !== null && val !== undefined && typeof val === "number" && isFinite(val);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ba-navy">Base Rate</h1>
        <p className="text-gray-500 mt-1">
          Historical peer comparison and probability analysis for the &quot;outside view&quot;.
        </p>
      </div>

      {/* Input Panel */}
      <div className="ba-card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">
              Ticker (SYMBOL.EXCHANGE)
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g., MSFT.US"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">
              Metric
            </label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">
              Peer Selection
            </label>
            <select
              value={peerSelection}
              onChange={(e) => setPeerSelection(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
            >
              <option value="sector">Same Sector (Automatic)</option>
              <option value="custom">Custom Peer Group</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ba-navy mb-1">
              Historical Period
            </label>
            <select
              value={years}
              onChange={(e) => setYears(parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y} years</option>
              ))}
            </select>
          </div>
        </div>

        {peerSelection === "custom" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-ba-navy mb-1">
              Custom Peer Tickers (comma or newline separated)
            </label>
            <textarea
              value={customPeers}
              onChange={(e) => setCustomPeers(e.target.value)}
              rows={3}
              placeholder="AAPL.US, GOOGL.US, AMZN.US"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none font-mono"
            />
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="ba-btn-primary disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze Base Rate"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && <LoadingSpinner message="Analyzing base rates across peer group..." />}

      {!loading && result && (
        <div className="space-y-6">
          {/* Company Info */}
          <div className="ba-card">
            <h2 className="font-serif text-xl font-semibold text-ba-navy mb-3">
              {result.company_name} ({result.ticker})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase">Sector</p>
                <p className="text-lg font-semibold text-ba-navy">{result.sector || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Metric</p>
                <p className="text-lg font-semibold text-ba-navy">{result.metric_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Current Value</p>
                <p className="text-lg font-semibold text-ba-navy">
                  {isValidNumber(result.current_value) ? formatNumber(result.current_value, 1) : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Percentile Rank</p>
                <p className="text-lg font-semibold text-ba-navy">
                  {result.peer_distribution.company_percentile.toFixed(0)}th
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Peer selection: {result.peer_selection_method} ({result.peer_companies.length} peers)
            </p>
          </div>

          {/* Probability Analysis */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Probability Analysis</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ba-navy">
                    <th className="px-4 py-2 text-left text-ba-navy font-semibold">Scenario</th>
                    <th className="px-4 py-2 text-right text-ba-navy font-semibold">Probability</th>
                    <th className="px-4 py-2 text-left text-ba-navy font-semibold">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Above Median (50th)", value: result.probability_analysis.above_median, note: "Beats half of peer group" },
                    { label: "Above 75th Percentile", value: result.probability_analysis.above_75th, note: "Top quartile performance" },
                    { label: "Above 90th Percentile", value: result.probability_analysis.above_90th, note: "Top decile performance" },
                    { label: "Below 25th Percentile", value: result.probability_analysis.below_25th, note: "Bottom quartile" },
                    { label: "Below 10th Percentile", value: result.probability_analysis.below_10th, note: "Bottom decile" },
                  ].map((row) => (
                    <tr key={row.label} className="border-b border-gray-100">
                      <td className="px-4 py-2 text-ba-navy">{row.label}</td>
                      <td className="px-4 py-2 text-right font-semibold text-ba-navy">
                        {(row.value * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Distribution Chart */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">
              Peer Distribution ({result.years_analyzed} years, {result.peer_distribution.total_data_points} data points)
            </h3>
            {result.peer_distribution.histogram_counts?.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={result.peer_distribution.histogram_counts.map((count: number, i: number) => ({
                      bin: Math.round(
                        (result.peer_distribution.histogram_bins[i] +
                          result.peer_distribution.histogram_bins[i + 1]) /
                          2
                      ),
                      count,
                      binStart: result.peer_distribution.histogram_bins[i],
                      binEnd: result.peer_distribution.histogram_bins[i + 1],
                    }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="bin"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                      label={{ value: result.metric_name, position: "insideBottom", offset: -10, fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                      label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 12 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-300 rounded p-2 text-xs shadow">
                              <p className="font-semibold text-ba-navy">
                                {formatNumber(data.binStart, 1)} to {formatNumber(data.binEnd, 1)}
                              </p>
                              <p className="text-gray-500">Count: {data.count}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#005ba5" />
                    {isValidNumber(result.current_value) && (
                      <ReferenceLine
                        x={result.current_value}
                        stroke="#163963"
                        strokeDasharray="5 5"
                        strokeWidth={2.5}
                        label={{
                          value: `Company: ${formatNumber(result.current_value, 1)}`,
                          position: "top",
                          fill: "#163963",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                        ifOverflow="extendDomain"
                      />
                    )}
                    {isValidNumber(result.peer_distribution.mean) && (
                      <ReferenceLine
                        x={result.peer_distribution.mean}
                        stroke="#EF4444"
                        strokeDasharray="3 3"
                        strokeWidth={2}
                        label={{
                          value: `Mean: ${formatNumber(result.peer_distribution.mean, 1)}`,
                          position: "top",
                          fill: "#EF4444",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                        ifOverflow="extendDomain"
                      />
                    )}
                    {isValidNumber(result.peer_distribution.median) && (
                      <ReferenceLine
                        x={result.peer_distribution.median}
                        stroke="#3B82F6"
                        strokeDasharray="3 3"
                        strokeWidth={2}
                        label={{
                          value: `Median: ${formatNumber(result.peer_distribution.median, 1)}`,
                          position: "bottom",
                          fill: "#3B82F6",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                        ifOverflow="extendDomain"
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-4 gap-4 text-center text-sm">
                  <div>
                    <p className="text-xs text-gray-400 uppercase">Mean</p>
                    <p className="font-semibold text-ba-navy">{formatNumber(result.peer_distribution.mean, 1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase">Median</p>
                    <p className="font-semibold text-ba-navy">{formatNumber(result.peer_distribution.median, 1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase">Std Dev</p>
                    <p className="font-semibold text-ba-navy">{formatNumber(result.peer_distribution.std, 1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase">Company Rank</p>
                    <p className="font-semibold text-ba-navy">
                      {result.peer_distribution.company_percentile.toFixed(0)}th
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center py-8 text-gray-400">No histogram data available</p>
            )}
          </div>

          {/* Time Series Chart */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">
              Historical Comparison ({result.years_analyzed} years)
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={result.historical_data}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" stroke="#163963" />
                <YAxis stroke="#163963" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #163963",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="company_value"
                  stroke="#163963"
                  strokeWidth={3}
                  name="Company"
                  connectNulls
                  dot={{ fill: "#163963", r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="peer_avg"
                  stroke="#005ba5"
                  strokeWidth={2}
                  name="Peer Average"
                  dot={{ fill: "#005ba5", r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="peer_median"
                  stroke="#7FBAD8"
                  strokeWidth={2}
                  name="Peer Median"
                  strokeDasharray="5 5"
                  dot={{ fill: "#7FBAD8", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 mt-3">
              Peer count varies by year. Years with insufficient peer data are excluded.
            </p>
          </div>

          {/* Peer Companies */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">
              Peer Companies ({result.peer_companies.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
              {result.peer_companies.slice(0, 24).map((peer: any) => (
                <div key={peer.ticker} className="p-2 bg-gray-50 rounded border border-gray-100">
                  <p className="font-medium text-ba-navy">{peer.ticker}</p>
                  <p className="text-xs text-gray-400 truncate">{peer.name}</p>
                </div>
              ))}
            </div>
            {result.peer_companies.length > 24 && (
              <p className="text-xs text-gray-400 mt-3">
                ... and {result.peer_companies.length - 24} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
