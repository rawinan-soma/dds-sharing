import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { m } from '../paraglide/messages.js';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly appName = m.app_name();
  protected readonly appTagline = m.app_tagline();
}
