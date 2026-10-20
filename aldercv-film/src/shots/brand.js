'use strict';
// PLACEHOLDER — replaced by the brand chapter. See docs/ANIMATION_GUIDE.md.
const C = require('../lib/core');
const { camera, ui } = require('../lib/stage');
const { drawSky } = require('../lib/sky');
const { createRiver } = require('../lib/river');
function draw(id) {
  return (ctx, env, t) => {
    camera(ctx, env, { cx: 960, cy: 540, zoom: 1 });
    drawSky(ctx, env, { horizonY: 470, warmth: 1, t, starAmount: 0.5 });
    const river = createRiver(env, {});
    river.drawWater(ctx, { phase: t * 1.2, t });
    river.drawPages(ctx, { phase: t * 1.2, t });
    ui(ctx, env);
    C.text(ctx, id + ' placeholder', 60, 120, { font: C.FONT.sansSemi(56), color: '#efe6cf' });
  };
}
module.exports = { S6: { draw: draw('S6') }, S7: { draw: draw('S7') }, };
