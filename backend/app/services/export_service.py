"""PDF tear sheet export service."""

from io import BytesIO
from typing import List, Dict, Optional
import base64
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

from app.services.portfolio_service import PortfolioService
from app.models.portfolio import VisualizeRequest, Holding


BA_NAVY = HexColor('#163963')
BA_ACCENT = HexColor('#005ba5')
BA_LIGHT = HexColor('#E8F0FE')


class ExportService:
    def __init__(self):
        self.portfolio_service = PortfolioService()

    def generate_tearsheet(self, holdings: List[Dict], sections: List[str]) -> bytes:
        """Generate a PDF tear sheet for a portfolio."""
        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
        )

        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle(
            'BATitle',
            parent=styles['Title'],
            fontName='Helvetica-Bold',
            fontSize=24,
            textColor=BA_NAVY,
            spaceAfter=6,
        )

        subtitle_style = ParagraphStyle(
            'BASubtitle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            textColor=HexColor('#666666'),
            spaceAfter=12,
        )

        heading_style = ParagraphStyle(
            'BAHeading',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=14,
            textColor=BA_NAVY,
            spaceBefore=16,
            spaceAfter=8,
        )

        normal_style = ParagraphStyle(
            'BANormal',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            textColor=black,
        )

        # Get visualization data
        holding_objs = [Holding(ticker=h['ticker'], weight=h['weight']) for h in holdings]
        viz_request = VisualizeRequest(holdings=holding_objs)
        viz = self.portfolio_service.visualize(viz_request)

        story = []

        # Header
        story.append(Paragraph("Brown Advisory", title_style))
        story.append(Paragraph("Portfolio Tear Sheet", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=2, color=BA_NAVY))
        story.append(Spacer(1, 8))
        story.append(Paragraph(
            f"Generated: {datetime.now().strftime('%d %B %Y')}",
            ParagraphStyle('Date', parent=normal_style, textColor=HexColor('#999999'), fontSize=8)
        ))
        story.append(Spacer(1, 16))

        # Portfolio Summary
        if 'summary' in sections:
            story.append(Paragraph("Portfolio Summary", heading_style))

            summary_data = [
                ['Holdings', str(viz.num_holdings)],
                ['Total Weight', f'{viz.total_weight:.1f}%'],
                ['Top 10 Concentration', f'{viz.top_10_weight:.1f}%'],
                ['HHI', f'{viz.hhi:.0f}'],
            ]

            if viz.weighted_pe:
                summary_data.append(['Weighted P/E', f'{viz.weighted_pe:.1f}x'])
            if viz.weighted_pb:
                summary_data.append(['Weighted P/B', f'{viz.weighted_pb:.1f}x'])
            if viz.weighted_roe:
                summary_data.append(['Weighted ROE', f'{viz.weighted_roe:.1f}%'])

            summary_table = Table(summary_data, colWidths=[200, 200])
            summary_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TEXTCOLOR', (0, 0), (0, -1), BA_NAVY),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('LINEBELOW', (0, 0), (-1, -2), 0.5, HexColor('#E5E7EB')),
            ]))
            story.append(summary_table)
            story.append(Spacer(1, 16))

        # Sector Breakdown
        if 'sectors' in sections and viz.sector_breakdown:
            story.append(Paragraph("Sector Breakdown", heading_style))

            sector_data = [['Sector', 'Weight', 'Stocks']]
            for b in viz.sector_breakdown:
                sector_data.append([b.name, f'{b.weight:.1f}%', str(b.count)])

            sector_table = Table(sector_data, colWidths=[250, 100, 80])
            sector_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TEXTCOLOR', (0, 0), (-1, 0), white),
                ('BACKGROUND', (0, 0), (-1, 0), BA_NAVY),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, HexColor('#E5E7EB')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, BA_LIGHT]),
            ]))
            story.append(sector_table)
            story.append(Spacer(1, 16))

        # Country Breakdown
        if 'countries' in sections and viz.country_breakdown:
            story.append(Paragraph("Country Breakdown", heading_style))

            country_data = [['Country', 'Weight', 'Stocks']]
            for b in viz.country_breakdown:
                country_data.append([b.name, f'{b.weight:.1f}%', str(b.count)])

            country_table = Table(country_data, colWidths=[250, 100, 80])
            country_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TEXTCOLOR', (0, 0), (-1, 0), white),
                ('BACKGROUND', (0, 0), (-1, 0), BA_NAVY),
                ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, HexColor('#E5E7EB')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, BA_LIGHT]),
            ]))
            story.append(country_table)
            story.append(Spacer(1, 16))

        # Holdings Detail
        if 'holdings' in sections:
            story.append(Paragraph("Holdings", heading_style))

            holdings_data = [['Ticker', 'Company', 'Weight', 'Sector', 'ROE', 'Margin']]
            for h in viz.holdings:
                holdings_data.append([
                    h.ticker,
                    h.company_name[:25] + ('...' if len(h.company_name) > 25 else ''),
                    f'{h.weight:.1f}%',
                    (h.sector or '-')[:15],
                    f'{h.roe:.1f}%' if h.roe else '-',
                    f'{h.net_margin:.1f}%' if h.net_margin else '-',
                ])

            holdings_table = Table(holdings_data, colWidths=[65, 140, 50, 85, 45, 45])
            holdings_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('TEXTCOLOR', (0, 0), (-1, 0), white),
                ('BACKGROUND', (0, 0), (-1, 0), BA_NAVY),
                ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, HexColor('#E5E7EB')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, BA_LIGHT]),
            ]))
            story.append(holdings_table)

        # Footer
        story.append(Spacer(1, 30))
        story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#CCCCCC')))
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            "This document is for informational purposes only. Brown Advisory.",
            ParagraphStyle('Footer', parent=normal_style, textColor=HexColor('#999999'), fontSize=7, alignment=TA_CENTER)
        ))

        doc.build(story)
        return buffer.getvalue()

    def close(self):
        self.portfolio_service.close()
