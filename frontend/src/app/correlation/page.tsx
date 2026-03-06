"use client";

import { useState, useRef } from "react";
import CorrelationMatrix from "@/components/CorrelationMatrix";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { CorrelationResponse } from "@/lib/types";

const TIME_PERIODS = [
  { value: 1, label: "1 Year" },
  { value: 3, label: "3 Years" },
  { value: 5, label: "5 Years" },
  { value: 10, label: "10 Years" },
];

export default function CorrelationPage() {
  const [tickerInput, setTickerInput] = useState("AAPL.US, MSFT.US, GOOGL.US, AMZN.US, META.US");
  const [years, setYears] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CorrelationResponse | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseTickers = (text: string): string[] => {
    return text
      .split(/[,\n\t;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && t.includes("."));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        const lines = text.split(/[\n\r]+/).filter(Boolean);
        const tickers: string[] = [];
        for (const line of lines) {
          const parts = line.split(/[,\t;]+/);
          for (const part of parts) {
            const cleaned = part.trim().replace(/['"]/g, "");
            // Accept tickers with dot (SYMBOL.EXCHANGE) or plain symbols — add .US default
            if (cleaned.length > 0 && cleaned.length < 20 && !/^[0-9.]+$/.test(cleaned)) {
              if (cleaned.includes(".")) {
                tickers.push(cleaned.toUpperCase());
              } else if (/^[A-Za-z]/.test(cleaned)) {
                // If no exchange suffix, skip header-like words
                const upper = cleaned.toUpperCase();
                if (!["TICKER", "SYMBOL", "NAME", "COMPANY", "DATE", "WEIGHT"].includes(upper)) {
                  tickers.push(upper + ".US");
                }
              }
            }
          }
        }
        if (tickers.length > 0) {
          // Deduplicate
          const unique = [...new Set(tickers)];
          setTickerInput(unique.join(", "));
        } else {
          setError("No tickers found in file. Expected SYMBOL.EXCHANGE format (e.g., AAPL.US)");
        }
      }
    };
    reader.readAsText(file);

    // Reset file input so same file can be re-uploaded
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    const tickers = parseTickers(tickerInput);
    if (tickers.length < 2) {
      setError("Need at least 2 valid tickers (format: SYMBOL.EXCHANGE)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.analyzeCorrelation({ tickers, years });
      setResult(response);
    } catch (err: any) {
      setError(err.message || "Correlation analysis failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTicker = (ticker: string) => {
    const current = tickerInput.trim();
    if (current) {
      setTickerInput(current + ", " + ticker);
    } else {
      setTickerInput(ticker);
    }
  };

  const handleRemoveTicker = (tickerToRemove: string) => {
    const tickers = parseTickers(tickerInput).filter((t) => t !== tickerToRemove);
    setTickerInput(tickers.join(", "));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-ba-navy">Correlation</h1>
        <p className="text-gray-500 mt-1">Analyze portfolio correlation matrices with dendrogram clustering.</p>
      </div>

      {/* Input panel */}
      <div className="ba-card mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Ticker input */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-ba-navy mb-1">
              Tickers (SYMBOL.EXCHANGE format, comma or newline separated)
            </label>
            <textarea
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              rows={3}
              placeholder="AAPL.US, MSFT.US, GOOGL.US..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none font-mono"
            />
            <div className="flex items-center gap-3 mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx"
                onChange={handleFileUpload}
                className="hidden"
                id="correlation-file-upload"
              />
              <label
                htmlFor="correlation-file-upload"
                className="ba-btn text-xs py-1 cursor-pointer inline-block"
              >
                Upload CSV/TXT
              </label>
              {uploadedFileName && (
                <span className="text-xs text-ba-accent">{uploadedFileName}</span>
              )}
              <span className="text-xs text-gray-400">
                {parseTickers(tickerInput).length} ticker{parseTickers(tickerInput).length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Config */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-ba-navy mb-1">Time Period</label>
              <select
                value={years}
                onChange={(e) => setYears(parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent outline-none"
              >
                {TIME_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading || parseTickers(tickerInput).length < 2}
              className="ba-btn-primary w-full disabled:opacity-50"
            >
              {loading ? "Analyzing..." : "Analyze Correlation"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && <LoadingSpinner message="Calculating correlations..." />}

      {!loading && result && (
        <div className="space-y-6">
          {/* Info bar */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <span>Period: {result.start_date} to {result.end_date}</span>
            <span>Trading days: {result.num_trading_days}</span>
            <span>Tickers: {result.valid_tickers.length}</span>
            {result.excluded_tickers.length > 0 && (
              <span className="text-orange-600">Excluded: {result.excluded_tickers.join(", ")}</span>
            )}
          </div>

          {/* Statistics */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase">Mean</p>
                <p className="text-xl font-semibold text-ba-navy">{formatNumber(result.statistics.mean_correlation, 3)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Median</p>
                <p className="text-xl font-semibold text-ba-navy">{formatNumber(result.statistics.median_correlation, 3)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Min</p>
                <p className="text-xl font-semibold text-ba-navy">{formatNumber(result.statistics.min_correlation, 3)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Max</p>
                <p className="text-xl font-semibold text-ba-navy">{formatNumber(result.statistics.max_correlation, 3)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Pairs</p>
                <p className="text-xl font-semibold text-ba-navy">{result.statistics.num_pairs}</p>
              </div>
            </div>
          </div>

          {/* Ticker management */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Tickers in Analysis</h3>
            <div className="flex flex-wrap gap-2">
              {result.valid_tickers.map((ticker, i) => (
                <div
                  key={ticker}
                  className="flex items-center gap-1 px-2 py-1 rounded text-sm border border-gray-200"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: `hsl(${(result.cluster_assignments[i] * 72) % 360}, 60%, 45%)`,
                  }}
                >
                  <span className="font-medium text-ba-navy" title={result.company_names[ticker]}>
                    {ticker.split(".")[0]}
                  </span>
                  <span className="text-xs text-gray-400">C{result.cluster_assignments[i]}</span>
                  <button
                    onClick={() => {
                      handleRemoveTicker(ticker);
                    }}
                    className="text-gray-300 hover:text-red-500 ml-1"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Correlation matrix */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Correlation Matrix</h3>
            <CorrelationMatrix
              matrix={result.correlation_matrix}
              tickers={result.tickers}
              companyNames={result.company_names}
            />
          </div>

          {/* Dendrogram */}
          <div className="ba-card">
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-3">Cluster Dendrogram</h3>
            <div className="flex justify-center">
              <img
                src={`data:image/png;base64,${result.dendrogram_image}`}
                alt="Correlation Dendrogram"
                className="max-w-full rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
