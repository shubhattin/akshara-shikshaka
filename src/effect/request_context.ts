import { AsyncLocalStorage } from 'node:async_hooks';

type ActiveRequest = {
  readonly request: Request;
};

const requestStorage = new AsyncLocalStorage<ActiveRequest>();

export const runWithRequest = <A>(request: Request, run: () => A): A =>
  requestStorage.run({ request }, run);

export const currentRequest = (): Request | undefined => requestStorage.getStore()?.request;
