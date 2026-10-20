'use strict';
// The film's palette. Names match docs/style_guide.md. Never hard-code a hex in a shot file
// unless it is a one-off tint derived from these with mix()/shade().
module.exports = {
  // night & horizon
  night0: '#10132b', night1: '#1b2350', night2: '#2a3c78', blueband: '#4f78b8',
  ember0: '#6e1a14', ember1: '#a8301c', ember2: '#d4512a', glow: '#ef8a3c', treeline: '#17121f',
  // paper
  paper: '#efe6cf', paperWarm: '#e8d8b4', paperShade: '#c7b08a', ink: '#2b2330', stampRed: '#b3362a',
  // botanical
  leafDeep: '#1d3529', leaf: '#2f5a3c', leafMid: '#4f7d4a', leafLight: '#8fae6a',
  agave: '#b8c4bd', agaveLight: '#e2e8e1', agaveShade: '#7d8c88', bloom: '#e69aa6', bloomLight: '#f4c3c6',
  stone: '#8d8a80', stoneLight: '#b9b4a6', stoneShade: '#5d5a55',
  // character
  skin: '#f0d6c0', skinShade: '#d6ab95', line: '#4b2f2b', blush: '#e8a99a',
  hair: '#2a1f24', hairLight: '#4d3c48', shirt: '#aabdc4', shirtShade: '#7d94a1',
  trousers: '#2f3659', trousersShade: '#1f2441', iris: '#5a3a2a', irisRing: '#b07a3a',
  // accent: alder green (derived from brand teal, see style guide)
  alder: '#3f9a6e', alderDeep: '#1d5a43', alderLight: '#8fd4a9',
  // brand (real aldercv.com tokens) — logo/CV chrome only
  brandTeal: '#123D45', brandTealRaise: '#1c4c55', brandAmber: '#E3912B', brandPaper: '#F1EFEA', brandInk: '#1f1c17', brandMuted: '#b2cfd2',
};
