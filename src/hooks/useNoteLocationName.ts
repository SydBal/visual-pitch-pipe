import { useMemo } from 'react';
import NoteLocationMapping from '../musicData/noteLocationMapping';
import type { ClefType, StaffPosition } from '../types/musicTypes';

export function useNoteLocationName(clef: ClefType, noteLocation: StaffPosition) {
  return useMemo(() => {
    return NoteLocationMapping[clef][noteLocation];
  }, [clef, noteLocation]);
}
