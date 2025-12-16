import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SanitizeAttachmentsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (Array.isArray(data)) {
          return data.map((item) => this.sanitizeItem(item));
        }
        return this.sanitizeItem(data);
      }),
    );
  }

  private sanitizeItem(item: any): any {
    if (!item || typeof item !== 'object') {
      return item;
    }

    // Create a copy to avoid mutating the original
    const sanitized = { ...item };

    // Sanitize attachments array
    if (Array.isArray(sanitized.attachments)) {
      sanitized.attachments = sanitized.attachments.map((attachment: any) => {
        const sanitizedAttachment = { ...attachment };
        // Remove or mask fileUrl - only keep fileKey for secure access
        if (sanitizedAttachment.fileUrl && sanitizedAttachment.fileKey) {
          // Keep fileUrl for backward compatibility but mark it as deprecated
          // Frontend should use fileKey with secure endpoints instead
          sanitizedAttachment.fileUrl =
            '[REDACTED - Use fileKey with secure endpoints]';
        }
        return sanitizedAttachment;
      });
    }

    // Recursively sanitize nested objects
    Object.keys(sanitized).forEach((key) => {
      if (
        sanitized[key] &&
        typeof sanitized[key] === 'object' &&
        !Array.isArray(sanitized[key])
      ) {
        sanitized[key] = this.sanitizeItem(sanitized[key]);
      }
    });

    return sanitized;
  }
}
