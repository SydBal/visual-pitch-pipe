export type StaffPosition = string; // e.g. '-14' to '21', representing staff positions
export type ClefType = 'treble' | 'bass' | 'alto' | 'tenor';
export type KeySignatureAccidentalCount = `${0|1|2|3|4|5|6|7}`;
export type NoteAccidental = 'none' | '#' | 'b' | 'n';
export type KeySignatureAccidental = 'sharp' | 'flat';
export type KeySignatureName = string; // e.g. 'C', 'G', 'D', etc.
export type NoteLocationName = `${string}/${number}`; // e.g. 'C/4', 'F/3', etc.
export type KeySignatureAccentedNotes = string; // e.g. '', 'F', 'FC', etc.
