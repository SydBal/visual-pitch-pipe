import type { NoteAccidental } from '../types/musicTypes';

const accidentalToDisplayCharacter: Record<NoteAccidental, string> = {
  'none': '',
  '#': '♯',
  'b': '♭',
  'n': '♮'
};

export default accidentalToDisplayCharacter;
