import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import * as m from '../paraglide/messages.js';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly appServiceName = m.app_service_name();
}
