import { Directive } from '@angular/core';
import { classes } from '@sanpay/ui/utils';

@Directive({
	selector: '[hlmBreadcrumbItem]',
	host: {
		'data-slot': 'breadcrumb-item',
	},
})
export class HlmBreadcrumbItem {
	constructor() {
		classes(() => 'gap-1 inline-flex items-center');
	}
}
