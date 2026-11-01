import { toast } from '@spartan-ng/brain/sonner';
import { notifyError } from './notifications';

describe('dashboard error notifications', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses a dismissible error toast and deduplicates the same message', () => {
    const error = vi.spyOn(toast, 'error');
    notifyError('خطای آزمایشی');
    notifyError('خطای آزمایشی');
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('خطای آزمایشی', {
      id: 'dashboard-error:خطای آزمایشی',
      duration: 8000,
    });
  });
});
