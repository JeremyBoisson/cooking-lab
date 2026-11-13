/* Cooking Lab · shared minigame kit
   Each station page calls MG.create(def). The kit owns the page shell (HUD, order panel with timer
   and Finish, menu, results, tweaks), the round flow, input, sound and particles. The game owns
   its simulation and drawing.

   def = {
     id, name, verb, intro,                // menu text
     keys: 'html help line',
     variants: [{id,name,kind,desc,icon}], // menu cards (icon = emoji) — or def.thumb(g,variant,w,h)
     // settings (tweak schema, defaults, time per unit) live in specs.js under the same id,
     // shared with the GDD station window and synced both ways (postMessage + storage events)
     order(variant, rand, K) -> { units, big, sub, chip, title, subtitle, ...game data }
     start(K, order), update(K, dt), draw(K, g, now),
     down(K,x,y,e), move(K,x,y,e), up(K,x,y,e), wheel(K,dy,x,y), key(K,key,isDown,e),
     panel(K) -> { slots:['ok'|'warn'|''], sub:'text' }   // live progress in the order panel
     evaluate(K, reason) -> { score:0..100, lines:[[label,value]], bars?:{items:[{v,label,cls}],target,max,tlabel}, note? }
     onTimeUp(K)                            // optional, default = finish('time')
   }
*/
"use strict";
(function(){
const W=900,H=560,RS=Math.min(2,Math.max(1,window.devicePixelRatio||1)),TAU=Math.PI*2;
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function store(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
if(/[?&]embed=1/.test(location.search))document.documentElement.classList.add('embed');

const SHELL=`<div class="app">
 <header><div class="brand"><h1 id="kTitle"></h1><small id="kSub"></small></div>
  <div class="hud"><div class="chip" id="hVar">—</div><div class="chip">Order <b id="hTarget">—</b></div>
   <div class="chip timer" id="hTimer"><b id="hTime">—</b><div class="tbar"><div class="tfill" id="hFill"></div></div></div>
   <button class="btn primary" id="bFinish" title="Finish (Enter)">Finish</button><button class="btn" id="bRestart" title="Retry (R)">Restart</button><button class="btn" id="bMenu" title="Menu (Esc)">Menu</button></div></header>
 <main><div class="stagewrap"><div class="stage" id="stage"><canvas id="c"></canvas>
   <div id="hudL" hidden><div id="order"><div class="olabel" id="oLabel">Order</div><div class="obig" id="oBig"></div><div class="osub" id="oSub"></div><div class="slots" id="oSlots"></div>
     <div class="otimer" id="oTimer"><div class="otrow"><span class="olabel">Time left</span><b id="oTime">—</b></div><div class="obar"><div id="oFill"></div></div></div></div>
     <button class="btn primary" id="bFinish2" title="Finish (Enter)">✓ Finish</button></div>
   <div class="hint" id="hint"></div><div id="toast"></div>
   <div class="overlay" id="banner" hidden></div><div class="overlay" id="result" hidden></div>
   <div class="overlay" id="menu"><div class="menucard"><h2 id="mTitle"></h2><p id="mIntro"></p><div class="grid" id="grid"></div>
     <div class="startbar"><div><div id="selName" style="font-weight:600"></div><div class="best" id="selBest"></div></div><div class="sp"></div>
      <label class="rnd" title="Random targets each round. Off = the same order every time."><input type="checkbox" id="rndChk">🎲 Random orders</label>
      <button class="btn" id="bSurprise" title="Random variant + random order (S)">🎲 Surprise me</button><button class="btn primary" id="bStart">Start ⏎</button></div></div></div>
 </div></div>
 <aside><h3>Tweaks</h3><div class="sub">Saved in this browser. Most apply on the next round.</div><div id="tweaks"></div><div class="keys" id="keys"></div></aside></main></div>`;

/* ---------- audio ---------- */
let AC=null,NB=null,soundOn=()=>true;
function ac(){if(!soundOn())return null;try{if(!AC){AC=new(window.AudioContext||window.webkitAudioContext)();NB=AC.createBuffer(1,AC.sampleRate*1,AC.sampleRate);const d=NB.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}if(AC.state==='suspended')AC.resume();return AC}catch(e){return null}}
function env(a,node,v,dur,t0){const g=a.createGain();g.gain.setValueAtTime(v,t0);g.gain.exponentialRampToValueAtTime(.001,t0+dur);node.connect(g);g.connect(a.destination);return g}
function tone(f,dur,v,type='sine',f2,delay=0){const a=ac();if(!a)return;const t=a.currentTime+delay,o=a.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);env(a,o,v,dur,t);o.start(t);o.stop(t+dur+.02)}
function noise(dur,v,type='bandpass',freq=2000,q=1){const a=ac();if(!a)return;const t=a.currentTime,s=a.createBufferSource();s.buffer=NB;const f=a.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;s.connect(f);env(a,f,v,dur,t);s.start(t);s.stop(t+dur+.02)}
// continuous sound: returns {set(vol, freq), stop()}
function loop(kind='noise',freq=800,type='lowpass'){const a=ac();if(!a)return{set(){},stop(){}};
  const g=a.createGain();g.gain.value=0;g.connect(a.destination);let src,f;
  if(kind==='noise'){src=a.createBufferSource();src.buffer=NB;src.loop=true;f=a.createBiquadFilter();f.type=type;f.frequency.value=freq;src.connect(f);f.connect(g)}
  else{src=a.createOscillator();src.type=kind;src.frequency.value=freq;f=src;src.connect(g)}
  src.start();return{set(v,fr){const t=a.currentTime;g.gain.setTargetAtTime(v,t,.03);if(fr!=null)(f.frequency).setTargetAtTime(fr,t,.03)},stop(){try{g.gain.setTargetAtTime(0,a.currentTime,.03);src.stop(a.currentTime+.2)}catch(e){}}}}
const sfx={tone,noise,loop,
  click(){tone(1400,.03,.12,'square')},
  tick(){tone(1100,.04,.12,'square')},
  pop(){tone(520,.07,.15,'sine',880)},
  good(){tone(880,.12,.18,'triangle');tone(1320,.14,.12,'triangle',null,.06)},
  bad(){tone(180,.2,.25,'sawtooth',110)},
  tink(){tone(2300,.25,.12);tone(3450,.18,.06)},
  whoosh(){noise(.35,.3,'bandpass',900,.7)},
  thud(){tone(120,.15,.5,'sine',50)},
  end(stars){const n=[523,659,784,1047];for(let i=0;i<=stars;i++)tone(n[i],.25,.18,'triangle',null,i*.11)},
  buzz(){tone(330,.5,.2,'square',160)}};

/* ---------- plate background ---------- */
function makePlate(label){const c=document.createElement('canvas');c.width=W*RS;c.height=H*RS;const g=c.getContext('2d');g.scale(RS,RS);
  const rr=new Path2D();rr.roundRect(18,18,W-36,H-36,22);
  g.save();g.shadowColor='rgba(63,224,255,.45)';g.shadowBlur=30;g.fillStyle='#0b181d';g.fill(rr);g.restore();
  g.save();g.clip(rr);const lg=g.createLinearGradient(0,0,W,H);lg.addColorStop(0,'#14303a');lg.addColorStop(.6,'#0c1d23');lg.addColorStop(1,'#091519');g.fillStyle=lg;g.fillRect(0,0,W,H);
  const r=rng(7);for(let i=0;i<220;i++){g.fillStyle=`rgba(255,255,255,${.008+r()*.02})`;g.fillRect(0,r()*H,W,.6+r())}
  g.lineWidth=1;for(let x=40;x<W;x+=20){g.strokeStyle=(x-40)%100?'rgba(120,230,255,.04)':'rgba(120,230,255,.1)';g.beginPath();g.moveTo(x,18);g.lineTo(x,H-18);g.stroke()}
  for(let y=40;y<H;y+=20){g.strokeStyle=(y-40)%100?'rgba(120,230,255,.04)':'rgba(120,230,255,.1)';g.beginPath();g.moveTo(18,y);g.lineTo(W-18,y);g.stroke()}
  g.strokeStyle='#3FE0FF';g.lineWidth=3;g.shadowColor='#3FE0FF';g.shadowBlur=10;
  for(const[x,y,sx,sy]of[[52,52,1,1],[W-52,52,-1,1],[52,H-52,1,-1],[W-52,H-52,-1,-1]]){g.beginPath();g.moveTo(x,y+24*sy);g.lineTo(x,y);g.lineTo(x+24*sx,y);g.stroke()}
  g.shadowBlur=0;g.fillStyle='rgba(127,243,255,.5)';g.font='600 10px "IBM Plex Mono", monospace';g.textAlign='right';g.fillText(label,W-60,H-40);
  g.textAlign='left';g.fillStyle='rgba(255,110,74,.8)';g.fillText('● REC',60,H-40);g.restore();
  g.save();g.shadowColor='#3FE0FF';g.shadowBlur=14;g.lineWidth=2;g.strokeStyle='rgba(63,224,255,.85)';g.stroke(rr);g.restore();return c}

/* ---------- drawing helpers (game side) ---------- */
const draw={
  text(g,s,x,y,o={}){g.save();g.font=o.font||'600 16px "IBM Plex Mono", monospace';g.textAlign=o.align||'center';g.textBaseline=o.base||'middle';
    if(o.glow){g.shadowColor=o.glow;g.shadowBlur=o.blur||12}g.fillStyle=o.col||'#E2F6FF';g.fillText(s,x,y);g.restore()},
  box(g,x,y,w,h,r,o={}){g.save();g.beginPath();g.roundRect(x,y,w,h,r);if(o.glow){g.shadowColor=o.glow;g.shadowBlur=o.blur||14}
    if(o.fill){g.fillStyle=o.fill;g.fill()}g.shadowBlur=0;if(o.stroke){g.lineWidth=o.lw||1.5;g.strokeStyle=o.stroke;g.stroke()}g.restore()},
  ring(g,x,y,r,a0,a1,col,lw,glow){g.save();g.beginPath();g.arc(x,y,r,a0,a1);g.lineWidth=lw;g.strokeStyle=col;g.lineCap='round';if(glow){g.shadowColor=glow;g.shadowBlur=12}g.stroke();g.restore()},
  line(g,pts,col,lw,glow){g.save();g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.lineWidth=lw;g.strokeStyle=col;g.lineJoin='round';g.lineCap='round';if(glow){g.shadowColor=glow;g.shadowBlur=12}g.stroke();g.restore()},
  // horizontal meter with a target band
  meter(g,x,y,w,h,v,lo,hi,o={}){const mn=o.min??0,mx=o.max??1,X=t=>x+(clamp(t,mn,mx)-mn)/(mx-mn)*w;
    draw.box(g,x,y,w,h,h/2,{fill:'rgba(127,243,255,.08)',stroke:'rgba(127,243,255,.3)'});
    if(lo!=null){g.save();g.fillStyle='rgba(60,196,142,.28)';g.fillRect(X(lo),y,X(hi)-X(lo),h);g.strokeStyle='#3CC48E';g.lineWidth=1.5;g.strokeRect(X(lo),y,X(hi)-X(lo),h);g.restore()}
    g.save();g.shadowColor=o.col||'#3FE0FF';g.shadowBlur=10;g.fillStyle=o.col||'#3FE0FF';g.fillRect(X(v)-2,y-4,4,h+8);g.restore();
    if(o.label)draw.text(g,o.label,x,y-10,{align:'left',font:'600 11px "IBM Plex Mono", monospace',col:'#7FF3FF'})}
};
const C={cyan:'#3FE0FF',cyan2:'#7FF3FF',ok:'#3CC48E',warn:'#E8B53A',bad:'#FF6370',accent:'#FF6E4A',violet:'#9D88FF',ink:'#E2F6FF',dim:'#8FB6BF',panel:'rgba(6,18,22,.88)'};

/* ---------- create ---------- */
window.MG={create(def){
  document.body.innerHTML=SHELL;document.title=def.name;
  $('#kTitle').innerHTML=def.name.replace(/(\S+)$/,'<span>$1</span>');$('#kSub').textContent=`Cooking Lab · ${def.verb} station · prototype`;
  $('#mTitle').textContent=def.menuTitle||'Pick an order';$('#mIntro').textContent=def.intro||'';
  $('#keys').innerHTML=(def.keys?def.keys+' · ':'')+'<kbd>Enter</kbd> start/finish · <kbd>R</kbd> retry · <kbd>S</kbd> surprise me · <kbd>Esc</kbd> menu · <kbd>M</kbd> mute';

  /* tweaks */
  // settings come from specs.js (shared with the GDD station window)
  const SPECS=window.MG_SPECS,T=SPECS.load(def.id);soundOn=()=>T.sound;
  const SCHEMA=[...SPECS.schema(def.id),{k:'shake',l:'Screen shake',t:'bool'},{k:'sound',l:'Sound',t:'bool'}];
  const embedded=window.parent!==window,QP=new URLSearchParams(location.search);
  const RUN={on:QP.get('run')==='1',ing:QP.get('ing')||'',label:QP.get('label')||''};
  function syncIn(nt){Object.assign(T,nt);buildTweaks();refreshMenu();updateHud()}
  addEventListener('message',e=>{const d=e.data;if(d&&d.type==='mg-tweaks'&&d.id===def.id){syncIn(d.T);SPECS.save(def.id,T)}});
  addEventListener('storage',e=>{if(e.key===SPECS.key(def.id))syncIn(SPECS.load(def.id))});
  function buildTweaks(){const box=$('#tweaks');box.innerHTML='';
    for(const s of SCHEMA){const d=document.createElement('div');d.className='tw';
      if(s.t==='bool'){d.innerHTML=`<label><span>${s.l}</span><input type=checkbox ${T[s.k]?'checked':''}></label>`;d.querySelector('input').onchange=e=>setT(s.k,e.target.checked)}
      else if(s.t==='range'){d.innerHTML=`<label><span>${s.l}</span><output>${s.f?s.f(T[s.k]):T[s.k]}</output></label><input type=range min=${s.min} max=${s.max} step=${s.step} value=${T[s.k]}>`;
        const o=d.querySelector('output');d.querySelector('input').oninput=e=>{setT(s.k,+e.target.value);o.textContent=s.f?s.f(T[s.k]):T[s.k]}}
      else{d.innerHTML=`<label><span>${s.l}</span></label><select>${s.o.map(([v,t])=>`<option value="${v}" ${T[s.k]===v?'selected':''}>${t}</option>`).join('')}</select>`;d.querySelector('select').onchange=e=>setT(s.k,e.target.value)}
      if(s.h)d.insertAdjacentHTML('beforeend',`<div class=h>${s.h}</div>`);box.appendChild(d)}}
  function setT(k,v){T[k]=v;SPECS.save(def.id,T);if(k==='random'){$('#rndChk').checked=v;refreshMenu()}
    if(embedded)parent.postMessage({type:'mg-tweaks',id:def.id,T:{...T}},'*')}

  /* canvas */
  const cv=$('#c');cv.width=W*RS;cv.height=H*RS;const ctx=cv.getContext('2d');const plate=makePlate(def.plateLabel||`${def.verb} STATION · CALIBRATED`);
  const parts=[];let shakeA=0,toastT=0,hintTxt='';
  const K={W,H,TAU,T,ctx,draw,C,sfx,clamp,lerp,rng,state:'menu',order:null,variant:null,timeLeft:0,timeMax:0,elapsed:0,mouse:{x:0,y:0,down:false},
    get playing(){return K.state==='play'},
    finish:r=>finish(r||'done'),
    toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('on'),1400)},
    banner,shake(a){if(T.shake)shakeA=Math.max(shakeA,a)},
    hint(t){if(t!==hintTxt){hintTxt=t;$('#hint').textContent=t}},
    burst(x,y,o={}){const n=o.n||12;for(let i=0;i<n;i++){const a=o.dir!=null?o.dir+(Math.random()-.5)*(o.spread??1.2):Math.random()*TAU,s=(o.spd||120)*(.4+Math.random()*.8);
      parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:(o.life||.6)*(.6+Math.random()*.6),max:o.life||.6,r:(o.r||2.5)*(.5+Math.random()),col:o.col||C.cyan,g:o.grav||0})}},
    refresh:()=>updateHud()};

  /* flow */
  let selIdx=clamp(store('mg.'+def.id+'.sel')||0,0,def.variants.length-1),round=0,lastSec=99;
  function newOrder(v,forceRandom){const rand=(T.random||forceRandom)?Math.random:rng(1000+def.variants.indexOf(v)*77);const o=def.order(v,rand,K);o.variant=v;o.random=!!(T.random||forceRandom);return o}
  function startRound(keep){
    const v=def.variants[selIdx];
    if(!keep||!K.order||K.order.variant!==v)K.order=newOrder(v);
    K.variant=v;round++;parts.length=0;K.elapsed=0;
    K.timeMax=T.timePer*(K.order.units||1);K.timeLeft=K.timeMax;lastSec=99;
    def.start(K,K.order);
    $('#menu').hidden=true;$('#result').hidden=true;K.state='intro';K.hint('');updateHud();
    banner(`${K.order.random?'🎲 ':''}${K.order.title||v.name}<small>${RUN.label?RUN.label+'<br>':''}${K.order.subtitle||''}</small>`,RUN.label?1600:1200);
    const r=round;setTimeout(()=>{if(round===r&&K.state==='intro'){K.state='play';banner('Go!',450);updateHud()}},1050);
  }
  function surprise(){let i=Math.floor(Math.random()*def.variants.length);if(def.variants.length>1&&K.variant&&def.variants[i]===K.variant)i=(i+1)%def.variants.length;
    selIdx=i;store('mg.'+def.id+'.sel',i);K.order=newOrder(def.variants[i],true);startRound(true)}
  function openMenu(){K.state='menu';round++;if(def.stop)def.stop(K);$('#result').hidden=true;$('#banner').hidden=true;$('#menu').hidden=false;refreshMenu();updateHud()}
  function finish(reason){
    if(K.state!=='play'&&K.state!=='ending')return;K.state='done';if(def.stop)def.stop(K);
    const ev=def.evaluate(K,reason),score=clamp(Math.round(ev.score),0,100);
    const stars=score>=90?3:score>=75?2:score>=50?1:0,grade=score>=95?'Lab-perfect':score>=90?'Precise':score>=75?'Solid':score>=50?'Passable':'Botched';
    const key='mg.'+def.id+'.best.'+K.variant.id+(K.order.random?'.rnd':''),best=store(key),isBest=best==null||score>best;if(isBest)store(key,score);
    if(reason==='time'){banner("Time's up!",900);sfx.buzz()}
    if(embedded)parent.postMessage({type:'mg-result',id:def.id,score,stars,grade,variant:K.variant.name,reason},'*');
    setTimeout(()=>{sfx.end(stars);showResult(ev,score,stars,grade,isBest?null:best)},reason==='time'?700:150);updateHud()}
  function showResult(ev,score,stars,grade,prev){
    let bars='';if(ev.bars&&ev.bars.items.length){const b=ev.bars,mx=b.max||Math.max(...b.items.map(i=>i.v),b.target||0)*1.2||1;
      bars=`<div class=bars>${b.items.map(i=>`<div class=bar style="height:${clamp(i.v/mx,0,1)*100}%;background:var(--${i.cls||'ok'})"><span>${i.label}</span></div>`).join('')}${b.target!=null?`<div class=tline style="bottom:${b.target/mx*100}%"><i>${b.tlabel||'target'}</i></div>`:''}</div>`}
    const r=$('#result');r.innerHTML=`<div class=rcard id=rcard><div class=rtop><div class=rhead><div class=score>${score}</div><div><div class=stars>${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div><div class=grade>${grade}</div></div></div><button class=btn id=rMin title="Show/hide details">–</button></div>
     <div class=rbody><div class=rlines>${(ev.lines||[]).map(([a,b])=>`<span>${a}</span><b>${b}</b>`).join('')}</div>${bars}${ev.note?`<div class=best>${ev.note}</div>`:''}<div class=best>${prev==null?'New best for this setup!':'Best: '+prev}</div></div>
     <div class=rbtns style="margin-top:10px"><button class="btn primary" id=rRetry>Retry (R)</button><button class=btn id=rSurp>🎲 Surprise me</button><button class=btn id=rMenu>Menu</button></div></div>`;
    r.hidden=false;$('#rRetry').onclick=()=>startRound(true);$('#rSurp').onclick=surprise;$('#rMenu').onclick=openMenu;
    $('#rMin').onclick=()=>{const c=$('#rcard');c.classList.toggle('min');$('#rMin').textContent=c.classList.contains('min')?'+':'–'}}
  function banner(html,ms){const b=$('#banner');b.innerHTML=`<div>${html}</div>`;b.hidden=false;clearTimeout(banner.t);if(ms)banner.t=setTimeout(()=>b.hidden=true,ms)}
  function updateHud(){const inGame=K.state!=='menu'&&K.order;
    $('#hVar').textContent=inGame?K.variant.name:'—';$('#hTarget').innerHTML=inGame?(K.order.chip||K.order.big||'—'):'—';
    $('#hudL').hidden=!inGame;$('#bFinish').disabled=$('#bFinish2').disabled=!K.playing;$('#bFinish2').style.visibility=K.state==='done'?'hidden':'';$('#bRestart').disabled=!inGame;
    if(inGame){const p=def.panel?def.panel(K):{};$('#oLabel').textContent=p.label??K.order.label??'Order';$('#oBig').innerHTML=p.big??K.order.big??'';
      $('#oSub').innerHTML=p.sub??K.order.sub??'';$('#oSlots').innerHTML=(p.slots||[]).map(c=>`<i class="${c}"></i>`).join('')}
    updateTimer()}
  function updateTimer(){const ot=$('#oTimer'),ht=$('#hTimer');
    if(!K.order||K.state==='menu'||!K.timeMax){$('#hTime').textContent=$('#oTime').textContent=K.order&&K.state!=='menu'?'∞':'—';$('#hFill').style.width=$('#oFill').style.width='100%';ot.classList.remove('low');ht.classList.remove('low');return}
    const low=K.timeLeft<=Math.min(5,K.timeMax*.3)&&K.playing,w=(K.timeLeft/K.timeMax*100)+'%';
    $('#hTime').textContent=K.timeLeft.toFixed(1);$('#oTime').textContent=K.timeLeft.toFixed(1)+' s';$('#hFill').style.width=$('#oFill').style.width=w;ot.classList.toggle('low',low);ht.classList.toggle('low',low)}

  /* menu */
  function buildMenu(){const grid=$('#grid');grid.innerHTML='';
    def.variants.forEach((v,i)=>{const b=document.createElement('button');b.className='card';
      if(def.thumb){const c=document.createElement('canvas');c.width=300;c.height=187;const g=c.getContext('2d');const bg=g.createLinearGradient(0,0,300,187);bg.addColorStop(0,'#14303a');bg.addColorStop(1,'#091519');g.fillStyle=bg;g.beginPath();g.roundRect(0,0,300,187,10);g.fill();def.thumb(g,v,300,187);b.appendChild(c)}
      else b.insertAdjacentHTML('beforeend',`<div class=art>${v.icon||'🧪'}</div>`);
      b.insertAdjacentHTML('beforeend',`<span class=nm>${v.name}</span><span class=kind>${v.kind||''}</span><span class=desc>${v.desc||''}</span><span class=meta data-m></span>`);
      b.onclick=()=>{selIdx=i;store('mg.'+def.id+'.sel',i);refreshMenu()};b.ondblclick=()=>{selIdx=i;startRound()};grid.appendChild(b)});refreshMenu()}
  function refreshMenu(){const cards=[...document.querySelectorAll('.card')];
    def.variants.forEach((v,i)=>{const c=cards[i];if(!c)return;c.classList.toggle('sel',i===selIdx);const b=store('mg.'+def.id+'.best.'+v.id+(T.random?'.rnd':''));c.querySelector('[data-m]').textContent=b!=null?'★ best '+b:''});
    const v=def.variants[selIdx];$('#selName').textContent=v.name;const b=store('mg.'+def.id+'.best.'+v.id+(T.random?'.rnd':''));$('#selBest').textContent=b!=null?'Best: '+b:'Not played yet';$('#rndChk').checked=T.random}

  /* input */
  const toB=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H]};
  cv.addEventListener('pointerdown',e=>{ac();const[x,y]=toB(e);K.mouse={x,y,down:true,button:e.button};if(!K.playing)return;cv.setPointerCapture(e.pointerId);def.down&&def.down(K,x,y,e)});
  cv.addEventListener('pointermove',e=>{const[x,y]=toB(e);K.mouse.x=x;K.mouse.y=y;if(K.playing&&def.move)def.move(K,x,y,e)});
  cv.addEventListener('pointerup',e=>{const[x,y]=toB(e);K.mouse.down=false;if(K.playing&&def.up)def.up(K,x,y,e)});
  cv.addEventListener('pointercancel',e=>{K.mouse.down=false;if(K.playing&&def.up)def.up(K,K.mouse.x,K.mouse.y,e)});
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  cv.addEventListener('wheel',e=>{if(!K.playing||!def.wheel)return;e.preventDefault();const[x,y]=toB(e);def.wheel(K,Math.sign(e.deltaY),x,y,e)},{passive:false});
  addEventListener('keydown',e=>{if(e.target.tagName==='SELECT'||e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();
    if(K.playing&&def.key&&def.key(K,k,true,e)===true){e.preventDefault();return}
    if(k==='enter'){e.preventDefault();if(K.state==='menu')startRound();else if(K.playing)finish('done');else if(K.state==='done')startRound(true)}
    else if(k==='r'&&K.order&&K.state!=='menu')startRound(true);
    else if(k==='s'&&(K.state==='menu'||K.state==='done'))surprise();
    else if(k==='escape')openMenu();
    else if(k==='m'){setT('sound',!T.sound);buildTweaks();K.toast(T.sound?'Sound on':'Muted')}
    else if(k===' '&&K.playing)e.preventDefault();
    else if(K.state==='menu'&&(k==='arrowright'||k==='arrowleft')){selIdx=(selIdx+(k==='arrowright'?1:def.variants.length-1))%def.variants.length;store('mg.'+def.id+'.sel',selIdx);refreshMenu()}});
  addEventListener('keyup',e=>{if(K.playing&&def.key)def.key(K,e.key.toLowerCase(),false,e)});
  $('#bStart').onclick=()=>startRound();$('#bSurprise').onclick=surprise;$('#rndChk').onchange=e=>{setT('random',e.target.checked);buildTweaks();refreshMenu()};
  $('#bFinish').onclick=$('#bFinish2').onclick=()=>finish('done');$('#bRestart').onclick=()=>{if(K.order)startRound(true)};$('#bMenu').onclick=openMenu;

  /* loop */
  let last=performance.now(),panelT=0;
  function frame(){const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
    if(K.playing){K.elapsed+=dt;if(K.timeMax){K.timeLeft=Math.max(0,K.timeLeft-dt);const s=Math.ceil(K.timeLeft);if(s<lastSec){lastSec=s;if(s<=3&&s>0)sfx.tick()}
      if(K.timeLeft<=0){if(def.onTimeUp)def.onTimeUp(K);else finish('time')}}}
    if(K.state!=='menu'&&def.update)def.update(K,dt);
    if((panelT+=dt)>.12&&K.state!=='menu'){panelT=0;updateHud()}
    for(let i=parts.length-1;i>=0;i--){const q=parts[i];q.life-=dt;if(q.life<=0){parts.splice(i,1);continue}const d=Math.exp(-4*dt);q.vx*=d;q.vy=q.vy*d+q.g*dt;q.x+=q.vx*dt;q.y+=q.vy*dt}
    shakeA*=Math.exp(-12*dt);
    ctx.setTransform(RS,0,0,RS,0,0);ctx.clearRect(0,0,W,H);if(shakeA>.1)ctx.translate((Math.random()-.5)*shakeA*2,(Math.random()-.5)*shakeA*2);
    ctx.drawImage(plate,0,0,W,H);
    if(K.state!=='menu'&&def.draw){ctx.save();def.draw(K,ctx,now);ctx.restore()}
    for(const q of parts){ctx.globalAlpha=Math.min(1,q.life/q.max*1.6);ctx.fillStyle=q.col;ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,TAU);ctx.fill()}ctx.globalAlpha=1;
    requestAnimationFrame(frame)}
  buildTweaks();buildMenu();updateHud();requestAnimationFrame(frame);
  if(embedded)parent.postMessage({type:'mg-ready',id:def.id},'*');
  // Recipe run mode (?run=1&ing=<ingredient>&label=<step>): skip the menu, pick the variant that matches
  // the recipe ingredient (else a random one) and start right away. The result is posted as 'mg-result'.
  if(RUN.on){const words=RUN.ing.toLowerCase().split(/[ -]/).filter(w=>w.length>3);
    let i=def.variants.findIndex(v=>words.some(w=>v.name.toLowerCase().includes(w)));if(i<0)i=Math.floor(Math.random()*def.variants.length);
    selIdx=i;setTimeout(()=>startRound(),200)}
  window.__MG={startRound,finish,surprise,openMenu,K,def};// test hook
  return K;
}};
})();
