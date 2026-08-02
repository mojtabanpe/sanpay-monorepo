import { Directive } from '@angular/core';
import { classes } from '@sanpay/ui/utils';

@Directive({
	selector: 'optgroup[hlmNativeSelectOptGroup]',
	host: { 'data-slot': 'native-select-optgroup' },
})
export class HlmNativeSelectOptGroup {
	constructor() {
		classes(() => 'bg-[Canvas] text-[CanvasText]');
	}
}
