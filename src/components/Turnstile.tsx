import Turnstile from 'react-turnstile';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type Props = {
  setToken: Dispatch<SetStateAction<string | null>>;
};

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!;
const PROD = process.env.NODE_ENV === 'production';

export const TURNSTILE_ENABLED = SITE_KEY && PROD;
// export const TURNSTILE_ENABLED = SITE_KEY && !PROD; // for dev mode testing

export default function TurnstileWidget({ setToken }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !TURNSTILE_ENABLED) return <></>;

  return (
    <Turnstile
      sitekey={SITE_KEY}
      onVerify={(token) => {
        // console.log('token', token);
        setToken(token);
      }}
    />
  );
}
