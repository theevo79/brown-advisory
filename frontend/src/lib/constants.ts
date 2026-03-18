export const FOCUS_PRESETS = [
  { label: "None", value: "none", min: undefined, max: undefined },
  { label: "Cheapest 25%", value: "p25", min: 0, max: 25 },
  { label: "Cheapest 50%", value: "p50", min: 0, max: 50 },
  { label: "Most Expensive 25%", value: "top25", min: 75, max: 100 },
] as const;

export const FOCUS_METRICS = [
  { id: "pe_ratio", name: "P/E Ratio" },
  { id: "pb_ratio", name: "P/B Ratio" },
  { id: "cape", name: "CAPE" },
  { id: "ev_ebitda", name: "EV/EBITDA" },
  { id: "ev_ebit_avg", name: "EV/EBIT Avg" },
  { id: "roe", name: "ROE" },
  { id: "ev_nopat_avg", name: "EV/NOPAT Avg" },
  { id: "ev_sales", name: "EV/Sales" },
  { id: "net_debt_ebitda", name: "Net Debt/EBITDA" },
  { id: "ebitda_margin", name: "EBITDA Margin" },
];

export const CHART_COLORS = [
  "#163963", "#005ba5", "#2980b9", "#3498db", "#5dade2",
  "#7fb3d8", "#a9cce3", "#d4e6f1", "#85929e", "#566573",
  "#2c3e50", "#1a5276", "#154360", "#1b4f72", "#21618c",
  "#2874a6",
];
