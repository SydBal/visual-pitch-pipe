import { useMemo } from 'react';
import NoteLocationMapping from '../musicData/noteLocationMapping';
import type { ClefType, StaffPosition, NoteLocationName } from '../types/musicTypes';

export function useNoteLocationName(clef: ClefType, noteLocation: StaffPosition): NoteLocationName {
  return useMemo(() => {
    return NoteLocationMapping[clef][noteLocation] as NoteLocationName;
  }, [clef, noteLocation]);
}
