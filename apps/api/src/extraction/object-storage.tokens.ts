// Split out from `object-storage.module.ts` so the module and the service
// can each import the token without importing each other — a module that
// provides a service and a service that injects a token the module defines
// is a circular ESM import, which surfaces as
// "Cannot access 'MINIO_CLIENT' before initialization" at boot.
export const MINIO_CLIENT = Symbol("MINIO_CLIENT");
