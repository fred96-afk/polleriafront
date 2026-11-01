import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardStats } from '../../models/dashboard.model';
import { finalize } from 'rxjs';
import {
  ChartComponent,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexDataLabels,
  ApexTitleSubtitle,
  ApexStroke,
  ApexGrid,
  ApexPlotOptions,
  ApexYAxis,
  ApexTooltip,
  ApexFill,
  ApexLegend,
  NgApexchartsModule
} from "ng-apexcharts";

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  dataLabels: ApexDataLabels;
  grid: ApexGrid;
  stroke: ApexStroke;
  title: ApexTitleSubtitle;
  plotOptions: ApexPlotOptions;
  yaxis: ApexYAxis;
  tooltip: ApexTooltip;
  fill: ApexFill;
  legend: ApexLegend;
  colors: string[];
};

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, NgApexchartsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  
  stats = signal<DashboardStats | null>(null);
  loading = signal(true);

  // Chart computed options
  salesChartOptions = computed<Partial<ChartOptions> | null>(() => {
    const data = this.stats();
    if (!data || !data.salesByDay || data.salesByDay.length === 0) return null;
    const hasSinglePoint = data.salesByDay.length === 1;

    return {
      series: [
        {
          name: "Ventas (S/)",
          data: data.salesByDay.map(s => s.amount ?? 0)
        }
      ],
      chart: {
        height: 350,
        type: hasSinglePoint ? "bar" : "area",
        toolbar: { show: false },
        fontFamily: 'inherit'
      },
      colors: ["#ea580c"],
      dataLabels: { enabled: hasSinglePoint },
      stroke: { curve: "smooth", width: 3 },
      plotOptions: hasSinglePoint
        ? {
            bar: {
              borderRadius: 8,
              columnWidth: '35%'
            }
          }
        : {},
      xaxis: {
        categories: data.salesByDay.map(s => s.date ?? ""),
        labels: { style: { colors: "#94a3b8", fontWeight: 600 } }
      },
      yaxis: {
        labels: { style: { colors: "#94a3b8", fontWeight: 600 } }
      },
      grid: { borderColor: "#f1f5f9" },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [20, 100, 100, 100]
        }
      }
    };
  });

  productsChartOptions = computed<Partial<ChartOptions> | null>(() => {
    const data = this.stats();
    if (!data || !data.topProducts || data.topProducts.length === 0) return null;

    return {
      series: [
        {
          name: "Cantidad",
          data: data.topProducts.map(p => p.quantity ?? 0)
        }
      ],
      chart: {
        type: "bar",
        height: 350,
        toolbar: { show: false },
        fontFamily: 'inherit'
      },
      plotOptions: {
        bar: {
          borderRadius: 8,
          horizontal: true,
          columnWidth: '55%',
        }
      },
      colors: ["#1e293b"],
      dataLabels: { enabled: false },
      xaxis: {
        categories: data.topProducts.map(p => p.name ?? ""),
        labels: { style: { colors: "#94a3b8", fontWeight: 600 } }
      },
      yaxis: {
        labels: { style: { colors: "#94a3b8", fontWeight: 600 } }
      },
      grid: { borderColor: "#f1f5f9" }
    };
  });

  constructor() {
    this.loadStats();
  }

  loadStats() {
    this.loading.set(true);
    this.dashboardService.getStats().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (data) => this.stats.set(data),
      error: (err) => console.error('Error cargando estadísticas:', err)
    });
  }
}
