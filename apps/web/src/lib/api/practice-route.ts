import type { SupabaseClient } from '@supabase/supabase-js';
import { requireApiUser } from './bearer-auth';
import { readJsonBody, serviceResponse } from './service-response';
import type { ServiceResult } from '../services/result';

/**
 * The shape every `/api/m/v1/practices/:id/*` write shares: authenticate,
 * merge the JSON body with the practice id from the path, call the service.
 */
export type PracticeParams = { params: { practiceId: string } };

type PracticeService<T> = (db: SupabaseClient, actorUserId: string, input: unknown) => Promise<ServiceResult<T>>;

export function practiceBodyRoute<T>(service: PracticeService<T>) {
  return async (req: Request, { params }: PracticeParams) => {
    const auth = await requireApiUser(req);
    if (auth.response) return auth.response;

    const body = await readJsonBody(req);
    const fields = body && typeof body === 'object' ? body : {};
    return serviceResponse(await service(auth.db, auth.user.id, { ...fields, practiceId: params.practiceId }));
  };
}

/** A read of one practice: authenticate and call the service with the path's id. */
export function practiceReadRoute<T>(service: PracticeService<T>) {
  return async (req: Request, { params }: PracticeParams) => {
    const auth = await requireApiUser(req);
    if (auth.response) return auth.response;

    return serviceResponse(await service(auth.db, auth.user.id, { practiceId: params.practiceId }));
  };
}
