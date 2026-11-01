import { toast } from '@spartan-ng/brain/sonner';

/** One presentation for operation errors, including local validation failures. */
export function notifyError(message: string): void {
  toast.error(message, { id: `dashboard-error:${message}`, duration: 8000 });
}
