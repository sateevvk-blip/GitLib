import { useEffect } from 'react';
import { Mascot } from './Mascot';
import { phrases, react, useMascot } from './store';
import { useOnline } from '../lib/online';

export function MascotDock() {
  const { mood, message } = useMascot();
  const online = useOnline();

  useEffect(() => {
    if (!online) react('sad', phrases.offline, 6000);
  }, [online]);

  return (
    <div className="mascot-dock" aria-live="polite">
      {message && (
        <div className="mascot-bubble" key={message}>
          {message}
        </div>
      )}
      <button
        type="button"
        className="mascot-button"
        title="Том, библиотекарь"
        onClick={() => react('happy', phrases.idleTips, 5000)}
      >
        <Mascot mood={mood} size={104} />
      </button>
    </div>
  );
}
