import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

export type AlertIcon = 'warning' | 'question' | 'error' | 'info' | 'success';

export interface ConfirmAlertOptions {
  title: string;
  text?: string;
  html?: string;
  icon?: AlertIcon;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

export interface PromptAlertOptions {
  title: string;
  text?: string;
  inputPlaceholder?: string;
  inputValue?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  inputValidator?: (value: string) => string | null;
}

/**
 * Alertas y confirmaciones unificadas con SweetAlert2.
 * Reemplaza el uso de alert(), confirm() y prompt() nativos del navegador.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly baseOptions = {
    confirmButtonColor: '#ea580c',
    cancelButtonColor: '#6b7280',
    reverseButtons: true,
    focusCancel: true,
    heightAuto: false,
  } as const;

  async confirm(options: ConfirmAlertOptions): Promise<boolean> {
    const result = await Swal.fire({
      ...this.baseOptions,
      title: options.title,
      text: options.text,
      html: options.html,
      icon: options.icon ?? 'warning',
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText ?? 'Sí, continuar',
      cancelButtonText: options.cancelButtonText ?? 'Cancelar',
      allowOutsideClick: false,
    });

    return result.isConfirmed;
  }

  async prompt(options: PromptAlertOptions): Promise<string | null> {
    const result = await Swal.fire({
      ...this.baseOptions,
      title: options.title,
      text: options.text,
      input: 'text',
      inputPlaceholder: options.inputPlaceholder,
      inputValue: options.inputValue,
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText ?? 'Aceptar',
      cancelButtonText: options.cancelButtonText ?? 'Cancelar',
      inputValidator: options.inputValidator,
      allowOutsideClick: false,
    });

    if (!result.isConfirmed) {
      return null;
    }

    const value = String(result.value ?? '').trim();
    return value.length > 0 ? value : null;
  }
}
