import axios, { AxiosError } from "axios";
import type {
  ScreeningRequest,
  ScreeningResponse,
  CorrelationRequest,
  CorrelationResponse,
  BaseRateRequest,
  BaseRateResponse,
  RegionInfo,
  Portfolio,
  PortfolioHolding,
  PortfolioListItem,
  VisualizationResponse,
  ConstructionHolding,
  ConstructionResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002/api";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

export const api = {
  async getRegions(): Promise<RegionInfo[]> {
    const response = await apiClient.get<{ regions: RegionInfo[] }>("/metadata/regions");
    return response.data.regions;
  },

  async getMetrics(): Promise<Record<string, any[]>> {
    const response = await apiClient.get<{ metrics: Record<string, any[]> }>("/metadata/metrics");
    return response.data.metrics;
  },

  async screenStocks(request: ScreeningRequest): Promise<ScreeningResponse> {
    const response = await apiClient.post<ScreeningResponse>("/screening/screen", request);
    return response.data;
  },

  async getBulkMomentum(companyIds: number[]): Promise<Record<number, any>> {
    const response = await apiClient.post<{ data: Record<number, any> }>("/screening/momentum/bulk", {
      company_ids: companyIds,
    });
    return response.data.data;
  },

  async getMarketHeatmap(request: any): Promise<any> {
    const response = await apiClient.post("/heatmap/market", request);
    return response.data;
  },

  async analyzeCorrelation(request: CorrelationRequest): Promise<CorrelationResponse> {
    const response = await apiClient.post<CorrelationResponse>("/correlation/analyze", request);
    return response.data;
  },

  async analyzeBaseRate(request: BaseRateRequest): Promise<BaseRateResponse> {
    const response = await apiClient.post<BaseRateResponse>("/base-rate/analyze", request);
    return response.data;
  },

  // Portfolio
  async createPortfolio(name: string, holdings: PortfolioHolding[]): Promise<Portfolio> {
    const response = await apiClient.post<Portfolio>("/portfolio/create", { name, holdings });
    return response.data;
  },

  async listPortfolios(): Promise<PortfolioListItem[]> {
    const response = await apiClient.get<PortfolioListItem[]>("/portfolio/list");
    return response.data;
  },

  async getPortfolio(id: number): Promise<Portfolio> {
    const response = await apiClient.get<Portfolio>(`/portfolio/${id}`);
    return response.data;
  },

  async updatePortfolio(id: number, name: string, holdings: PortfolioHolding[]): Promise<Portfolio> {
    const response = await apiClient.put<Portfolio>(`/portfolio/${id}`, { name, holdings });
    return response.data;
  },

  async deletePortfolio(id: number): Promise<void> {
    await apiClient.delete(`/portfolio/${id}`);
  },

  async visualizePortfolio(holdings: PortfolioHolding[]): Promise<VisualizationResponse> {
    const response = await apiClient.post<VisualizationResponse>("/portfolio/visualize", { holdings });
    return response.data;
  },

  // Construction
  async analyzeConstruction(holdings: ConstructionHolding[], targetCash: number = 0): Promise<ConstructionResponse> {
    const response = await apiClient.post<ConstructionResponse>("/construction/analyze", {
      holdings,
      target_cash: targetCash,
    });
    return response.data;
  },

  // Export
  async downloadTearsheet(
    holdings: Array<{ ticker: string; weight: number }>,
    sections: string[] = ["summary", "sectors", "countries", "holdings"]
  ): Promise<Blob> {
    const response = await apiClient.post("/export/tearsheet", { holdings, sections }, {
      responseType: "blob",
    });
    return response.data;
  },

  async searchCompanies(query: string, limit: number = 50): Promise<any> {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    const response = await apiClient.get(`/metadata/search/companies?${params.toString()}`);
    return response.data;
  },

  handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ detail?: string }>;
      if (axiosError.response) {
        return new Error(axiosError.response.data?.detail || `Server error: ${axiosError.response.status}`);
      } else if (axiosError.request) {
        return new Error("Unable to reach the server. Please check if the backend is running.");
      }
    }
    return new Error("An unexpected error occurred.");
  },
};
