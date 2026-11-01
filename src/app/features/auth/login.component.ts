import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
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
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastrService);

  loading = signal(false);
  showPassword = signal(false);

  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  onSubmit() {
    if (this.loginForm.valid) {
      this.loading.set(true);
      const { email, password } = this.loginForm.value;
      
      this.authService.login({ email, password }).subscribe({
        next: () => {
          this.toastService.success('BIENVENIDO A EL GIGANTE', '¡ÉXITO!');
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 1000);
        },
        error: (err) => {
          const message = err.error?.message || err.error || '';
          if (message.toLowerCase().includes('verific') || message.toLowerCase().includes('confirm')) {
            this.toastService.warning('POR FAVOR, VERIFICA TU CORREO ANTES DE INICIAR SESIÓN', 'CUENTA NO VERIFICADA');
          } else {
            this.toastService.error('EMAIL O CLAVE INCORRECTA', 'ERROR');
          }
          this.loading.set(false);
        }
      });
    } else {
      this.toastService.warning('POR FAVOR, REVISA LOS CAMPOS', 'ATENCIÓN');
    }
  }
}
