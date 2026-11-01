import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { enviroment } from '../../enviroments/enviroments.development';
import { Observable, map, catchError, of } from 'rxjs';

export interface ConsultaData {
  nombre?: string;
  razonSocial?: string;
  numero: string;
  success: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DniService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://dniruc.apisperu.com/api/v1';
  private readonly token = enviroment.apisPeruToken;

  consultarDocumento(num: string): Observable<ConsultaData> {
    const isRuc = num.length === 11;
    const type = isRuc ? 'ruc' : 'dni';
    const url = `${this.baseUrl}/${type}/${num}?token=${this.token}`;

    return this.http.get<any>(url).pipe(
      map(res => {
        const nombre = this.resolveDocumentName(res);
        if (res && nombre) {
          return {
            success: true,
            nombre,
            razonSocial: this.toCleanString(res?.razonSocial),
            numero: res.numero || num
          } as ConsultaData;
        }
        return {
          success: false,
          numero: num,
          message: 'No se encontraron resultados'
        } as ConsultaData;
      }),
      catchError(err => {
        console.error(`Error en consulta ${type.toUpperCase()}:`, err);
        return of({
          success: false,
          numero: num,
          message: 'Error de conexión con el API'
        } as ConsultaData);
      })
    );
  }

  private resolveDocumentName(response: any): string | undefined {
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const directName = this.firstNonEmptyString(
      response.nombre,
      response.nombreCompleto,
      response.razonSocial
    );

    if (directName) {
      return directName;
    }

    const fullName = [
      this.toCleanString(response.nombres),
      this.toCleanString(response.apellidoPaterno),
      this.toCleanString(response.apellidoMaterno)
    ].filter((value): value is string => !!value).join(' ');

    return fullName || undefined;
  }

  private firstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      const normalized = this.toCleanString(value);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private toCleanString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  }
}
