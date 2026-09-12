import { bootstrapApplication } from '@angular/platform-browser';
import { setLocale } from './paraglide/runtime.js';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Thai is the only language shown to a person (spec §16.3) — set before the
// first render rather than left to the toolchain's dev-mode baseLocale
// ("en"), which exists only to keep an untranslated key readable, never to
// pick the shown language.
setLocale('th', { reload: false });

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
