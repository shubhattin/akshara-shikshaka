import { Layer, ManagedRuntime } from 'effect';
import { AppConfig } from './config';
import { Database } from './database';
import { RedisClient } from './redis';
import { ObjectStorage } from './storage';
import { AiProvider } from './ai';
import { ImageProcessor } from './image';
import { BackgroundWork } from './background';

const InfrastructureLayer = Layer.mergeAll(Database.Live, ImageProcessor.Live, BackgroundWork.Live);

const ConfigDependentLayer = Layer.mergeAll(
  RedisClient.Live,
  ObjectStorage.Live,
  AiProvider.Live
).pipe(Layer.provide(AppConfig.Live));

export const AppLayer = Layer.mergeAll(InfrastructureLayer, ConfigDependentLayer, AppConfig.Live);

export const appRuntime = ManagedRuntime.make(AppLayer);

export type AppRuntime = typeof appRuntime;
