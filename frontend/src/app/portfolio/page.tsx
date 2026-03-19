"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import LoadingSpinner from "@/components/LoadingSpinner";
import TickerSearch from "@/components/TickerSearch";
import { api } from "@/lib/api";
import { formatNumber, formatCurrency } from "@/lib/formatters";
import type {
  PortfolioHolding,
  PortfolioListItem,
  VisualizationResponse,
  Tag,
  TagBreakdown,
  MetricSummary,
  BenchmarkBreakdown,
} from "@/lib/types";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const COLORS = [
  "#163963", "#005ba5", "#2980b9", "#3498db", "#5dade2",
  "#7fb3d8", "#a9cce3", "#d4e6f1", "#85929e", "#566573",
  "#2c3e50", "#1a5276", "#154360", "#1b4f72", "#21618c",
  "#2874a6",
];

type ChartView = "sector" | "country" | "region" | "marketcap" | "valuation" | "profitability" | "tag" | "benchmark";

interface MetricDistItem {
  ticker: string;
  name: string;
  value: number;
  weight: number;
}

interface MetricFilterState {
  pe_max?: number;
  cape_max?: number;
  roe_min?: number;
  net_margin_min?: number;
  div_yield_min?: number;
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioName, setPortfolioName] = useState("My Portfolio");
  const [savedPortfolios, setSavedPortfolios] = useState<PortfolioListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisualizationResponse | null>(null);
  const [chartView, setChartView] = useState<ChartView>("sector");
  const [newTicker, setNewTicker] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tag state
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagBreakdown, setTagBreakdown] = useState<TagBreakdown[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColour, setNewTagColour] = useState("#163963");
  const [newTagType, setNewTagType] = useState("General");
  const [customTagType, setCustomTagType] = useState("");
  const [assigningTag, setAssigningTag] = useState<number | null>(null);
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [metricFilters, setMetricFilters] = useState<MetricFilterState>({});

  useEffect(() => {
    loadSavedPortfolios().then(async (portfolios) => {
      const baiv = portfolios?.find((p) => p.name.includes("BAIV"));
      if (baiv) {
        try {
          const portfolio = await api.getPortfolio(baiv.id);
          setPortfolioName(portfolio.name);
          setHoldings(portfolio.holdings);
        } catch {}
      }
      setInitialLoading(false);
    });
    loadTags();
  }, []);

  const loadSavedPortfolios = async (): Promise<PortfolioListItem[] | undefined> => {
    try {
      const list = await api.listPortfolios();
      setSavedPortfolios(list);
      return list;
    } catch {
      return undefined;
    }
  };

  const loadTags = async () => {
    try {
      const t = await api.listTags();
      setTags(t);
    } catch {}
  };

  const loadTagBreakdown = async () => {
    const valid = holdings.filter((h) => h.ticker.trim() && h.weight > 0);
    if (valid.length === 0) return;
    try {
      const breakdown = await api.getTagBreakdown(valid);
      setTagBreakdown(breakdown);
    } catch {}
  };

  const handleVisualize = async () => {
    const valid = holdings.filter((h) => h.ticker.trim() && h.weight > 0);
    if (valid.length === 0) {
      setError("Add at least one holding");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [response] = await Promise.all([
        api.visualizePortfolio(valid),
        api.getTagBreakdown(valid).then(setTagBreakdown).catch(() => {}),
      ]);
      setResult(response);
    } catch (err: any) {
      setError(err.message || "Visualization failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.createPortfolio(portfolioName, holdings.filter((h) => h.ticker.trim()));
      await loadSavedPortfolios();
    } catch (err: any) {
      setError(err.message || "Failed to save portfolio");
    }
  };

  const handleLoad = async (id: number) => {
    try {
      const portfolio = await api.getPortfolio(id);
      setPortfolioName(portfolio.name);
      setHoldings(portfolio.holdings);
    } catch (err: any) {
      setError(err.message || "Failed to load portfolio");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deletePortfolio(id);
      await loadSavedPortfolios();
    } catch {}
  };

  const addHolding = () => {
    if (!newTicker.trim()) return;
    const weight = parseFloat(newWeight) || 5;
    setHoldings([...holdings, { ticker: newTicker.trim().toUpperCase(), weight }]);
    setNewTicker("");
    setNewWeight("");
  };

  const removeHolding = (idx: number) => {
    setHoldings(holdings.filter((_, i) => i !== idx));
  };

  const updateHolding = (idx: number, field: "ticker" | "weight", value: string) => {
    const updated = [...holdings];
    if (field === "weight") {
      updated[idx] = { ...updated[idx], weight: parseFloat(value) || 0 };
    } else {
      updated[idx] = { ...updated[idx], ticker: value.toUpperCase() };
    }
    setHoldings(updated);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

    const parseRows = (rows: string[][]) => {
      const parsed: PortfolioHolding[] = [];

      // Detect header row and find ticker/weight columns
      let tickerCol = 0;
      let weightCol = 1;
      let startRow = 0;

      if (rows.length > 0) {
        const headers = rows[0].map((h) => h.toLowerCase().trim());
        const ti = headers.findIndex((h) => h === "ticker" || h === "tickers" || h === "symbol");
        const wi = headers.findIndex((h) => h === "weight" || h === "weights" || h === "%");
        if (ti !== -1) {
          tickerCol = ti;
          if (wi !== -1) weightCol = wi;
          startRow = 1;
        }
      }

      for (let i = startRow; i < rows.length; i++) {
        const parts = rows[i];
        const ticker = (parts[tickerCol] || "").trim().replace(/['"]/g, "").toUpperCase();
        if (!ticker || !ticker.includes(".")) continue;
        const weight = parts[weightCol] ? parseFloat(parts[weightCol]) || 5 : 5;
        parsed.push({ ticker, weight });
      }
      return parsed;
    };

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let parsed: PortfolioHolding[] = [];

        if (isExcel) {
          const data = ev.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          const rows = jsonData.map((row) => row.map((cell: any) => String(cell ?? "")));
          parsed = parseRows(rows);
        } else {
          const text = ev.target?.result as string;
          if (!text) return;
          const lines = text.split(/[\r\n]+/).filter((l) => l.trim().length > 0);
          const delimiter = lines[0]?.includes("\t") ? "\t" : /[,;]/.test(lines[0] || "") ? /[,;]/ : ",";
          const rows = lines.map((line) => line.split(delimiter).map((p) => p.trim()));
          parsed = parseRows(rows);
        }

        if (parsed.length > 0) setHoldings(parsed);
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

  const handleExportPDF = async () => {
    const valid = holdings.filter((h) => h.ticker.trim() && h.weight > 0);
    if (valid.length === 0) return;
    setExporting(true);
    try {
      const blob = await api.downloadTearsheet(
        valid,
        ["summary", "sectors", "countries", "market_cap", "holdings"],
        portfolioName
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${portfolioName.replace(/\s+/g, "_")}_tearsheet.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  // Tag handlers
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const resolvedType = newTagType === "__new__" ? customTagType.trim() || "General" : newTagType;
    try {
      await api.createTag(newTagName.trim(), newTagColour, resolvedType);
      setNewTagName("");
      if (newTagType === "__new__") {
        setNewTagType(resolvedType);
        setCustomTagType("");
      }
      await loadTags();
    } catch (err: any) {
      setError(err.message || "Failed to create tag");
    }
  };

  const handleDeleteTag = async (id: number) => {
    try {
      await api.deleteTag(id);
      await loadTags();
      if (result) loadTagBreakdown();
    } catch {}
  };

  const handleAssignTicker = async (tagId: number, ticker: string) => {
    try {
      await api.assignTickersToTag(tagId, [ticker]);
      await loadTags();
      if (result) loadTagBreakdown();
    } catch {}
  };

  const handleUnassignTicker = async (tagId: number, ticker: string) => {
    try {
      await api.unassignTickerFromTag(tagId, ticker);
      await loadTags();
      if (result) loadTagBreakdown();
    } catch {}
  };

  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0);

  // Build distribution data for metric views
  const buildDistribution = (
    holdings: MetricSummary[],
    metric: keyof MetricSummary
  ): MetricDistItem[] => {
    return holdings
      .filter((h) => h[metric] != null && typeof h[metric] === "number")
      .map((h) => ({
        ticker: h.ticker.split(".")[0],
        name: h.company_name.length > 25 ? h.company_name.substring(0, 25) + "..." : h.company_name,
        value: h[metric] as number,
        weight: h.weight,
      }))
      .sort((a, b) => a.value - b.value);
  };

  // Build market cap buckets
  const buildMarketCapBreakdown = (holdings: MetricSummary[]) => {
    const buckets: Record<string, { weight: number; count: number; tickers: string[] }> = {};
    const order = ["Mega (>$100B)", "Large ($20-100B)", "Mid ($5-20B)", "Small ($1-5B)", "Micro (<$1B)", "Unknown"];
    for (const o of order) buckets[o] = { weight: 0, count: 0, tickers: [] };

    for (const h of holdings) {
      const mcap = h.market_cap_usd;
      let bucket: string;
      if (!mcap) bucket = "Unknown";
      else if (mcap >= 100e9) bucket = "Mega (>$100B)";
      else if (mcap >= 20e9) bucket = "Large ($20-100B)";
      else if (mcap >= 5e9) bucket = "Mid ($5-20B)";
      else if (mcap >= 1e9) bucket = "Small ($1-5B)";
      else bucket = "Micro (<$1B)";

      buckets[bucket].weight += h.weight;
      buckets[bucket].count++;
      buckets[bucket].tickers.push(h.ticker);
    }

    return order
      .filter((name) => buckets[name].count > 0)
      .map((name) => ({ name, ...buckets[name] }));
  };

  const isDistView = chartView === "valuation" || chartView === "profitability";
  const isTagView = chartView === "tag";

  // Group tags by type
  const tagsByType: Record<string, Tag[]> = {};
  for (const tag of tags) {
    const type = tag.tag_type || "General";
    if (!tagsByType[type]) tagsByType[type] = [];
    tagsByType[type].push(tag);
  }
  const tagTypes = Array.from(new Set(["General", ...Object.keys(tagsByType)])).sort();

  // Filtered holdings for the detail table (5a)
  const filteredHoldings = result?.holdings.filter((h) => {
    const f = metricFilters;
    if (f.pe_max != null && (h.pe_ratio == null || h.pe_ratio > f.pe_max)) return false;
    if (f.cape_max != null && (h.cape_ratio == null || h.cape_ratio > f.cape_max)) return false;
    if (f.roe_min != null && (h.roe == null || h.roe < f.roe_min)) return false;
    if (f.net_margin_min != null && (h.net_margin == null || h.net_margin < f.net_margin_min)) return false;
    if (f.div_yield_min != null && (h.div_yield == null || h.div_yield < f.div_yield_min)) return false;
    return true;
  }) ?? [];

  if (initialLoading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-ba-navy">Portfolio Visualizer</h1>
          <p className="text-gray-500 mt-1">Loading portfolio...</p>
        </div>
        <LoadingSpinner message="Loading BAIV portfolio..." />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ba-navy">Portfolio Visualizer</h1>
        <p className="text-gray-500 mt-1">
          Analyze portfolio composition by sector, country, and key metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Holdings input */}
        <div className="lg:col-span-2 ba-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg font-semibold text-ba-navy">Holdings</h3>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="ba-btn text-xs py-1">
                Upload File
              </button>
              <span className="text-xs text-gray-400">
                Total: {formatNumber(totalWeight, 1)}%
              </span>
            </div>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto mb-3">
            {holdings.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <input
                  value={h.ticker}
                  onChange={(e) => updateHolding(i, "ticker", e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1 font-mono text-sm focus:border-ba-accent outline-none"
                  placeholder="TICKER.EXCHANGE"
                />
                <input
                  value={h.weight}
                  onChange={(e) => updateHolding(i, "weight", e.target.value)}
                  type="number"
                  step="0.1"
                  className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:border-ba-accent outline-none"
                />
                <span className="text-xs text-gray-400 w-4">%</span>
                <button onClick={() => removeHolding(i)} className="text-gray-300 hover:text-red-500">
                  &times;
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <TickerSearch
              value={newTicker}
              onChange={setNewTicker}
              onSelect={(t) => {
                const weight = parseFloat(newWeight) || 5;
                setHoldings([...holdings, { ticker: t, weight }]);
                setNewTicker("");
                setNewWeight("");
              }}
              placeholder="Add ticker..."
              className="flex-1"
            />
            <input
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              placeholder="Wt%"
              type="number"
              className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:border-ba-accent outline-none"
              onKeyDown={(e) => e.key === "Enter" && addHolding()}
            />
            <button onClick={addHolding} className="ba-btn text-xs py-1">Add</button>
          </div>
        </div>

        {/* Save/Load panel */}
        <div className="ba-card">
          <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Portfolios</h3>
          <div className="mb-3">
            <input
              value={portfolioName}
              onChange={(e) => setPortfolioName(e.target.value)}
              placeholder="Portfolio name"
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm mb-2 focus:border-ba-accent outline-none"
            />
            <div className="flex gap-2">
              <button onClick={handleSave} className="ba-btn text-xs py-1 flex-1">Save</button>
              <button onClick={handleVisualize} disabled={loading} className="ba-btn-primary text-xs py-1 flex-1 disabled:opacity-50">
                {loading ? "..." : "Visualize"}
              </button>
            </div>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="ba-btn text-xs py-1 w-full mt-2 disabled:opacity-50"
            >
              {exporting ? "Exporting..." : "Export PDF Tear Sheet"}
            </button>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {savedPortfolios.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border border-gray-100 rounded px-2 py-1">
                <button onClick={() => handleLoad(p.id)} className="text-ba-accent hover:underline text-left truncate flex-1">
                  {p.name} ({p.num_holdings})
                </button>
                <button onClick={() => handleDelete(p.id)} className="text-gray-300 hover:text-red-500 ml-2">&times;</button>
              </div>
            ))}
            {savedPortfolios.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">No saved portfolios</p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && <LoadingSpinner message="Analyzing portfolio..." />}

      {!loading && result && (
        <div className="space-y-6">
          {/* Summary metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-3">
            {[
              { label: "Holdings", value: result.num_holdings.toString() },
              { label: "Total Wt", value: `${formatNumber(result.total_weight, 1)}%` },
              { label: "Top 10", value: `${formatNumber(result.top_10_weight, 1)}%` },
              { label: "HHI", value: formatNumber(result.hhi, 0) },
              { label: "Wtd PE", value: result.weighted_pe ? formatNumber(result.weighted_pe, 1) : "N/A" },
              { label: "Wtd CAPE", value: result.weighted_cape ? formatNumber(result.weighted_cape, 1) : "N/A" },
              { label: "Wtd PB", value: result.weighted_pb ? formatNumber(result.weighted_pb, 1) : "N/A" },
              { label: "Wtd Div%", value: result.weighted_div_yield ? `${formatNumber(result.weighted_div_yield, 1)}%` : "N/A" },
              { label: "Wtd ROE", value: result.weighted_roe ? `${formatNumber(result.weighted_roe, 1)}%` : "N/A" },
              { label: "Wtd Margin", value: result.weighted_net_margin ? `${formatNumber(result.weighted_net_margin, 1)}%` : "N/A" },
            ].map((card) => (
              <div key={card.label} className="ba-card text-center py-3">
                <p className="text-xs text-gray-400 uppercase">{card.label}</p>
                <p className="text-lg font-semibold text-ba-navy">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="ba-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">Breakdown</h3>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { key: "sector", label: "Sector" },
                    { key: "country", label: "Country" },
                    { key: "region", label: "Region" },
                    { key: "marketcap", label: "Mkt Cap" },
                    { key: "valuation", label: "Valuation" },
                    { key: "profitability", label: "Profitability" },
                    { key: "benchmark", label: "vs Benchmark" },
                    { key: "tag", label: "By Tag" },
                  ] as { key: ChartView; label: string }[]
                ).map((view) => (
                  <button
                    key={view.key}
                    onClick={() => {
                      setChartView(view.key);
                      if (view.key === "tag" && tagBreakdown.length === 0) loadTagBreakdown();
                    }}
                    className={`px-3 py-1 text-xs rounded ${
                      chartView === view.key
                        ? "bg-ba-navy text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>

            {chartView === "marketcap" && result ? (
              /* Market cap breakdown */
              (() => {
                const mcData = buildMarketCapBreakdown(result.holdings);
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={mcData.map((b) => ({ name: b.name, value: b.weight }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          label={({ name, value }) => `${name}: ${formatNumber(value, 1)}%`}
                          labelLine={true}
                        >
                          {mcData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => `${formatNumber(Number(value), 1)}%`} />
                      </PieChart>
                    </ResponsiveContainer>

                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={mcData.map((b) => ({
                          name: b.name,
                          weight: b.weight,
                          count: b.count,
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis type="number" stroke="#163963" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" stroke="#163963" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white border border-gray-200 rounded p-2 text-xs shadow">
                                  <p className="font-semibold text-ba-navy">{d.name}</p>
                                  <p>Weight: {formatNumber(d.weight, 1)}%</p>
                                  <p>Stocks: {d.count}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="weight" fill="#163963" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()
            ) : chartView === "valuation" && result ? (
              /* Valuation: summary cards + compact histogram + sortable table */
              (() => {
                const metricDefs = [
                  { key: "pe_ratio" as keyof MetricSummary, label: "P/E", avg: result.weighted_pe, suffix: "x", color: "#163963" },
                  { key: "cape_ratio" as keyof MetricSummary, label: "CAPE", avg: result.weighted_cape, suffix: "x", color: "#2980b9" },
                  { key: "pb_ratio" as keyof MetricSummary, label: "P/B", avg: result.weighted_pb, suffix: "x", color: "#5dade2" },
                ];
                const buildBuckets = (metric: keyof MetricSummary, numBuckets: number = 8) => {
                  const vals = result.holdings.filter((h) => h[metric] != null && typeof h[metric] === "number").map((h) => ({ v: h[metric] as number, w: h.weight }));
                  if (vals.length === 0) return [];
                  const min = Math.min(...vals.map((v) => v.v));
                  const max = Math.max(...vals.map((v) => v.v));
                  const step = (max - min) / numBuckets || 1;
                  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
                    range: `${formatNumber(min + i * step, 0)}-${formatNumber(min + (i + 1) * step, 0)}`,
                    count: 0,
                    weight: 0,
                  }));
                  vals.forEach(({ v, w }) => {
                    const idx = Math.min(Math.floor((v - min) / step), numBuckets - 1);
                    buckets[idx].count++;
                    buckets[idx].weight += w;
                  });
                  return buckets;
                };
                return (
                  <div className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-4">
                      {metricDefs.map((m) => (
                        <div key={m.label} className="text-center p-3 bg-gray-50 rounded">
                          <p className="text-xs text-gray-400 uppercase">Wtd {m.label}</p>
                          <p className="text-2xl font-semibold text-ba-navy">{m.avg != null ? formatNumber(m.avg, 1) + m.suffix : "N/A"}</p>
                        </div>
                      ))}
                    </div>
                    {/* Histograms side-by-side */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {metricDefs.map((m) => {
                        const data = buildBuckets(m.key);
                        if (data.length === 0) return <div key={m.label} className="text-xs text-gray-400 text-center py-8">No {m.label} data</div>;
                        return (
                          <div key={m.label}>
                            <h4 className="text-sm font-medium text-ba-navy mb-2">{m.label} Distribution</h4>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                <XAxis dataKey="range" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10 }} label={{ value: "Wt%", angle: -90, position: "insideLeft", fontSize: 10 }} />
                                <Tooltip formatter={(val) => `${formatNumber(Number(val), 1)}%`} />
                                <Bar dataKey="weight" name="Weight" fill={m.color} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        );
                      })}
                    </div>
                    {/* Compact table: top 15 cheapest + most expensive */}
                    <div>
                      <h4 className="text-sm font-medium text-ba-navy mb-2">Holdings by Valuation</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="border-b-2 border-ba-navy">
                              <th className="px-2 py-1.5 text-left text-ba-navy font-semibold">Ticker</th>
                              <th className="px-2 py-1.5 text-left text-ba-navy font-semibold">Company</th>
                              <th className="px-2 py-1.5 text-right text-ba-navy font-semibold">Wt%</th>
                              <th className="px-2 py-1.5 text-right text-ba-navy font-semibold">P/E</th>
                              <th className="px-2 py-1.5 text-right text-ba-navy font-semibold">CAPE</th>
                              <th className="px-2 py-1.5 text-right text-ba-navy font-semibold">P/B</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...result.holdings]
                              .filter((h) => h.pe_ratio != null || h.cape_ratio != null)
                              .sort((a, b) => (a.cape_ratio ?? a.pe_ratio ?? 999) - (b.cape_ratio ?? b.pe_ratio ?? 999))
                              .map((h) => (
                                <tr key={h.ticker} className="border-b border-gray-100">
                                  <td className="px-2 py-1 font-mono font-medium text-ba-navy">{h.ticker.split(".")[0]}</td>
                                  <td className="px-2 py-1 text-gray-500 max-w-[150px] truncate">{h.company_name}</td>
                                  <td className="px-2 py-1 text-right">{formatNumber(h.weight, 1)}</td>
                                  <td className="px-2 py-1 text-right">{h.pe_ratio != null ? formatNumber(h.pe_ratio, 1) : "-"}</td>
                                  <td className="px-2 py-1 text-right">{h.cape_ratio != null ? formatNumber(h.cape_ratio, 1) : "-"}</td>
                                  <td className="px-2 py-1 text-right">{h.pb_ratio != null ? formatNumber(h.pb_ratio, 1) : "-"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : chartView === "profitability" && result ? (
              /* Profitability: summary cards + histogram + table */
              (() => {
                const metricDefs = [
                  { key: "roe" as keyof MetricSummary, label: "ROE", avg: result.weighted_roe, suffix: "%", color: "#27ae60" },
                  { key: "net_margin" as keyof MetricSummary, label: "Net Margin", avg: result.weighted_net_margin, suffix: "%", color: "#f39c12" },
                ];
                const buildBuckets = (metric: keyof MetricSummary, numBuckets: number = 8) => {
                  const vals = result.holdings.filter((h) => h[metric] != null && typeof h[metric] === "number").map((h) => ({ v: h[metric] as number, w: h.weight }));
                  if (vals.length === 0) return [];
                  const min = Math.min(...vals.map((v) => v.v));
                  const max = Math.max(...vals.map((v) => v.v));
                  const step = (max - min) / numBuckets || 1;
                  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
                    range: `${formatNumber(min + i * step, 0)}-${formatNumber(min + (i + 1) * step, 0)}`,
                    count: 0,
                    weight: 0,
                  }));
                  vals.forEach(({ v, w }) => {
                    const idx = Math.min(Math.floor((v - min) / step), numBuckets - 1);
                    buckets[idx].count++;
                    buckets[idx].weight += w;
                  });
                  return buckets;
                };
                return (
                  <div className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-4">
                      {metricDefs.map((m) => (
                        <div key={m.label} className="text-center p-3 bg-gray-50 rounded">
                          <p className="text-xs text-gray-400 uppercase">Wtd {m.label}</p>
                          <p className="text-2xl font-semibold text-ba-navy">{m.avg != null ? formatNumber(m.avg, 1) + m.suffix : "N/A"}</p>
                        </div>
                      ))}
                    </div>
                    {/* Histograms side-by-side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {metricDefs.map((m) => {
                        const data = buildBuckets(m.key);
                        if (data.length === 0) return <div key={m.label} className="text-xs text-gray-400 text-center py-8">No {m.label} data</div>;
                        return (
                          <div key={m.label}>
                            <h4 className="text-sm font-medium text-ba-navy mb-2">{m.label} Distribution</h4>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                <XAxis dataKey="range" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10 }} label={{ value: "Wt%", angle: -90, position: "insideLeft", fontSize: 10 }} />
                                <Tooltip formatter={(val) => `${formatNumber(Number(val), 1)}%`} />
                                <Bar dataKey="weight" name="Weight" fill={m.color} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        );
                      })}
                    </div>
                    {/* Compact table */}
                    <div>
                      <h4 className="text-sm font-medium text-ba-navy mb-2">Holdings by Profitability</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="border-b-2 border-ba-navy">
                              <th className="px-2 py-1.5 text-left text-ba-navy font-semibold">Ticker</th>
                              <th className="px-2 py-1.5 text-left text-ba-navy font-semibold">Company</th>
                              <th className="px-2 py-1.5 text-right text-ba-navy font-semibold">Wt%</th>
                              <th className="px-2 py-1.5 text-right text-ba-navy font-semibold">ROE%</th>
                              <th className="px-2 py-1.5 text-right text-ba-navy font-semibold">Margin%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...result.holdings]
                              .filter((h) => h.roe != null || h.net_margin != null)
                              .sort((a, b) => (b.roe ?? 0) - (a.roe ?? 0))
                              .map((h) => (
                                <tr key={h.ticker} className="border-b border-gray-100">
                                  <td className="px-2 py-1 font-mono font-medium text-ba-navy">{h.ticker.split(".")[0]}</td>
                                  <td className="px-2 py-1 text-gray-500 max-w-[150px] truncate">{h.company_name}</td>
                                  <td className="px-2 py-1 text-right">{formatNumber(h.weight, 1)}</td>
                                  <td className="px-2 py-1 text-right">{h.roe != null ? formatNumber(h.roe, 1) : "-"}</td>
                                  <td className="px-2 py-1 text-right">{h.net_margin != null ? formatNumber(h.net_margin, 1) : "-"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : isTagView ? (
              /* Tag breakdown — grouped by tag_type */
              tagBreakdown.length > 0 ? (
                <div className="space-y-8">
                  {(() => {
                    // Group breakdown items by tag_type
                    const byType: Record<string, TagBreakdown[]> = {};
                    for (const b of tagBreakdown) {
                      const tt = b.tag_type || "General";
                      if (!byType[tt]) byType[tt] = [];
                      byType[tt].push(b);
                    }
                    const THEME_COLORS: Record<string, string[]> = {
                      General: ["#163963", "#005ba5", "#2980b9", "#3498db", "#5dade2", "#7fb3d8", "#a9cce3"],
                      _1: ["#1a5276", "#1f618d", "#2e86c1", "#5499c7", "#85c1e9", "#aed6f1", "#d4e6f1"],
                      _2: ["#4a235a", "#6c3483", "#8e44ad", "#a569bd", "#bb8fce", "#d2b4de", "#e8daef"],
                      _3: ["#0e6655", "#148f77", "#1abc9c", "#48c9b0", "#76d7c4", "#a3e4d7", "#d1f2eb"],
                      _4: ["#7e5109", "#b9770e", "#d4ac0d", "#f1c40f", "#f4d03f", "#f7dc6f", "#fad7a0"],
                    };
                    const typeKeys = Object.keys(byType).sort();
                    return typeKeys.map((type, typeIdx) => {
                      const items = byType[type];
                      const fallbackPalette = Object.values(THEME_COLORS)[((typeIdx + 1) % Object.keys(THEME_COLORS).length)];
                      return (
                        <div key={type}>
                          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 border-b border-gray-100 pb-1">{type}</h4>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ResponsiveContainer width="100%" height={280}>
                              <PieChart>
                                <Pie
                                  data={items.map((b) => ({ name: b.name, value: b.weight }))}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={100}
                                  label={({ name, value }) => `${name}: ${formatNumber(value, 1)}%`}
                                  labelLine={true}
                                >
                                  {items.map((b, i) => (
                                    <Cell key={i} fill={b.colour || fallbackPalette[i % fallbackPalette.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => `${formatNumber(Number(value), 1)}%`} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-2 font-semibold text-gray-500">Tag</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">Wt %</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">#</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">P/E</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">CAPE</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">P/B</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">ROE %</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">Margin %</th>
                                    <th className="text-right py-2 px-2 font-semibold text-gray-500">Div %</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((b, i) => (
                                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                                      <td className="py-2 px-2">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: b.colour || fallbackPalette[i % fallbackPalette.length] }} />
                                          <span className="font-medium text-ba-navy">{b.name}</span>
                                        </div>
                                      </td>
                                      <td className="text-right py-2 px-2 font-mono">{formatNumber(b.weight, 1)}</td>
                                      <td className="text-right py-2 px-2 text-gray-500">{b.count}</td>
                                      <td className="text-right py-2 px-2 font-mono">{b.weighted_pe != null ? formatNumber(b.weighted_pe, 1) : "–"}</td>
                                      <td className="text-right py-2 px-2 font-mono">{b.weighted_cape != null ? formatNumber(b.weighted_cape, 1) : "–"}</td>
                                      <td className="text-right py-2 px-2 font-mono">{b.weighted_pb != null ? formatNumber(b.weighted_pb, 1) : "–"}</td>
                                      <td className="text-right py-2 px-2 font-mono">{b.weighted_roe != null ? formatNumber(b.weighted_roe, 1) : "–"}</td>
                                      <td className="text-right py-2 px-2 font-mono">{b.weighted_net_margin != null ? formatNumber(b.weighted_net_margin, 1) : "–"}</td>
                                      <td className="text-right py-2 px-2 font-mono">{b.weighted_div_yield != null ? formatNumber(b.weighted_div_yield, 1) : "–"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No tags created yet. Create tags below to see breakdown.</p>
              )
            ) : chartView === "region" && result ? (
              /* Regional breakdown (5g) */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={result.region_breakdown.map((b) => ({ name: b.name, value: b.weight }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={({ name, value }) => `${name}: ${formatNumber(value, 1)}%`}
                      labelLine={true}
                    >
                      {result.region_breakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `${formatNumber(Number(value), 1)}%`} />
                  </PieChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={result.region_breakdown.map((b) => ({
                      name: b.name,
                      weight: b.weight,
                      count: b.count,
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" stroke="#163963" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" stroke="#163963" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded p-2 text-xs shadow">
                              <p className="font-semibold text-ba-navy">{d.name}</p>
                              <p>Weight: {formatNumber(d.weight, 1)}%</p>
                              <p>Stocks: {d.count}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="weight" fill="#163963" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : chartView === "benchmark" && result ? (
              /* Benchmark comparison (5d/5e) */
              <div className="space-y-6">
                <p className="text-xs text-gray-400">Benchmark: MSCI EAFE Value (approximate weights)</p>
                {[
                  { label: "Sector", data: result.benchmark_sector },
                  { label: "Country", data: result.benchmark_country },
                ].map(({ label, data }) => (
                  <div key={label}>
                    <h4 className="text-sm font-medium text-ba-navy mb-2">{label} — Portfolio vs Benchmark</h4>
                    <ResponsiveContainer width="100%" height={Math.max(250, data.length * 22)}>
                      <BarChart
                        data={data.map((b) => ({
                          name: b.name.length > 18 ? b.name.substring(0, 18) + "…" : b.name,
                          portfolio: b.portfolio_weight,
                          benchmark: b.benchmark_weight,
                          active: b.active_weight,
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 110, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis type="number" stroke="#163963" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" stroke="#163963" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip
                          formatter={(val: any) => `${formatNumber(Number(val), 1)}%`}
                        />
                        <Bar dataKey="portfolio" name="Portfolio" fill="#163963" />
                        <Bar dataKey="benchmark" name="Benchmark" fill="#a9cce3" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="overflow-x-auto mt-2">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-1 px-2 font-semibold text-gray-500">{label}</th>
                            <th className="text-right py-1 px-2 font-semibold text-gray-500">Portfolio</th>
                            <th className="text-right py-1 px-2 font-semibold text-gray-500">Benchmark</th>
                            <th className="text-right py-1 px-2 font-semibold text-gray-500">Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((b) => (
                            <tr key={b.name} className="border-b border-gray-100">
                              <td className="py-1 px-2 font-medium text-ba-navy">{b.name}</td>
                              <td className="py-1 px-2 text-right font-mono">{formatNumber(b.portfolio_weight, 1)}%</td>
                              <td className="py-1 px-2 text-right font-mono text-gray-500">{formatNumber(b.benchmark_weight, 1)}%</td>
                              <td className={`py-1 px-2 text-right font-mono font-semibold ${b.active_weight > 0 ? "text-green-600" : b.active_weight < 0 ? "text-red-600" : "text-gray-400"}`}>
                                {b.active_weight > 0 ? "+" : ""}{formatNumber(b.active_weight, 1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Standard sector/country charts */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={(chartView === "sector" ? result.sector_breakdown : result.country_breakdown).map((b) => ({
                        name: b.name,
                        value: b.weight,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={({ name, value }) => `${name}: ${formatNumber(value, 1)}%`}
                      labelLine={true}
                    >
                      {(chartView === "sector" ? result.sector_breakdown : result.country_breakdown).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `${formatNumber(Number(value), 1)}%`} />
                  </PieChart>
                </ResponsiveContainer>

                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={(chartView === "sector" ? result.sector_breakdown : result.country_breakdown).map((b) => ({
                      name: b.name.length > 15 ? b.name.substring(0, 15) + "..." : b.name,
                      fullName: b.name,
                      weight: b.weight,
                      count: b.count,
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" stroke="#163963" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" stroke="#163963" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded p-2 text-xs shadow">
                              <p className="font-semibold text-ba-navy">{d.fullName}</p>
                              <p>Weight: {formatNumber(d.weight, 1)}%</p>
                              <p>Stocks: {d.count}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="weight" fill="#163963" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Tag Management */}
          <div className="ba-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">Tags</h3>
              <button
                onClick={() => setShowTagPanel(!showTagPanel)}
                className="ba-btn text-xs py-1"
              >
                {showTagPanel ? "Hide" : "Manage Tags"}
              </button>
            </div>

            {showTagPanel && (
              <div className="space-y-4">
                {/* Create tag */}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={newTagType}
                    onChange={(e) => {
                      setNewTagType(e.target.value);
                      if (e.target.value !== "__new__") setCustomTagType("");
                    }}
                    className="w-32 border border-gray-200 rounded px-2 py-1 text-sm focus:border-ba-accent outline-none bg-white"
                  >
                    {tagTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="__new__">+ New type...</option>
                  </select>
                  {newTagType === "__new__" && (
                    <input
                      value={customTagType}
                      onChange={(e) => setCustomTagType(e.target.value)}
                      placeholder="e.g. Theme, Quality"
                      className="w-36 border border-gray-200 rounded px-2 py-1 text-sm focus:border-ba-accent outline-none"
                      autoFocus
                    />
                  )}
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name..."
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:border-ba-accent outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  />
                  <input
                    type="color"
                    value={newTagColour}
                    onChange={(e) => setNewTagColour(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                  />
                  <button onClick={handleCreateTag} className="ba-btn text-xs py-1">Create</button>
                </div>

                {/* Tags grouped by type */}
                {tagTypes.map((type) => (
                  <div key={type}>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{type}</h4>
                    <div className="space-y-2">
                      {(tagsByType[type] || []).map((tag) => (
                        <div key={tag.id} className="border border-gray-100 rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full inline-block"
                                style={{ backgroundColor: tag.colour }}
                              />
                              <span className="text-sm font-medium text-ba-navy">{tag.name}</span>
                              <span className="text-xs text-gray-400">({tag.tickers.length})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setAssigningTag(assigningTag === tag.id ? null : tag.id)}
                                className="text-xs text-ba-accent hover:underline"
                              >
                                {assigningTag === tag.id ? "Done" : "+ Assign"}
                              </button>
                              <button
                                onClick={() => handleDeleteTag(tag.id)}
                                className="text-gray-300 hover:text-red-500"
                              >
                                &times;
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {tag.tickers.map((ticker) => (
                              <span
                                key={ticker}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border"
                                style={{ borderColor: tag.colour, color: tag.colour }}
                              >
                                {ticker.split(".")[0]}
                                <button
                                  onClick={() => handleUnassignTicker(tag.id, ticker)}
                                  className="hover:text-red-500"
                                >
                                  &times;
                                </button>
                              </span>
                            ))}
                          </div>

                          {assigningTag === tag.id && (() => {
                            // Collect tickers assigned to sibling tags of the same tag_type
                            const siblingTickers = new Set<string>();
                            const siblings = tagsByType[tag.tag_type || "General"] || [];
                            for (const s of siblings) {
                              if (s.id !== tag.id) {
                                for (const t of s.tickers) siblingTickers.add(t);
                              }
                            }
                            return (
                              <div className="mt-2 flex flex-wrap gap-1 border-t border-gray-100 pt-2">
                                {holdings
                                  .filter((h) => h.ticker.trim() && !tag.tickers.includes(h.ticker) && !siblingTickers.has(h.ticker))
                                  .map((h) => (
                                    <button
                                      key={h.ticker}
                                      onClick={() => handleAssignTicker(tag.id, h.ticker)}
                                      className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-ba-navy hover:text-white"
                                    >
                                      {h.ticker.split(".")[0]}
                                    </button>
                                  ))}
                                {holdings.filter((h) => h.ticker.trim() && !tag.tickers.includes(h.ticker) && !siblingTickers.has(h.ticker)).length === 0 && (
                                  <span className="text-xs text-gray-400 italic">All holdings assigned within this theme</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {tags.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">
                    No tags yet. Create one above to categorize holdings.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Position Size Bar Chart (5b) */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Position Sizes</h3>
            <ResponsiveContainer width="100%" height={Math.max(300, result.holdings.length * 20)}>
              <BarChart
                data={[...result.holdings].sort((a, b) => b.weight - a.weight).map((h) => ({
                  name: h.ticker.split(".")[0],
                  weight: h.weight,
                  company: h.company_name,
                }))}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#163963" tick={{ fontSize: 10 }} unit="%" />
                <YAxis dataKey="name" type="category" stroke="#163963" tick={{ fontSize: 9 }} width={60} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded p-2 text-xs shadow">
                          <p className="font-semibold text-ba-navy">{d.company}</p>
                          <p>Weight: {formatNumber(d.weight, 2)}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="weight" fill="#163963" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Holdings table with filters (5a) and performance columns (5c) */}
          <div className="ba-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">Holdings Detail</h3>
              <span className="text-xs text-gray-400">
                {filteredHoldings.length} / {result.holdings.length} shown
              </span>
            </div>

            {/* Metric filters (5a) */}
            <div className="flex flex-wrap gap-3 mb-3 text-xs">
              {[
                { key: "pe_max" as keyof MetricFilterState, label: "PE <", placeholder: "e.g. 20" },
                { key: "cape_max" as keyof MetricFilterState, label: "CAPE <", placeholder: "e.g. 15" },
                { key: "roe_min" as keyof MetricFilterState, label: "ROE >", placeholder: "e.g. 10" },
                { key: "net_margin_min" as keyof MetricFilterState, label: "Margin >", placeholder: "e.g. 5" },
                { key: "div_yield_min" as keyof MetricFilterState, label: "Div Yld >", placeholder: "e.g. 2" },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-gray-500">{label}</span>
                  <input
                    type="number"
                    step="any"
                    placeholder={placeholder}
                    value={metricFilters[key] ?? ""}
                    onChange={(e) => setMetricFilters({ ...metricFilters, [key]: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:border-ba-accent outline-none"
                  />
                </div>
              ))}
              {Object.values(metricFilters).some((v) => v != null) && (
                <button onClick={() => setMetricFilters({})} className="text-xs text-red-500 hover:underline">Clear</button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ba-navy">
                    <th className="px-2 py-2 text-left text-ba-navy font-semibold">Ticker</th>
                    <th className="px-2 py-2 text-left text-ba-navy font-semibold">Company</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Wt%</th>
                    <th className="px-2 py-2 text-left text-ba-navy font-semibold">Sector</th>
                    <th className="px-2 py-2 text-left text-ba-navy font-semibold">Country</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Mkt Cap</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">PE</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">CAPE</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">PB</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Div%</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">ROE</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">Margin</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">1M</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">3M</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">6M</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">12M</th>
                    <th className="px-2 py-2 text-right text-ba-navy font-semibold">YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHoldings.map((h) => (
                    <tr key={h.ticker} className="border-b border-gray-100 hover:bg-gray-50 text-xs">
                      <td className="px-2 py-1.5 font-mono font-medium text-ba-navy">{h.ticker}</td>
                      <td className="px-2 py-1.5 text-gray-600 max-w-[150px] truncate">{h.company_name}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{formatNumber(h.weight, 1)}</td>
                      <td className="px-2 py-1.5 text-gray-500">{h.sector || "-"}</td>
                      <td className="px-2 py-1.5 text-gray-500">{h.country || "-"}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">
                        {h.market_cap_usd ? formatCurrency(h.market_cap_usd) : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-right">{h.pe_ratio ? formatNumber(h.pe_ratio, 1) : "-"}</td>
                      <td className="px-2 py-1.5 text-right">{h.cape_ratio ? formatNumber(h.cape_ratio, 1) : "-"}</td>
                      <td className="px-2 py-1.5 text-right">{h.pb_ratio ? formatNumber(h.pb_ratio, 1) : "-"}</td>
                      <td className="px-2 py-1.5 text-right">{h.div_yield ? formatNumber(h.div_yield, 1) : "-"}</td>
                      <td className="px-2 py-1.5 text-right">{h.roe ? formatNumber(h.roe, 1) + "%" : "-"}</td>
                      <td className="px-2 py-1.5 text-right">{h.net_margin ? formatNumber(h.net_margin, 1) + "%" : "-"}</td>
                      {[h.return_1m, h.return_3m, h.return_6m, h.return_12m, h.return_ytd].map((ret, i) => (
                        <td key={i} className={`px-2 py-1.5 text-right font-mono ${ret != null ? (ret >= 0 ? "text-green-600" : "text-red-600") : "text-gray-300"}`}>
                          {ret != null ? `${ret >= 0 ? "+" : ""}${formatNumber(ret, 1)}%` : "-"}
                        </td>
                      ))}
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
