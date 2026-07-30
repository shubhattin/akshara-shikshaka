import { Context, Effect, Layer } from 'effect';
import { db, type transactionType } from '~/db/db';
import { DatabaseError } from './errors';

export type DbClient = typeof db;
export type DbTransaction = transactionType;

const tryDb = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => DatabaseError.make({ operation, cause })
  }).pipe(Effect.annotateLogs({ category: 'db', operation }));

export class Database extends Context.Service<
  Database,
  {
    readonly run: <A>(
      operation: string,
      run: (client: DbClient) => Promise<A>
    ) => Effect.Effect<A, DatabaseError>;
    readonly transaction: <A>(
      operation: string,
      run: (tx: DbTransaction) => Promise<A>
    ) => Effect.Effect<A, DatabaseError>;
    // readonly db: DbClient;
  }
>()('Database') {
  static readonly Live = Layer.succeed(Database)({
    // db: db,
    run: (operation, run) => tryDb(operation, () => run(db)),
    transaction: (operation, run) => tryDb(operation, () => db.transaction(async (tx) => run(tx)))
  });
}

export const dbRun = <A>(operation: string, run: (client: DbClient) => Promise<A>) =>
  Effect.gen(function* () {
    const database = yield* Database;
    return yield* database.run(operation, run);
  });

export const dbTransaction = <A>(operation: string, run: (tx: DbTransaction) => Promise<A>) =>
  Effect.gen(function* () {
    const database = yield* Database;
    return yield* database.transaction(operation, run);
  });
