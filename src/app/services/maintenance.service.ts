import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { enviroment } from '../../enviroments/enviroments.development';
import { MaintenanceNotificationRequest } from '../models/maintenance.model';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${enviroment.backenbaseurl}/api/Maintenance`;

  notify(request: MaintenanceNotificationRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/notify`, request);
  }
}
