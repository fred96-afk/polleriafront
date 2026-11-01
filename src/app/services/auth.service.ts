import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { enviroment } from '../../enviroments/enviroments.development';
import { AuthResponse, LoginRequest, UserRequest, ForgotPasswordRequest, ResetPasswordRequest, AuthUser } from '../models/auth.model';
import { Observable, tap, catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${enviroment.backenbaseurl}/api/Auth`;

  private getStoredUser(): AuthUser | null {
    // Si existía un token previo en localStorage de versiones anteriores, se remueve
    if (localStorage.getItem('token')) {
      localStorage.removeItem('token');
    }
    const raw = localStorage.getItem('auth_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem('auth_user');
      return null;
    }
  }

  private userState = signal<AuthUser | null>(this.getStoredUser());

  currentUser = computed(() => this.userState());

  private parseNumericClaim(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  get roleName(): string | null {
    const user = this.currentUser();
    if (!user) return null;

    const role = user.role || 
                 user['Role'] || 
                 user['roleName'];

    return typeof role === 'string' && role.trim() !== '' ? role.trim() : null;
  }

  get displayName(): string {
    const user = this.currentUser();
    if (!user) return 'Usuario';

    const candidateName = user.name ||
      user['unique_name'] ||
      user['given_name'];

    if (typeof candidateName === 'string' && candidateName.trim() !== '') {
      return candidateName.trim();
    }

    const candidateEmail = user.email;
    if (typeof candidateEmail === 'string' && candidateEmail.includes('@')) {
      return candidateEmail.split('@')[0];
    }

    return 'Usuario';
  }

  get email(): string | null {
    const user = this.currentUser();
    if (!user) return null;

    return typeof user.email === 'string' && user.email.trim() !== ''
      ? user.email.trim()
      : null;
  }

  get roleId(): number | null {
    const user = this.currentUser();
    if (!user) return null;

    const rawRoleId = user.roleId ?? user['RoleId'] ?? user['roleid'];
    return this.parseNumericClaim(rawRoleId);
  }

  get userId(): number | null {
    const user = this.currentUser();
    if (!user) return null;

    const rawId = user.id ?? user['Id'] ?? user['userId'];
    return this.parseNumericClaim(rawId);
  }

  get clientId(): number | null {
    const user = this.currentUser();
    if (!user) {
      console.warn('[AUTH] No hay usuario logueado al intentar obtener clientId');
      return null;
    }

    const rawClientId = user.clientId ?? user['ClientId'] ?? user['clientid'];
    return this.parseNumericClaim(rawClientId);
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request).pipe(
      tap(response => {
        const user: AuthUser = response.user || {
          email: request.email,
          role: response.role,
          permissions: response.permissions
        };
        this.setUser(user);
      })
    );
  }

  adminLogin(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/adminlogin`, request).pipe(
      tap(response => {
        const user: AuthUser = response.user || {
          email: request.email,
          role: response.role,
          permissions: response.permissions
        };
        this.setUser(user);
      })
    );
  }

  registerClient(request: UserRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/registerclient`, request);
  }

  verifyEmail(token: string): Observable<void> {
    return this.http.get<void>(`${this.apiUrl}/verify-email`, {
      params: { token }
    });
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/forgot-password`, request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/reset-password`, request);
  }

  logout() {
    this.http.post(`${this.apiUrl}/logout`, {}).subscribe({
      next: () => {},
      error: (e) => console.warn('Error al notificar logout al servidor', e)
    });
    this.setUser(null);
    localStorage.removeItem('token');
  }

  checkAuth(): Observable<AuthUser | null> {
    return this.http.get<AuthUser>(`${this.apiUrl}/me`).pipe(
      tap(user => this.setUser(user)),
      catchError(() => {
        this.setUser(null);
        return of(null);
      })
    );
  }

  private setUser(user: AuthUser | null) {
    if (user) {
      localStorage.setItem('auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('auth_user');
    }
    this.userState.set(user);
  }

  isAuthenticated(): boolean {
    return !!this.userState();
  }

  isAdministrator(): boolean {
    const name = this.roleName?.toLowerCase() || '';
    const id = this.roleId;
    return name.includes('admin') || id === 1;
  }

  isWaiter(): boolean {
    const name = this.roleName?.toLowerCase() || '';
    const id = this.roleId;
    return name.includes('mozo') || name.includes('waiter') || id === 2;
  }

  isDelivery(): boolean {
    const name = this.roleName?.toLowerCase() || '';
    const id = this.roleId;
    return name.includes('delivery') || id === 3;
  }

  canAccessAdminDashboard(): boolean {
    return this.isAdministrator();
  }

  canAccessPos(): boolean {
    return this.isWaiter() || this.isAdministrator();
  }
}
