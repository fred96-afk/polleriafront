import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-checkout-result',
  imports: [CommonModule, RouterLink],
  templateUrl: './checkout-result.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutResultComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  status = signal<'success' | 'failure' | 'pending'>('success');
  orderId = signal<string | null>(null);

  ngOnInit() {
    this.orderId.set(this.route.snapshot.queryParamMap.get('orderId'));
    const path = window.location.pathname;
    if (path.includes('success')) this.status.set('success');
    else if (path.includes('failure')) this.status.set('failure');
    else if (path.includes('pending')) this.status.set('pending');
  }
}
