import { useState } from 'react';
import { useKeySignature } from './useKeySignature';
import { useClefNoteLocations, useNoteLocationName } from './useNoteLocationName';
import { useCalculatedNote } from './useCalculatedNote';
import type {
  StaffPosition,
  ClefType,
  KeySignatureAccidentalCount,
  NoteAccidental,
  KeySignatureAccidental,
} from '../types/musicTypes';

export function usePitchPipeState() {
  const [noteLocation, setNoteLocation] = useState<StaffPosition>('0');
  const [noteAccidentalType, setNoteAccidentalType] = useState<NoteAccidental>('');
  const [clef, setClef] = useState<ClefType>('treble');
  const [numberOfKeySignatureAccidentals, setNumberOfKeySignatureAccidentals] = useState<KeySignatureAccidentalCount>('0');
  const [keySignatureAccidentalType, setKeySignatureAccidentalType] = useState<KeySignatureAccidental>('sharp');

  const { keySignature, keySignatureDisplayString } = useKeySignature(
    keySignatureAccidentalType,
    numberOfKeySignatureAccidentals
  );

  const clefNoteLocations = useClefNoteLocations(clef);
  const noteLocationName = useNoteLocationName(clef, noteLocation);

  const { note: calculatedNote, octave: calculatedNoteOctave, accidental: calculatedNoteAccidental } = useCalculatedNote(
    clef,
    noteLocationName,
    noteAccidentalType,
    keySignature,
    keySignatureAccidentalType
  );

  return {
    noteLocation, setNoteLocation,
    noteAccidentalType, setNoteAccidentalType,
    clef, setClef,
    numberOfKeySignatureAccidentals, setNumberOfKeySignatureAccidentals,
    keySignatureAccidentalType, setKeySignatureAccidentalType,
    keySignature,
    keySignatureDisplayString,
    noteLocationName,
    clefNoteLocations,
    calculatedNote,
    calculatedNoteOctave,
    calculatedNoteAccidental,
  };
}
