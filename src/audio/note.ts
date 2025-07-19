import noteToMidi from '../data/noteToMidi';

/**
 * Plays a note using the Web Audio API.
 * @param noteName The note name (e.g., 'C', 'C#', 'Db', etc.)
 * @param octave The octave number (e.g., 4 for middle C)
 */
export function playNote(noteName: string, octave: number) {
  // Default to C if not found
  const midiBase = noteToMidi[noteName] ?? 0;
  // MIDI note number: C-1 = 0, C0 = 12, C1 = 24, ..., C4 = 60, C5 = 72
  // So: midiNumber = 12 * (octave + 1) + midiBase
  // If octave is NaN, default to 4
  const midiNumber = 12 * ((isNaN(octave) ? 4 : octave) + 1) + midiBase;
  const frequency = 440 * Math.pow(2, (midiNumber - 69) / 12);
  const audioContext = new window.AudioContext();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gainNode.gain.value = 0.5;
  oscillator.connect(gainNode).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 1);
  oscillator.onended = () => audioContext.close();
}
