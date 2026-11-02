import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';
import { App } from './app';
import { unlockAudio } from './lib/device';

registerSW({ immediate: true });

// Any first tap unlocks audio, so the end-of-rest beep is allowed later (e.g. after a reload mid-session).
document.addEventListener('pointerdown', unlockAudio, { once: true });

render(<App />, document.getElementById('app')!);
