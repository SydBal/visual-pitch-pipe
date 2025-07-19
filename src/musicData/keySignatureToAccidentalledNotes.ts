import type { KeySignatureName, KeySignatureAccentedNotes } from '../types/musicTypes';

const keySignatureToAccidentalledNotes: Record<KeySignatureName, KeySignatureAccentedNotes> = {
  'C': '',
  'G': 'F',
  'D': 'FC',
  'A': 'FCG',
  'E': 'FCGD',
  'B': 'FCGDA',
  'F#': 'FCGDAE',
  'C#': 'FCGDAEB',
  'F': 'B',
  'Bb': 'BE',
  'Eb': 'BEA',
  'Ab': 'BEAD',
  'Db': 'BEADG',
  'Gb': 'BEADGC',
  'Cb': 'BEADGCF',
};

export default keySignatureToAccidentalledNotes;
