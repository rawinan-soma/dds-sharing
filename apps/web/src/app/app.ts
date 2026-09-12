import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import * as m from '../paraglide/messages.js';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly departmentLine = m.requester_department_line();
}
