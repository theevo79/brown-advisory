"""Correlation analysis service."""

from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import scipy.cluster.hierarchy as sch
import scipy.spatial.distance as ssd
from io import BytesIO
import base64

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.colors import LinearSegmentedColormap

from app.utils.database import DatabaseClient
from app.models.correlation import CorrelationRequest, CorrelationResponse, CorrelationStatistics


class CorrelationService:
    def __init__(self):
        self.db = DatabaseClient()

    def analyze_portfolio(self, request: CorrelationRequest) -> CorrelationResponse:
        if request.start_date and request.end_date:
            start_date = datetime.fromisoformat(request.start_date).date()
            end_date = datetime.fromisoformat(request.end_date).date()
        else:
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=request.years * 365)

        price_data, excluded_tickers, company_names = self._fetch_price_history(
            request.tickers, start_date, end_date
        )

        if len(price_data) < 2:
            raise ValueError(
                f"Need at least 2 tickers with valid data, got {len(price_data)}. "
                f"Excluded: {excluded_tickers}"
            )

        corr_matrix, valid_tickers, num_days = self._calculate_correlation_matrix(price_data)
        cluster_assignments = self._assign_clusters(corr_matrix)

        # Build labels based on label_mode
        label_mode = getattr(request, 'label_mode', 'ticker')
        if label_mode == 'name':
            labels = [company_names.get(t, t.split('.')[0]) for t in valid_tickers]
        else:
            labels = [t.split('.')[0] for t in valid_tickers]

        dendrogram_image = self._generate_clustermap(
            corr_matrix, labels, cluster_assignments
        )
        statistics = self._calculate_statistics(corr_matrix)

        return CorrelationResponse(
            correlation_matrix=corr_matrix.tolist(),
            tickers=valid_tickers,
            company_names=company_names,
            dendrogram_image=dendrogram_image,
            cluster_assignments=cluster_assignments.tolist(),
            statistics=statistics,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            valid_tickers=valid_tickers,
            excluded_tickers=excluded_tickers,
            num_trading_days=num_days
        )

    def _fetch_price_history(self, tickers: List[str], start_date, end_date
                              ) -> Tuple[Dict[str, pd.Series], List[str], Dict[str, str]]:
        price_data = {}
        excluded_tickers = []
        company_names = {}

        for ticker in tickers:
            try:
                if '.' not in ticker:
                    excluded_tickers.append(ticker)
                    continue

                symbol, exchange = ticker.split('.', 1)
                company = self.db.db.get_company(symbol, exchange)

                if not company:
                    excluded_tickers.append(ticker)
                    continue

                company_id = company['company_id']
                company_names[ticker] = company.get('full_name', ticker)

                prices = self.db.db.get_daily_prices(
                    company_id,
                    start_date=start_date.isoformat(),
                    end_date=end_date.isoformat()
                )

                if len(prices) < 250:
                    excluded_tickers.append(ticker)
                    continue

                price_series = pd.Series(
                    [p['adjusted_close'] for p in prices],
                    index=pd.to_datetime([p['trade_date'] for p in prices])
                )
                price_data[ticker] = price_series

            except Exception as e:
                print(f"[ERROR] Failed to fetch data for {ticker}: {e}")
                excluded_tickers.append(ticker)

        return price_data, excluded_tickers, company_names

    def _calculate_correlation_matrix(self, price_data: Dict[str, pd.Series]
                                       ) -> Tuple[np.ndarray, List[str], int]:
        df = pd.DataFrame(price_data)
        df = df.dropna()
        returns = np.log(df / df.shift(1)).dropna()
        corr_matrix = returns.corr()
        return corr_matrix.values, corr_matrix.columns.tolist(), len(returns)

    def _generate_clustermap(self, correlation_matrix: np.ndarray,
                              labels: List[str],
                              cluster_assignments: Optional[np.ndarray] = None) -> str:
        plt.figure(figsize=(14, 12))

        # Brown Advisory branded colormap: white to navy
        colors = ['#FFFFFF', '#163963']
        ba_cmap = LinearSegmentedColormap.from_list('ba_navy', colors, N=256)

        # Cluster colors for dendrogram branches and row/col coloring
        CLUSTER_PALETTE = [
            '#163963', '#D4A843', '#2E7D32', '#C62828', '#6A1B9A',
            '#00838F', '#EF6C00', '#AD1457', '#1565C0', '#558B2F'
        ]

        # Build row_colors from cluster assignments
        row_colors = None
        if cluster_assignments is not None:
            row_colors = [CLUSTER_PALETTE[int(c - 1) % len(CLUSTER_PALETTE)] for c in cluster_assignments]

        # Set dendrogram colors via scipy color_threshold
        # We use seaborn's tree_kws to pass color info
        g = sns.clustermap(
            correlation_matrix,
            cmap=ba_cmap,
            vmin=0, vmax=1,
            xticklabels=labels,
            yticklabels=labels,
            figsize=(14, 12),
            cbar_kws={'label': 'Correlation Coefficient'},
            method='ward',
            metric='euclidean',
            linewidths=0.5,
            linecolor='white',
            annot=len(labels) <= 15,
            fmt='.2f',
            row_colors=row_colors,
            col_colors=row_colors,
            tree_kws={'linewidths': 1.5},
        )

        # Color dendrogram branches
        if cluster_assignments is not None:
            n_clusters = len(set(cluster_assignments))
            for ax_dendro in [g.ax_row_dendrogram, g.ax_col_dendrogram]:
                for line in ax_dendro.collections:
                    line.set_color('#163963')
                for line in ax_dendro.get_children():
                    if hasattr(line, 'set_color') and hasattr(line, 'get_xydata'):
                        line.set_color('#163963')
                        line.set_linewidth(1.5)

        g.ax_heatmap.tick_params(colors='#163963', labelsize=10)
        g.ax_heatmap.set_xlabel('', fontsize=12)
        g.ax_heatmap.set_ylabel('', fontsize=12)

        cbar = g.ax_cbar
        cbar.set_ylabel('Correlation', fontsize=11, color='#163963')
        cbar.tick_params(labelsize=10, colors='#163963')

        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        plt.close('all')

        return image_base64

    def _assign_clusters(self, correlation_matrix: np.ndarray, num_clusters: int = 5) -> np.ndarray:
        distance_matrix = 1 - np.abs(correlation_matrix)
        condensed_dist = ssd.squareform(distance_matrix)
        linkage = sch.linkage(condensed_dist, method='ward')
        n = len(correlation_matrix)
        k = min(num_clusters, n)
        return sch.fcluster(linkage, k, criterion='maxclust')

    def _calculate_statistics(self, correlation_matrix: np.ndarray) -> CorrelationStatistics:
        n = len(correlation_matrix)
        upper_triangle = correlation_matrix[np.triu_indices(n, k=1)]
        avg_corr = float(np.mean(upper_triangle))

        # Effective number of independent bets (ENB)
        # ENB = N / (1 + (N-1) * avg_pairwise_correlation)
        # Higher = more diversified. Max = N (zero correlation), Min = 1 (perfect correlation)
        if n > 1 and (1 + (n - 1) * avg_corr) > 0:
            enb = n / (1 + (n - 1) * avg_corr)
        else:
            enb = float(n)

        # Diversification score: ENB / N as a percentage (100% = perfectly diversified)
        div_score = (enb / n) * 100 if n > 0 else 0

        return CorrelationStatistics(
            mean_correlation=float(np.mean(upper_triangle)),
            median_correlation=float(np.median(upper_triangle)),
            min_correlation=float(np.min(upper_triangle)),
            max_correlation=float(np.max(upper_triangle)),
            num_pairs=len(upper_triangle),
            diversification_score=round(div_score, 1),
            effective_independent_bets=round(enb, 1)
        )

    def close(self):
        self.db.close()
