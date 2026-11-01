export interface QueueReportRequest {
  startDate?: string;
  endDate?: string;
  reportType?: string | null;
  channel?: string | null;
  userId?: string | null;
}

export interface ReportReadyEvent {
  jobId: string;
  reportType: 'Excel' | 'Pdf' | string;
  status: 'Completed' | 'Failed' | 'Processing' | string;
  message?: string;
  fileName: string;
  downloadUrl: string;
  fileSize?: number;
  createdAt?: string | Date;
}

export interface ReportFileInfo {
  fileName: string;
  downloadUrl: string;
  fileSize: number;
  createdAt: string;
  reportType: 'Excel' | 'Pdf' | string;
  jobId?: string | null;
}

export interface ReportQueueResponse {
  jobId: string;
  message?: string;
  status?: string;
  reportType?: string;
  channel?: string;
  requestedAt?: string;
}

export interface PendingReportJob {
  jobId: string;
  reportType: 'Excel' | 'Pdf';
  startDate?: string;
  endDate?: string;
  status: 'Queued' | 'Processing' | 'Completed' | 'Failed';
  startedAt: Date;
}
