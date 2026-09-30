import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { getLocale } from '../paraglide/runtime.js';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  constructor() {
    // Thai is the only language a person is shown (§16.3); the dev catalogue is
    // English until the flip, and the document should say which it is.
    document.documentElement.lang = getLocale();
  }
}
