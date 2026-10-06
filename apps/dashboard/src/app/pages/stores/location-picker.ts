import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@sanpay/ui/button';
import type { Map, Marker, TileLayer } from 'leaflet';

@Component({
  selector: 'app-store-location-picker',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="text-muted-foreground mb-3 text-xs">
      روی محل فروشگاه کلیک کنید یا نشانگر را جابه‌جا کنید. برای انتخاب با
      صفحه‌کلید، نقشه را با کلیدهای جهت جابه‌جا کنید و «انتخاب مرکز نقشه» را
      بزنید.
    </p>
    <div
      #mapElement
      class="relative z-0 h-80 w-full rounded-lg border"
      dir="ltr"
      role="region"
      aria-label="نقشه انتخاب موقعیت فروشگاه"
    ></div>
    @if (tilesFailed()) {
      <div class="mt-2 flex flex-wrap items-center gap-3" role="alert">
        <p class="text-destructive text-xs">
          تصاویر نقشه دریافت نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.
        </p>
        <button hlmBtn type="button" variant="outline" (click)="retryTiles()">
          تلاش دوباره
        </button>
      </div>
    }
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <button
        hlmBtn
        type="button"
        variant="outline"
        [disabled]="!ready()"
        (click)="selectCenter()"
      >
        انتخاب مرکز نقشه
      </button>
      <button
        hlmBtn
        type="button"
        variant="outline"
        [disabled]="!ready() || locating()"
        (click)="locate()"
      >
        {{ locating() ? 'در حال دریافت موقعیت…' : 'موقعیت فعلی من' }}
      </button>
      <span class="text-muted-foreground text-xs" aria-live="polite">{{
        latitude() !== null && longitude() !== null
          ? 'موقعیت فروشگاه انتخاب شده است'
          : 'هنوز موقعیتی انتخاب نشده است'
      }}</span>
    </div>
    @if (error()) {
      <p class="text-destructive mt-2 text-xs" role="alert">{{ error() }}</p>
    }
  `,
})
export class StoreLocationPicker {
  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);
  readonly locationSelected = output<{ latitude: number; longitude: number }>();
  private readonly element =
    viewChild.required<ElementRef<HTMLDivElement>>('mapElement');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ready = signal(false);
  protected readonly locating = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tilesFailed = signal(false);
  private map?: Map;
  private tiles?: TileLayer;
  private marker?: Marker;
  private leaflet?: typeof import('leaflet');
  private observer?: ResizeObserver;

  constructor() {
    afterNextRender(() => {
      void this.initialize();
    });
    afterRenderEffect(() =>
      this.syncSelection(this.latitude(), this.longitude()),
    );
    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      this.map?.remove();
    });
  }

  private async initialize(): Promise<void> {
    try {
      const imported = await import('leaflet');
      // Production bundles expose this CommonJS library through default;
      // the development server can expose the named exports directly.
      const leaflet = (
        'default' in imported ? imported.default : imported
      ) as typeof import('leaflet');
      if (this.destroyRef.destroyed) return;
      this.leaflet = leaflet;
      const latitude = this.latitude();
      const longitude = this.longitude();
      const selected = latitude !== null && longitude !== null;
      this.map = leaflet
        .map(this.element().nativeElement)
        .setView(
          selected ? [latitude, longitude] : [32.6, 53.7],
          selected ? 16 : 5,
        );
      this.map.zoomControl.setPosition('topright');
      this.tiles = leaflet
        .tileLayer('/map-tiles/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        });
      this.tiles.on('tileerror', () => {
        if (!this.destroyRef.destroyed) this.tilesFailed.set(true);
      });
      this.tiles.addTo(this.map);
      this.map.on('click', (event) =>
        this.select(event.latlng.lat, event.latlng.lng),
      );
      this.syncSelection(latitude, longitude);
      this.observer = new ResizeObserver(() => this.map?.invalidateSize());
      this.observer.observe(this.element().nativeElement);
      this.ready.set(true);
    } catch {
      if (!this.destroyRef.destroyed)
        this.error.set('بارگذاری نقشه ممکن نشد؛ صفحه را دوباره باز کنید.');
    }
  }

  private syncSelection(
    latitude: number | null,
    longitude: number | null,
  ): void {
    if (!this.map || !this.leaflet) return;
    if (latitude === null || longitude === null) {
      this.marker?.remove();
      this.marker = undefined;
      return;
    }
    if (this.marker) this.marker.setLatLng([latitude, longitude]);
    else {
      this.marker = this.leaflet
        .marker([latitude, longitude], {
          draggable: true,
          title: 'موقعیت فروشگاه؛ برای تغییر، نشانگر را بکشید',
          icon: this.leaflet.divIcon({
            className: 'store-location-pin',
            html: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 40C12 34 2 24 2 16a14 14 0 0 1 28 0c0 8-10 18-14 24Z" fill="#2563eb" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="white"/></svg>',
            iconSize: [32, 42],
            iconAnchor: [16, 40],
          }),
        })
        .addTo(this.map);
      this.marker.on('dragend', () => {
        const point = this.marker?.getLatLng();
        if (point) this.select(point.lat, point.lng);
      });
    }
  }

  private select(latitude: number, longitude: number): void {
    if (this.destroyRef.destroyed) return;
    // Leaflet can wrap horizontally beyond ±180 degrees.
    longitude = ((((longitude + 180) % 360) + 360) % 360) - 180;
    this.syncSelection(latitude, longitude);
    this.locationSelected.emit({ latitude, longitude });
  }

  protected selectCenter(): void {
    const point = this.map?.getCenter();
    if (point) this.select(point.lat, point.lng);
  }

  protected retryTiles(): void {
    this.tilesFailed.set(false);
    this.tiles?.redraw();
  }

  protected locate(): void {
    this.error.set(null);
    if (!navigator.geolocation) {
      this.error.set(
        'مرورگر امکان دریافت موقعیت فعلی را ندارد؛ محل را روی نقشه انتخاب کنید.',
      );
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (this.destroyRef.destroyed) return;
        this.locating.set(false);
        const { latitude, longitude } = position.coords;
        this.map?.setView([latitude, longitude], 16);
        this.select(latitude, longitude);
      },
      () => {
        if (this.destroyRef.destroyed) return;
        this.locating.set(false);
        this.error.set(
          'دریافت موقعیت فعلی ممکن نشد؛ محل را روی نقشه انتخاب کنید.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
}
