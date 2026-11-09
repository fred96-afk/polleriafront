import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { enviroment } from '../../enviroments/enviroments.development';
import { Observable, Subscription, interval } from 'rxjs';
import { tap } from 'rxjs/operators';
import { takeWhile } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { PusherService } from './pusher.service';
import {
  PendingReportJob,
  QueueReportRequest,
  ReportFileInfo,
  ReportQueueResponse,
  ReportReadyEvent
} from '../models/report.model';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly pusherService = inject(PusherService);
  private readonly toastService = inject(ToastrService);

  public readonly apiUrl = `${enviroment.backenbaseurl}/api/Reports`;

  // Estado global y reactivo de reportes
  readonly completedReports = signal<ReportReadyEvent[]>([]);
  readonly activeJobs = signal<PendingReportJob[]>([]);
  readonly isGenerating = computed(() => this.activeJobs().length > 0);
  readonly isLoadingHistory = signal<boolean>(false);

  private reportReadySub?: Subscription;
  private reportCompletedSub?: Subscription;
  private reportFailedSub?: Subscription;

  constructor() {
    this.initGlobalPusherListener();
    this.loadReportHistory();
  }

  /**
   * Inicializa la escucha global del canal 'reports' en Pusher.
   * Al estar en un servicio raíz (providedIn: 'root'), este listener persiste
   * durante toda la sesión, permitiendo la generación en segundo plano sin importar
   * en qué página o ruta navegue el usuario.
   */
  private initGlobalPusherListener(): void {
    // 1. Escuchar 'report-ready'
    this.reportReadySub = this.pusherService
      .listenToEvent<any>('reports', 'report-ready')
      .subscribe({
        next: (data) => this.handleReportCompleted(data),
        error: (err) => console.error('Error escuchando canal reports (report-ready):', err)
      });

    // 2. Escuchar 'report-completed'
    this.reportCompletedSub = this.pusherService
      .listenToEvent<any>('reports', 'report-completed')
      .subscribe({
        next: (data) => this.handleReportCompleted(data),
        error: (err) => console.error('Error escuchando canal reports (report-completed):', err)
      });

    // 3. Escuchar 'report-failed'
    this.reportFailedSub = this.pusherService
      .listenToEvent<any>('reports', 'report-failed')
      .subscribe({
        next: (data) => this.handleReportFailed(data),
        error: (err) => console.error('Error escuchando canal reports (report-failed):', err)
      });
  }

  /**
   * Manejador central cuando un reporte ha finalizado su generación en el worker.
   */
  public handleReportCompleted(data: any): void {
    if (!data) return;

    const rawDownloadUrl = data.downloadUrl || data.DownloadUrl || '';
    const fileName = data.fileName || data.FileName || `reporte_${Date.now()}`;
    const reportType = (data.reportType || data.ReportType || (fileName.endsWith('.xlsx') ? 'Excel' : 'Pdf')) as 'Excel' | 'Pdf';
    const message = data.message || data.Message || `Reporte ${reportType} generado exitosamente.`;
    const jobId = data.jobId || data.JobId || '';
    const status = data.status || data.Status || 'Completed';
    const fileSize = data.fileSize || data.FileSize;
    const createdAt = data.createdAt || data.CreatedAt || new Date();

    const fullDownloadUrl = this.getFullDownloadUrl(rawDownloadUrl);

    // Remover el trabajo de la lista de trabajos activos
    if (jobId) {
      this.activeJobs.update(jobs => jobs.filter(j => j.jobId !== jobId));
    } else {
      this.activeJobs.update(jobs => jobs.filter(j => j.reportType !== reportType));
    }

    const reportEvent: ReportReadyEvent = {
      jobId,
      reportType,
      status,
      message,
      fileName,
      downloadUrl: fullDownloadUrl,
      fileSize,
      createdAt
    };

    // Actualizar historial local sin duplicados
    this.completedReports.update(prev => {
      if (prev.some(r => (jobId && r.jobId === jobId) || r.fileName === fileName)) {
        return prev;
      }
      return [reportEvent, ...prev];
    });

    // Reproducir tono suave de notificación
    this.pusherService.playSoftNotificationSound();

    // Notificación Toast interactiva disponible globalmente
    const toastHtml = `
      <div style="font-size: 13px; line-height: 1.4;">
        <span>Tu reporte <b>${reportType}</b> está listo para descargar.</span><br>
        <a href="${fullDownloadUrl}" target="_blank" download="${fileName}" 
           style="color: #16a34a; font-weight: 800; text-decoration: underline; margin-top: 6px; display: inline-block;">
          [Descargar archivo]
        </a>
      </div>
    `;

    const toastRef = this.toastService.success(toastHtml, '¡Reporte Listo en Segundo Plano!', {
      timeOut: 15000,
      enableHtml: true,
      closeButton: true,
      progressBar: true
    });

    toastRef.onTap.subscribe(() => {
      if (fullDownloadUrl) {
        this.triggerDownload(fullDownloadUrl, fileName);
      }
    });

    // Notificación Push del navegador si tiene permisos concedidos
    this.showBrowserPushNotification(`🍗 Reporte ${reportType} Listo`, {
      body: `El reporte "${fileName}" ya está disponible para descargar.`,
      tag: `report-${jobId || fileName}`
    });
  }

  /**
   * Manejador de error si la generación del reporte falla en el worker.
   */
  private handleReportFailed(data: any): void {
    if (!data) return;
    const jobId = data.jobId || data.JobId;
    const message = data.message || data.Message || 'Ocurrió un error al procesar el reporte.';

    if (jobId) {
      this.activeJobs.update(jobs => jobs.filter(j => j.jobId !== jobId));
    }

    this.toastService.error(message, 'Error en Generación de Reporte');
  }

  /**
   * Inicia el seguimiento en segundo plano de un trabajo encolado (con sondeo de respaldo).
   */
  private trackJobWithPolling(jobId: string, reportType: 'Excel' | 'Pdf', startDate?: string, endDate?: string): void {
    const newJob: PendingReportJob = {
      jobId,
      reportType,
      startDate,
      endDate,
      status: 'Queued',
      startedAt: new Date()
    };

    this.activeJobs.update(jobs => [newJob, ...jobs.filter(j => j.jobId !== jobId)]);

    // Sondeo de respaldo cada 4 segundos por hasta 2 minutos
    const startTime = Date.now();
    const maxDuration = 120000; // 2 minutos

    interval(4000)
      .pipe(
        takeWhile(() => {
          const isStillPending = this.activeJobs().some(j => j.jobId === jobId);
          const isWithinTime = (Date.now() - startTime) < maxDuration;
          return isStillPending && isWithinTime;
        })
      )
      .subscribe({
        next: () => {
          this.getReportStatus(jobId).subscribe({
            next: (res) => {
              if (res && res.status === 'Completed') {
                this.handleReportCompleted(res);
              }
            },
            error: () => {}
          });
        }
      });
  }

  // ==========================================
  // GENERACIÓN ASÍNCRONA EN SEGUNDO PLANO
  // ==========================================
  queueSalesExcel(startDate: string, endDate: string, channel = 'reports'): Observable<ReportQueueResponse> {
    const body: QueueReportRequest = {
      startDate,
      endDate,
      reportType: 'Excel',
      channel
    };

    return this.http.post<ReportQueueResponse>(`${this.apiUrl}/sales/excel/queue`, body).pipe(
      tap(resp => {
        if (resp?.jobId) {
          this.trackJobWithPolling(resp.jobId, 'Excel', startDate, endDate);
        }
      })
    );
  }

  queueSalesPdf(startDate: string, endDate: string, channel = 'reports'): Observable<ReportQueueResponse> {
    const body: QueueReportRequest = {
      startDate,
      endDate,
      reportType: 'Pdf',
      channel
    };

    return this.http.post<ReportQueueResponse>(`${this.apiUrl}/sales/pdf/queue`, body).pipe(
      tap(resp => {
        if (resp?.jobId) {
          this.trackJobWithPolling(resp.jobId, 'Pdf', startDate, endDate);
        }
      })
    );
  }

  // ==========================================
  // HISTORIAL Y GESTIÓN DE REPORTES
  // ==========================================
  loadReportHistory(): void {
    this.isLoadingHistory.set(true);
    this.http.get<ReportFileInfo[]>(`${this.apiUrl}/history`).subscribe({
      next: (files) => {
        this.isLoadingHistory.set(false);
        if (Array.isArray(files)) {
          const events: ReportReadyEvent[] = files.map(f => ({
            jobId: f.jobId || '',
            reportType: f.reportType,
            status: 'Completed',
            fileName: f.fileName,
            downloadUrl: this.getFullDownloadUrl(f.downloadUrl),
            fileSize: f.fileSize,
            createdAt: f.createdAt,
            message: `Reporte ${f.reportType} listo para descargar.`
          }));
          this.completedReports.set(events);
        }
      },
      error: (err) => {
        this.isLoadingHistory.set(false);
        console.warn('No se pudo cargar el historial de reportes:', err);
      }
    });
  }

  deleteReport(fileName: string): Observable<any> {
    return new Observable(observer => {
      this.http.delete(`${this.apiUrl}/${encodeURIComponent(fileName)}`).subscribe({
        next: (res) => {
          this.completedReports.update(prev => prev.filter(r => r.fileName !== fileName));
          this.toastService.info(`Reporte "${fileName}" eliminado.`);
          observer.next(res);
          observer.complete();
        },
        error: (err) => {
          this.toastService.error('No se pudo eliminar el archivo');
          observer.error(err);
        }
      });
    });
  }

  // Descargas síncronas tradicionales (retrocompatibilidad)
  downloadSalesPdf(startDate: string, endDate: string): Observable<Blob> {
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate);
    
    return this.http.get(`${this.apiUrl}/sales/pdf`, {
      params,
      responseType: 'blob'
    });
  }

  downloadSalesExcel(startDate: string, endDate: string): Observable<Blob> {
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate);
    
    return this.http.get(`${this.apiUrl}/sales/excel`, {
      params,
      responseType: 'blob'
    });
  }

  // Estado del Job de reporte
  getReportStatus(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/status/${encodeURIComponent(jobId)}`);
  }

  // URL absoluta de descarga
  getFullDownloadUrl(relativeUrl: string): string {
    if (!relativeUrl) return '';
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }
    const cleanBase = enviroment.backenbaseurl.replace(/\/+$/, '');
    const cleanRelative = relativeUrl.replace(/^\/+/, '');
    return `${cleanBase}/${cleanRelative}`;
  }

  // Disparar descarga directa en el navegador
  triggerDownload(url: string, fileName?: string): void {
    if (!url || url === 'undefined') return;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    if (fileName && fileName !== 'undefined') {
      link.download = fileName;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private showBrowserPushNotification(title: string, options?: NotificationOptions): void {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        new Notification(title, {
          icon: '/favicon.ico',
          ...options
        });
      }
    } catch (e) {
      console.warn('No se pudo mostrar la notificación nativa del navegador:', e);
    }
  }
}
