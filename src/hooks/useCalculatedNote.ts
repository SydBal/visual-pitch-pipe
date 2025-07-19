import { useMemo } from 'react';
import keySignatureToAccidentalledNotes from '../musicData/keySignatureToAccidentalledNotes';
import accidentalTypeToCharacterMapping from '../musicData/accidentalTypeToCharacterMapping';
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
      noteAccidentalType === 'none' &&
      keySignatureToAccidentalledNotes[keySignature].includes(noteOctaveTuple[0])
    ) {
      noteAccidental = accidentalTypeToCharacterMapping[keySignatureAccidentalType === 'sharp' ? '#' : 'b'];
    } else {
      noteAccidental = accidentalTypeToCharacterMapping[noteAccidentalType];
    }
    return {
      note: noteOctaveTuple[0],
      octave: noteOctaveTuple[1],
      accidental: noteAccidental,
    };
  }, [clef, noteLocationName, noteAccidentalType, keySignature, keySignatureAccidentalType]);
}
