/* Cooking Lab · minigame specs
   Single source of truth for every station minigame's settings, shared by the games (minigames/*.html)
   and the GDD station window (index.html):
   - tweak schema + defaults + storage key
   - describe(T): how the game plays, written from the current values

   MG_SPECS.schema(id)   gameplay settings (random orders + time + game tweaks)
   MG_SPECS.defaults(id) default values (incl. shake/sound)
   MG_SPECS.load(id) / save(id,T)
   MG_SPECS.describe(id,T) -> {pitch, play:[html], score:html}
   Sync: games and the GDD exchange {type:'mg-tweaks', id, T} with postMessage, and listen to 'storage'. */
"use strict";
(function(){
const s1=v=>v===1?'':'s',x=v=>'×'+(+v).toFixed(1),sec=v=>(+v%1?(+v).toFixed(1):v)+' s';
function timeLine(T,unit,example){return T.timePer?`You get <b>${sec(T.timePer)} per ${unit}</b> (e.g. ${example} ${unit}s = ${sec(+(T.timePer*example).toFixed(1))}).`:'There is <b>no time limit</b>.'}
const randLine=(T,what)=>T.random?`Each round rolls a <b>random order</b> (${what}). Retry replays the same order.`:`<b>Fixed orders</b>: the same ${what} every time, so you can practise it.`;

const S={
 board:{name:'Cutting board',file:'minigames/cutting-board.html',key:'cb4.tweaks',full:true,
  defaults:{cutMode:'line',random:true,timePer:4,buffer:10,extra:11,volume:true,hint:true,preview:'weights',undo:false,autoFinish:true,push:7,strict:2},
  tweaks:[
   {k:'cutMode',l:'Cut mode',t:'select',o:[['stroke','Stroke: knife follows the mouse freehand'],['line','Line: straight cut from press to release']]},
   {k:'random',l:'Random orders',t:'bool',h:'Each round rolls the portion count, the ingredient weight (±15%) and the buffer (5–25%). Retry keeps the same order.'},
   {k:'timePer',l:'Time per portion',t:'range',min:0,max:15,step:.5,f:v=>v?v+' s':'no limit',h:'Round time = this × number of portions.'},
   {k:'buffer',l:'Weight buffer',t:'range',min:0,max:30,step:5,f:v=>v+' %',h:'Target = (total − buffer) ÷ portions, rounded down.'},
   {k:'extra',l:'Extra pieces allowed',t:'range',min:0,max:11,step:1,f:v=>v>=11?'unlimited':'+'+v,h:'Pieces you may cut beyond the portions. The best N pieces are served, the rest is trim.'},
   {k:'volume',l:'3D volume weighting',t:'bool',h:'Thick parts weigh more than thin edges. Off = weight follows area.'},
   {k:'hint',l:'Colour bubbles near target',t:'bool',h:'Green within 5%, amber within 15%.'},
   {k:'preview',l:'Cut preview while drawing',t:'select',o:[['off','Off'],['line','Stroke turns green if it will cut'],['weights','Stroke + predicted weights']]},
   {k:'undo',l:'Allow undo',t:'bool'},
   {k:'autoFinish',l:'Auto-finish at max pieces',t:'bool'},
   {k:'push',l:'Piece separation',t:'range',min:0,max:20,step:1,f:v=>v+' px'},
   {k:'strict',l:'Score strictness',t:'range',min:1,max:4,step:.5,f:v=>'×'+v,h:'Score = 100 − avg error % × strictness'}],
  describe:T=>({pitch:'Cut one ingredient into portions that each match a target weight. Every piece shows its weight in a bubble.',
   play:[T.cutMode==='line'?'<b>Press and release</b> to make a <b>straight cut</b> between the two points.':'<b>Hold the button and draw</b> the knife path <b>freehand</b>; curves and loops work.',
    'A cut only counts if it goes <b>all the way through</b> a piece.',
    `Target = (total − <b>${T.buffer}% buffer</b>) ÷ portions, rounded down${T.buffer?`, so there is always spare weight to trim off`:', so the portions use the whole ingredient'}.`,
    T.extra>=11?'You can cut <b>as many extra pieces</b> as you like, e.g. to trim an oversized piece down to the target.':T.extra?`You can cut <b>${T.extra} extra piece${s1(T.extra)}</b> beyond the portions; a cut that would go over keeps only its most precise split.`:'You can\'t cut <b>any extra piece</b>: the portions must come out exactly.',
    T.volume?'Weight follows <b>volume</b>: thick middles weigh more than thin ends (carrot tip, melon rim).':'Weight follows <b>surface area</b> only.',
    {off:'There is <b>no preview</b> while you cut.',line:'While cutting, the knife turns <b>green when the cut will go through</b>.',weights:'While cutting, you see the <b>predicted weights</b> of the resulting pieces.'}[T.preview]+(T.hint?' Bubbles turn <b>green within 5%</b> of the target, amber within 15%.':''),
    timeLine(T,'portion',6)+(T.autoFinish&&T.extra<11?' The round ends as soon as you reach the piece limit.':''),
    randLine(T,'ingredient weight, portion count and buffer')+(T.undo?' <b>Undo</b> (Z) is allowed.':'')],
   score:`The ${'N'} pieces closest to the target are served, the rest is trim. Score = 100 − average error % × <b>${T.strict}</b> (5% average error → ${Math.max(0,100-5*T.strict)}).`})},

 scale:{name:'Precision scale',file:'minigames/scale.html',time:{def:7,label:'Time per dose'},
  defaults:{tol:.2,lag:1,accel:1.2,autoTare:false,maxDoses:4},
  tweaks:[
   {k:'tol',l:'Perfect tolerance',t:'range',min:.05,max:1,step:.05,f:v=>'±'+v.toFixed(2)+' g',h:'Within this a dose is perfect; 10× this error scores 0.'},
   {k:'lag',l:'Display lag',t:'range',min:0,max:2,step:.1,f:x,h:'Multiplies how slowly the readout catches up.'},
   {k:'accel',l:'Pour ramp-up time',t:'range',min:.2,max:3,step:.1,f:v=>v.toFixed(1)+' s',h:'Time for a held pour to reach full flow.'},
   {k:'maxDoses',l:'Max doses per order',t:'range',min:1,max:5,step:1,f:v=>v},
   {k:'autoTare',l:'Auto-tare after each dose',t:'bool'}],
  describe:T=>({pitch:'Dose target weights of an ingredient into one beaker. Overshoot can\'t be undone.',
   play:[`An order has <b>1 to ${T.maxDoses} dose${s1(T.maxDoses)}</b>, poured one after the other into the same beaker.`,
    `<b>Click</b> to add one drip; <b>hold</b> to pour. A held pour reaches full flow after <b>${(+T.accel).toFixed(1)} s</b>.`,
    'Material is still falling when you let go, so <b>stop early</b>.',
    T.lag>0?`The display catches up with a lag (<b>${x(T.lag)}</b>): wait for it to settle before you decide.`:'The display is <b>instant</b> (no lag).',
    T.autoTare?'The scale <b>tares itself</b> after each dose.':'<b>Right-click to tare</b> between doses, or add up the weights in your head.',
    'Press <b>Space</b> (or LOCK DOSE) to lock a dose and move to the next one.',
    timeLine(T,'dose',3),randLine(T,'dose count and target weights')],
   score:`A dose within <b>±${(+T.tol).toFixed(2)} g</b> is perfect; an error of ±${(T.tol*10).toFixed(1)} g or more scores 0. The score is the average over the doses.`})},

 centrifuge:{name:'Centrifuge whisk',file:'minigames/centrifuge.html',time:{def:6,label:'Time per phase'},
  defaults:{band:12,inertia:1,phases:3,stopWin:.8},
  tweaks:[
   {k:'band',l:'Band width',t:'range',min:4,max:30,step:1,f:v=>'±'+v+' %'},
   {k:'inertia',l:'Drum inertia',t:'range',min:.2,max:3,step:.1,f:x,h:'Higher = the drum reacts more slowly to your circling.'},
   {k:'phases',l:'Max phases per order',t:'range',min:1,max:5,step:1,f:v=>v},
   {k:'stopWin',l:'Release window',t:'range',min:.3,max:2,step:.1,f:v=>(+v).toFixed(1)+' s'}],
  describe:T=>({pitch:'Spin the drum by circling the mouse and hold a target speed.',
   play:['<b>Hold the button and circle</b> around the drum: the faster you circle, the faster it spins.',
    `The drum has inertia (<b>${x(T.inertia)}</b>): ${T.inertia>1.4?'it reacts slowly, so anticipate':T.inertia<.6?'it reacts almost instantly':'it follows you with a short delay'}.`,
    `Keep the needle inside the green band (<b>±${T.band}%</b> of the target rpm) until the phase bar fills (2–5 s per phase).`,
    `An order has <b>1 to ${T.phases} phase${s1(T.phases)}</b>, each at a different speed.`,
    `After the last phase the drum <b>beeps</b>: let go within <b>${(+T.stopWin).toFixed(1)} s</b>.`,
    timeLine(T,'phase',3),randLine(T,'phase speeds and durations')],
   score:'80%: share of the time spent inside the band during each phase. 20%: how fast you let go after the beep.'})},

 cryo:{name:'Cryo chamber',file:'minigames/cryo.html',time:{def:9,label:'Time per item'},
  defaults:{speed:1,crack:1,shatter:true,maxItems:3},
  tweaks:[
   {k:'speed',l:'Freeze speed',t:'range',min:.3,max:3,step:.1,f:x},
   {k:'crack',l:'Crack sensitivity',t:'range',min:0,max:3,step:.1,f:v=>v?x(v):'off',h:'How fast the crack meter fills when the core is colder than the window.'},
   {k:'shatter',l:'Shatter beat (shatter items)',t:'bool'},
   {k:'maxItems',l:'Max items per order',t:'range',min:1,max:4,step:1,f:v=>v}],
  describe:T=>({pitch:'Flash-freeze ingredients in liquid nitrogen until their core hits a temperature window.',
   play:[`An order has <b>1 to ${T.maxItems} item${s1(T.maxItems)}</b>, frozen one at a time.`,
    `<b>Hold</b> the button (or Space) to dip the item, release to lift it. Freezing speed: <b>${x(T.speed)}</b>.`,
    'The core keeps cooling for a moment after you lift it (thermal lag): lift <b>before</b> the window.',
    T.crack>0?`If the core stays colder than the window, the crack meter fills (<b>${x(T.crack)}</b>); a cracked item scores at most 40.`:'Cracking is <b>off</b>: overfreezing only costs temperature accuracy.',
    T.shatter?'Shatter items (Mineral ice) then need <b>exactly N taps</b> to break into the requested number of shards.':'The <b>shatter beat is off</b>: shatter items are scored on temperature only.',
    'Press <b>L</b> (or LOCK) to validate an item.',timeLine(T,'item',2),randLine(T,'item count and temperature windows')],
   score:'Each item scores on its distance to the window (and shard count); the score is the average over the items.'})},

 oven:{name:'Oven',file:'minigames/oven.html',time:{def:30,label:'Time per dish',max:60,step:5},
  defaults:{inertia:1,heatLoss:1,curve:true,brownGauge:false,window:1},
  tweaks:[
   {k:'inertia',l:'Core inertia',t:'range',min:.3,max:3,step:.1,f:x,h:'Higher = the core lags further behind the air.'},
   {k:'heatLoss',l:'Heat loss with door open',t:'range',min:0,max:3,step:.1,f:x},
   {k:'window',l:'Target window width',t:'range',min:.4,max:2.5,step:.1,f:x},
   {k:'curve',l:'Show temperature curve',t:'bool'},
   {k:'brownGauge',l:'Crust gauge with door closed',t:'bool',h:'Off = you must open the door to see the crust.'}],
  describe:T=>({pitch:'Bake a dish until its core temperature and crust colour are both right.',
   play:['<b>Scroll</b> (or ↑/↓) to set the oven temperature, then click <b>START</b>. Time runs ×60 (1 s = 1 min).',
    `The core heats slowly behind the air (inertia <b>${x(T.inertia)}</b>); the crust browns only when the air is above 140 °C.`,
    T.brownGauge?'A <b>crust gauge</b> shows the colour at all times.':'You only see the crust with the <b>door open</b> (D).',
    T.heatLoss>0?`Opening the door loses heat (<b>${x(T.heatLoss)}</b>); more than 2 openings cost points.`:'Opening the door loses <b>no heat</b> (more than 2 openings still cost points).',
    T.curve?'A live <b>curve</b> shows air and core temperature against the target band.':'The <b>temperature curve is hidden</b>: watch the readouts.',
    `Target windows are <b>${x(T.window)}</b> the base width. Press <b>Space</b> to pull the dish out.`,
    timeLine(T,'dish',1),randLine(T,'core window and crust colour')],
   score:'55% core temperature, 45% crust colour (distance to each window). Burnt caps the score at 30; each door opening beyond 2 costs 3 points.'})},

 pan:{name:'Cooktop & pan',file:'minigames/pan.html',time:{def:3.5,label:'Time per piece'},
  defaults:{heatResp:1,tilt:1,minPieces:4,maxPieces:8,press:1.7},
  tweaks:[
   {k:'heatResp',l:'Heat response',t:'range',min:.3,max:3,step:.1,f:x,h:'How fast the pan follows the heat setting.'},
   {k:'tilt',l:'Tilt sensitivity',t:'range',min:.2,max:3,step:.1,f:x},
   {k:'press',l:'Press-down boost',t:'range',min:1,max:3,step:.1,f:x},
   {k:'minPieces',l:'Min pieces',t:'range',min:2,max:8,step:1,f:v=>v},
   {k:'maxPieces',l:'Max pieces',t:'range',min:2,max:12,step:1,f:v=>v}],
  describe:T=>{const lo=Math.min(T.minPieces,T.maxPieces),hi=Math.max(T.minPieces,T.maxPieces);return{pitch:'Brown every piece in the pan evenly without burning any.',
   play:[`The pan holds <b>${lo===hi?lo:lo+' to '+hi} pieces</b>.`,
    `<b>Scroll</b> (or ↑/↓) to set the heat in kelvin; the pan follows ${T.heatResp>1.4?'quickly':T.heatResp<.6?'slowly':'with a short delay'} (<b>${x(T.heatResp)}</b>). Pieces brown above 380 K.`,
    'The middle of the pan is hottest and the oil runs downhill.',
    `<b>Move the mouse</b> to tilt the pan and slide the pieces around (sensitivity <b>${x(T.tilt)}</b>).`,
    `<b>Hold</b> the button to press down: pieces brown <b>${x(T.press)}</b> faster.`,
    'Press <b>Space</b> to pull the pan off.',timeLine(T,'piece',6),randLine(T,'piece count, layout and shade of golden')],
   score:'Each piece scores on its distance to the golden band; burnt pieces score 0. The score is the average over the pieces.'}}},

 torch:{name:'Plasma torch',file:'minigames/torch.html',time:{def:4,label:'Time per zone unit'},
  defaults:{power:1,burn:1,guide:true},
  tweaks:[
   {k:'power',l:'Flame power',t:'range',min:.3,max:3,step:.1,f:x},
   {k:'burn',l:'Burn margin',t:'range',min:.5,max:2,step:.1,f:x,h:'Wider margin = more room above the target colour before it counts as burnt.'},
   {k:'guide',l:'Show target zone outline',t:'bool'}],
  describe:T=>({pitch:'Caramelise a sugar crust to the requested colour, only inside the target zone.',
   play:[`<b>Hold</b> to fire and move the flame over the sugar. Flame power: <b>${x(T.power)}</b>.`,
    '<b>Wheel</b> changes the flame width: narrow is hot and precise, wide is gentle.',
    T.guide?'The <b>target zone</b> (disc, ring, star or stripes) is outlined.':'The <b>target zone is not outlined</b>: work from the order description.',
    `Sugar goes raw → blond → golden → amber → dark. Burn margin: <b>${x(T.burn)}</b> ${T.burn>1.3?'(forgiving)':T.burn<.8?'(it burns quickly past the target)':''}.`,
    'Caramel outside the zone counts as spill.',timeLine(T,'zone unit',4),randLine(T,'target colour and zone rotation')],
   score:'Score = zone closeness to the target colour − 1.5 × burnt share − 0.6 × spill share.'})},

 mitosis:{name:'Mitosis oven',file:'minigames/mitosis.html',time:{def:1.3,label:'Time per cell',max:4,step:.1},
  defaults:{bpmMul:1,hitWin:1,drift:1,grace:1},
  tweaks:[
   {k:'bpmMul',l:'Tempo',t:'range',min:.5,max:1.6,step:.05,f:v=>'×'+(+v).toFixed(2)},
   {k:'hitWin',l:'Hit window',t:'range',min:.4,max:2.5,step:.1,f:x,h:'Perfect ±60 ms, Good ±130 ms at ×1.'},
   {k:'drift',l:'Tempo drift',t:'range',min:0,max:3,step:.1,f:v=>v?x(v):'off'},
   {k:'grace',l:'Beats before overgrowth',t:'range',min:0,max:4,step:1,f:v=>v}],
  describe:T=>({pitch:'A rhythm game: pulse energy on the beat to make cells divide, and stop exactly at the target count.',
   play:[`Cells pulse on a beat (base tempo <b>×${(+T.bpmMul).toFixed(2)}</b>${T.drift>0?`, drifting <b>${x(T.drift)}</b>`:', perfectly steady'}).`,
    `<b>Click</b> (or Space) when the shrinking ring meets the membrane: <b>Perfect ±${Math.round(60*T.hitWin)} ms</b>, Good ±${Math.round(130*T.hitWin)} ms.`,
    'Each Perfect or Good hit divides one cell. A miss <b>stalls</b> division until your next good hit.',
    `Once you reach the target, the culture keeps dividing by itself after <b>${T.grace} beat${s1(T.grace)}</b>: press <b>STOP</b> (X) right away.`,
    timeLine(T,'cell',10),randLine(T,'target cell count and tempo')],
   score:'60% exact cell count (−25% per cell off), 40% rhythm accuracy (Perfect 1, Good 0.6, Miss 0).'})},

 pantry:{name:'Ingredient pantry',file:'minigames/pantry.html',time:{def:5,label:'Time per item'},
  defaults:{look:1,magnifier:true,labels:true},
  tweaks:[
   {k:'look',l:'Look-alike difficulty',t:'range',min:0,max:3,step:1,f:v=>['none','wrong batches','+ similar names','+ expired twins'][v]},
   {k:'magnifier',l:'Label magnifier on hover',t:'bool'},
   {k:'labels',l:'Names printed on shelf jars',t:'bool',h:'Off = only colour and batch are visible on the shelf.'}],
  describe:T=>({pitch:'Pick the right jars from the shelves: right ingredient, right batch, not expired.',
   play:['The ticket lists 3 to 5 ingredients, each with a required <b>batch number</b>.',
    T.magnifier?'<b>Hover</b> a jar to magnify its label (name, batch, expiry).':'There is <b>no magnifier</b>: read the small labels on the shelf.',
    T.labels?'Shelf jars show their name and batch.':'Shelf jars only show their <b>colour and batch</b>, not their name.',
    'Decoys: '+['only unrelated jars (pantry presets can add more).','<b>wrong batches</b> of the ordered ingredients.','<b>wrong batches</b> and <b>look-alike names</b>.','wrong batches, look-alike names and <b>expired twins</b>.'][T.look],
    '<b>Click</b> a jar to drop it in the tray; click a tray jar to put it back.',timeLine(T,'item',4),randLine(T,'ingredients, batches and shelf layout')],
   score:'Share of ticket items picked correctly, minus 10 points per wrong grab.'})},

 plating:{name:'Plating pass',file:'minigames/plating.html',time:{def:3,label:'Time per piece'},
  defaults:{guide:true,tweez:.3,tol:1},
  tweaks:[
   {k:'guide',l:'Show placement guide',t:'bool'},
   {k:'tweez',l:'Tweezers speed',t:'range',min:.1,max:1,step:.05,f:v=>'×'+(+v).toFixed(2),h:'Cursor speed while Shift is held.'},
   {k:'tol',l:'Placement tolerance',t:'range',min:.4,max:3,step:.1,f:x}],
  describe:T=>({pitch:'Compose the dish on the plate in recipe order, then ring the bell to serve.',
   play:['<b>Drag</b> components from the rack onto the plate in layer order: <b>base → main → sauce → garnish</b>.',
    T.guide?'A <b>ghost guide</b> shows where each piece goes.':'There is <b>no guide</b>: place pieces from memory of the recipe layout.',
    `Hold <b>Shift</b> while dragging for <b>tweezers</b>: the piece moves at <b>×${(+T.tweez).toFixed(2)}</b> of the cursor speed.`,
    `Placement tolerance: <b>${x(T.tol)}</b> (garnish within about ${Math.round(10*T.tol)} px, main pieces ${Math.round(22*T.tol)} px).`,
    'Press <b>Space</b> (or the bell) to serve.',timeLine(T,'piece',10),randLine(T,'layout rotation and offset')],
   score:'35% layer order (pieces placed out of order), 65% placement accuracy against the guide.'})},
};

function schema(id){const s=S[id];if(!s)return[];if(s.full)return s.tweaks;const t=s.time;
  return[{k:'random',l:'Random orders',t:'bool',h:'Random targets each round. Off = the same order every time.'},
    {k:'timePer',l:t.label,t:'range',min:0,max:t.max||15,step:t.step||.5,f:v=>v?v+' s':'no limit',h:'Round time = this × the size of the order. 0 = no limit.'},...s.tweaks]}
function defaults(id){const s=S[id];return Object.assign({shake:true,sound:true},s.full?{}:{random:true,timePer:s.time.def},s.defaults)}
function key(id){return S[id].key||('mg.'+id+'.tweaks.v1')}
function load(id){let v=null;try{v=JSON.parse(localStorage.getItem(key(id)))}catch(e){}return Object.assign(defaults(id),v||{})}
function save(id,T){try{localStorage.setItem(key(id),JSON.stringify(T))}catch(e){}}
function describe(id,T){return S[id].describe(T)}
window.MG_SPECS={list:S,schema,defaults,key,load,save,describe};
})();
