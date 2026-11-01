import { HttpInterceptorFn } from '@angular/common/http';
import { enviroment } from '../../enviroments/enviroments.development';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isBackendRequest = req.url.startsWith(enviroment.backenbaseurl);
  
  if (isBackendRequest) {
    const cloned = req.clone({
      withCredentials: true
    });
    return next(cloned);
  }
  
  return next(req);
};
