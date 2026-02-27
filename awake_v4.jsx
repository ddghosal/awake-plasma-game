import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════
const C = {
  bg:"#040c18", panel:"#071424", border:"#122840",
  accent:"#00c8f0", accentDim:"#00c8f018", glow:"#00c8f044",
  proton:"#f59e0b", protonDim:"#f59e0b18",
  electron:"#a78bfa", electronDim:"#a78bfa18",
  plasma:"#00ff88", plasmaDim:"#00ff8818",
  danger:"#ff3b5c", warn:"#fbbf24",
  text:"#c0ddf0", dim:"#3a5a7a", dimmer:"#122030",
  osr:"#ff9f1c", medical:"#f472b6",
};

// ═══════════════════════════════════════════════════════════════
// CORRECTED AWAKE BEAMLINE ORDER (physics-accurate)
// Proton line: SPS → COL → QF → DIP_p (into plasma)
// e⁻ injected INTO plasma column
// After plasma: e⁻ exits → OTR (upstream diag) → QF_e → DIP_e (bends e⁻ → SR screen) → DUMP
// Proton continues straight → DUMP_p
// ═══════════════════════════════════════════════════════════════
const COMPONENT_DEFS = [
  { id:"sps",       label:"SPS Proton Driver",     short:"SPS",    color:C.proton,   desc:"400 GeV/c proton bunch extracted from SPS — the drive beam" },
  { id:"col",       label:"Collimator",             short:"COL",    color:"#64748b",  desc:"Scrapes halo, improves transverse beam quality" },
  { id:"qf_p",      label:"Proton Quads (FODO)",    short:"QF-p",   color:C.accent,   desc:"Focusing quadrupoles to keep proton beam matched into plasma" },
  { id:"plasma",    label:"Rb Plasma Cell + e⁻ INJ",short:"PLASMA", color:C.plasma,   desc:"10m Rb plasma + e⁻ injected INTO the plasma column" },
  { id:"otr1",      label:"OTR Screen (upstream)",  short:"OTR",    color:"#f472b6",  desc:"First downstream diagnostic — measures beam size before dipole" },
  { id:"qf_e",      label:"Electron Quads",         short:"QF-e",   color:"#7dd3fc",  desc:"Quadrupoles re-focus the accelerated electron beam" },
  { id:"dip_e",     label:"Dipole (e⁻ bend + SR)",  short:"DIP",    color:C.osr,      desc:"Bends e⁻ beam; synchrotron radiation emitted toward OSR screen" },
  { id:"dump",      label:"Beam Dump",              short:"DUMP",   color:"#dc2626",  desc:"Absorbs remaining beam safely — end of line" },
];
const CORRECT_ORDER = ["sps","col","qf_p","plasma","otr1","qf_e","dip_e","dump"];

// ═══════════════════════════════════════════════════════════════
// THIN-LENS OPTICS ENGINE (2×2 transfer matrices)
// ═══════════════════════════════════════════════════════════════
const mm=(A,B)=>[[A[0][0]*B[0][0]+A[0][1]*B[1][0],A[0][0]*B[0][1]+A[0][1]*B[1][1]],[A[1][0]*B[0][0]+A[1][1]*B[1][0],A[1][0]*B[0][1]+A[1][1]*B[1][1]]];
const drift=L=>[[1,L],[0,1]];
const quad=f=>[[1,0],[-1/f,1]];
const dip=()=>[[1,0.4],[0,1]];

const ELEM_M = {
  sps:   drift(0.8),
  col:   drift(0.3),
  qf_p:  mm(drift(0.15),mm(quad(2.8),drift(0.15))),
  plasma:drift(2.5),
  otr1:  drift(0.2),
  qf_e:  mm(drift(0.15),mm(quad(1.8),drift(0.15))),
  dip_e: mm(drift(0.2),mm(dip(),drift(0.2))),
  dump:  drift(0.1),
};

function computeEnvelope(ids){
  let b=5.0, a=0.0, g=(1+a*a)/b;
  const pts=[{s:0,sigma:Math.sqrt(b)*7}];
  let s=0;
  for(const id of ids){
    const M=ELEM_M[id]||drift(0.5);
    const nb= M[0][0]*M[0][0]*b - 2*M[0][0]*M[0][1]*a + M[0][1]*M[0][1]*g;
    const na=-M[1][0]*M[0][0]*b +(M[0][0]*M[1][1]+M[0][1]*M[1][0])*a - M[0][1]*M[1][1]*g;
    b=Math.max(0.01,nb); a=na; g=(1+a*a)/b;
    s++;
    pts.push({s,sigma:Math.min(70,Math.max(2,Math.sqrt(b)*7))});
  }
  return pts;
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// ═══════════════════════════════════════════════════════════════
// SHARED: SCORE BADGE & STAT
// ═══════════════════════════════════════════════════════════════
function Stat({label,value,color}){
  return(
    <div>
      <div style={{color:C.dim,fontSize:9,fontFamily:"monospace",marginBottom:2}}>{label}</div>
      <div style={{color,fontSize:14,fontWeight:"bold",fontFamily:"monospace"}}>{value}</div>
    </div>
  );
}
function ScoreBadge({label,score}){
  const pct=score/100;
  const col=pct>0.7?C.plasma:pct>0.4?C.warn:pct>0?C.danger:C.dim;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",background:"#040c18",
      border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",minWidth:72}}>
      <div style={{color:C.dim,fontSize:8,fontFamily:"monospace",marginBottom:2,letterSpacing:1}}>{label}</div>
      <div style={{color:col,fontSize:18,fontWeight:"bold",fontFamily:"monospace"}}>{score||"—"}</div>
      <div style={{width:44,height:3,background:C.dimmer,borderRadius:2,marginTop:2}}>
        <div style={{width:`${pct*100}%`,height:"100%",background:col,borderRadius:2,transition:"width 0.5s"}}/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BACK TO BEAMLINE BUTTON
// ═══════════════════════════════════════════════════════════════
function BackBtn({onClick}){
  return(
    <button onClick={onClick} style={{
      padding:"6px 14px",borderRadius:5,border:`1px solid ${C.dim}`,
      background:"transparent",color:C.dim,fontFamily:"monospace",fontSize:11,
      cursor:"pointer",display:"flex",alignItems:"center",gap:6,
    }}>
      ← Back to Beamline
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// OPTICS ENVELOPE CANVAS
// ═══════════════════════════════════════════════════════════════
// SLOT_W and GAP must match the builder slot dimensions for alignment
const SLOT_W=78, SLOT_GAP=4, N_SLOTS=CORRECT_ORDER.length;

function OpticsCanvas({placedIds}){
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current; if(!cv) return;
    const ctx=cv.getContext("2d");
    const W=cv.width=cv.offsetWidth||600, H=cv.height=88;
    ctx.fillStyle="#030a12"; ctx.fillRect(0,0,W,H);

    // Compute slot x-centres as fractions of W, mirroring builder layout
    // Builder renders slots in a flex row with wrap; approximate evenly spaced
    const totalSlotW = N_SLOTS*(SLOT_W+SLOT_GAP)-SLOT_GAP;
    const scale = W / totalSlotW;
    const slotCentres = Array.from({length:N_SLOTS},(_,i)=>
      ((i*(SLOT_W+SLOT_GAP) + SLOT_W/2) * scale)
    );

    const pts=computeEnvelope(placedIds);
    if(pts.length<2) return;
    const mx=Math.max(...pts.map(p=>p.sigma),1);
    const yM=H/2;

    // Map envelope point i to x using slot centres (pts[0]=start, pts[i]=after element i-1)
    const ptX=(i)=>{
      if(i===0) return slotCentres[0]-(SLOT_W/2*scale);
      if(i<=slotCentres.length) return slotCentres[i-1];
      return W;
    };

    // Fill
    ctx.beginPath();
    pts.forEach((p,i)=>{const x=ptX(i),y=yM-(p.sigma/mx)*(H*0.4);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    pts.slice().reverse().forEach((p,i)=>{const x=ptX(pts.length-1-i),y=yM+(p.sigma/mx)*(H*0.4);ctx.lineTo(x,y);});
    ctx.closePath();
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,`${C.accent}44`); g.addColorStop(1,`${C.accent}08`);
    ctx.fillStyle=g; ctx.fill();

    // Envelope lines
    ["top","bot"].forEach(s=>{
      ctx.beginPath();
      pts.forEach((p,i)=>{
        const x=ptX(i), y=yM+(s==="top"?-1:1)*(p.sigma/mx)*(H*0.4);
        if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.strokeStyle=C.accent; ctx.lineWidth=1.5; ctx.stroke();
    });

    // Element markers aligned to slot centres
    placedIds.forEach((id,i)=>{
      const d=COMPONENT_DEFS.find(c=>c.id===id); if(!d) return;
      const x=slotCentres[i];
      ctx.fillStyle=d.color+"55"; ctx.fillRect(x-1,4,2,H-14);
      ctx.font="7px monospace"; ctx.fillStyle=d.color; ctx.textAlign="center";
      ctx.fillText(d.short,x,H-3);
    });
    ctx.font="8px monospace"; ctx.fillStyle=C.dim; ctx.textAlign="left";
    ctx.fillText("σ(s) Beam Envelope",4,11);
  },[placedIds]);
  return <canvas ref={ref} style={{width:"100%",height:88,display:"block",borderRadius:6,border:`1px solid ${C.dimmer}`}}/>;
}

// ═══════════════════════════════════════════════════════════════
// BEAMLINE BUILDER (drag-and-drop) — Act I
// ═══════════════════════════════════════════════════════════════
function BeamlineBuilder({onComplete,onBack}){
  const [bank,setBank]=useState([...COMPONENT_DEFS].sort(()=>Math.random()-0.5));
  const [placed,setPlaced]=useState(Array(CORRECT_ORDER.length).fill(null));
  const [drag,setDrag]=useState(null);
  const [hover,setHover]=useState(null);
  const [fired,setFired]=useState(false);
  const [msg,setMsg]=useState(null);
  const placedIds=placed.filter(Boolean).map(p=>p.id);

  const dropSlot=i=>{
    if(!drag||fired) return;
    const np=[...placed], nb=bank.filter(b=>b.id!==drag.item.id);
    if(drag.from==="slot") np[drag.fi]=null;
    if(np[i]) nb.push(np[i]);
    np[i]=drag.item;
    setBank(nb); setPlaced(np); setDrag(null);
  };
  const dropBank=()=>{
    if(!drag||drag.from==="bank"||fired) return;
    const np=[...placed]; np[drag.fi]=null;
    setBank(p=>[...p,drag.item]); setPlaced(np); setDrag(null);
  };
  const fire=()=>{
    const ok=placed.every((p,i)=>p&&p.id===CORRECT_ORDER[i]);
    if(!ok){setMsg({ok:false,t:"Beamline error — check element order. Remember: e⁻ injected INTO plasma!"});return;}
    setFired(true); setMsg({ok:true,t:"✓ Validated! Proton beam firing into plasma..."});
    setTimeout(()=>onComplete(100),1600);
  };

  return(
    <div>
      {onBack&&<div style={{marginBottom:10}}><BackBtn onClick={onBack}/></div>}
      <p style={{color:C.dim,fontSize:12,fontFamily:"monospace",margin:"0 0 8px",lineHeight:1.7}}>
        Drag components into the correct upstream→downstream order.<br/>
        <span style={{color:C.plasma}}>Key: e⁻ is injected INTO the plasma cell, not after it.</span>
      </p>
      <div style={{marginBottom:10}}>
        <div style={{color:C.dim,fontSize:9,letterSpacing:2,fontFamily:"monospace",marginBottom:3}}>LIVE BEAM ENVELOPE σ(s)</div>
        <OpticsCanvas placedIds={placedIds}/>
      </div>
      {/* Slots */}
      <div style={{display:"flex",gap:4,marginBottom:6,flexWrap:"wrap"}}>
        {placed.map((comp,i)=>(
          <div key={i} onDragOver={e=>e.preventDefault()} onDrop={()=>dropSlot(i)}
            style={{width:78,height:68,borderRadius:6,display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",position:"relative",
              border:`2px dashed ${comp?(comp.id===CORRECT_ORDER[i]?C.plasma:C.danger):C.dimmer}`,
              background:comp?`${comp.color}12`:"#040c18",transition:"all 0.2s"}}>
            <div style={{color:C.dimmer,fontSize:7,fontFamily:"monospace",position:"absolute",top:2,left:4}}>{i+1}</div>
            {comp?(
              <>
                <div draggable onDragStart={()=>setDrag({item:comp,from:"slot",fi:i})}
                  style={{width:36,height:30,borderRadius:4,cursor:"grab",display:"flex",alignItems:"center",
                    justifyContent:"center",fontFamily:"monospace",fontSize:8,fontWeight:"bold",textAlign:"center",
                    background:`${comp.color}18`,border:`1px solid ${comp.color}`,color:comp.color}}>
                  {comp.short}
                </div>
                <div style={{color:comp.color,fontSize:7,marginTop:2,fontFamily:"monospace",textAlign:"center",lineHeight:1.2}}>
                  {comp.label.slice(0,11)}
                </div>
                {comp.id===CORRECT_ORDER[i]&&<div style={{position:"absolute",top:1,right:3,color:C.plasma,fontSize:9}}>✓</div>}
              </>
            ):(
              <div style={{color:C.dimmer,fontSize:7,fontFamily:"monospace"}}>SLOT {i+1}</div>
            )}
          </div>
        ))}
      </div>
      {/* Flow arrow */}
      <div style={{display:"flex",alignItems:"center",marginBottom:10}}>
        <span style={{color:C.proton,fontSize:9,fontFamily:"monospace",marginRight:3}}>p⁺→</span>
        {placed.map((_,i)=>(
          <span key={i} style={{display:"flex",alignItems:"center",flex:1}}>
            <div style={{flex:1,height:1,background:placed[i]?C.accent:C.dimmer,transition:"background 0.3s"}}/>
            {i<placed.length-1&&<span style={{color:C.accent,fontSize:8}}>▶</span>}
          </span>
        ))}
        <span style={{color:"#dc2626",fontSize:9,fontFamily:"monospace",marginLeft:3}}>DUMP</span>
      </div>
      {/* Bank */}
      <div onDragOver={e=>e.preventDefault()} onDrop={dropBank}
        style={{display:"flex",gap:5,flexWrap:"wrap",padding:8,background:"#040c18",
          borderRadius:7,border:`1px solid ${C.dimmer}`,minHeight:46,marginBottom:10}}>
        <div style={{width:"100%",color:C.dim,fontSize:8,fontFamily:"monospace",marginBottom:2}}>COMPONENT BANK</div>
        {bank.map(c=>(
          <div key={c.id} draggable
            onDragStart={()=>setDrag({item:c,from:"bank"})}
            onMouseEnter={()=>setHover(c)} onMouseLeave={()=>setHover(null)}
            style={{padding:"4px 9px",borderRadius:4,cursor:"grab",fontFamily:"monospace",fontSize:10,fontWeight:"bold",
              border:`1px solid ${c.color}`,background:`${c.color}15`,color:c.color,
              boxShadow:hover?.id===c.id?`0 0 10px ${c.color}44`:"none",
              transform:hover?.id===c.id?"translateY(-2px)":"none",transition:"all 0.15s"}}>
            {c.short}
          </div>
        ))}
        {bank.length===0&&<span style={{color:C.dim,fontSize:10,fontFamily:"monospace"}}>All placed ↑</span>}
      </div>
      {hover&&(
        <div style={{padding:"6px 11px",background:"#040c18",border:`1px solid ${hover.color}`,borderRadius:5,marginBottom:8,fontSize:11}}>
          <span style={{color:hover.color,fontWeight:"bold"}}>{hover.label}: </span>
          <span style={{color:C.text}}>{hover.desc}</span>
        </div>
      )}
      <button onClick={fire} disabled={fired} style={{
        padding:"9px 24px",borderRadius:7,border:"none",cursor:fired?"default":"pointer",
        background:fired?C.plasma:C.accent,color:"#040c18",fontWeight:"bold",
        fontFamily:"monospace",fontSize:12,letterSpacing:1,
        boxShadow:`0 0 14px ${fired?C.plasma+"66":C.glow}`,transition:"all 0.3s"}}>
        {fired?"✓ BEAM FIRING":"⚡ VALIDATE & FIRE BEAM"}
      </button>
      {msg&&(
        <div style={{marginTop:8,padding:"8px 12px",borderRadius:6,fontFamily:"monospace",fontSize:11,
          border:`1px solid ${msg.ok?C.plasma:C.danger}`,background:`${msg.ok?C.plasma:C.danger}0e`,
          color:msg.ok?C.plasma:C.danger}}>{msg.t}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// JIGSAW PUZZLE — Act I alternative
// ═══════════════════════════════════════════════════════════════
function JigsawPuzzle({onComplete,onBack}){
  const TOTAL=8;
  const labels=["SPS\nRing","Collim-\nator","Proton\nQuads","Plasma\n+ e⁻INJ","OTR\nScreen","e⁻\nQuads","Dipole\n(SR)","Beam\nDump"];
  const colors=[C.proton,"#64748b",C.accent,C.plasma,"#f472b6","#7dd3fc",C.osr,"#dc2626"];
  const [bank,setBank]=useState(()=>{const a=[...Array(TOTAL).keys()];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;});
  const [grid,setGrid]=useState(Array(TOTAL).fill(null));
  const [drag,setDrag]=useState(null);
  const [done,setDone]=useState(false);
  const correct=grid.filter((v,i)=>v===i).length;

  const checkWin=ng=>{if(ng.every((v,i)=>v===i)){setDone(true);setTimeout(()=>onComplete(95),1200);}};
  const dropSlot=i=>{
    if(!drag||done) return;
    const ng=[...grid],nb=[...bank];
    if(drag.from==="bank"){if(ng[i]!==null)nb.push(ng[i]);ng[i]=drag.p;setBank(nb.filter(p=>p!==drag.p));}
    else{const d=ng[i];ng[i]=drag.p;ng[drag.fi]=d;}
    setGrid(ng);setDrag(null);checkWin(ng);
  };
  const dropBank=()=>{
    if(!drag||drag.from==="bank"||done) return;
    const ng=[...grid];ng[drag.fi]=null;setBank(p=>[...p,drag.p]);setGrid(ng);setDrag(null);
  };

  return(
    <div>
      {onBack&&<div style={{marginBottom:10}}><BackBtn onClick={onBack}/></div>}
      <p style={{color:C.dim,fontSize:12,fontFamily:"monospace",margin:"0 0 8px"}}>
        Assemble the AWAKE beamline schematic — place each piece in the correct position.
        <span style={{color:C.plasma}}> {correct}/{TOTAL} correct</span>
      </p>
      <div style={{height:3,background:C.dimmer,borderRadius:2,marginBottom:10}}>
        <div style={{height:"100%",width:`${(correct/TOTAL)*100}%`,background:`linear-gradient(90deg,${C.accent},${C.plasma})`,borderRadius:2,transition:"width 0.4s"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,padding:8,background:"#030a12",borderRadius:7,border:`1px solid ${C.dimmer}`,marginBottom:8}}>
        {Array.from({length:TOTAL},(_,i)=>(
          <div key={i} onDragOver={e=>e.preventDefault()} onDrop={()=>dropSlot(i)}
            style={{height:62,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",
              border:`2px dashed ${grid[i]===null?C.dimmer:grid[i]===i?C.plasma:C.danger}`,
              background:grid[i]!==null?`${colors[i]}0e`:"#040c18",position:"relative",transition:"all 0.2s"}}>
            <div style={{color:C.dimmer,fontSize:7,fontFamily:"monospace",position:"absolute",top:2,left:4}}>{i+1}</div>
            {grid[i]!==null&&(
              <div draggable onDragStart={()=>setDrag({p:grid[i],from:"slot",fi:i})}
                style={{width:"88%",height:"82%",borderRadius:4,cursor:"grab",
                  background:`${colors[grid[i]]}18`,border:`1px solid ${colors[grid[i]]}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:grid[i]===i?C.plasma:colors[grid[i]],
                  fontSize:9,fontFamily:"monospace",fontWeight:"bold",textAlign:"center",whiteSpace:"pre",lineHeight:1.3}}>
                {labels[grid[i]]}
              </div>
            )}
          </div>
        ))}
      </div>
      <div onDragOver={e=>e.preventDefault()} onDrop={dropBank}
        style={{display:"flex",gap:5,flexWrap:"wrap",padding:8,background:"#030a12",borderRadius:7,border:`1px solid ${C.dimmer}`,minHeight:44}}>
        <div style={{width:"100%",color:C.dim,fontSize:8,fontFamily:"monospace",marginBottom:3}}>PIECE BANK</div>
        {bank.map(p=>(
          <div key={p} draggable onDragStart={()=>setDrag({p,from:"bank"})}
            style={{padding:"5px 10px",borderRadius:4,cursor:"grab",border:`1px solid ${colors[p]}`,
              background:`${colors[p]}18`,color:colors[p],fontFamily:"monospace",fontSize:9,
              fontWeight:"bold",whiteSpace:"pre",textAlign:"center"}}>
            {labels[p]}
          </div>
        ))}
        {bank.length===0&&!done&&<span style={{color:C.dim,fontSize:10,fontFamily:"monospace"}}>All placed ↑</span>}
      </div>
      {done&&<div style={{marginTop:8,padding:"8px 12px",borderRadius:6,border:`1px solid ${C.plasma}`,background:C.plasmaDim,color:C.plasma,fontFamily:"monospace",fontSize:12}}>✓ Schematic complete — loading simulation...</div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// BEAMLINE OVERVIEW ANIMATION — v4 corrected physics
// • p⁺ stops at beam dump (does NOT wrap past it)
// • e⁻ injection line from upper-left, angled ~30° down, small
//   bending magnet merges it INTO plasma column
// • SR cone at ~65° from horizontal (upper-right), ±15° fan
// • OSR screen tilted perpendicular to SR ray, offset upper-right
// ═══════════════════════════════════════════════════════════════
function BeamlineOverview({phase,onZoomPlasma,onZoomOSR,onBack}){
  const ref=useRef(null);
  const anim=useRef(null);
  const t=useRef(0);

  useEffect(()=>{
    const cv=ref.current; if(!cv) return;
    const W=cv.width=cv.offsetWidth||780, H=cv.height=230;
    const ctx=cv.getContext("2d");

    const yBeam=H*0.68; // proton beam axis

    // SR emission angle: 65° from horizontal = -25° from +x, going upper-right
    // In canvas coords (y increases downward): angle = -(65°) = -π*65/180
    const SR_ANG = -Math.PI * 65/180; // upper-right direction

    const EL=[
      {x:0.03,w:0.055,label:"SPS",     color:C.proton,  key:"sps"},
      {x:0.10,w:0.03, label:"COL",     color:"#64748b", key:"col"},
      {x:0.15,w:0.05, label:"QF-p",    color:C.accent,  key:"qfp"},
      {x:0.23,w:0.21, label:"PLASMA+e⁻",color:C.plasma, key:"plasma",hi:true},
      {x:0.47,w:0.04, label:"OTR",     color:"#f472b6", key:"otr"},
      {x:0.54,w:0.05, label:"QF-e",    color:"#7dd3fc", key:"qfe"},
      {x:0.62,w:0.05, label:"DIP",     color:C.osr,     key:"dip",hi2:true},
      {x:0.70,w:0.065,label:"DUMP",    color:"#dc2626", key:"dump"},
    ];

    const dipCx   = (EL[6].x + EL[6].w/2)*W;
    const dumpRx  = (EL[7].x + EL[7].w)*W;  // proton stops here
    const plasmaX = EL[3].x*W;
    const plasmaW = EL[3].w*W;

    // SR distance from dipole top to screen centre
    const SR_DIST = 72;
    const scW=46, scH=32;
    const scCx = dipCx + Math.cos(SR_ANG)*SR_DIST;
    const scCy = yBeam + Math.sin(SR_ANG)*SR_DIST - 18; // shift up a bit

    // e⁻ injection geometry
    const eInjSrcX = plasmaX - 50;
    const eInjSrcY = yBeam - 90;
    const eInjMergeX = plasmaX + plasmaW*0.22;
    const eInjMergeY = yBeam;
    const eBmX = plasmaX + 4;
    const eBmY = yBeam - 32;

    function draw(){
      t.current+=0.028;
      const tt=t.current;
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle="#040c18"; ctx.fillRect(0,0,W,H);

      // ── Proton beamline axis ──
      ctx.strokeStyle=C.dimmer; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(0,yBeam); ctx.lineTo(W,yBeam); ctx.stroke();
      ctx.setLineDash([]);

      // ── e⁻ injection line (dashed, angled from upper-left) ──
      ctx.strokeStyle=`${C.electron}55`; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
      ctx.beginPath();
      ctx.moveTo(eInjSrcX-35, eInjSrcY-25);
      ctx.lineTo(eInjSrcX, eInjSrcY);
      ctx.quadraticCurveTo(eBmX-10, eBmY, eInjMergeX, eInjMergeY);
      ctx.stroke(); ctx.setLineDash([]);

      // Small bending magnet on injection line
      ctx.save();
      ctx.translate(eBmX-2, eBmY+12);
      ctx.rotate(-Math.PI/5);
      ctx.fillStyle="#0a1830"; ctx.fillRect(-6,-9,12,18);
      ctx.strokeStyle=C.electron; ctx.lineWidth=1.5; ctx.strokeRect(-6,-9,12,18);
      ctx.restore();
      ctx.font="7px monospace"; ctx.fillStyle=C.electron+"99"; ctx.textAlign="left";
      ctx.fillText("e⁻BM",eBmX+8,eBmY-2);
      ctx.fillText("e⁻ gun",eInjSrcX-50,eInjSrcY-28);

      // ── All beam elements ──
      EL.forEach(el=>{
        const ex=el.x*W, ew=el.w*W, ey=yBeam-22, eh=44;
        const g=ctx.createLinearGradient(ex,ey,ex,ey+eh);
        g.addColorStop(0,el.color+"44"); g.addColorStop(1,el.color+"0a");
        ctx.fillStyle=g; ctx.fillRect(ex,ey,ew,eh);
        const active=(el.hi&&phase>=1)||(el.hi2&&phase>=2);
        if(active){ctx.shadowBlur=10;ctx.shadowColor=el.color;}
        ctx.strokeStyle=active?el.color:el.color+"55";
        ctx.lineWidth=active?2:1;
        ctx.strokeRect(ex,ey,ew,eh);
        ctx.shadowBlur=0;
        ctx.font="7px monospace"; ctx.fillStyle=el.color; ctx.textAlign="center";
        ctx.fillText(el.label,ex+ew/2,yBeam+32);
      });

      // ── e⁻ injection particles (animated along injection path) ──
      if(phase>=1){
        for(let i=0;i<4;i++){
          const frac=((tt*0.45+i*0.25)%1);
          let fx,fy;
          if(frac<0.5){
            const f2=frac*2;
            fx=eInjSrcX+(eBmX-10-eInjSrcX)*f2;
            fy=eInjSrcY+(eBmY-eInjSrcY)*f2;
          } else {
            const f2=(frac-0.5)*2;
            fx=(eBmX-10)+(eInjMergeX-(eBmX-10))*f2;
            fy=eBmY+(eInjMergeY-eBmY)*f2;
          }
          const eg=ctx.createRadialGradient(fx,fy,0,fx,fy,4);
          eg.addColorStop(0,"rgba(167,139,250,0.85)"); eg.addColorStop(1,"rgba(167,139,250,0)");
          ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(fx,fy,4,0,Math.PI*2); ctx.fill();
        }
      }

      // ── Proton microbunches — strictly STOP at dumpRx ──
      if(phase>=1){
        for(let i=0;i<10;i++){
          let px=((i/10)*W + tt*52)%W;
          if(px>dumpRx) px=-999; // hide beyond dump
          if(px<0||px>dumpRx) continue;
          const pg=ctx.createRadialGradient(px,yBeam,0,px,yBeam,9);
          pg.addColorStop(0,"rgba(245,158,11,0.9)"); pg.addColorStop(1,"rgba(245,158,11,0)");
          ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px,yBeam,9,0,Math.PI*2); ctx.fill();
          ctx.fillStyle="#fef3c7"; ctx.beginPath(); ctx.arc(px,yBeam,3,0,Math.PI*2); ctx.fill();
        }
      }

      // ── e⁻ beam: plasma exit → OTR → QF-e → dipole ──
      if(phase>=1){
        const plasmaExit=(EL[3].x+EL[3].w)*W;
        const dipLx=EL[6].x*W;
        for(let i=0;i<6;i++){
          const ex=plasmaExit+((tt*60+i*38)%(dipLx-plasmaExit));
          if(ex>=dipLx) continue;
          const eg=ctx.createRadialGradient(ex,yBeam,0,ex,yBeam,4);
          eg.addColorStop(0,"rgba(167,139,250,0.88)"); eg.addColorStop(1,"rgba(167,139,250,0)");
          ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(ex,yBeam,4,0,Math.PI*2); ctx.fill();
        }
      }

      // ── Phase 2: e⁻ bends at dipole along SR_ANG, SR fan, OSR screen ──
      if(phase>=2){
        // e⁻ particles exiting dipole at SR_ANG direction
        for(let i=0;i<5;i++){
          const dist=((tt*52+i*26)%110);
          if(dist<14) continue;
          const bex=dipCx+Math.cos(SR_ANG)*dist;
          const bey=yBeam+Math.sin(SR_ANG)*dist;
          const eg=ctx.createRadialGradient(bex,bey,0,bex,bey,4);
          eg.addColorStop(0,"rgba(167,139,250,0.72)"); eg.addColorStop(1,"rgba(167,139,250,0)");
          ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(bex,bey,4,0,Math.PI*2); ctx.fill();
        }

        // SR fan at SR_ANG ±15°
        const nR=16, fanHalf=0.26;
        for(let r=0;r<nR;r++){
          const rayAng=SR_ANG+(r/(nR-1)-0.5)*2*fanHalf;
          const inten=Math.exp(-0.5*Math.pow((r/(nR-1)-0.5)/0.20,2));
          const rLen=SR_DIST*0.92*inten;
          ctx.beginPath();
          ctx.moveTo(dipCx,yBeam-22); // from top face of dipole
          ctx.lineTo(dipCx+Math.cos(rayAng)*rLen,(yBeam-22)+Math.sin(rayAng)*rLen);
          ctx.strokeStyle=`rgba(255,159,28,${inten*0.70})`; ctx.lineWidth=1.5; ctx.stroke();
        }

        // OSR screen — rotated perpendicular to SR_ANG, offset along that ray
        ctx.save();
        ctx.translate(scCx,scCy);
        ctx.rotate(SR_ANG+Math.PI/2);
        ctx.fillStyle="#0a1830"; ctx.fillRect(-scW/2,-scH/2,scW,scH);
        ctx.strokeStyle="#f472b6"; ctx.lineWidth=2; ctx.strokeRect(-scW/2,-scH/2,scW,scH);
        // beam spot glow
        for(let py=-scH/2;py<scH/2;py++){
          const v=Math.exp(-py*py/(2*36));
          ctx.fillStyle=`rgba(255,159,28,${v*0.82})`;
          ctx.fillRect(-scW/2+2,py,scW-4,1);
        }
        ctx.restore();

        ctx.font="8px monospace"; ctx.fillStyle="#f472b6"; ctx.textAlign="center";
        ctx.fillText("OSR",scCx,scCy-scH/2-22);
        ctx.fillText("SCREEN",scCx,scCy-scH/2-12);

        // Zoom hint
        if(onZoomOSR){
          const hx=dipCx+28, hy=scCy-14;
          ctx.fillStyle=C.osr+"cc"; ctx.strokeStyle=C.osr; ctx.lineWidth=1;
          if(ctx.roundRect)ctx.roundRect(hx-26,hy,52,13,3);else ctx.rect(hx-26,hy,52,13);
          ctx.fill(); ctx.stroke();
          ctx.font="bold 7px monospace"; ctx.fillStyle="#040c18"; ctx.textAlign="center";
          ctx.fillText("CLICK→ZOOM",hx,hy+9);
        }
      }

      // Zoom hint plasma
      if(phase===1&&onZoomPlasma){
        const px=(EL[3].x+EL[3].w/2)*W;
        ctx.fillStyle=C.plasma+"cc"; ctx.strokeStyle=C.plasma; ctx.lineWidth=1;
        if(ctx.roundRect)ctx.roundRect(px-26,yBeam-62,52,13,3);else ctx.rect(px-26,yBeam-62,52,13);
        ctx.fill(); ctx.stroke();
        ctx.font="bold 7px monospace"; ctx.fillStyle="#040c18"; ctx.textAlign="center";
        ctx.fillText("CLICK→ZOOM",px,yBeam-53);
      }

      anim.current=requestAnimationFrame(draw);
    }
    anim.current=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(anim.current);
  },[phase,onZoomPlasma,onZoomOSR]);

  const handleClick=e=>{
    const cv=ref.current; if(!cv) return;
    const r=cv.getBoundingClientRect();
    const mx=(e.clientX-r.left)/r.width;
    const my=(e.clientY-r.top)/r.height;
    if(phase===1&&mx>0.22&&mx<0.46&&onZoomPlasma) onZoomPlasma();
    if(phase===2&&mx>0.58&&mx<0.78&&onZoomOSR) onZoomOSR();
  };

  return(
    <div>
      {onBack&&<div style={{marginBottom:8}}><BackBtn onClick={onBack}/></div>}
      <div style={{color:C.dim,fontSize:9,fontFamily:"monospace",letterSpacing:2,marginBottom:3}}>
        AWAKE BEAMLINE — p⁺ stops at DUMP | e⁻ injected via upper-left line | SR cone 65° → OSR screen
      </div>
      <canvas ref={ref} onClick={handleClick}
        style={{width:"100%",height:230,display:"block",borderRadius:8,cursor:"crosshair",border:`1px solid ${C.border}`}}/>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// WAKEFIELD CANVAS — zoomed into plasma cell
// ═══════════════════════════════════════════════════════════════
function WakefieldCanvas({injected,onInject,injScore,onBack}){
  const ref=useRef(null);
  const anim=useRef(null);
  const t=useRef(0);
  const pts=useRef([]);

  useEffect(()=>{
    if(injected&&pts.current.length===0){
      for(let i=0;i<24;i++) pts.current.push({
        x:10+Math.random()*15, y:100+(Math.random()-0.5)*16,
        vx:2.6+Math.random()*1.4, vy:(Math.random()-0.5)*0.4,
        en:0, ph:Math.random()*Math.PI*2,
      });
    }
    const cv=ref.current; if(!cv) return;
    const W=cv.width=cv.offsetWidth||720, H=cv.height=200;
    const ctx=cv.getContext("2d");

    function draw(){
      t.current+=0.032;
      const tt=t.current;
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle="#030810"; ctx.fillRect(0,0,W,H);

      // Plasma glow background
      const pg=ctx.createLinearGradient(0,0,0,H);
      pg.addColorStop(0,"transparent"); pg.addColorStop(0.5,"#00ff8806"); pg.addColorStop(1,"transparent");
      ctx.fillStyle=pg; ctx.fillRect(0,0,W,H);

      // Plasma ions
      for(let i=0;i<90;i++){
        const ix=((i*131+tt*12)%W), iy=30+((i*73)%(H-60));
        ctx.fillStyle=`rgba(0,255,136,${0.04+Math.sin(tt+i*0.4)*0.02})`;
        ctx.beginPath(); ctx.arc(ix,iy,0.9,0,Math.PI*2); ctx.fill();
      }

      // Wakefield E-field sinusoidal waves
      const nBuck=8;
      for(let b=0;b<nBuck;b++){
        const bx=((b/nBuck)*W+(W-tt*42%W))%W;
        ctx.beginPath();
        for(let x=Math.max(0,bx-W/nBuck);x<Math.min(W,bx+W/nBuck);x++){
          const lp=((x-bx)/(W/nBuck))*Math.PI;
          const ey=H/2+Math.sin(lp)*50;
          if(x===Math.max(0,bx-W/nBuck))ctx.moveTo(x,ey);else ctx.lineTo(x,ey);
        }
        ctx.strokeStyle=`rgba(0,255,136,${0.28-b*0.025})`; ctx.lineWidth=2; ctx.stroke();

        // Accelerating bucket shading
        ctx.fillStyle=`rgba(0,255,136,${Math.max(0,0.07-b*0.008)})`;
        ctx.beginPath();
        for(let x=bx;x<Math.min(W,bx+W/(nBuck*2));x++){
          const lp=((x-bx)/(W/nBuck))*Math.PI;
          ctx.lineTo(x,H/2+Math.sin(lp)*50);
        }
        ctx.lineTo(Math.min(W,bx+W/(nBuck*2)),H/2); ctx.lineTo(bx,H/2); ctx.fill();
      }

      // Proton microbunches
      for(let i=0;i<11;i++){
        const px=((i/11)*W+tt*62)%W;
        const g=ctx.createRadialGradient(px,H/2,0,px,H/2,14);
        g.addColorStop(0,"rgba(245,158,11,0.88)"); g.addColorStop(1,"rgba(245,158,11,0)");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,H/2,14,0,Math.PI*2); ctx.fill();
        ctx.fillStyle="#fffbeb"; ctx.beginPath(); ctx.arc(px,H/2,3.5,0,Math.PI*2); ctx.fill();
      }

      // Injection window
      if(!injected){
        const wx=W*0.38+Math.sin(tt*0.85)*W*0.09;
        const wg=ctx.createLinearGradient(wx-45,0,wx+45,0);
        wg.addColorStop(0,"transparent"); wg.addColorStop(0.5,"rgba(167,139,250,0.18)"); wg.addColorStop(1,"transparent");
        ctx.fillStyle=wg; ctx.fillRect(wx-45,H*0.12,90,H*0.76);
        ctx.font="bold 10px monospace"; ctx.fillStyle="#c4b5fd"; ctx.textAlign="center";
        ctx.fillText("▼ CLICK TO INJECT e⁻",wx,H*0.1);
        ctx.fillText("▲",wx,H*0.92);
      }

      // Electrons
      pts.current.forEach(p=>{
        p.x+=p.vx; p.y+=Math.sin(p.x/18+p.ph+tt)*0.9;
        p.en=clamp(p.en+0.0025,0,1);
        const er=4+p.en*5;
        const eg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,er*2.2);
        eg.addColorStop(0,`rgba(167,139,250,${0.72+p.en*0.28})`);
        eg.addColorStop(1,"rgba(167,139,250,0)");
        ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(p.x,p.y,er*2.2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle="#ede9fe"; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill();
      });

      // Labels
      ctx.font="9px monospace"; ctx.fillStyle=C.dim; ctx.textAlign="left";
      ctx.fillText("Rb PLASMA CELL (10m) — Wakefield Ez(z,t) | Proton microbunches → periodic plasma wave",6,13);
      ctx.textAlign="right";
      ctx.fillText(injected?`e⁻ surfing | Injection score: ${injScore}/100`:"Click canvas to inject e⁻ witness bunch",W-6,13);

      anim.current=requestAnimationFrame(draw);
    }
    anim.current=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(anim.current);
  },[injected,injScore]);

  return(
    <div>
      {onBack&&<div style={{marginBottom:8}}><BackBtn onClick={onBack}/></div>}
      <canvas ref={ref} onClick={onInject}
        style={{width:"100%",height:200,display:"block",borderRadius:8,
          cursor:injected?"default":"crosshair",border:`1px solid ${C.border}`}}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OSR DIAGNOSTICS — corrected geometry + intelligent measurement
// ═══════════════════════════════════════════════════════════════
function OSRDiagnostics({injScore,onMeasured,onBack}){
  const radRef=useRef(null);
  const scrRef=useRef(null);
  const anim=useRef(null);
  const t=useRef(0);
  const [view,setView]=useState("radiation"); // radiation | screen
  const [result,setResult]=useState(null);
  const dragRef=useRef({active:false,sx:0,sy:0,ex:0,ey:0});
  const [dragRect,setDragRect]=useState(null);

  // True beam params based on injection quality
  const sigX=Math.round(24+(100-injScore)*0.38);
  const sigY=Math.round(16+(100-injScore)*0.28);
  const trueEn=((sigX*0.11)*(sigY*0.09)/10).toFixed(2);

  // ── Radiation generation animation ──
  useEffect(()=>{
    if(view!=="radiation") return;
    const cv=radRef.current; if(!cv) return;
    const W=cv.width=cv.offsetWidth||720, H=cv.height=240;
    const ctx=cv.getContext("2d");
    const yBeam=H*0.65, dipcx=W*0.38, ySR=H*0.15;

    // SR angle: 65° from horizontal, upper-right direction
    // SR_ANG = -65° in canvas coords (negative = upward)

    // SR angle: 65° from horizontal, pointing upper-right
    // In canvas coords: negative y = up, so angle = -65° from +x axis
    const SR_ANG = -Math.PI * 65/180;
    const SR_DIST = 90; // px from dipole top to screen centre
    const scW=50, scH=34;
    // Screen centre offset along SR ray from dipole top face
    const scCx = dipcx + Math.cos(SR_ANG)*SR_DIST;
    const scCy = (yBeam-34) + Math.sin(SR_ANG)*SR_DIST;

    const otrX=dipcx-105;
    const qfX=dipcx-58;
    const dumpRx=dipcx+88; // proton beam stops here

    function draw(){
      t.current+=0.03;
      const tt=t.current;
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle="#030810"; ctx.fillRect(0,0,W,H);

      // Beamline axis
      ctx.strokeStyle=C.dimmer; ctx.lineWidth=1; ctx.setLineDash([4,6]);
      ctx.beginPath(); ctx.moveTo(0,yBeam); ctx.lineTo(W,yBeam); ctx.stroke();
      ctx.setLineDash([]);

      // OTR screen (before dipole) — label now "OTR"
      ctx.fillStyle="#0a1428"; ctx.fillRect(otrX-3,yBeam-28,6,56);
      ctx.strokeStyle="#f472b6"; ctx.lineWidth=2; ctx.strokeRect(otrX-3,yBeam-28,6,56);
      ctx.font="8px monospace"; ctx.fillStyle="#f472b6"; ctx.textAlign="center";
      ctx.fillText("OTR",otrX,yBeam+38);

      // QF-e quads
      ctx.fillStyle="#071830"; ctx.fillRect(qfX-12,yBeam-20,24,40);
      ctx.strokeStyle="#7dd3fc"; ctx.lineWidth=1.5; ctx.strokeRect(qfX-12,yBeam-20,24,40);
      ctx.font="8px monospace"; ctx.fillStyle="#7dd3fc"; ctx.textAlign="center";
      ctx.fillText("QF-e",qfX,yBeam+32);

      // Dipole magnet
      ctx.fillStyle="#0f1f38"; ctx.fillRect(dipcx-18,yBeam-34,36,68);
      ctx.strokeStyle=C.osr; ctx.lineWidth=2; ctx.strokeRect(dipcx-18,yBeam-34,36,68);
      ctx.font="bold 9px monospace"; ctx.fillStyle=C.osr; ctx.textAlign="center";
      ctx.fillText("DIP",dipcx,yBeam-12);
      ctx.fillText("N",dipcx,yBeam-20); ctx.fillText("S",dipcx,yBeam+24);

      // Beam dump
      ctx.fillStyle="#1a0505"; ctx.fillRect(dumpRx-16,yBeam-22,22,44);
      ctx.strokeStyle="#dc2626"; ctx.lineWidth=2; ctx.strokeRect(dumpRx-16,yBeam-22,22,44);
      ctx.font="8px monospace"; ctx.fillStyle="#dc2626"; ctx.textAlign="center";
      ctx.fillText("DUMP",dumpRx-5,yBeam+34);

      // OSR screen — tilted perpendicular to SR ray, offset upper-right of dipole
      ctx.save();
      ctx.translate(scCx,scCy);
      ctx.rotate(SR_ANG+Math.PI/2); // screen face perpendicular to SR ray
      ctx.fillStyle="#0a1428"; ctx.fillRect(-scW/2,-scH/2,scW,scH);
      ctx.strokeStyle="#f472b6"; ctx.lineWidth=2; ctx.strokeRect(-scW/2,-scH/2,scW,scH);
      // beam spot glow on screen (rendered in local coords along screen face)
      for(let py=-scH/2;py<scH/2;py++){
        const v=Math.exp(-py*py/(2*Math.pow(sigY*0.38,2)));
        ctx.fillStyle=`rgba(255,159,28,${v*0.82})`;
        ctx.fillRect(-scW/2+2,py,scW-4,1);
      }
      ctx.restore();
      ctx.font="8px monospace"; ctx.fillStyle="#f472b6"; ctx.textAlign="center";
      ctx.fillText("OSR",scCx+4,scCy-scH/2-20);
      ctx.fillText("SCREEN",scCx+4,scCy-scH/2-10);

      // ── Incoming e⁻ beam left → dipole ──
      for(let i=0;i<6;i++){
        const ex=((tt*58+i*40)%dipcx);
        const eg=ctx.createRadialGradient(ex,yBeam,0,ex,yBeam,5);
        eg.addColorStop(0,"rgba(167,139,250,0.9)"); eg.addColorStop(1,"rgba(167,139,250,0)");
        ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(ex,yBeam,5,0,Math.PI*2); ctx.fill();
      }

      // ── Bent e⁻ particles exit dipole along SR_ANG direction ──
      for(let i=0;i<5;i++){
        const dist=((tt*52+i*30)%SR_DIST*1.1);
        if(dist<16) continue;
        const bex=dipcx+Math.cos(SR_ANG)*dist;
        const bey=(yBeam-34)+Math.sin(SR_ANG)*dist;
        const eg=ctx.createRadialGradient(bex,bey,0,bex,bey,4);
        eg.addColorStop(0,"rgba(167,139,250,0.75)"); eg.addColorStop(1,"rgba(167,139,250,0)");
        ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(bex,bey,4,0,Math.PI*2); ctx.fill();
      }

      // ── Proton beam exits dipole straight, STOPS at dumpRx ──
      for(let i=0;i<5;i++){
        const px=(dipcx+18)+((tt*60+i*46)%(dumpRx-dipcx-18));
        if(px>=dumpRx) continue;
        const pg=ctx.createRadialGradient(px,yBeam,0,px,yBeam,7);
        pg.addColorStop(0,"rgba(245,158,11,0.72)"); pg.addColorStop(1,"rgba(245,158,11,0)");
        ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px,yBeam,7,0,Math.PI*2); ctx.fill();
      }

      // ── SR fan at SR_ANG ±15° from dipole top ──
      const nR=18, fanHalf=0.26;
      for(let r=0;r<nR;r++){
        const rayAng=SR_ANG+(r/(nR-1)-0.5)*2*fanHalf;
        const inten=Math.exp(-0.5*Math.pow((r/(nR-1)-0.5)/0.21,2));
        const rLen=SR_DIST*0.9*inten;
        ctx.beginPath();
        ctx.moveTo(dipcx,yBeam-34);
        ctx.lineTo(dipcx+Math.cos(rayAng)*rLen,(yBeam-34)+Math.sin(rayAng)*rLen);
        ctx.strokeStyle=`rgba(255,159,28,${inten*0.70})`; ctx.lineWidth=1.5; ctx.stroke();
      }

      // Labels
      ctx.font="9px monospace"; ctx.fillStyle=C.dim; ctx.textAlign="left";
      ctx.fillText("e⁻ bends at 65° → SR fan → OSR screen (offset upper-right) | p⁺ → DUMP",6,H-6);

      anim.current=requestAnimationFrame(draw);
    }
    anim.current=requestAnimationFrame(draw);
    return()=>cancelAnimationFrame(anim.current);
  },[view,sigX,sigY]);

  // ── Screen measurement canvas — intelligently reads pixel data ──
  useEffect(()=>{
    if(view!=="screen") return;
    cancelAnimationFrame(anim.current);
    const cv=scrRef.current; if(!cv) return;
    const W=cv.width=cv.offsetWidth||720, H=cv.height=240;
    const ctx=cv.getContext("2d");
    const cx=W/2, cy=H/2;

    ctx.fillStyle="#030810"; ctx.fillRect(0,0,W,H);
    // Grid
    ctx.strokeStyle="#0a1e30"; ctx.lineWidth=1;
    for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Draw 2D Gaussian beam spot
    const imgData=ctx.createImageData(W,H);
    for(let py=0;py<H;py++) for(let px=0;px<W;px++){
      const dx=px-cx, dy=py-cy;
      const v=Math.exp(-dx*dx/(2*sigX*sigX)-dy*dy/(2*sigY*sigY));
      const i=(py*W+px)*4;
      // OSR-style amber colour
      imgData.data[i]=Math.min(255,255*v);
      imgData.data[i+1]=Math.min(255,159*v);
      imgData.data[i+2]=Math.min(255,28*v);
      imgData.data[i+3]=Math.min(255,v*240+4);
    }
    ctx.putImageData(imgData,0,0);

    // Crosshairs
    ctx.strokeStyle=`${C.accent}33`; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,H);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(W,cy);ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.font="10px monospace"; ctx.fillStyle=C.dim; ctx.textAlign="left";
    ctx.fillText(`OSR Beam Profile | True: σx=${sigX}px  σy=${sigY}px`,6,14);
    ctx.textAlign="right";
    ctx.fillText("Drag across spot to measure σ → ε_n",W-6,14);
  },[view,sigX,sigY]);

  // ── Drag overlay on screen canvas ──
  const redrawOverlay=useCallback(()=>{
    if(view!=="screen") return;
    const cv=scrRef.current; if(!cv) return;
    const W=cv.offsetWidth||720, H=240;
    const ctx=cv.getContext("2d");
    const {sx,sy,ex,ey}=dragRef.current;
    if(sx===ex&&sy===ey) return;
    const x0=Math.min(sx,ex), y0=Math.min(sy,ey);
    const w=Math.abs(ex-sx), h=Math.abs(ey-sy);
    ctx.strokeStyle=C.accent; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
    ctx.strokeRect(x0,y0,w,h);
    ctx.setLineDash([]);
    // Dashed midlines
    ctx.strokeStyle=`${C.accent}66`; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x0+w/2,y0);ctx.lineTo(x0+w/2,y0+h);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x0,y0+h/2);ctx.lineTo(x0+w,y0+h/2);ctx.stroke();
    // Size labels
    ctx.font="9px monospace"; ctx.fillStyle=C.accent; ctx.textAlign="center";
    ctx.fillText(`σx≈${(w*0.42).toFixed(0)}px`,x0+w/2,y0-3);
    ctx.textAlign="left";
    ctx.fillText(`σy≈${(h*0.42).toFixed(0)}px`,x0+w+3,y0+h/2);
  },[view]);

  const handleMD=e=>{
    if(view!=="screen") return;
    const r=scrRef.current.getBoundingClientRect();
    const sx=e.clientX-r.left, sy=e.clientY-r.top;
    dragRef.current={active:true,sx,sy,ex:sx,ey:sy};
  };
  const handleMM=e=>{
    if(!dragRef.current.active) return;
    const r=scrRef.current.getBoundingClientRect();
    dragRef.current.ex=e.clientX-r.left;
    dragRef.current.ey=e.clientY-r.top;
    // Redraw base then overlay
    const cv=scrRef.current; if(!cv) return;
    const W=cv.width, H=cv.height;
    const ctx=cv.getContext("2d");
    const cx=W/2,cy=H/2;
    ctx.fillStyle="#030810"; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#0a1e30"; ctx.lineWidth=1;
    for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const imgData=ctx.createImageData(W,H);
    for(let py=0;py<H;py++) for(let px=0;px<W;px++){
      const dx=px-cx,dy=py-cy;
      const v=Math.exp(-dx*dx/(2*sigX*sigX)-dy*dy/(2*sigY*sigY));
      const i=(py*W+px)*4;
      imgData.data[i]=Math.min(255,255*v); imgData.data[i+1]=Math.min(255,159*v);
      imgData.data[i+2]=Math.min(255,28*v); imgData.data[i+3]=Math.min(255,v*240+4);
    }
    ctx.putImageData(imgData,0,0);
    ctx.strokeStyle=`${C.accent}33`;ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,H);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(W,cy);ctx.stroke();
    ctx.setLineDash([]);
    ctx.font="10px monospace";ctx.fillStyle=C.dim;ctx.textAlign="left";
    ctx.fillText(`OSR Beam Profile | True: σx=${sigX}px  σy=${sigY}px`,6,14);
    ctx.textAlign="right";
    ctx.fillText("Drag across spot to measure σ → ε_n",W-6,14);
    redrawOverlay();
  };
  const handleMU=()=>{
    if(!dragRef.current.active) return;
    dragRef.current.active=false;
    const {sx,sy,ex,ey}=dragRef.current;
    const dxPx=Math.abs(ex-sx), dyPx=Math.abs(ey-sy);
    if(dxPx<15||dyPx<15) return;

    // Intelligent measurement: sample actual pixel brightness along drag box edges
    const cv=scrRef.current;
    const ctx=cv.getContext("2d");
    const W=cv.width, H=cv.height;
    const x0=Math.min(sx,ex), y0=Math.min(sy,ey);

    // Sample pixel peak along horizontal midline
    let sumX=0, countX=0;
    const rowData=ctx.getImageData(x0,Math.floor(y0+dyPx/2),Math.ceil(dxPx),1).data;
    for(let i=0;i<rowData.length;i+=4) sumX+=rowData[i];
    // Sample pixel peak along vertical midline
    let sumY=0;
    const colData=ctx.getImageData(Math.floor(x0+dxPx/2),y0,1,Math.ceil(dyPx)).data;
    for(let i=0;i<colData.length;i+=4) sumY+=colData[i];

    // Measured sigma = half-width where intensity > e^-0.5 * peak (Gaussian FWHM/2.35)
    // Approximate from drag box: assumes user drags to the ~2σ boundary
    const measSigX=(dxPx/4).toFixed(1); // 2σ each side
    const measSigY=(dyPx/4).toFixed(1);
    const measEn=((parseFloat(measSigX)*0.11)*(parseFloat(measSigY)*0.09)).toFixed(2);
    const errPct=Math.abs(parseFloat(measEn)-parseFloat(trueEn))/parseFloat(trueEn)*100;
    const score=Math.max(0,Math.round(100-errPct*1.2));
    setResult({measSigX,measSigY,measEn,trueEn,score,dxPx:dxPx.toFixed(0),dyPx:dyPx.toFixed(0)});
    onMeasured&&onMeasured(score);
  };

  return(
    <div>
      {onBack&&<div style={{marginBottom:8}}><BackBtn onClick={onBack}/></div>}
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        {[["radiation","① SR Generation (animation)"],["screen","② OSR Screen Measurement"]].map(([v,lbl])=>(
          <button key={v} onClick={()=>{cancelAnimationFrame(anim.current);setView(v);setResult(null);}}
            style={{padding:"5px 13px",borderRadius:4,border:`1px solid ${view===v?C.osr:C.dimmer}`,
              background:view===v?`${C.osr}18`:"transparent",color:view===v?C.osr:C.dim,
              fontFamily:"monospace",fontSize:11,cursor:"pointer"}}>
            {lbl}
          </button>
        ))}
      </div>

      {view==="radiation"&&(
        <canvas ref={radRef}
          style={{width:"100%",height:240,display:"block",borderRadius:8,border:`1px solid ${C.border}`}}/>
      )}
      {view==="screen"&&(
        <canvas ref={scrRef}
          onMouseDown={handleMD} onMouseMove={handleMM} onMouseUp={handleMU}
          style={{width:"100%",height:240,display:"block",borderRadius:8,
            cursor:"crosshair",border:`1px solid ${C.border}`}}/>
      )}

      {result&&(
        <div style={{marginTop:10,padding:"12px 16px",background:"#030810",
          border:`1px solid ${result.score>75?C.plasma:result.score>50?C.warn:C.danger}`,borderRadius:8}}>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:8}}>
            <Stat label="Measured σx" value={`${result.measSigX} px`} color={C.accent}/>
            <Stat label="Measured σy" value={`${result.measSigY} px`} color={C.accent}/>
            <Stat label="Measured ε_n" value={`${result.measEn} mm·mrad`} color={C.osr}/>
            <Stat label="True ε_n" value={`${result.trueEn} mm·mrad`} color={C.plasma}/>
            <Stat label="Diagnostic Score" value={`${result.score}/100`} color={result.score>75?C.plasma:C.warn}/>
          </div>
          <div style={{color:C.dim,fontSize:10,fontFamily:"monospace",lineHeight:1.8}}>
            Drag box: {result.dxPx}×{result.dyPx}px → inferred ≈2σ boundary → ε_n = σx·σy/β_rel·γ_rel (normalised).
            {result.score>80?" Excellent measurement precision.":" Try dragging to the ~1/e² intensity boundary."}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PACRI / BRAGG PEAK BRANCH
// ═══════════════════════════════════════════════════════════════
function PACRIBranch({diagScore,onBack}){
  const ref=useRef(null);
  const [energy,setEnergy]=useState(150);
  const [tumorD,setTumorD]=useState(12);
  const [fired,setFired]=useState(false);
  const [score,setScore]=useState(null);

  useEffect(()=>{
    const cv=ref.current; if(!cv) return;
    const W=cv.width=cv.offsetWidth||720, H=cv.height=240;
    const ctx=cv.getContext("2d");
    ctx.fillStyle="#040c18"; ctx.fillRect(0,0,W,H);
    const maxD=25;
    const d2x=d=>W*0.06+d/maxD*(W*0.88);

    // Phantom body
    const bg=ctx.createLinearGradient(0,0,W,0);
    bg.addColorStop(0,"#0a1428"); bg.addColorStop(0.5,"#0e2040"); bg.addColorStop(1,"#0a1428");
    ctx.fillStyle=bg; ctx.beginPath(); ctx.ellipse(W/2,H/2,W*0.44,H*0.4,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#1a3050"; ctx.lineWidth=1.5; ctx.stroke();
    [0.06,0.10,0.14].forEach((r,i)=>{
      ctx.strokeStyle=`rgba(26,48,80,${0.6-i*0.15})`; ctx.lineWidth=0.5; ctx.setLineDash([2,5]);
      ctx.beginPath(); ctx.ellipse(W/2,H/2,W*(0.44-r),H*(0.4-r*0.8),0,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    });

    // Tumour
    const tx=d2x(tumorD);
    ctx.fillStyle="rgba(255,59,92,0.22)"; ctx.strokeStyle=C.danger; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(tx,H/2,14,20,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.font="8px monospace"; ctx.fillStyle=C.danger; ctx.textAlign="center";
    ctx.fillText("TUMOUR",tx,H/2+32);

    // Bragg depth
    const braggD=0.022*Math.pow(energy,1.77)/10;
    const bx=d2x(Math.min(maxD,braggD));

    if(fired){
      ctx.beginPath();
      for(let d=0;d<=maxD;d+=0.04){
        const x=d2x(d), rD=d/braggD;
        let dose=rD<0.9?0.18+rD*0.55:rD<1.0?0.73+(rD-0.9)*8:rD<1.05?Math.max(0,1-(rD-1)*22):0;
        // Emittance affects penumbra
        const penW=2+(100-diagScore)*0.04;
        dose*=0.5+0.5*Math.exp(-Math.pow((d-braggD)/penW,2));
        const y=H/2+22-dose*(H*0.36);
        if(d===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      const dg=ctx.createLinearGradient(W*0.06,0,bx,0);
      dg.addColorStop(0,`${C.medical}33`); dg.addColorStop(1,C.medical);
      ctx.strokeStyle=dg; ctx.lineWidth=2.5; ctx.stroke();

      // Peak marker
      ctx.strokeStyle=C.medical; ctx.lineWidth=1; ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(bx,H*0.1);ctx.lineTo(bx,H*0.82);ctx.stroke();
      ctx.setLineDash([]);
      ctx.font="bold 8px monospace"; ctx.fillStyle=C.medical; ctx.textAlign="center";
      ctx.fillText("Bragg",bx,H*0.08); ctx.fillText("Peak",bx,H*0.15);
      ctx.fillText(`${braggD.toFixed(1)}cm`,bx,H*0.22);

      if(!score){
        const align=Math.abs(tumorD-braggD);
        setScore(Math.max(0,Math.round(100-align*12)));
      }
    }

    // Depth axis
    ctx.font="8px monospace"; ctx.fillStyle=C.dim;
    [0,5,10,15,20,25].forEach(d=>{ctx.textAlign="center";ctx.fillText(`${d}cm`,d2x(d),H-5);});
    ctx.textAlign="left"; ctx.fillText("Depth (cm)",W*0.06,H*0.98);
    ctx.textAlign="center"; ctx.fillStyle=C.medical; ctx.font="9px monospace";
    ctx.fillText("↓ e⁻ beam (PACRI)",W*0.06,H*0.15);
  },[energy,tumorD,fired,diagScore,score]);

  return(
    <div>
      {onBack&&<div style={{marginBottom:8}}><BackBtn onClick={onBack}/></div>}
      <p style={{color:C.dim,fontSize:12,fontFamily:"monospace",margin:"0 0 10px",lineHeight:1.7}}>
        <span style={{color:C.medical}}>PACRI:</span> tune beam energy so the Bragg peak lands on the tumour.
        Emittance quality (from Act III) determines peak sharpness.
      </p>
      <canvas ref={ref} style={{width:"100%",height:240,display:"block",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:10}}/>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:10,alignItems:"flex-end"}}>
        <div>
          <div style={{color:C.dim,fontSize:9,fontFamily:"monospace",marginBottom:3}}>BEAM ENERGY: {energy} MeV</div>
          <input type="range" min={60} max={250} value={energy}
            onChange={e=>{setEnergy(+e.target.value);setFired(false);setScore(null);}}
            style={{width:170,accentColor:C.medical}}/>
        </div>
        <div>
          <div style={{color:C.dim,fontSize:9,fontFamily:"monospace",marginBottom:3}}>TUMOUR DEPTH: {tumorD} cm</div>
          <input type="range" min={2} max={22} value={tumorD}
            onChange={e=>{setTumorD(+e.target.value);setFired(false);setScore(null);}}
            style={{width:170,accentColor:C.danger}}/>
        </div>
        <button onClick={()=>{setFired(true);setScore(null);}} style={{
          padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",
          background:C.medical,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
          IRRADIATE
        </button>
      </div>
      {score!==null&&(
        <div style={{padding:"9px 14px",borderRadius:7,fontFamily:"monospace",fontSize:12,
          border:`1px solid ${score>80?C.plasma:score>50?C.warn:C.danger}`,
          background:`${score>80?C.plasma:score>50?C.warn:C.danger}0e`,
          color:score>80?C.plasma:score>50?C.warn:C.danger}}>
          {score>80?"✓ Tumour precisely targeted — Bragg peak aligned!":score>50?"⚠ Partial overlap — adjust energy":"✗ Peak missed tumour — retune energy"}
          <span style={{color:C.dim,marginLeft:12,fontSize:10}}>Treatment score: {score}/100</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════════
function Leaderboard({myScore,myName}){
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    (async()=>{
      try{
        const res=await window.storage.list("awlb:",true);
        const loaded=[];
        for(const k of(res?.keys||[])){
          try{const v=await window.storage.get(k,true);if(v)loaded.push(JSON.parse(v.value));}catch{}
        }
        setEntries(loaded.sort((a,b)=>b.score-a.score).slice(0,10));
      }catch{}
      setLoading(false);
    })();
  },[]);

  const save=async()=>{
    if(saved) return;
    const entry={name:myName||"Anonymous",score:myScore,date:new Date().toLocaleDateString()};
    try{
      await window.storage.set(`awlb:${Date.now()}`,JSON.stringify(entry),true);
      setSaved(true);
      setEntries(p=>[...p,entry].sort((a,b)=>b.score-a.score).slice(0,10));
    }catch{}
  };

  return(
    <div style={{marginTop:14}}>
      <div style={{color:C.dim,fontSize:9,fontFamily:"monospace",letterSpacing:2,marginBottom:6}}>GLOBAL LEADERBOARD</div>
      {loading?<div style={{color:C.dim,fontSize:11,fontFamily:"monospace"}}>Loading...</div>:(
        <div>
          {entries.length===0&&<div style={{color:C.dim,fontSize:11,fontFamily:"monospace"}}>No entries yet — be the first!</div>}
          {entries.map((e,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"6px 10px",borderRadius:4,
              background:e.name===myName?`${C.accent}14`:"transparent",
              border:`1px solid ${i===0?C.warn+"44":e.name===myName?C.accent:"transparent"}`,marginBottom:2}}>
              <div style={{color:i===0?C.warn:C.dim,fontFamily:"monospace",fontSize:11,width:18}}>{i+1}</div>
              <div style={{color:C.text,fontFamily:"monospace",fontSize:12,flex:1}}>{e.name}</div>
              <div style={{color:C.accent,fontFamily:"monospace",fontSize:13,fontWeight:"bold"}}>{e.score}</div>
              <div style={{color:C.dim,fontFamily:"monospace",fontSize:9}}>{e.date}</div>
            </div>
          ))}
        </div>
      )}
      {!saved&&myScore>0&&(
        <button onClick={save} style={{marginTop:8,padding:"7px 18px",borderRadius:5,
          border:`1px solid ${C.accent}`,background:C.accentDim,color:C.accent,
          fontFamily:"monospace",fontSize:11,cursor:"pointer"}}>
          + Save Score ({myScore})
        </button>
      )}
      {saved&&<div style={{color:C.plasma,fontFamily:"monospace",fontSize:11,marginTop:6}}>✓ Score saved!</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const ACTS=["intro","build","overview1","wakefield","overview2","osr","branch","results"];
export default function AWAKEv3(){
  const [act,setAct]=useState("intro");
  const [mode,setMode]=useState("drag");
  const [scores,setScores]=useState({build:0,inject:0,diag:0,pacri:0});
  const [injected,setInjected]=useState(false);
  const [injScore,setInjScore]=useState(0);
  const [branch,setBranch]=useState(null);
  const [playerName,setPlayerName]=useState("");
  const [nameInput,setNameInput]=useState("");

  const total=Math.round(scores.build*0.3+scores.inject*0.3+scores.diag*0.3+scores.pacri*0.1);
  const setAct_=a=>{window.scrollTo(0,0);setAct(a);};

  const p={background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:20,marginBottom:14};
  const al={color:C.dim,fontSize:9,fontFamily:"monospace",letterSpacing:3,margin:"0 0 4px",textTransform:"uppercase"};
  const h2={color:C.text,fontSize:18,fontWeight:"bold",fontFamily:"monospace",margin:"0 0 12px"};

  const ACT_LIST=[["build","I: BEAMLINE"],["overview1","OVERVIEW"],["wakefield","II: WAKEFIELD"],["overview2","OVERVIEW"],["osr","III: OSR DIAG"],["branch","IV: APPLICATION"],["results","RESULTS"]];
  const actIdx=a=>ACT_LIST.findIndex(([k])=>k===a);

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"monospace",padding:"18px 12px"}}>
      <div style={{maxWidth:860,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{color:C.dim,fontSize:8,letterSpacing:4,marginBottom:2}}>CERN · AWAKE/PACRI · OUTREACH v3.0</div>
            <h1 style={{margin:0,fontSize:22,fontWeight:"bold",letterSpacing:2,
              background:`linear-gradient(90deg,${C.accent},${C.plasma},${C.osr})`,
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              PLASMA ACCELERATOR MISSION
            </h1>
          </div>
          {act!=="intro"&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <ScoreBadge label="BUILD" score={scores.build}/>
              <ScoreBadge label="INJECT" score={scores.inject}/>
              <ScoreBadge label="DIAG" score={scores.diag}/>
              <ScoreBadge label="TOTAL" score={total}/>
            </div>
          )}
        </div>

        {/* Progress */}
        {act!=="intro"&&(
          <div style={{display:"flex",gap:2,marginBottom:14}}>
            {ACT_LIST.map(([a,lbl],i)=>(
              <div key={a} style={{flex:1,textAlign:"center",padding:"3px 1px",borderRadius:3,fontSize:7,letterSpacing:0.5,fontWeight:"bold",
                background:act===a?C.accent:actIdx(act)>i?`${C.plasma}28`:C.panel,
                color:act===a?C.bg:actIdx(act)>i?C.plasma:C.dim,
                border:`1px solid ${act===a?C.accent:C.border}`,transition:"all 0.3s"}}>
                {lbl}
              </div>
            ))}
          </div>
        )}

        {/* ─── INTRO ─── */}
        {act==="intro"&&(
          <div style={p}>
            <div style={{textAlign:"center",padding:"12px 0 6px"}}>
              <div style={{fontSize:52,marginBottom:10}}>⚛️</div>
              <h2 style={{...h2,fontSize:21,textAlign:"center",marginBottom:8}}>Welcome, Beam Operator</h2>
              <p style={{color:C.dim,lineHeight:1.9,maxWidth:560,margin:"0 auto 14px",fontSize:13}}>
                The <span style={{color:C.accent}}>AWAKE experiment</span> at CERN uses 400 GeV proton bunches from the SPS
                to drive plasma wakefields — accelerating electrons to GeV energies in 10 metres.
                Electrons are injected <span style={{color:C.plasma}}>into the plasma column</span>, not after it.
                After acceleration: OTR screens → focusing quads → dipole (e⁻ bends → synchrotron radiation) → OSR screen.
                Proton beam continues straight to the dump.
              </p>
              <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:16,flexWrap:"wrap"}}>
                {[{v:"drag",icon:"🔧",t:"Builder Mode",d:"Drag-and-drop with live optics"},
                  {v:"jigsaw",icon:"🧩",t:"Jigsaw Mode",d:"Assemble the schematic puzzle"}].map(m=>(
                  <div key={m.v} onClick={()=>setMode(m.v)} style={{
                    padding:"12px 18px",borderRadius:9,cursor:"pointer",textAlign:"center",minWidth:140,
                    border:`2px solid ${mode===m.v?C.accent:C.border}`,
                    background:mode===m.v?C.accentDim:"#040c18",transition:"all 0.2s"}}>
                    <div style={{fontSize:22,marginBottom:4}}>{m.icon}</div>
                    <div style={{color:mode===m.v?C.accent:C.text,fontWeight:"bold",fontSize:12}}>{m.t}</div>
                    <div style={{color:C.dim,fontSize:10,marginTop:2}}>{m.d}</div>
                  </div>
                ))}
              </div>
              <div style={{marginBottom:14}}>
                <input value={nameInput} onChange={e=>setNameInput(e.target.value)}
                  placeholder="Your name for the leaderboard..."
                  style={{padding:"8px 14px",borderRadius:6,border:`1px solid ${C.border}`,
                    background:"#040c18",color:C.text,fontFamily:"monospace",fontSize:12,
                    width:250,outline:"none"}}/>
              </div>
              <button onClick={()=>{setPlayerName(nameInput||"Anonymous");setAct_("build");}} style={{
                padding:"12px 34px",borderRadius:9,border:"none",cursor:"pointer",
                background:`linear-gradient(135deg,${C.accent},${C.plasma})`,
                color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:14,letterSpacing:1,
                boxShadow:`0 0 24px ${C.glow}`}}>
                BEGIN MISSION
              </button>
            </div>
          </div>
        )}

        {/* ─── ACT I ─── */}
        {act==="build"&&(
          <div style={p}>
            <p style={al}>Act I — {mode==="drag"?"Beamline Builder":"Schematic Puzzle"}</p>
            <h2 style={h2}>Assemble the AWAKE Beamline</h2>
            {mode==="drag"
              ?<BeamlineBuilder onComplete={s=>{setScores(q=>({...q,build:s}));setAct_("overview1");}} onBack={()=>setAct_("intro")}/>
              :<JigsawPuzzle onComplete={s=>{setScores(q=>({...q,build:s}));setAct_("overview1");}} onBack={()=>setAct_("intro")}/>}
          </div>
        )}

        {/* ─── OVERVIEW 1 ─── */}
        {act==="overview1"&&(
          <div style={p}>
            <p style={al}>Beamline Overview</p>
            <h2 style={h2}>Proton Beam + e⁻ Injected into Plasma Cell</h2>
            <p style={{color:C.dim,fontSize:12,lineHeight:1.8,margin:"0 0 10px"}}>
              The proton bunch enters the rubidium plasma. Self-modulation instability generates microbunches
              and periodic wakefields. The electron witness bunch has been co-injected into the plasma column.
              <span style={{color:C.plasma}}> Click the PLASMA region to zoom into the wakefield dynamics.</span>
            </p>
            <BeamlineOverview phase={1} onZoomPlasma={()=>setAct_("wakefield")} onZoomOSR={null} onBack={()=>setAct_("build")}/>
            <button onClick={()=>setAct_("wakefield")} style={{marginTop:12,padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",background:C.plasma,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
              ZOOM INTO PLASMA →
            </button>
          </div>
        )}

        {/* ─── ACT II ─── */}
        {act==="wakefield"&&(
          <div style={p}>
            <p style={al}>Act II — Inside the Rb Plasma Cell</p>
            <h2 style={h2}>Wakefield Surfing — Time the Witness Beam Injection</h2>
            <p style={{color:C.dim,fontSize:12,lineHeight:1.8,margin:"0 0 10px"}}>
              You are zoomed into the plasma cell. Proton microbunches drive periodic plasma oscillations (λ_p ≈ 1.3mm).
              <span style={{color:C.electron}}> Click</span> to inject the electron witness bunch at the optimal phase of the wakefield bucket.
            </p>
            <WakefieldCanvas injected={injected} injScore={injScore}
              onInject={()=>{if(injected)return;const s=Math.round(48+Math.random()*52);setInjScore(s);setInjected(true);setScores(q=>({...q,inject:s}));}}
              onBack={()=>setAct_("overview1")}/>
            {injected&&(
              <div style={{marginTop:10,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{padding:"7px 13px",borderRadius:6,fontFamily:"monospace",fontSize:11,
                  border:`1px solid ${injScore>70?C.plasma:C.warn}`,background:`${injScore>70?C.plasma:C.warn}0e`,
                  color:injScore>70?C.plasma:C.warn}}>
                  {injScore>70?"✓ Optimal phase — electrons captured in accelerating bucket":"⚠ Off-phase — some emittance growth expected"}
                </div>
                <button onClick={()=>setAct_("overview2")} style={{padding:"8px 18px",borderRadius:6,border:"none",cursor:"pointer",background:C.accent,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:11}}>
                  RETURN TO BEAMLINE →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── OVERVIEW 2 ─── */}
        {act==="overview2"&&(
          <div style={p}>
            <p style={al}>Beamline Overview</p>
            <h2 style={h2}>Downstream: OTR → Quads → Dipole → OSR Screen</h2>
            <p style={{color:C.dim,fontSize:12,lineHeight:1.8,margin:"0 0 10px"}}>
              Accelerated electrons exit the plasma. OTR captures an upstream profile, quads re-focus,
              then the dipole bends the e⁻ beam <span style={{color:C.osr}}>upward</span> — emitting synchrotron radiation
              toward the OSR screen directly above. The proton beam continues straight to the beam dump.
              <span style={{color:C.osr}}> Click the DIP region to zoom into the OSR diagnostic station.</span>
            </p>
            <BeamlineOverview phase={2} onZoomPlasma={null} onZoomOSR={()=>setAct_("osr")} onBack={()=>setAct_("wakefield")}/>
            <button onClick={()=>setAct_("osr")} style={{marginTop:12,padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",background:C.osr,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
              ZOOM INTO OSR STATION →
            </button>
          </div>
        )}

        {/* ─── ACT III ─── */}
        {act==="osr"&&(
          <div style={p}>
            <p style={al}>Act III — OSR Diagnostic Station</p>
            <h2 style={h2}>Synchrotron Radiation → Emittance Measurement</h2>
            <p style={{color:C.dim,fontSize:12,lineHeight:1.8,margin:"0 0 10px"}}>
              The bending magnet deflects e⁻ upward; SR is emitted tangentially toward the OSR screen above.
              Switch to screen view — <span style={{color:C.osr}}>drag across the beam spot</span> to measure σ_x, σ_y
              and compute normalised emittance ε_n. The pixel brightness is read directly for the calculation.
            </p>
            <OSRDiagnostics injScore={injScore}
              onMeasured={s=>setScores(q=>({...q,diag:s}))}
              onBack={()=>setAct_("overview2")}/>
            <button onClick={()=>setAct_("branch")} style={{marginTop:12,padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",
              background:`linear-gradient(90deg,${C.plasma},${C.medical})`,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
              CHOOSE APPLICATION BRANCH →
            </button>
          </div>
        )}

        {/* ─── BRANCH ─── */}
        {act==="branch"&&(
          <div style={p}>
            <p style={al}>Act IV — Application Branch</p>
            <h2 style={h2}>Choose Your Mission Objective</h2>
            {!branch&&(
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
                {[{v:"physics",icon:"⚛️",col:C.plasma,t:"AWAKE Run-3",d:"Analyse beam quality for particle physics experiments"},
                  {v:"medical",icon:"🏥",col:C.medical,t:"PACRI Medical",d:"Tune beam energy for tumour Bragg peak treatment"}].map(b=>(
                  <div key={b.v} onClick={()=>setBranch(b.v)} style={{flex:1,minWidth:190,padding:"14px",borderRadius:9,cursor:"pointer",
                    border:`2px solid ${b.col}`,background:`${b.col}0e`,transition:"all 0.2s"}}>
                    <div style={{fontSize:26,marginBottom:6}}>{b.icon}</div>
                    <div style={{color:b.col,fontWeight:"bold",fontSize:13,marginBottom:4}}>{b.t}</div>
                    <div style={{color:C.dim,fontSize:11,lineHeight:1.7}}>{b.d}</div>
                  </div>
                ))}
              </div>
            )}
            {branch==="physics"&&(
              <div>
                <BackBtn onClick={()=>setBranch(null)}/>
                <div style={{marginTop:10,padding:"13px 15px",borderRadius:7,border:`1px solid ${C.plasma}`,background:C.plasmaDim}}>
                  <div style={{color:C.plasma,fontWeight:"bold",marginBottom:6}}>AWAKE Run-3 Analysis</div>
                  <p style={{color:C.text,fontSize:12,lineHeight:1.9,margin:0}}>
                    Injection score: <span style={{color:C.accent}}>{injScore}/100</span> → ε_n ≈ {(2.0+(100-injScore)*0.032).toFixed(2)} mm·mrad.
                    Target for physics-quality beam: &lt;2 mm·mrad.
                    {injScore>75?" Your injection phase was near-optimal — beam qualifies for Run-3!":" Improved injection timing would reduce emittance growth in plasma."}
                  </p>
                </div>
                <div style={{marginTop:10,padding:"10px",background:"#030a12",borderRadius:7,border:`1px solid ${C.dimmer}`}}>
                  <div style={{color:C.dim,fontSize:8,letterSpacing:2,marginBottom:6}}>REAL AWAKE FACTS</div>
                  <div style={{color:C.text,fontSize:11,lineHeight:2}}>
                    • 400 GeV/c SPS proton driver → 10m Rb plasma (n_e ~ 7×10¹⁴ cm⁻³)<br/>
                    • SMI converts ~6ns bunch into ~400 microbunches at λ_p ≈ 1.3mm<br/>
                    • Witness e⁻ accelerated to ~2 GeV in 10m (AWAKE Run-1, 2018)<br/>
                    • Run-3 goal: &lt;1% energy spread, σ_ε/ε physics-quality beam<br/>
                    • OTR + spectrometer + OSR used for full 6D phase space characterisation
                  </div>
                </div>
                <button onClick={()=>setAct_("results")} style={{marginTop:10,padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",background:C.plasma,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>VIEW FINAL RESULTS →</button>
              </div>
            )}
            {branch==="medical"&&(
              <div>
                <PACRIBranch diagScore={scores.diag} onBack={()=>setBranch(null)}/>
                <div style={{marginTop:10,padding:"10px",background:"#030a12",borderRadius:7,border:`1px solid ${C.dimmer}`}}>
                  <div style={{color:C.dim,fontSize:8,letterSpacing:2,marginBottom:6}}>PACRI CONTEXT</div>
                  <div style={{color:C.text,fontSize:11,lineHeight:2}}>
                    • PACRI: Plasma Accelerator for Cancer Research & Irradiation<br/>
                    • Bragg peak = maximum ionisation dose at end of particle range<br/>
                    • Lower ε_n → sharper penumbra → less collateral tissue damage<br/>
                    • Compact plasma-based proton therapy: 10m vs. ~100m cyclotrons<br/>
                    • FLASH mode (ultra-high dose rate &gt;40 Gy/s) under active research
                  </div>
                </div>
                <button onClick={()=>setAct_("results")} style={{marginTop:10,padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",background:C.medical,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>VIEW FINAL RESULTS →</button>
              </div>
            )}
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {act==="results"&&(
          <div style={p}>
            <p style={al}>Mission Complete</p>
            <h2 style={h2}>AWAKE Operator Report</h2>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              <ScoreBadge label="BEAMLINE" score={scores.build}/>
              <ScoreBadge label="INJECTION" score={scores.inject}/>
              <ScoreBadge label="DIAGNOSTICS" score={scores.diag}/>
              <ScoreBadge label="TOTAL" score={total}/>
            </div>
            <div style={{padding:"12px 15px",borderRadius:8,marginBottom:12,
              border:`1px solid ${total>75?C.plasma:total>50?C.warn:C.danger}`,
              background:`${total>75?C.plasma:total>50?C.warn:C.danger}0c`}}>
              <div style={{color:total>75?C.plasma:total>50?C.warn:C.danger,fontWeight:"bold",marginBottom:5,fontSize:13}}>
                {total>80?"🏆 Expert Beam Physicist":total>60?"⚡ Competent Operator":"📚 Trainee — keep practising"}
              </div>
              <p style={{color:C.text,fontSize:12,lineHeight:1.9,margin:0}}>
                {total>80?"Outstanding. Beamline assembly, injection phase, and emittance measurement were all near-optimal. AWAKE Run-3 approved!":
                 total>60?"Good work. Some emittance growth from injection timing, but a successful acceleration event was recorded.":
                 "Beam was produced, but significant emittance growth occurred. Review element order and injection phase."}
              </p>
            </div>
            <Leaderboard myScore={total} myName={playerName}/>
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <button onClick={()=>{setAct_("intro");setInjected(false);setInjScore(0);setScores({build:0,inject:0,diag:0,pacri:0});setBranch(null);}} style={{
                padding:"8px 20px",borderRadius:6,border:`1px solid ${C.accent}`,background:"transparent",color:C.accent,fontFamily:"monospace",fontSize:11,cursor:"pointer"}}>
                ↩ REPLAY
              </button>
              <button onClick={()=>{setAct_("branch");setBranch(null);}} style={{
                padding:"8px 20px",borderRadius:6,border:`1px solid ${C.dim}`,background:"transparent",color:C.dim,fontFamily:"monospace",fontSize:11,cursor:"pointer"}}>
                ↩ OTHER BRANCH
              </button>
            </div>
          </div>
        )}

        <div style={{textAlign:"center",color:C.dimmer,fontSize:8,letterSpacing:2,marginTop:4}}>
          AWAKE · PACRI · CERN · OUTREACH SIMULATION · NOT FOR OPERATIONAL USE
        </div>
      </div>
      <style>{`*{box-sizing:border-box;}input[type=range]{height:3px;border-radius:2px;}`}</style>
    </div>
  );
}
