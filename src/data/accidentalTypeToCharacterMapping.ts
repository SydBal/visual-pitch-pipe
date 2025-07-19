import type { NoteAccidental } from '../types/musicTypes';

const accidentalTypeToCharacterMapping: Record<NoteAccidental, string> = {
  'none': '',
  '#': '♯',
  'b': '♭',
  'n': '♮'
};

export default accidentalTypeToCharacterMapping;
