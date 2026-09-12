import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  DuplicateRequestResponse,
  SubmitRequestBody,
  SubmitRequestResponse,
  ValidationErrorItem,
} from './requests-api.types.js';

export type SubmitOutcome =
  | { kind: 'submitted'; value: SubmitRequestResponse }
  | { kind: 'duplicate'; value: DuplicateRequestResponse }
  | { kind: 'validation_error'; errors: ValidationErrorItem[] }
  | { kind: 'unexpected_error' };

@Injectable({ providedIn: 'root' })
export class RequestsApiService {
  private readonly http = inject(HttpClient);

  async submit(body: SubmitRequestBody): Promise<SubmitOutcome> {
    try {
      const value = await firstValueFrom(
        this.http.post<SubmitRequestResponse>('/api/requests', body),
      );
      return { kind: 'submitted', value };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 409) {
          return {
            kind: 'duplicate',
            value: error.error as DuplicateRequestResponse,
          };
        }
        if (error.status === 400) {
          const errors =
            (error.error as { errors?: ValidationErrorItem[] })?.errors ?? [];
          return { kind: 'validation_error', errors };
        }
      }
      return { kind: 'unexpected_error' };
    }
  }
}
