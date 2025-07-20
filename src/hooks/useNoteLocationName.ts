import { useMemo } from 'react';
import noteLocationMapping from '../data/noteLocationMapping';
import type { ClefType, StaffPosition, NoteLocationName } from '../types/musicTypes';

export function useClefNoteLocations<T extends Record<StaffPosition, string> = Record<StaffPosition, string>>(clef: ClefType): T {
  return useMemo(() => {
    return noteLocationMapping[clef] as T;
  }, [clef]);
}

export function useNoteLocationName(clef: ClefType, noteLocation: StaffPosition): NoteLocationName {
  return useMemo(() => {
    return noteLocationMapping[clef][noteLocation] as NoteLocationName;
  }, [clef, noteLocation]);
}
