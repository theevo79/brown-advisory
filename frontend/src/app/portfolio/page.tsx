"use client";

import { useState, useEffect, useRef } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import { formatNumber, formatCurrency } from "@/lib/formatters";
import type { PortfolioHolding, PortfolioListItem, VisualizationResponse } from "@/lib/types";
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
  Legend,
} from "recharts";

const COLORS = [
  "#163963", "#005ba5", "#2980b9", "#3498db", "#5dade2",
  "#7fb3d8", "#a9cce3", "#d4e6f1", "#85929e", "#566573",
  "#2c3e50", "#1a5276", "#154360", "#1b4f72", "#21618c",
  "#2874a6",
];

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [portfolioName, setPortfolioName] = useState("My Portfolio");
  const [savedPortfolios, setSavedPortfolios] = useState<PortfolioListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisualizationResponse | null>(null);
  const [chartView, setChartView] = useState<"sector" | "country">("sector");
  const [newTicker, setNewTicker] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSavedPortfolios().then(async (portfolios) => {
      // Auto-load the BAIV portfolio if it exists
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

  const handleVisualize = async () => {
    const valid = holdings.filter((h) => h.ticker.trim() && h.weight > 0);
    if (valid.length === 0) {
      setError("Add at least one holding");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.visualizePortfolio(valid);
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split(/[\n\r]+/).filter(Boolean);
      const parsed: PortfolioHolding[] = [];
      for (const line of lines) {
        const parts = line.split(/[,\t;]+/).map((p) => p.trim().replace(/['"]/g, ""));
        if (parts.length >= 2 && parts[0].includes(".")) {
          parsed.push({ ticker: parts[0].toUpperCase(), weight: parseFloat(parts[1]) || 5 });
        } else if (parts[0].includes(".")) {
          parsed.push({ ticker: parts[0].toUpperCase(), weight: 5 });
        }
      }
      if (parsed.length > 0) setHoldings(parsed);
    };
    reader.readAsText(file);
  };

  const handleExportPDF = async () => {
    const valid = holdings.filter((h) => h.ticker.trim() && h.weight > 0);
    if (valid.length === 0) return;
    setExporting(true);
    try {
      const blob = await api.downloadTearsheet(valid);
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

  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0);

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
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="ba-btn text-xs py-1">
                Upload CSV
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
            <input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              placeholder="Add ticker..."
              className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:border-ba-accent outline-none"
              onKeyDown={(e) => e.key === "Enter" && addHolding()}
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
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: "Holdings", value: result.num_holdings.toString() },
              { label: "Total Weight", value: `${formatNumber(result.total_weight, 1)}%` },
              { label: "Top 10 Wt", value: `${formatNumber(result.top_10_weight, 1)}%` },
              { label: "HHI", value: formatNumber(result.hhi, 0) },
              { label: "Wtd PE", value: result.weighted_pe ? formatNumber(result.weighted_pe, 1) : "N/A" },
              { label: "Wtd ROE", value: result.weighted_roe ? `${formatNumber(result.weighted_roe, 1)}%` : "N/A" },
            ].map((card) => (
              <div key={card.label} className="ba-card text-center py-3">
                <p className="text-xs text-gray-400 uppercase">{card.label}</p>
                <p className="text-xl font-semibold text-ba-navy">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="ba-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold text-ba-navy">Breakdown</h3>
              <div className="flex gap-1">
                {(["sector", "country"] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setChartView(view)}
                    className={`px-3 py-1 text-xs rounded ${
                      chartView === view
                        ? "bg-ba-navy text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {view.charAt(0).toUpperCase() + view.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie chart */}
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
                  <Tooltip formatter={(value: number) => `${formatNumber(value, 1)}%`} />
                </PieChart>
              </ResponsiveContainer>

              {/* Bar chart */}
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
          </div>

          {/* Holdings table */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Holdings Detail</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ba-navy">
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Ticker</th>
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Company</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">Weight</th>
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Sector</th>
                    <th className="px-3 py-2 text-left text-ba-navy font-semibold">Country</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">Mkt Cap</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">PE</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">ROE</th>
                    <th className="px-3 py-2 text-right text-ba-navy font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {result.holdings.map((h) => (
                    <tr key={h.ticker} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono font-medium text-ba-navy">{h.ticker}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">{h.company_name}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatNumber(h.weight, 1)}%</td>
                      <td className="px-3 py-2 text-gray-500">{h.sector || "-"}</td>
                      <td className="px-3 py-2 text-gray-500">{h.country || "-"}</td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {h.market_cap_usd ? formatCurrency(h.market_cap_usd) : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">{h.pe_ratio ? formatNumber(h.pe_ratio, 1) : "-"}</td>
                      <td className="px-3 py-2 text-right">{h.roe ? formatNumber(h.roe, 1) + "%" : "-"}</td>
                      <td className="px-3 py-2 text-right">{h.net_margin ? formatNumber(h.net_margin, 1) + "%" : "-"}</td>
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
