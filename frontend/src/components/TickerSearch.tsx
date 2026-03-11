"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

interface SearchResult {
  company_id: number;
  ticker: string;
  exchange_code: string;
  full_name: string;
  sector: string | null;
  country: string | null;
}

interface TickerSearchProps {
  onSelect: (ticker: string) => void;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export default function TickerSearch({
  onSelect,
  placeholder = "Search ticker or company...",
  value,
  onChange,
  className = "",
}: TickerSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isControlled = value !== undefined;
  const displayValue = isControlled ? value : query;

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.searchCompanies(q, 10);
      setResults(data.results || []);
      setIsOpen(true);
      setHighlightIdx(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    if (isControlled && onChange) {
      onChange(val);
    } else {
      setQuery(val);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const selectResult = (r: SearchResult) => {
    const ticker = `${r.ticker}.${r.exchange_code}`;
    onSelect(ticker);
    if (isControlled && onChange) {
      onChange(ticker);
    } else {
      setQuery("");
    }
    setIsOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "Enter" && displayValue.trim()) {
        onSelect(displayValue.trim().toUpperCase());
        if (!isControlled) setQuery("");
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < results.length) {
          selectResult(results[highlightIdx]);
        } else if (displayValue.trim()) {
          onSelect(displayValue.trim().toUpperCase());
          if (!isControlled) setQuery("");
          setIsOpen(false);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  // Click-away
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-ba-accent focus:ring-1 focus:ring-ba-accent outline-none font-mono"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-ba-accent rounded-full animate-spin" />
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-64 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.ticker}-${r.exchange_code}`}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                i === highlightIdx ? "bg-blue-50" : ""
              } ${i > 0 ? "border-t border-gray-100" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectResult(r);
              }}
              onMouseEnter={() => setHighlightIdx(i)}
            >
              <span className="font-mono font-semibold text-ba-navy">
                {r.ticker}.{r.exchange_code}
              </span>
              <span className="text-gray-500 ml-2 truncate">
                {r.full_name}
              </span>
              {(r.sector || r.country) && (
                <span className="text-gray-400 ml-2 text-xs">
                  ({[r.sector, r.country].filter(Boolean).join(", ")})
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
