import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  type DiseaseGroupChoice,
  type Province,
  type SubmissionBody,
} from './request-form';

export interface ReferenceData {
  diseaseGroups: DiseaseGroupChoice[];
  provinces: Province[];
}

export interface ServerProblem {
  field: string;
  code: string;
  message: string;
}

export type SubmitOutcome =
  | { status: 'submitted'; reference: string }
  | { status: 'in_progress' }
  | { status: 'refused'; problems: ServerProblem[] }
  | { status: 'failed' };

@Injectable({ providedIn: 'root' })
export class RequesterApi {
  private readonly http = inject(HttpClient);

  reference(): Promise<ReferenceData> {
    return firstValueFrom(this.http.get<ReferenceData>('/api/reference'));
  }

  async submit(body: SubmissionBody): Promise<SubmitOutcome> {
    try {
      const { reference } = await firstValueFrom(
        this.http.post<{ reference: string }>('/api/requests', body),
      );
      return { status: 'submitted', reference };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 409) return { status: 'in_progress' };
        if (error.status === 400) {
          const errors = (error.error as { errors?: ServerProblem[] } | null)
            ?.errors;
          return { status: 'refused', problems: errors ?? [] };
        }
      }
      return { status: 'failed' };
    }
  }
}
