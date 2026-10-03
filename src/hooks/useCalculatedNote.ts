import { useMemo } from 'react';
import { calculateNote } from '../utils/calculateNote';
import type { ClefType, NoteAccidental, KeySignatureAccidental } from '../types/musicTypes';

export function useCalculatedNote(
  clef: ClefType,
  noteLocationName: string,
  noteAccidentalType: NoteAccidental,
  keySignature: string,
  keySignatureAccidentalType: KeySignatureAccidental
) {
  return useMemo(
    () => calculateNote(noteLocationName, noteAccidentalType, keySignature, keySignatureAccidentalType),
    [clef, noteLocationName, noteAccidentalType, keySignature, keySignatureAccidentalType]
  );
}
