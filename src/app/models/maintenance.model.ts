export interface MaintenanceNotificationRequest {
  scheduledDate: string;
  estimatedDuration: number;
  details: string;
  supportContact?: string;
}
