import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

/**
 * Request timeout interceptor
 * Automatically cancels requests that exceed the configured timeout
 * This prevents long-running queries from consuming resources when clients navigate away
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeout: number;

  constructor(private readonly configService: ConfigService) {
    // Default timeout: 30 seconds (30000ms)
    // Can be overridden with REQUEST_TIMEOUT environment variable
    this.defaultTimeout = parseInt(
      this.configService.get<string>('REQUEST_TIMEOUT', '30000'),
      10,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const timeoutMs = this.defaultTimeout;

    // Skip timeout for file uploads/downloads which may take longer
    const isFileOperation =
      request.url?.includes('/upload') ||
      request.url?.includes('/download') ||
      request.url?.includes('/ocr/process');

    if (isFileOperation) {
      // Use longer timeout for file operations (5 minutes)
      return next.handle().pipe(
        timeout(300000), // 5 minutes for file operations
        catchError((err) => {
          if (err instanceof TimeoutError) {
            return throwError(
              () => new RequestTimeoutException('Request timeout exceeded'),
            );
          }
          return throwError(() => err);
        }),
      );
    }

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          console.warn(
            `[TimeoutInterceptor] Request timeout after ${timeoutMs}ms: ${request.method} ${request.url}`,
          );
          return throwError(
            () => new RequestTimeoutException('Request timeout exceeded'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
