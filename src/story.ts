export type Speaker = 'Nell' | 'Mae' | 'me';

export interface Line {
  who: Speaker;
  text: string;
  note?: string;
}

export interface Note {
  beat: number;
  pitch: string;
  dur: number;
  fx?: 'scoop' | 'fall';
}

export type Feel = 'swing' | 'ballad' | 'fast' | 'modal';

export interface Exchange {
  call: Note[];
  callBars?: number;
  line?: Line;
  hint?: string;
  answerHint?: string;
}

export interface Song {
  id: 'friday' | 'harbor' | 'alley' | 'lastset';
  title: string;
  year: string;
  bpm: number;
  swing: number;
  feel: Feel;
  keys: string[];
  home: number[];
  form: string[];
  introBars: number;
  introHint?: string;
  exchanges: Exchange[];
  space: [number, number];
  ending: 'player' | 'nell' | 'stop' | 'head';
  tag?: Note[];
  finalChord: string;
  head?: { chords: string[]; melody: Note[] };
  goodbye?: Note[];
  after: string[];
}

export interface Inspect {
  label: string;
  lines: string[];
  image?: string;
  paper?: string;
}

const n = (spec: string): Note[] =>
  spec.trim().split(/\s+/).map((token) => {
    const [pitch, rest] = token.split('@');
    const [beat, durFx] = rest.split('/');
    const fx = durFx.endsWith('~') ? 'fall' : durFx.endsWith('^') ? 'scoop' : undefined;
    return { pitch, beat: Number(beat), dur: Number(durFx.replace(/[~^]$/, '')), fx };
  });

export const prologue = {
  dateline: 'The Nightjar. November 1986.',
  lines: [
    'The Nightjar closed tonight after forty-one years. On Monday the builders start taking it apart.',
    'The party ended at two. Mae gave me her keys and asked me to lock up when I was ready.',
    "That was an hour ago. I haven't locked up yet.",
  ],
};

export const songs: Song[] = [
  {
    id: 'friday',
    title: 'Friday Blues',
    year: '1952',
    bpm: 116,
    swing: 0.64,
    feel: 'swing',
    keys: ['F4', 'G4', 'Ab4', 'A4', 'C5', 'D5', 'Eb5', 'F5'],
    home: [0, 7],
    form: ['F7', 'Bb7', 'F7', 'F7', 'Bb7', 'Bb7', 'F7', 'D7', 'Gm7', 'C7', 'F7', 'C7'],
    introBars: 4,
    introHint: 'Nell plays first. Listen to her phrase.',
    space: [3, 8],
    exchanges: [
      {
        call: n('C5@0/.5 A4@.5/.5 C5@1/1 A4@2.5/.5 F4@3/2.5'),
        answerHint: 'Your turn. Answer her with the keys A S D F G H J K.',
        line: { who: 'Nell', text: "Don't watch your hands, kid. Watch me." },
      },
      {
        call: n('F4@0/.5 Ab4@.5/.5 A4@1/.5 C5@1.5/1.5 Eb5@3.5/.5 D5@4/1 C5@5/1.5'),
        hint: 'Copying her rhythm is a good answer. So is ending on a marked key.',
        line: { who: 'Nell', text: "I play a little, then you play a little back. That's all it is." },
      },
      {
        call: n('F5@.5/.5 Eb5@1/.5 D5@1.5/.5 C5@2/1 A4@3/.5 C5@3.5/1.5'),
        hint: 'Play on the beat, and leave some space.',
        line: { who: 'Mae', text: 'Nell Avery, that child has school in the morning.' },
      },
      {
        call: n('C5@0/1.5 Ab4@1.5/.5 A4@2/.5 F4@2.5/1 G4@4/.5 A4@4.5/.5 C5@5/1'),
        line: { who: 'Nell', text: "You don't have to fill every beat. Leave some room." },
      },
      {
        call: n('D5@0/.5 F5@.5/.5 D5@1/.5 C5@1.5/.5 A4@2/1 Ab4@3.5/.5 G4@4/.5 F4@4.5/1.5'),
        line: { who: 'Nell', text: "There. That's it. Now do it again." },
      },
      {
        call: n('F5@0/1 Eb5@1/.5 C5@1.5/.5 A4@2/.5 C5@2.5/2.5'),
        answerHint: 'Take the last note. End on a marked key.',
        line: { who: 'Nell', text: 'Take us home, kid. The last note is yours tonight.' },
      },
    ],
    ending: 'player',
    finalChord: 'F9',
    after: [
      'That was the only time Nell let me play the last note. After that night she always took it herself.',
      'Everyone who played with her knew about it. You could trade phrases with Nell all night, but the tune ended when she said so.',
    ],
  },
  {
    id: 'harbor',
    title: 'Harbor Lights',
    year: '1958',
    bpm: 64,
    swing: 0.667,
    feel: 'ballad',
    keys: ['Db4', 'Eb4', 'F4', 'Ab4', 'Bb4', 'Db5', 'Eb5', 'F5'],
    home: [0, 5],
    form: ['Dbmaj9', 'Bbm9', 'Ebm9', 'Ab13', 'Fm7', 'Bbm9', 'Ebm9', 'Ab13'],
    introBars: 2,
    introHint: 'This one is a ballad. Play fewer notes and hold them longer.',
    space: [2, 6],
    exchanges: [
      {
        call: n('F4@0/1.5^ Ab4@1.5/.5 Bb4@2/2 Ab4@4.5/.5 F4@5/2'),
        line: { who: 'Mae', text: "Tape's rolling. Take four, whenever you're ready." },
      },
      {
        call: n('Db5@.5/1.5 Bb4@2/.5 Ab4@2.5/1.5 F4@4/1 Eb4@5/2.5'),
        line: { who: 'Nell', text: 'Slower. Let it breathe.' },
      },
      {
        call: n('Ab4@0/.67 Bb4@.67/.66 Db5@1.33/.67 Eb5@2/2 Db5@4/1 Bb4@5/2'),
        line: { who: 'Nell', text: 'You keep filling every gap. Give me some space to answer.' },
      },
      {
        call: n('F5@0/2^ Eb5@2/.5 Db5@2.5/.5 Bb4@3/1 Ab4@4/3'),
        line: { who: 'me', text: 'You never leave me any space.' },
      },
      {
        call: n('Db5@0/1 Bb4@1/1 Ab4@2/1 F4@3/.5 Eb4@3.5/.5 Db4@4/3'),
        line: { who: 'Nell', text: "That's the take. I could feel it. Couldn't you?" },
      },
    ],
    ending: 'nell',
    tag: n('Ab4@0/1 F4@1/1 Db4@2/6~'),
    finalChord: 'Dbmaj9',
    after: [
      'We sold about four hundred copies. Mae bought twenty of them and gave them away at the bar.',
      'I still think it was the best we ever played together. I never told Nell that.',
    ],
  },
  {
    id: 'alley',
    title: 'The Alley',
    year: '1961',
    bpm: 150,
    swing: 0.6,
    feel: 'fast',
    keys: ['C4', 'Eb4', 'F4', 'F#4', 'G4', 'Bb4', 'C5', 'Eb5'],
    home: [0, 6],
    form: ['Cm7', 'Cm7', 'Cm7', 'Cm7', 'Fm7', 'Fm7', 'Cm7', 'Cm7', 'Ab7', 'G7alt', 'Cm7', 'G7alt'],
    introBars: 4,
    introHint: 'Faster now. Keep up with her.',
    space: [4, 10],
    exchanges: [
      {
        call: n('G4@0/.5 Bb4@.5/.5 C5@1/.5 Eb5@1.5/1 C5@3/.5 Bb4@3.5/.5 G4@4/1.5'),
        line: { who: 'Nell', text: "It's a year in Paris, kid. They asked for me by name." },
      },
      {
        call: n('C5@0/.5 Eb5@.5/.5 F5@1/.5 F#5@1.5/.5 G5@2/1 F5@3.5/.5 Eb5@4/.5 C5@4.5/1'),
        line: { who: 'me', text: 'We start the trio in January. You promised.' },
      },
      {
        call: n('G5@.5/.5 F5@1/.5 Eb5@1.5/.5 C5@2/.5 Bb4@2.5/.5 G4@3/.5 F#4@3.5/.5 F4@4/.5 Eb4@4.5/1.5'),
        line: { who: 'Nell', text: 'Come with me. They have pianos in Paris.' },
      },
      {
        callBars: 3,
        call: n('C5@0/.5 D5@.5/.5 Eb5@1/.5 F5@1.5/.5 G5@2/1 Bb5@3/.5 G5@3.5/.5 F5@4/.5 Eb5@4.5/.5 C5@5/.5 Bb4@5.5/.5 G4@6/1 Bb4@7.5/.5 C5@8/.5 Eb5@8.5/.5 G5@9/1.5'),
        hint: "She's cutting into your turn. Answer in the space that's left.",
        line: { who: 'me', text: 'Someone has to stay. Mae has nobody else.' },
      },
      {
        callBars: 3,
        call: n('G5@0/.5 Bb5@.5/1 G5@1.5/.5 F5@2/.5 Eb5@2.5/.5 C5@3/1 Eb5@4/.5 F5@4.5/.5 F#5@5/.5 G5@5.5/1 Bb5@7/.5 C6@7.5/1.5~ G5@9.5/.5 Eb5@10/1'),
        line: { who: 'Nell', text: "That isn't why you're staying, and you know it." },
      },
      {
        callBars: 4,
        call: n('C6@0/2 Bb5@2/.5 G5@2.5/.5 F5@3/.5 Eb5@3.5/.5 C5@4/1 Eb5@5/.5 G5@5.5/.5 Bb5@6/.5 C6@6.5/1.5 Bb5@8.5/.5 G5@9/.5 F5@9.5/.5 Eb5@10/.5 C5@10.5/.5 Bb4@11/.5 G4@11.5/1 C5@13/.5 Eb5@13.5/.5 G5@14/2'),
        line: { who: 'me', text: 'Go on, then. You always take the last word anyway.' },
      },
    ],
    ending: 'stop',
    tag: n('G5@0/.5 Eb5@.5/.5 C5@1/3~'),
    finalChord: 'Cm9',
    after: [
      "She left for Paris four days later. I didn't go to the station.",
      'She sent me a postcard every Christmas for twenty-four years. I never wrote back once. I kept every one of them.',
    ],
  },
  {
    id: 'lastset',
    title: 'Last Set',
    year: '1986',
    bpm: 100,
    swing: 0.6,
    feel: 'modal',
    keys: ['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'],
    home: [0, 7],
    form: ['Dm9', 'Dm9', 'G13', 'G13'],
    introBars: 4,
    introHint: 'Each good answer brings back one of her postcards.',
    space: [3, 8],
    exchanges: [
      {
        call: n('D5@0/1 C5@1/.5 A4@1.5/1 G4@3/.5 A4@3.5/2'),
        line: { who: 'Nell', note: 'Paris, Christmas 1962', text: 'The club here is smaller than the Nightjar. Nobody sits in with me the way you did.' },
      },
      {
        call: n('F4@0/.5 A4@.5/.5 C5@1/.5 E5@1.5/1.5 D5@3.5/.5 C5@4/1 A4@5/1.5'),
        line: { who: 'Nell', note: 'Christmas 1968', text: "I still end every tune the same way. You'd laugh at me." },
      },
      {
        call: n('E5@.5/.5 F5@1/1 E5@2/.5 D5@2.5/.5 C5@3/1 B4@4/.5 A4@4.5/1.5'),
        line: { who: 'Nell', note: 'Christmas 1979', text: "A friend played me your trio record. You've gotten good, kid. You always were." },
      },
      {
        call: n('A5@0/2^ G5@2/.5 F5@2.5/.5 E5@3/1 D5@4/.5 C5@4.5/.5 A4@5/2'),
        line: { who: 'Nell', note: 'Christmas 1985', text: "I'm writing you a tune. I can't find the end of it." },
      },
    ],
    ending: 'head',
    head: {
      chords: ['Dm9', 'Gm9', 'Ebmaj9', 'Dm9', 'Bbmaj9', 'A7alt', 'Dm9', 'Dm9'],
      melody: n(
        'A4@0/1.5 C5@1.5/.5 D5@2/1 E5@3/1 F5@4/2 E5@6/.5 D5@6.5/1.5 Bb4@8/1.5 D5@9.5/.5 G5@10/2 E5@12/1 F5@13/.5 A5@13.5/2.5 ' +
          'D5@16/1.5 F5@17.5/.5 A5@18/1 G5@19/1 F5@20/1 C#5@21/1 Bb4@22/.5 A4@22.5/1.5 C5@24/1 A4@25/1 E5@26/2',
      ),
    },
    goodbye: n('A4@0/1 D5@1/1 F5@2/1.5 E5@3.5/.5 D5@4/6'),
    finalChord: 'Dm9',
    after: [],
  },
];

export const lastSet = {
  headHint: 'Nell plays her tune. The eighth bar is yours.',
  endingHint: 'Play the ending.',
  herEnding: 'I ended it the way she ended every tune.',
  answered: [
    'I answered her. It was the first thing I had said to her in twenty-five years.',
    'We traded phrases until the windows turned gray. Then I played the last note, and she let me have it.',
  ],
  letRing: [
    "I didn't answer. I let her note ring until the room was quiet.",
    'Nell always wanted the last note. This time I wanted her to have it.',
  ],
  dawn: "It's getting light outside.",
  leave: [
    "I turn off the stage light and lock the back door. Then I put Mae's keys through her mailbox and walk home with the tune inside my coat.",
    'The rain has stopped.',
  ],
};

export const inspects: Record<string, Inspect> = {
  note: {
    label: "Mae's note",
    paper: "Keys go through the mailbox when you leave. Take as long as you like.\n\nThe piano is tuned. I had it done on Tuesday, just in case.\n\nM.",
    lines: [
      'Mae has been trying to get me to play in this room for twenty-five years.',
      'Her photographs are still on the wall. The movers come for them tomorrow.',
    ],
  },
  photo: {
    label: 'Photograph',
    image: 'art/band-1952.jpg',
    lines: [
      "This is Mae's house band in the summer of 1952. Nell is the one at the front with the trumpet. She was nineteen.",
      "I was fourteen, and I'm not in the picture. I was sitting on the stairs, where Mae couldn't see me.",
      'That summer Nell let me sit in with the band for the first time. Before she counted in the tune, she leaned over the piano and told me to listen first.',
    ],
  },
  record: {
    label: 'Record',
    image: 'art/sleeve-harbor-lights.jpg',
    lines: [
      'Harbor Lights, by the Nell Avery Quintet. We recorded it here in 1958, after closing, on a borrowed tape machine.',
      "It's the only record she ever made. Mae kept a copy behind the bar for twenty-eight years and played it on slow nights.",
      "The piano on it is me.",
    ],
  },
  door: {
    label: 'Back door',
    lines: [
      'The back door opens onto the alley. The rain is coming down hard out there.',
      'In October 1961 Nell and I stood out there between sets. She told me she had been offered a year at a club in Paris.',
      'I said things that night that I never took back.',
    ],
  },
  envelope: {
    label: 'Envelope',
    image: 'art/lead-sheet.jpg',
    lines: [
      "This came from Paris in June. Nell's neighbor found it in her flat, already addressed to me. I brought it tonight, and I still haven't opened it.",
      "Inside is a tune in her handwriting, called Last Set. There are seven bars of melody. The eighth bar is empty.",
      'At the bottom she wrote, "It needs an ending. You were always better at those."',
    ],
  },
  tables: {
    label: 'Tables',
    lines: ['Mae put the chairs up herself at two o\'clock. She said it was the last time, so she wanted to do it properly.'],
  },
  drums: {
    label: 'Drums',
    lines: ['The house drummer left his kit for the movers. He said he would come back for it in the morning.'],
  },
  bass: {
    label: 'Bass',
    lines: ['The house bass has leaned against that wall for as long as I can remember. Mae is giving it to a school.'],
  },
  window: {
    label: 'Window',
    lines: ["The windows are at street level. All night I've watched shoes go past in the rain."],
  },
  sign: {
    label: 'Neon sign',
    lines: ['Mae had the sign made in 1945. It has buzzed the whole time.'],
  },
  poster: {
    label: 'Poster',
    image: 'art/poster-nightjar.jpg',
    lines: ['Mae printed a new poster every year. This one is from 1953. Nell made her put the name in bigger letters.'],
  },
  stairs: {
    label: 'Stairs',
    lines: ["The stairs go up to the street. I'm not ready to leave yet."],
  },
};

// Touch screens get their own wording for the two hints that name the controls.
export const touchText: Record<string, string> = {
  'Click things in the room to look at them.': 'Tap things in the room to look at them.',
  'Your turn. Answer her with the keys A S D F G H J K.': 'Your turn. Tap the keys to answer her.',
};

export const hubHints = {
  first: 'Click things in the room to look at them.',
  piano: 'Sit at the piano',
  leave: 'Lock up and leave',
};

export const credits = {
  title: 'Last Set',
  thanks: 'Thank you for playing.',
};
