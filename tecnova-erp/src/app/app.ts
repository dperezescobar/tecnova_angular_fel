import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdateService } from './core/services/sw-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Constak Cloud');
  public readonly swUpdateService = inject(SwUpdateService);
}
