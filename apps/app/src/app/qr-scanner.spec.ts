import jsQR from 'jsqr';
import { QrScanner } from './core/checkout/qr-scanner';

vi.mock('jsqr', () => ({ default: vi.fn() }));

describe('QR camera scanner', () => {
  let video: HTMLVideoElement;
  let frames: FrameRequestCallback[];
  let stopTrack: ReturnType<typeof vi.fn>;
  let detect: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    frames = [];
    stopTrack = vi.fn();
    detect = vi.fn();
    getUserMedia = vi
      .fn()
      .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        static getSupportedFormats() {
          return Promise.resolve(['qr_code']);
        }
        detect = detect;
      },
    );
    video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 320 });
    Object.defineProperty(video, 'videoHeight', { value: 240 });
    video.play = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }),
    } as unknown as CanvasRenderingContext2D);
    vi.mocked(jsQR).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function frame(): Promise<void> {
    const callback = frames.shift();
    expect(callback).toBeDefined();
    if (!callback) throw new Error('No scheduled frame');
    callback(0);
    await Promise.resolve();
    await Promise.resolve();
  }

  it('falls back to jsQR when the Android native detector throws', async () => {
    detect.mockRejectedValue(new Error('native detector unavailable'));
    vi.mocked(jsQR).mockReturnValue({ data: 'SANPAY:S:ABCD' } as ReturnType<
      typeof jsQR
    >);
    const result = vi.fn().mockReturnValue(true);
    const scanner = new QrScanner(video, result);
    await scanner.start();
    await frame();
    expect(result).toHaveBeenCalledWith('SANPAY:S:ABCD');
    scanner.stop();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('tries jsQR when the native detector returns no results', async () => {
    detect.mockResolvedValue([]);
    vi.mocked(jsQR).mockReturnValue({ data: 'SANPAY:S:EFGH' } as ReturnType<
      typeof jsQR
    >);
    const result = vi.fn().mockReturnValue(true);
    const scanner = new QrScanner(video, result);
    await scanner.start();
    await frame();
    expect(result).toHaveBeenCalledWith('SANPAY:S:EFGH');
    scanner.stop();
  });

  it('keeps scanning after an unrelated QR code', async () => {
    detect
      .mockResolvedValueOnce([{ rawValue: 'unrelated' }])
      .mockResolvedValueOnce([{ rawValue: 'SANPAY:S:ABCD' }]);
    const result = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const scanner = new QrScanner(video, result);
    await scanner.start();
    await frame();
    await frame();
    expect(result.mock.calls).toEqual([['unrelated'], ['SANPAY:S:ABCD']]);
    scanner.stop();
  });

  it('checks all native codes when another QR is also in view', async () => {
    detect.mockResolvedValue([
      { rawValue: 'unrelated' },
      { rawValue: 'SANPAY:S:ABCD' },
    ]);
    const result = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const scanner = new QrScanner(video, result);
    await scanner.start();
    await frame();
    expect(result.mock.calls).toEqual([['unrelated'], ['SANPAY:S:ABCD']]);
    scanner.stop();
  });

  it('stops a stream that arrives after the scanner was closed', async () => {
    let resolveStream!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveStream = resolve;
      }),
    );
    const scanner = new QrScanner(video, vi.fn());
    const started = scanner.start();
    scanner.stop();
    resolveStream({ getTracks: () => [{ stop: stopTrack }] });
    await started;
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });
});
