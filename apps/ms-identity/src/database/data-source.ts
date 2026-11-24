import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env';
import { typeOrmOptions } from './typeorm-options';

/**
 * Used only by the TypeORM CLI (`npm run migration:run|revert`). The service
 * itself builds its connection through Nest's TypeOrmModule.
 */
export default new DataSource(typeOrmOptions(validateEnv(process.env)));
