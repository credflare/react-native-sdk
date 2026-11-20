import {useCallback, useRef, useState} from 'react';
import {CredflareSession} from '@credflare/sdk-javascript';
import type {SessionDescriptor, SessionInfo} from '@credflare/sdk-javascript';

export function useCredflareSession(provider: () => Promise<SessionDescriptor>) {
  const active = useRef<Promise<SessionInfo> | undefined>(undefined);
  const client = useRef<CredflareSession | undefined>(undefined);
  const [info, setInfo] = useState<SessionInfo>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const load = useCallback(() => {
    if (active.current) return active.current;
    setLoading(true); setError(undefined);
    const pending = (async () => {
      try {
        const descriptor = await provider();
        if (client.current) client.current.replaceSession(descriptor);
        else client.current = new CredflareSession(descriptor);
        const metadata = await client.current.get();
        setInfo(metadata);
        return metadata;
      } catch (cause) {
        const failure = cause instanceof Error ? cause : new Error('Could not start verification.');
        setError(failure);
        throw failure;
      } finally {
        setLoading(false);
        active.current = undefined;
      }
    })();
    active.current = pending;
    return pending;
  }, [provider]);
  return {session:client.current, info, loading, error, load};
}
