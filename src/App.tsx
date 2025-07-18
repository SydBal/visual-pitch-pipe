import { useState, useEffect, useRef, useMemo, use } from 'react';
import { 
  Renderer,
  Stave,
  StaveNote, 
  Formatter, 
  Accidental,
  Beam,
} from 'vexflow';
import './App.css'

type NoteLocation = string; // an integer representing the note's position -14 -> 21
type Clef = 'treble' | 'bass' | 'alto' | 'tenor';
type NumberOfKeySignatureAccidentals = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7';
type NoteAccidentalType = 'none' | '#' | 'b' | 'n';
type KeySignatureAccidentalType = 'sharp' | 'flat';
type KeySignature = string; // a string representing the key signature, e.g. 'C', 'G', 'D', etc.
type NotesAccentedInKey = string; // a string representing the notes that are accented in the key signature, e.g. '', 'F', 'FC', etc.


const NoteLocationMapping: Record<Clef, Record<NoteLocation, string>> = {
  'treble': {
    '-14': 'F/2',
    '-13': 'G/2',
    '-12': 'A/2',
    '-11': 'B/2',
    '-10': 'C/3',
    '-9': 'D/3',
    '-8': 'E/3',
    '-7': 'F/3',
    '-6': 'G/3',
    '-5': 'A/3',
    '-4': 'B/3',
    '-3': 'C/4',
    '-2': 'D/4',
    '-1': 'E/4',
    '0': 'F/4',
    '1': 'G/4',
    '2': 'A/4',
    '3': 'B/4',
    '4': 'C/5',
    '5': 'D/5',
    '6': 'E/5',
    '7': 'F/5',
    '8': 'G/5',
    '9': 'A/5',
    '10': 'B/5',
    '11': 'C/6',
    '12': 'D/6',
    '13': 'E/6',
    '14': 'F/6',
    '15': 'G/6',
    '16': 'A/6',
    '17': 'B/6',
    '18': 'C/7',
    '19': 'D/7',
    '20': 'E/7',
    '21': 'F/7',
  },
  'bass': {
    '-14': 'A/0',
    '-13': 'B/0',
    '-12': 'C/1',
    '-11': 'D/1',
    '-10': 'E/1',
    '-9': 'F/1',
    '-8': 'G/1',
    '-7': 'A/1',
    '-6': 'B/1',
    '-5': 'C/2',
    '-4': 'D/2',
    '-3': 'E/2',
    '-2': 'F/2',
    '-1': 'G/2',
    '0': 'A/2',
    '1': 'B/2',
    '2': 'C/3',
    '3': 'D/3',
    '4': 'E/3',
    '5': 'F/3',
    '6': 'G/3',
    '7': 'A/3',
    '8': 'B/3',
    '9': 'C/4',
    '10': 'D/4',
    '11': 'E/4',
    '12': 'F/4',
    '13': 'G/4',
    '14': 'A/4',
    '15': 'B/4',
    '16': 'C/5',
    '17': 'D/5',
    '18': 'E/5',
    '19': 'F/5',
    '20': 'G/5',
    '21': 'A/5',
  },
  'alto': {
    '-14': 'G/1',
    '-13': 'A/1',
    '-12': 'B/1',
    '-11': 'C/2',
    '-10': 'D/2',
    '-9': 'E/2',
    '-8': 'F/2',
    '-7': 'G/2',
    '-6': 'A/2',
    '-5': 'B/2',
    '-4': 'C/3',
    '-3': 'D/3',
    '-2': 'E/3',
    '-1': 'F/3',
    '0': 'G/3',
    '1': 'A/3',
    '2': 'B/3',
    '3': 'C/4',
    '4': 'D/4',
    '5': 'E/4',
    '6': 'F/4',
    '7': 'G/4',
    '8': 'A/4',
    '9': 'B/4',
    '10': 'C/5',
    '11': 'D/5',
    '12': 'E/5',
    '13': 'F/5',
    '14': 'G/5',
    '15': 'A/5',
    '16': 'B/5',
    '17': 'C/6',
    '18': 'D/6',
    '19': 'E/6',
    '20': 'F/6',
    '21': 'G/6',
  },
  'tenor': {
    '-14': 'E/1',
    '-13': 'F/1',
    '-12': 'G/1',
    '-11': 'A/1',
    '-10': 'B/1',
    '-9': 'C/2',
    '-8': 'D/2',
    '-7': 'E/2',
    '-6': 'F/2',
    '-5': 'G/2',
    '-4': 'A/2',
    '-3': 'B/2',
    '-2': 'C/3',
    '-1': 'D/3',
    '0': 'E/3',
    '1': 'F/3',
    '2': 'G/3',
    '3': 'A/3',
    '4': 'B/3',
    '5': 'C/4',
    '6': 'D/4',
    '7': 'E/4',
    '8': 'F/4',
    '9': 'G/4',
    '10': 'A/4',
    '11': 'B/4',
    '12': 'C/5',
    '13': 'D/5',
    '14': 'E/5',
    '15': 'F/5',
    '16': 'G/5',
    '17': 'A/5',
    '18': 'B/5',
    '19': 'C/6',
    '20': 'D/6',
    '21': 'E/6',
  },
}


const KeySignatureMapping: Record<KeySignatureAccidentalType, Record<NumberOfKeySignatureAccidentals, >> = {
  sharp: {
    '0': 'C',
    '1': 'G',
    '2': 'D',
    '3': 'A',
    '4': 'E',
    '5': 'B',
    '6': 'F#',
    '7': 'C#',

  },
  flat: {
    '0': 'C',
    '1': 'F',
    '2': 'Bb',
    '3': 'Eb',
    '4': 'Ab',
    '5': 'Db',
    '6': 'Gb',
    '7': 'Cb',
  },
}

const keySignatureToAccidentalledNotes: Record<KeySignature, NotesAccentedInKey> = {
  'C': '',
  'G': 'F',
  'D': 'FC',
  'A': 'FCG',
  'E': 'FCGD',
  'B': 'FCGDA',
  'F#': 'FCGDAE',
  'C#': 'FCGDAEB',
  'F': 'B',
  'Bb': 'BE',
  'Eb': 'BEA',
  'Ab': 'BEAD',
  'Db': 'BEADG',
  'Gb': 'BEADGC',
  'Cb': 'BEADGCF',
}

const accidentalTypeToCharacterMapping: Record<NoteAccidentalType, string> = {
  'none': '',
  '#': '♯',
  'b': '♭',
  'n': '♮'
};

function App() {
  const [noteLocation, setNoteLocation] = useState<NoteLocation>('0');
  const [noteAccidentalType, setNoteAccidentalType] = useState<NoteAccidentalType>('none');
  const [clef, setClef] = useState<Clef>('treble');
  const [numberOfKeySignatureAccidentals, setNumberOfKeySignatureAccidentals] = useState<NumberOfKeySignatureAccidentals>(0);
  const [keySignatureAccidentalType, setKeySignatureAccidentalType] = useState<KeySignatureAccidentalType>('sharp');

  const keySignature = useMemo(() => {
    return KeySignatureMapping[keySignatureAccidentalType][numberOfKeySignatureAccidentals];
  }, [keySignatureAccidentalType, numberOfKeySignatureAccidentals]);

  const keySignatureDisplayString = useMemo(() => {
    let displayString = keySignature;
    Object.entries(accidentalTypeToCharacterMapping).forEach(([accidentalKey, accidentalCharacter]) => {
      displayString = displayString.replace(accidentalKey, accidentalCharacter);
    });
    return displayString;
  }, [keySignature]);

  const noteLocationName = useMemo(() => {
    return NoteLocationMapping[clef][noteLocation];
  }, [clef, noteLocation]);

  const {
    note: calculatedNote,
    octave: calculatedNoteOctave,
    accidental: calculatedNoteAccidental
  } = useMemo(() => {
    // Split the note location to get the note and octave
    const noteOctaveTuple = noteLocationName.split('/')

    // Calculate the accidental
    let noteAccidental;
    if (noteAccidentalType === 'n') {
      noteAccidental = '';
    } else if (noteAccidentalType === 'none' && keySignatureToAccidentalledNotes[keySignature].includes(noteOctaveTuple[0])) {
      noteAccidental = accidentalTypeToCharacterMapping[keySignatureAccidentalType === 'sharp' ? '#' : 'b'];
    } else {
      noteAccidental = accidentalTypeToCharacterMapping[noteAccidentalType];
    }
    


    return {
      note: noteOctaveTuple[0],
      octave: noteOctaveTuple[1],
      accidental: noteAccidental,
    }
  }, [clef, noteLocation, noteAccidentalType]);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleNoteLocationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNoteLocation(event.target.value as NoteLocation);
  };

  const handleNoteAccidentalChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setNoteAccidentalType(event.target.value as NoteAccidentalType);
  };

  const handleClefChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setClef(event.target.value as Clef);
  };

  const handleKeySignatureNumberOfAccidentalsChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setNumberOfKeySignatureAccidentals(event.target.value as NumberOfKeySignatureAccidentals);
  };

  const handleKeySignatureAccientalTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setKeySignatureAccidentalType(event.target.value as KeySignatureAccidentalType);
  };

  useEffect(() => {
    if (containerRef.current) {
      // Clear the container of any previous content
      containerRef.current.innerHTML = '';

      // Create an SVG renderer and attach it
      const renderer = new Renderer(containerRef.current.id, Renderer.Backends.SVG);

      // Configure the rendering context.
      // initial width is set to 1 to allow dynamic resizing
      renderer.resize(1, 200);
      const context = renderer.getContext();

      // Create a stave
      // initial width is set to 0 to allow dynamic resizing
      const staveOptions = {
        leftBar: true,
        rightBar: true,
      }
      const stave = new Stave(0, 40, 0, staveOptions);

      // Add a clef and time signature.
      stave.addClef(clef);

      stave.addKeySignature(keySignature);

      // Create a note at the specified location
      const note = new StaveNote({
        clef,
        keys: [noteLocationName],
        duration: 'q',
      });

      // Add the accidental to the note if it is not 'none'
      if (noteAccidentalType !== 'none') {
        note.addModifier(new Accidental(noteAccidentalType));
      }

      // Format the beam for the note
      Beam.generateBeams([note]);

      // First draw the zero width stave with the note
      Formatter.FormatAndDraw(context, stave, [note]);
      stave.setContext(context).draw();

      // Get the location of the note's right 
      const noteRightEdgeX = note.getAbsoluteX() - note.getX() + note.getWidth();

      // Resize the stave and canvas to fit the note loaction
      const notePadding = 12;
      stave.setWidth(noteRightEdgeX + notePadding);

      // Clear the container of any previous content and redraw and render
      context.clear();
      Formatter.FormatAndDraw(context, stave, [note]);
      stave.setContext(context).draw();
      // + 1 padding to avoid any overflow rendering issues
      renderer.resize(noteRightEdgeX + notePadding + 1, 200);
    }
  }, [
    clef,
    noteLocation,
    noteAccidentalType,
    numberOfKeySignatureAccidentals,
    keySignatureAccidentalType
  ]);

  return (
    <>
      <h1>Visual Pitch Pipe</h1>
      <div className='clef-controls'>
        <label>Cleft: </label>
        <select defaultValue='treble' onChange={handleClefChange}>
          <option value='treble'>Treble</option>
          <option value='bass'>Bass</option>
          <option value='alto'>Alto</option>
          <option value='tenor'>Tenor</option>
        </select>
      </div>
      <div className="key-signature-controls">
        <div className='key-signature-controls-accidental-type'>
          <label>Key Signature Accidental Type: </label>
          <select defaultValue='sharp' onChange={handleKeySignatureAccientalTypeChange}>
            <option value='sharp'>Sharp</option>
            <option value='flat'>Flat</option>
          </select>
        </div>
        <div className='key-signature-controls-number-of-accidentals'>
          <label>Key Signature Number of Accidentals: </label>
          <select defaultValue='0' onChange={handleKeySignatureNumberOfAccidentalsChange}>
            <option value='0'>0</option>
            <option value='1'>1</option>
            <option value='2'>2</option>
            <option value='3'>3</option>
            <option value='4'>4</option>
            <option value='5'>5</option>
            <option value='6'>6</option>
            <option value='7'>7</option>
          </select>
        </div>
        Key: {keySignatureDisplayString}
      </div>
      <div className='stave-container'>
        <div ref={containerRef} id='stave-visualization'></div>
      </div>
      <div className='note-name'>
        Note Name: {calculatedNote}{calculatedNoteAccidental}<sub>{calculatedNoteOctave}</sub>
      </div>
      <div className='note-controls'>
        <div className='note-controls-location'>
          <label>Note Location: </label>
          {/* 
            The range is set from -14 to 20 to match the NoteLocationMapping keys.
            Adjusted the max value to 20 to match the highest note in the mapping to prevent overflow.
          */}
          <input type='range' min='-14' max='20' step='1' value={noteLocation} onChange={handleNoteLocationChange} />
        </div>
        <div className='note-controls-accidental'>
          <label>Note Accidental: </label>
          <select defaultValue='none' onChange={handleNoteAccidentalChange}>
            <option value='none'>None</option>
            <option value='#'>Sharp</option>
            <option value='b'>Flat</option>
            <option value='n'>Natural</option>
          </select>
        </div>

      </div>
      <div className='play-pitch'>
        <button>Play Pitch</button>
      </div>
    </>
  )
}

export default App
