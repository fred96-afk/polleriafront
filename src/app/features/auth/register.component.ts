import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
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
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastrService);

  loading = signal(false);
  showPassword = signal(false);

  registerForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', [Validators.required]),
  }, { validators: this.passwordMatchValidator });

  private passwordMatchValidator(g: any) {
    return g.get('password').value === g.get('confirmPassword').value ? null : { mismatch: true };
  }

  onSubmit() {
    if (this.registerForm.valid) {
      this.loading.set(true);
      const { name, email, password } = this.registerForm.value;
      
      this.authService.registerClient({ 
        name, 
        email, 
        password, 
        roleId: 4 // 4 = Cliente
      }).subscribe({
        next: () => {
          this.toastService.success('POR FAVOR, REVISA TU CORREO PARA VERIFICAR TU CUENTA', '¡REGISTRO EXITOSO!', {
            timeOut: 5000
          });
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 2000);
        },
        error: () => {
          this.toastService.error('NO SE PUDO COMPLETAR EL REGISTRO', 'ERROR');
          this.loading.set(false);
        }
      });
    } else {
      this.toastService.warning('POR FAVOR, REVISA LOS CAMPOS', 'ATENCIÓN');
    }
  }
}
