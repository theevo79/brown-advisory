"use client";

import { useState } from "react";
import FilterPanel from "@/components/FilterPanel";
import ResultsTable from "@/components/ResultsTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import type { CompanyResult } from "@/lib/types";

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
        <div className="flex gap-4 mb-4 text-sm text-gray-500">
          <span>Universe: {stats.total.toLocaleString()} companies</span>
          <span>With metrics: {stats.filtered.toLocaleString()}</span>
          <span>Showing: {results.length.toLocaleString()}</span>
          {momentumLoading && <span className="text-ba-accent">Loading momentum...</span>}
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
