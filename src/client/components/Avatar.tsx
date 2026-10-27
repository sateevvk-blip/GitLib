import { useState } from 'react';

interface Props {
  avatarPath: string | null;
  name: string;
  size?: 'md' | 'lg';
}

export function Avatar({ avatarPath, name, size = 'md' }: Props) {
  const [failed, setFailed] = useState(false);
  const cls = `avatar${size === 'lg' ? ' avatar-lg' : ''}`;
  if (!avatarPath || failed) {
    return (
      <span className={`${cls} avatar-fallback`} aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img className={cls} src={`/${avatarPath}`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
