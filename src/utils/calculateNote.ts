import keySignatureToAccidentalledNotes from '../data/keySignatureToAccidentalledNotes';
import type { NoteAccidental, KeySignatureAccidental } from '../types/musicTypes';

export interface CalculatedNote {
  note: string;
  octave: string;
  accidental: NoteAccidental;
}

/**
 * Pure note calculation shared by manual and camera modes.
 * Resolves the final note name, octave, and accidental from a staff
 * position's note name, an optional per-note accidental, and the key signature.
 */
export function calculateNote(
  noteLocationName: string,
  noteAccidentalType: NoteAccidental,
  keySignature: string,
  keySignatureAccidentalType: KeySignatureAccidental
): CalculatedNote {
  const noteOctaveTuple = noteLocationName.split('/');
  let noteAccidental: NoteAccidental;
  if (noteAccidentalType === 'n') {
    noteAccidental = '';
  } else if (
    noteAccidentalType === '' &&
    (keySignatureToAccidentalledNotes[keySignature] ?? '').includes(noteOctaveTuple[0])
  ) {
    noteAccidental = keySignatureAccidentalType === 'sharp' ? '#' : 'b';
  } else {
    noteAccidental = noteAccidentalType;
  }
  return {
    note: noteOctaveTuple[0],
    octave: noteOctaveTuple[1],
    accidental: noteAccidental,
  };
}
