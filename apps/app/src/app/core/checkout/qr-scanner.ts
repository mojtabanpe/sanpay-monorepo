import jsQR from 'jsqr';

/**
 * اسکنر QR روی دوربین پشتی.
 *
 * اگر مرورگر `BarcodeDetector` بومی داشته باشد (کروم اندروید) از آن استفاده
 * می‌کند — سریع‌تر و کم‌مصرف‌تر است — وگرنه به jsQR روی فریم‌های canvas
 * برمی‌گردد که در سافاری iOS هم کار می‌کند.
 */
export class QrScanner {
  private stream: MediaStream | null = null;
  private frameHandle: number | null = null;
  private stopped = false;
  private readonly canvas = document.createElement('canvas');

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onResult: (text: string) => void,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', 'true');
    await this.video.play();

    const detector = await createNativeDetector();
    const scan = async () => {
      if (this.stopped) return;
      try {
        const text = detector
          ? await this.readNative(detector)
          : this.readWithJsQr();
        if (text) {
          this.onResult(text);
          return;
        }
      } catch {
        // فریم خراب — فریم بعدی را امتحان می‌کنیم
      }
      this.frameHandle = requestAnimationFrame(() => void scan());
    };
    this.frameHandle = requestAnimationFrame(() => void scan());
  }

  stop(): void {
    this.stopped = true;
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private async readNative(detector: BarcodeDetectorLike): Promise<string | null> {
    const codes = await detector.detect(this.video);
    return codes[0]?.rawValue ?? null;
  }

  private readWithJsQr(): string | null {
    const { videoWidth, videoHeight } = this.video;
    if (!videoWidth || !videoHeight) return null;

    // نمونه‌برداری با عرض حداکثر ۵۰۰ پیکسل — برای QR کافی است و CPU گوشی را
    // روی هر فریم اشغال نمی‌کند.
    const scale = Math.min(1, 500 / videoWidth);
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);
    this.canvas.width = width;
    this.canvas.height = height;

    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(this.video, 0, 0, width, height);

    const image = context.getImageData(0, 0, width, height);
    const result = jsQR(image.data, width, height, {
      inversionAttempts: 'dontInvert',
    });
    return result?.data ?? null;
  }
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

async function createNativeDetector(): Promise<BarcodeDetectorLike | null> {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  if (!ctor) return null;
  try {
    const formats = (await ctor.getSupportedFormats?.()) ?? [];
    if (formats.length > 0 && !formats.includes('qr_code')) return null;
    return new ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}
