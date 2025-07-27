import type { NoteAccidental } from '../types/musicTypes';

const accidentalToDisplayCharacter: Record<NoteAccidental, string> = {
  '': '',
  '#': '♯',
  'b': '♭',
  'n': '♮'
};

export default accidentalToDisplayCharacter;
