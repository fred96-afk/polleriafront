import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-admin-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-login.component.html',
  styles: [`
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
    .animate-shake {
      animation: shake 0.2s ease-in-out 0s 2;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastrService);

  loading = signal(false);
  showPassword = signal(false);
  submitted = signal(false);

  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  onSubmit() {
    this.submitted.set(true);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.loginForm.value;
    
    this.authService.adminLogin({ email, password }).subscribe({
      next: () => {
        if (this.authService.canAccessAdminDashboard()) {
          this.toastService.success('ENTRANDO AL PANEL DE CONTROL', 'ACCESO CONCEDIDO');
          setTimeout(() => {
            this.router.navigate(['/admin/dashboard/products']);
          }, 1000);
          return;
        }

        if (this.authService.canAccessPos()) {
          this.toastService.success('ENTRANDO AL POS', 'ACCESO CONCEDIDO');
          setTimeout(() => {
            this.router.navigate(['/admin/sales']);
          }, 1000);
          return;
        }

        this.authService.logout();
        this.toastService.error('TU ROL NO TIENE ACCESO A ESTE MÓDULO', 'ACCESO DENEGADO');
        this.loading.set(false);
      },
      error: () => {
        this.toastService.error('CREDENCIALES DE ADMIN INVÁLIDAS', 'ACCESO DENEGADO');
        this.loading.set(false);
      }
    });
  }
}
