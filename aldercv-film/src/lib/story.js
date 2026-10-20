'use strict';
// The words of the film, shared by every chapter so the page she writes (S5), the page that
// lifts (S6a), the aldercv.com CV (S6b) and the tagline (S7) always agree.

module.exports = {
  name: 'Mira Aydın',
  // S3: the old, generic résumé that slides off like wet ink
  oldResume: {
    name: 'MIRA AYDIN',
    lines: [
      'Objective: hard-working team player',
      'seeking an entry-level position in a',
      'fast-paced, dynamic environment.',
      '• Proficient in Microsoft Office',
      '• Excellent communication skills',
      '• Detail-oriented self-starter',
      '• References available on request',
    ],
  },
  // S5: lines that grow on the blank sheet, with the time each starts and its leaf sprouts
  pageLines: [
    { text: 'Mira Aydın', style: 'name', start: 0.8, leaf: 1.5 },          // seconds into S5 (S5 starts at 16.0 s)
    { text: 'I draw systems people can read.', style: 'italic', start: 2.3, leaf: 2.9 },
    { text: 'Illustration · Type · Figma', style: 'body', start: 3.5, leaf: 4.0 },
    { text: "Rebuilt my town library's signs, 2025.", style: 'body', start: 4.5, leaf: 5.1 },
  ],
  // S6b: the aldercv.com CV (one clean page)
  cv: {
    name: 'Mira Aydın',
    title: 'Visual Designer',
    summary: 'I draw systems people can read.',
    sections: [
      { h: 'Skills', items: ['Illustration', 'Typography', 'Figma', 'Wayfinding'] },
      { h: 'Experience', items: ['Library signage redesign — my town library, 2025', 'Freelance illustration — 12 book covers'] },
      { h: 'Education', items: ['BA Visual Communication, 2026'] },
    ],
  },
  url: 'aldercv.com',
  tagline: 'Your story, one page.',
};
