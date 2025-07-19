import type { KeySigAccidental, KeySigAccidentalCount } from '../types/musicTypes';

const KeySignatureMapping: Record<KeySigAccidental, Record<KeySigAccidentalCount, string>> = {
  sharp: {
    '0': 'C',
    '1': 'G',
    '2': 'D',
    '3': 'A',
    '4': 'E',
    '5': 'B',
    '6': 'F#',
    '7': 'C#',
  },
  flat: {
    '0': 'C',
    '1': 'F',
    '2': 'Bb',
    '3': 'Eb',
    '4': 'Ab',
    '5': 'Db',
    '6': 'Gb',
    '7': 'Cb',
  },
};

export default KeySignatureMapping;
