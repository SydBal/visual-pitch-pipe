// Mapping of note names to MIDI numbers (C = 0)
const noteToMidi: Record<string, number> = {
  'C':  0,
  'C#': 1,  'Db': 1,
  'Cb': -1, 'B#': 0,
  'D':  2,
  'D#': 3,  'Eb': 3,
  'E':  4,
  'E#': 5,  'Fb': 4,
  'F':  5,
  'F#': 6,  'Gb': 6,
  'G':  7,
  'G#': 8,  'Ab': 8,
  'A':  9,
  'A#': 10, 'Bb': 10,
  'B':  11
};

function getMidiNumber(noteName: string, octave: number): number {
  const midiBase = noteToMidi[noteName] ?? 0;
  // If octave is missing, default to 4 (middle C)
  return 12 * (((octave ?? 4) + 1)) + midiBase;
}

function getFrequencyFromMidiNumber(midiNumber: number): number {
  // A4 is 440 Hz, which is MIDI number 69
  return 440 * Math.pow(2, (midiNumber - 69) / 12);
}

/**
 * Plays a note using the Web Audio API.
 * @param noteName The note name (e.g., 'C', 'C#', 'Db', etc.)
 * @param octave The octave number (e.g., 4 for middle C)
 */
export function playNote(noteName: string, octave: number) {
  if (!window.AudioContext) {
    throw new Error('Web Audio API is not supported in this browser.');
  }
  const midiNumber = getMidiNumber(noteName, octave);
  const frequency = getFrequencyFromMidiNumber(midiNumber);
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
