import { useCallback, useEffect, useState } from 'react';

type UseAsyncDataOptions<T> = {
  initialData: T;
  loadOnMount?: boolean;
};

function toErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function useAsyncData<T>(
  loader: () => Promise<T>,
  { initialData, loadOnMount = true }: UseAsyncDataOptions<T>,
) {
  const [data, setData] = useState<T>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(loadOnMount);

  const reload = useCallback(async (fallbackMessage = '불러오기 실패') => {
    try {
      setLoading(true);
      setError(null);
      const nextData = await loader();
      setData(nextData);
      return nextData;
    } catch (err) {
      const message = toErrorMessage(err, fallbackMessage);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    if (!loadOnMount) {
      return;
    }
    void reload().catch(() => undefined);
  }, [loadOnMount, reload]);

  return {
    data,
    error,
    loading,
    reload,
    setData,
    setError,
  };
}
