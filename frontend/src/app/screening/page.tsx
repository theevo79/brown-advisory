"use client";

import { useState } from "react";
import FilterPanel from "@/components/FilterPanel";
import ResultsTable from "@/components/ResultsTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import type { CompanyResult, MetricFilter } from "@/lib/types";

export default function ScreeningPage() {
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; filtered: number } | null>(null);
  const [momentumData, setMomentumData] = useState<Record<number, any>>({});
  const [momentumLoading, setMomentumLoading] = useState(false);

  const handleSubmit = async (params: {
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
    sectors?: string[];
    countries?: string[];
    filters?: Record<string, MetricFilter>;
    momentumPeriod?: string;
    momentumPercentileMin?: number;
    momentumPercentileMax?: number;
  }) => {
    setLoading(true);
    setError(null);
    setMetrics(params.metrics);
    setMomentumData({});

    try {
      const response = await api.screenStocks({
        region: params.region,
        metrics: params.metrics,
        market_cap_min: params.marketCapMin,
        market_cap_max: params.marketCapMax,
        adv_usd_min: params.advMin,
        through_cycle_years: params.throughCycleYears,
        min_years: params.minYears,
        limit: 2000,
        valuation_metric: params.valuationMetric,
        valuation_percentile_min: params.valuationPercentileMin,
        valuation_percentile_max: params.valuationPercentileMax,
        sectors: params.sectors,
        countries: params.countries,
        filters: params.filters,
        momentum_period: params.momentumPeriod,
        momentum_percentile_min: params.momentumPercentileMin,
        momentum_percentile_max: params.momentumPercentileMax,
      });
      setResults(response.results);
      setStats({ total: response.total_companies, filtered: response.filtered_count });

      // Fetch momentum data for all screened companies
      if (response.results.length > 0) {
        setMomentumLoading(true);
        try {
          const companyIds = response.results.map((r) => r.company_id);
          const momentum = await api.getBulkMomentum(companyIds);
          setMomentumData(momentum);
        } catch {
          // Momentum is optional — don't fail the whole screen
        } finally {
          setMomentumLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.message || "Screening failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;

    const headers = ["Ticker", "Name", "Country", "Sector", "Market Cap ($)"];
    metrics.forEach((m) => {
      headers.push(m);
      headers.push(`${m}_percentile`);
    });
    headers.push("Composite %");

    // Add momentum columns if available
    const hasMomentum = Object.keys(momentumData).length > 0;
    if (hasMomentum) {
      headers.push("Return_1m", "Return_3m", "Return_6m", "Return_12m");
      headers.push("Percentile_1m", "Percentile_3m", "Percentile_6m", "Percentile_12m");
    }

    const rows = results.map((r) => {
      const row: (string | number)[] = [
        r.ticker,
        r.company_name || "",
        r.country || "",
        r.sector || "",
        r.market_cap ?? "",
      ];
      metrics.forEach((m) => {
        row.push(r.metrics[m]?.value ?? "");
        row.push(r.metrics[m]?.percentile ?? "");
      });
      row.push(r.composite_percentile ?? "");

      if (hasMomentum) {
        const mom = momentumData[r.company_id];
        row.push(mom?.return_1m ?? "");
        row.push(mom?.return_3m ?? "");
        row.push(mom?.return_6m ?? "");
        row.push(mom?.return_12m ?? "");
        row.push(mom?.percentile_1m ?? "");
        row.push(mom?.percentile_3m ?? "");
        row.push(mom?.percentile_6m ?? "");
        row.push(mom?.percentile_12m ?? "");
      }

      return row;
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((val) => {
          const s = String(val);
          return s.includes(",") ? `"${s}"` : s;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `screening_results_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ba-navy">Screening</h1>
        <p className="text-gray-500 mt-1">Screen stocks across regions with valuation, profitability, and financial health metrics.</p>
      </div>

      <FilterPanel onSubmit={handleSubmit} loading={loading} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && <LoadingSpinner message="Screening companies..." />}

      {!loading && stats && (
        <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
          <span>Universe: {stats.total.toLocaleString()} companies</span>
          <span>With metrics: {stats.filtered.toLocaleString()}</span>
          <span>Showing: {results.length.toLocaleString()}</span>
          {momentumLoading && <span className="text-ba-accent">Loading momentum...</span>}
          {results.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="ml-auto ba-btn text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          )}
        </div>
      )}

      {!loading && results.length > 0 && (
        <ResultsTable results={results} metrics={metrics} momentumData={momentumData} />
      )}

      {!loading && stats && results.length === 0 && (
        <div className="ba-card text-center py-12 text-gray-400">
          No companies match your criteria. Try adjusting filters.
        </div>
      )}
    </div>
  );
}
