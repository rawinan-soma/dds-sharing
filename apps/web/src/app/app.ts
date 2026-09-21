import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly appServiceName = m.app_service_name();
  protected readonly appDepartment = m.app_department();
  protected readonly appTelephone = m.app_telephone();

  constructor() {
    // Thai is the only language a person is shown (§16.3); the dev catalogue is
    // English until the flip, and the document should say which it is.
    document.documentElement.lang = getLocale();
  }
}
