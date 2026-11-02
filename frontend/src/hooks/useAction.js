import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

/**
 * Wraps a mutating API call: tracks pending state, shows success/error toasts.
 * run() resolves to the result, or undefined if the call failed.
 */
export function useAction(fn, { success, onSuccess, silent = false } = {}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (...args) => {
    setPending(true);
    setError(null);
    try {
      const result = await fn(...args);
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      if (onSuccess) await onSuccess(result);
      return result;
    } catch (err) {
      setError(err);
      if (!silent) toast.error(err.message || 'Something went wrong');
      return undefined;
    } finally {
      setPending(false);
    }
  }, [fn, success, onSuccess, silent]);
  return { run, pending, error };
}
