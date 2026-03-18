"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import LoadingSpinner from "@/components/LoadingSpinner";
import TickerSearch from "@/components/TickerSearch";
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
  Brush,
  ReferenceArea,
} from "recharts";

const METRICS = [
  { value: "revenue_growth", label: "Revenue Growth (%)" },
  { value: "roe", label: "Return on Equity (%)" },
  { value: "roa", label: "Return on Assets (%)" },
  { value: "roic", label: "Return on Invested Capital (%)" },
  { value: "net_margin", label: "Net Profit Margin (%)" },
  { value: "ebit_margin", label: "EBIT Margin (%)" },
  { value: "ebitda_margin", label: "EBITDA Margin (%)" },
  { value: "net_debt_ebitda", label: "Net Debt/EBITDA" },
  { value: "current_ratio", label: "Current Ratio" },
  { value: "debt_to_equity", label: "Debt/Equity Ratio" },
];

const YEAR_OPTIONS = [5, 10, 15, 20];

export default function BaseRatePage() {
  const [ticker, setTicker] = useState("");
  const [metric, setMetric] = useState("roe");
  const [peerSelection, setPeerSelection] = useState("sector");
  const [peerList, setPeerList] = useState<string[]>([]);
  const [years, setYears] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BaseRateResponse | null>(null);
  const [zoomPreset, setZoomPreset] = useState<"full" | "core" | "iqr" | "custom">("full");
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [customDomain, setCustomDomain] = useState<[number, number] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3c: % vs count toggle
  const [histMode, setHistMode] = useState<"count" | "percent">("count");

  // 3d: Company distribution overlay toggle
  const [showCompanyOverlay, setShowCompanyOverlay] = useState(true);

  // 3e: Saved peer groups
  const [savedGroups, setSavedGroups] = useState<any[]>([]);
  const [saveGroupName, setSaveGroupName] = useState("");

  useEffect(() => {
    api.listPeerGroups().then(setSavedGroups).catch(() => {});
  }, []);

  const handleSavePeerGroup = async () => {
    if (!saveGroupName.trim() || peerList.length === 0) return;
    try {
      await api.savePeerGroup(saveGroupName.trim(), peerList);
      setSaveGroupName("");
      const groups = await api.listPeerGroups();
      setSavedGroups(groups);
    } catch (err: any) {
      setError(err.message || "Failed to save peer group");
    }
  };

  const handleLoadPeerGroup = (group: any) => {
    setPeerList(group.tickers);
    setPeerSelection("custom");
  };

  const handleDeletePeerGroup = async (id: number) => {
    try {
      await api.deletePeerGroup(id);
      const groups = await api.listPeerGroups();
      setSavedGroups(groups);
    } catch {}
  };

  const addPeer = (t: string) => {
    const upper = t.trim().toUpperCase();
    if (upper && !peerList.includes(upper)) {
      setPeerList((prev) => [...prev, upper]);
    }
  };

  const removePeer = (t: string) => {
    setPeerList((prev) => prev.filter((p) => p !== t));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        let tickers: string[] = [];

        if (isExcel) {
          const data = ev.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

          if (jsonData.length === 0) return;

          // Look for ticker column in header row
          const headers = jsonData[0].map((h: any) => String(h).toLowerCase().trim());
          const tickerColIndex = headers.findIndex(
            (h: string) => h === "ticker" || h === "tickers" || h === "symbol"
          );

          if (tickerColIndex !== -1) {
            for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (row[tickerColIndex]) {
                const ticker = String(row[tickerColIndex]).trim().toUpperCase();
                if (ticker.length > 0 && ticker.includes(".")) {
                  tickers.push(ticker);
                }
              }
            }
          } else {
            // No header found — parse first column
            for (let i = 0; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (row[0]) {
                const ticker = String(row[0]).trim().toUpperCase();
                if (ticker.length > 0 && ticker.includes(".")) {
                  tickers.push(ticker);
                }
              }
            }
          }
        } else {
          // CSV / TXT
          const text = ev.target?.result as string;
          if (!text) return;

          const lines = text.split(/[\r\n]+/).filter((line) => line.trim().length > 0);
          if (lines.length === 0) return;

          const firstLine = lines[0].toLowerCase();
          const delimiter = firstLine.includes("\t") ? "\t" : ",";
          const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

          const tickerColIndex = headers.findIndex(
            (h) => h === "ticker" || h === "tickers" || h === "symbol"
          );

          if (tickerColIndex !== -1) {
            for (let i = 1; i < lines.length; i++) {
              const columns = lines[i].split(delimiter);
              if (columns[tickerColIndex]) {
                const ticker = columns[tickerColIndex].trim().replace(/^["']|["']$/g, "").toUpperCase();
                if (ticker.length > 0 && ticker.includes(".")) {
                  tickers.push(ticker);
                }
              }
            }
          } else {
            // Simple list
            tickers = text
              .split(/[\n,\t]/)
              .map((t) => t.trim().replace(/^["']|["']$/g, "").toUpperCase())
              .filter((t) => t.length > 0 && t.includes("."));
          }
        }

        if (tickers.length > 0) {
          const unique = Array.from(new Set([...peerList, ...tickers]));
          setPeerList(unique);
        }
      } catch {
        // Silent fail
      }
    };

    if (isExcel) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file, "UTF-8");
    }

    e.target.value = "";
  };

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

      if (peerSelection === "custom" && peerList.length > 0) {
        request.custom_peers = peerList;
      }

      const response = await api.analyzeBaseRate(request);
      setResult(response);
      setZoomPreset("full");
      setCustomDomain(null);
    } catch (err: any) {
      setError(err.message || "Failed to analyze base rate");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const isValidNumber = (val: any): val is number =>
    val !== null && val !== undefined && typeof val === "number" && isFinite(val);

  // Re-bin raw values within a given range
  const buildHistogram = (values: number[], rangeMin: number, rangeMax: number, numBins = 30) => {
    const filtered = values.filter((v) => v >= rangeMin && v <= rangeMax);
    if (filtered.length === 0) return [];
    const binWidth = (rangeMax - rangeMin) / numBins;
    const bins: { bin: number; count: number; binStart: number; binEnd: number }[] = [];
    for (let i = 0; i < numBins; i++) {
      const binStart = rangeMin + i * binWidth;
      const binEnd = rangeMin + (i + 1) * binWidth;
      const count = filtered.filter((v) =>
        i === numBins - 1 ? v >= binStart && v <= binEnd : v >= binStart && v < binEnd
      ).length;
      bins.push({
        bin: +((binStart + binEnd) / 2).toFixed(2),
        count,
        binStart: +binStart.toFixed(2),
        binEnd: +binEnd.toFixed(2),
      });
    }
    return bins;
  };

  const displayHistData = useMemo(() => {
    if (!result?.peer_distribution) return [];
    const dist = result.peer_distribution;
    const raw = dist.raw_values;

    let bins: { bin: number; count: number; binStart: number; binEnd: number }[];

    if (zoomPreset === "full") {
      if (!dist.histogram_counts?.length) return [];
      bins = dist.histogram_counts.map((count: number, i: number) => ({
        bin: +((dist.histogram_bins[i] + dist.histogram_bins[i + 1]) / 2).toFixed(2),
        count,
        binStart: dist.histogram_bins[i],
        binEnd: dist.histogram_bins[i + 1],
      }));
    } else {
      if (!raw?.length) return [];
      let rangeMin: number, rangeMax: number;
      if (zoomPreset === "custom" && customDomain) {
        [rangeMin, rangeMax] = customDomain;
      } else if (zoomPreset === "iqr") {
        rangeMin = dist.q1;
        rangeMax = dist.q3;
      } else {
        const iqr = dist.q3 - dist.q1;
        rangeMin = dist.q1 - 1.5 * iqr;
        rangeMax = dist.q3 + 1.5 * iqr;
      }
      bins = buildHistogram(raw, rangeMin, rangeMax);
    }

    // 3c: Convert to percentage if needed
    const totalCount = bins.reduce((s, b) => s + b.count, 0);

    // 3d: Build company overlay histogram from historical values
    const companyValues = result.historical_data
      ?.filter((h: any) => h.company_value != null)
      .map((h: any) => h.company_value as number) || [];

    return bins.map((b) => {
      const pct = totalCount > 0 ? +((b.count / totalCount) * 100).toFixed(1) : 0;
      // Count how many company historical values fall in this bin
      let companyCount = 0;
      if (showCompanyOverlay && companyValues.length > 0) {
        companyCount = companyValues.filter((v) => v >= b.binStart && v < b.binEnd).length;
        // Include the rightmost bin boundary for the last bin
        if (b === bins[bins.length - 1]) {
          companyCount = companyValues.filter((v) => v >= b.binStart && v <= b.binEnd).length;
        }
      }
      const companyPct = companyValues.length > 0 ? +((companyCount / companyValues.length) * 100).toFixed(1) : 0;
      return { ...b, percent: pct, companyCount, companyPercent: companyPct };
    });
  }, [result, zoomPreset, customDomain, showCompanyOverlay]);

  const handleChartMouseDown = (e: any) => {
    if (e?.activeLabel != null) setRefAreaLeft(e.activeLabel);
  };
  const handleChartMouseMove = (e: any) => {
    if (refAreaLeft != null && e?.activeLabel != null) setRefAreaRight(e.activeLabel);
  };
  const handleChartMouseUp = () => {
    if (refAreaLeft != null && refAreaRight != null && refAreaLeft !== refAreaRight) {
      const [left, right] = [Math.min(refAreaLeft, refAreaRight), Math.max(refAreaLeft, refAreaRight)];
      setCustomDomain([left, right]);
      setZoomPreset("custom");
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };
  const resetZoom = () => {
    setZoomPreset("full");
    setCustomDomain(null);
  };

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
            <TickerSearch
              value={ticker}
              onChange={setTicker}
              onSelect={(t) => setTicker(t)}
              placeholder="e.g., MSFT.US"
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
              Add Peers
            </label>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <TickerSearch
                  onSelect={addPeer}
                  placeholder="Search for a peer company..."
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 text-ba-navy whitespace-nowrap"
              >
                Upload File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            {peerList.length > 0 && (
              <div className="border border-gray-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{peerList.length} peer{peerList.length !== 1 ? "s" : ""}</span>
                  <button
                    type="button"
                    onClick={() => setPeerList([])}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {peerList.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 bg-gray-100 text-ba-navy text-xs font-mono px-2 py-1 rounded"
                    >
                      {p}
                      <button
                        type="button"
                        onClick={() => removePeer(p)}
                        className="text-gray-400 hover:text-red-500 ml-0.5"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {peerList.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Search to add peers individually, or upload a CSV/Excel file with SYMBOL.EXCHANGE tickers.
              </p>
            )}

            {/* 3e: Save/Load peer groups */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-ba-navy">Saved Groups:</span>
                {savedGroups.length > 0 ? (
                  savedGroups.map((g) => (
                    <div key={g.id} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                      <button
                        type="button"
                        onClick={() => handleLoadPeerGroup(g)}
                        className="text-xs text-ba-navy hover:text-ba-accent"
                      >
                        {g.name} ({g.tickers.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePeerGroup(g.id)}
                        className="text-gray-400 hover:text-red-500 text-xs ml-0.5"
                      >
                        &times;
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">None saved yet</span>
                )}
              </div>
              {peerList.length > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={saveGroupName}
                    onChange={(e) => setSaveGroupName(e.target.value)}
                    placeholder="Group name..."
                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:border-ba-accent outline-none w-40"
                  />
                  <button
                    type="button"
                    onClick={handleSavePeerGroup}
                    disabled={!saveGroupName.trim()}
                    className="px-2.5 py-1 text-xs bg-ba-navy text-white rounded disabled:opacity-40 hover:bg-ba-accent"
                  >
                    Save Current
                  </button>
                </div>
              )}
            </div>
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
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">
                Peer Distribution ({result.years_analyzed} years, {result.peer_distribution.total_data_points} data points)
              </h3>
              <div className="flex items-center gap-3 flex-wrap">
                {/* 3c: % vs Count toggle */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">Y-axis:</span>
                  {(["count", "percent"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setHistMode(m)}
                      className={`px-2 py-1 text-xs rounded ${
                        histMode === m ? "bg-ba-navy text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {m === "count" ? "Count" : "%"}
                    </button>
                  ))}
                </div>
                {/* 3d: Company overlay toggle */}
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCompanyOverlay}
                    onChange={(e) => setShowCompanyOverlay(e.target.checked)}
                    className="rounded border-gray-300 text-ba-accent"
                  />
                  Company overlay
                </label>
                <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400 mr-1">Zoom:</span>
                {([
                  { key: "full", label: "Full" },
                  { key: "core", label: "\u00b11.5 IQR" },
                  { key: "iqr", label: "IQR" },
                ] as const).map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { setZoomPreset(p.key); setCustomDomain(null); }}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      zoomPreset === p.key
                        ? "bg-ba-navy text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {zoomPreset === "custom" && (
                  <button
                    onClick={resetZoom}
                    className="px-2.5 py-1 text-xs rounded bg-ba-accent text-white"
                  >
                    Reset
                  </button>
                )}
              </div>
              </div>
            </div>
            {zoomPreset !== "full" && (
              <p className="text-xs text-gray-400 mb-2">
                {zoomPreset === "iqr"
                  ? `Showing Q1\u2013Q3 range: ${formatNumber(result.peer_distribution.q1, 1)} to ${formatNumber(result.peer_distribution.q3, 1)}`
                  : zoomPreset === "core"
                  ? `Showing core range (\u00b11.5\u00d7IQR from quartiles)`
                  : "Drag-selected range"
                }
                {" "}\u2014 click-drag on chart to custom zoom
              </p>
            )}
            {zoomPreset === "full" && (
              <p className="text-xs text-gray-400 mb-2">
                Tip: click and drag on the chart to zoom into a custom range
              </p>
            )}
            {displayHistData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={displayHistData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    onMouseDown={handleChartMouseDown}
                    onMouseMove={handleChartMouseMove}
                    onMouseUp={handleChartMouseUp}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="bin"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatNumber(v, 1)}
                      label={{ value: result.metric_name, position: "insideBottom", offset: -10, fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#6B7280"
                      tick={{ fontSize: 11 }}
                      label={{ value: histMode === "percent" ? "%" : "Count", angle: -90, position: "insideLeft", fontSize: 12 }}
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
                              <p className="text-gray-500">
                                Peers: {data.count}{histMode === "percent" ? ` (${data.percent}%)` : ""}
                              </p>
                              {showCompanyOverlay && data.companyCount > 0 && (
                                <p className="text-ba-navy">
                                  Company: {data.companyCount}{histMode === "percent" ? ` (${data.companyPercent}%)` : ""}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey={histMode === "percent" ? "percent" : "count"} fill="#005ba5" name="Peer Distribution" />
                    {showCompanyOverlay && (
                      <Bar dataKey={histMode === "percent" ? "companyPercent" : "companyCount"} fill="#163963" fillOpacity={0.5} name="Company History" />
                    )}
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
                        ifOverflow="hidden"
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
                        ifOverflow="hidden"
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
                        ifOverflow="hidden"
                      />
                    )}
                    {refAreaLeft != null && refAreaRight != null && (
                      <ReferenceArea
                        x1={refAreaLeft}
                        x2={refAreaRight}
                        strokeOpacity={0.3}
                        fill="#005ba5"
                        fillOpacity={0.15}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-5 gap-4 text-center text-sm">
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
                    <p className="text-xs text-gray-400 uppercase">Q1 / Q3</p>
                    <p className="font-semibold text-ba-navy">
                      {formatNumber(result.peer_distribution.q1, 1)} / {formatNumber(result.peer_distribution.q3, 1)}
                    </p>
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
                data={(() => {
                  // 3f: Cap extreme values for better visualization
                  const allVals = result.historical_data.flatMap((h: any) =>
                    [h.company_value, h.peer_avg, h.peer_median].filter((v) => v != null)
                  );
                  if (allVals.length === 0) return result.historical_data;
                  const sorted = [...allVals].sort((a, b) => a - b);
                  const q1 = sorted[Math.floor(sorted.length * 0.25)];
                  const q3 = sorted[Math.floor(sorted.length * 0.75)];
                  const iqr = q3 - q1;
                  const capMin = q1 - 3 * iqr;
                  const capMax = q3 + 3 * iqr;
                  return result.historical_data.map((h: any) => ({
                    ...h,
                    company_value: h.company_value != null ? Math.max(capMin, Math.min(capMax, h.company_value)) : null,
                    peer_avg: Math.max(capMin, Math.min(capMax, h.peer_avg)),
                    peer_median: Math.max(capMin, Math.min(capMax, h.peer_median)),
                  }));
                })()}
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
