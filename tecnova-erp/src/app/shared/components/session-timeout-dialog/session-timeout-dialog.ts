import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SessionActivityService } from '../../../core/services/session-activity';

@Component({
  selector: 'app-session-timeout-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule, ButtonModule],
  templateUrl: './session-timeout-dialog.html',
  styleUrl: './session-timeout-dialog.scss'
})
export class SessionTimeoutDialogComponent {
  session = inject(SessionActivityService);
}
