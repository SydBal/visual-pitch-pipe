import { useState, useEffect, useRef } from 'react';
import { 
  Renderer,
  Stave,
  StaveNote, 
  Formatter, 
  Accidental,
  Beam,
} from 'vexflow';
import './App.css'

type NoteLocation = number; // an integer representing the note's position -14 -> 21
type Clef = 'treble' | 'bass' | 'alto' | 'tenor';
type NumberOfKeySignatureAccidentals = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type NoteAccidentalType = 'none' | '#' | 'b' | 'n';
type KeySignatureAccidentalType = 'sharp' | 'flat';

const NoteLocationMapping = {
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


const KeySignatureMapping = {
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

function App() {
  const [noteLocation, setNoteLocation] = useState<NoteLocation>(0);
  const [noteAccidentalType, setNoteAccidentalType] = useState<NoteAccidentalType>('none');
  const [clef, setClef] = useState<Clef>('treble');
  const [numberOfKeySignatureAccidentals, setNumberOfKeySignatureAccidentals] = useState<NumberOfKeySignatureAccidentals>(0);
  const [keySignatureAccidentalType, setKeySignatureAccidentalType] = useState<KeySignatureAccidentalType>('sharp');

  const containerRef = useRef<HTMLDivElement>(null);

  const handleNoteLocationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNoteLocation(Number(event.target.value) as NoteLocation);
  };

  const handleNoteAccidentalChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setNoteAccidentalType(event.target.value as NoteAccidentalType);
  };

  const handleClefChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setClef(event.target.value as Clef);
  };

  const handleKeySignatureNumberOfAccidentalsChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setNumberOfKeySignatureAccidentals(Number(event.target.value) as NumberOfKeySignatureAccidentals);
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

      const width = 160;

      // Configure the rendering context.
      renderer.resize(width, 200);
      const context = renderer.getContext();
      context.setFont('Arial', 10);

      // Create a stave
      // width-1 to ensure elements fit within the SVG
      const stave = new Stave(0, 40, width - 1);

      // Add a clef and time signature.
      stave.addClef(clef);

      stave.addKeySignature(KeySignatureMapping[keySignatureAccidentalType][numberOfKeySignatureAccidentals]);

      // Create a note at the specified location
      const noteName = NoteLocationMapping[clef][noteLocation];
      const note = new StaveNote({
        clef,
        keys: [noteName],
        duration: 'q',
      });
      Beam.generateBeams([note]);
      if (noteAccidentalType !== 'none') {
        note.addModifier(new Accidental(noteAccidentalType));
      }
      Formatter.FormatAndDraw(context, stave, [note]);

      stave.setContext(context).draw();
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
      </div>
      <div className='stave-container'>
        <div ref={containerRef} id='stave-visualization'></div>
      </div>
      <div className='note-controls'>
        <div className='note-controls-location'>
          <label>Note Location: </label>
          <input type='range' min='-14' max='21' step='1' onChange={handleNoteLocationChange} />
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
