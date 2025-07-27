import { useMemo } from 'react';
import keySignatureToAccidentalledNotes from '../data/keySignatureToAccidentalledNotes';
import type { ClefType, NoteAccidental, KeySignatureAccidental } from '../types/musicTypes';

export function useCalculatedNote(
  clef: ClefType,
  noteLocationName: string,
  noteAccidentalType: NoteAccidental,
  keySignature: string,
  keySignatureAccidentalType: KeySignatureAccidental
) {
  return useMemo(() => {
    const noteOctaveTuple = noteLocationName.split('/');
    let noteAccidental;
    if (noteAccidentalType === 'n') {
      noteAccidental = '';
    } else if (
      noteAccidentalType === '' &&
      keySignatureToAccidentalledNotes[keySignature].includes(noteOctaveTuple[0])
    ) {
      noteAccidental = keySignatureAccidentalType === 'sharp' ? '#' : 'b';
    } else {
      noteAccidental = noteAccidentalType;
    }
    return {
      note: noteOctaveTuple[0],
      octave: noteOctaveTuple[1],
      accidental: noteAccidental as NoteAccidental,
    };
  }, [clef, noteLocationName, noteAccidentalType, keySignature, keySignatureAccidentalType]);
}
