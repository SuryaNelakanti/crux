import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOrReuseActiveSession, createProblemFromUpload } from '@/lib/api';

export function useCaptureFlow() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const openCapture = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;

      setUploading(true);
      setCaptureError(null);
      try {
        const sessionId = await createOrReuseActiveSession();
        const problemId = await createProblemFromUpload({ sessionId, file });
        navigate(`/problem/${problemId}`);
      } catch (error) {
        setCaptureError(
          error instanceof Error ? error.message : 'The photo could not be processed.'
        );
      } finally {
        setUploading(false);
        input.value = '';
      }
    },
    [navigate]
  );

  return {
    captureError,
    fileRef,
    handleFile,
    openCapture,
    uploading,
  };
}
