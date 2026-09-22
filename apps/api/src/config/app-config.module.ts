import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { httpAppSchema } from './env.schema';
import { InsecureFlags } from './insecure-flags';
import { NAMESPACES } from './namespaces';

/**
 * Validates the environment when the HTTP app boots, before any provider
 * connects or listens: the schema is checked while the module graph is still
 * being scanned, so a missing or malformed variable fails boot outright.
 */
export const configModuleOptions = {
  isGlobal: true,
  // Deployment facts come from the environment alone: no `.env` is read here.
  ignoreEnvFile: true,
  validationSchema: httpAppSchema,
  validationOptions: {
    libraryOptions: { abortEarly: false, allowUnknown: true },
  },
  load: NAMESPACES,
};

// A rejected `forRoot` is awaited by Nest when it scans the imports, which is
// where it fails boot. Marking it handled here only stops Node reporting it as
// unhandled in the gap between this file loading and Nest getting there.
const validatedConfig = ConfigModule.forRoot(configModuleOptions);
validatedConfig.catch(() => undefined);

@Global()
@Module({
  imports: [validatedConfig],
  providers: [InsecureFlags],
  exports: [InsecureFlags],
})
export class AppConfigModule {}
