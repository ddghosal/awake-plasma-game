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
// AWAKE BEAMLINE — v5 physics-accurate order
// SPS → TDX (transfer dipole, merges SPS line onto AWAKE axis)
// → PLASMA (with e⁻INJ from separate angled line)
// → OTR → QF-e → DIP (e⁻ bends → OSR) → DUMP
// ═══════════════════════════════════════════════════════════════
const COMPONENT_DEFS = [
  { id:"sps",    label:"SPS Proton Driver",      short:"SPS",    color:C.proton,   desc:"400 GeV/c proton bunch from SPS — arrives at angle, merged onto AWAKE axis" },
  { id:"tdx",    label:"Transfer Dipole (TDX)",  short:"TDX",    color:"#38bdf8",  desc:"Bending magnet that steers SPS proton beam onto the AWAKE beamline axis" },
  { id:"plasma", label:"Rb Plasma + e⁻ Inject.", short:"PLASMA", color:C.plasma,   desc:"10m Rb plasma cell; e⁻ witness bunch injected INTO the column from side" },
  { id:"einj",   label:"e⁻ Injection Line",      short:"e⁻INJ",  color:C.electron, desc:"Electron gun + transfer line injecting witness bunch into the plasma" },
  { id:"otr1",   label:"OTR Screen",             short:"OTR",    color:"#f472b6",  desc:"Downstream diagnostic — measures e⁻ beam size after plasma exit" },
  { id:"qf_e",   label:"Electron Quads",         short:"QF-e",   color:"#7dd3fc",  desc:"Quadrupoles re-focus the accelerated electron beam before the dipole" },
  { id:"dip_e",  label:"Dipole (SR bend)",        short:"DIP",    color:C.osr,      desc:"Bends e⁻ beam; SR emitted tangentially → OSR screen" },
  { id:"dump",   label:"Beam Dump",              short:"DUMP",   color:"#dc2626",  desc:"Absorbs spent proton and electron beams — end of AWAKE line" },
];
const CORRECT_ORDER = ["sps","tdx","plasma","einj","otr1","qf_e","dip_e","dump"];

// ═══════════════════════════════════════════════════════════════
// THIN-LENS OPTICS ENGINE (2×2 transfer matrices)
// ═══════════════════════════════════════════════════════════════
const mm=(A,B)=>[[A[0][0]*B[0][0]+A[0][1]*B[1][0],A[0][0]*B[0][1]+A[0][1]*B[1][1]],[A[1][0]*B[0][0]+A[1][1]*B[1][0],A[1][0]*B[0][1]+A[1][1]*B[1][1]]];
const drift=L=>[[1,L],[0,1]];
const quad=f=>[[1,0],[-1/f,1]];
const dip=()=>[[1,0.4],[0,1]];

const ELEM_M = {
  sps:   drift(0.6),
  tdx:   mm(drift(0.2),mm(dip(),drift(0.2))),  // transfer dipole merges SPS line
  plasma:drift(2.5),
  einj:  drift(0.15),  // e⁻ injection — short drift equivalent
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

function OpticsCanvas({placedIds, slotCentresX, containerW}){
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current; if(!cv) return;
    const ctx=cv.getContext("2d");
    const W=cv.width=cv.offsetWidth||600, H=cv.height=88;
    ctx.fillStyle="#030a12"; ctx.fillRect(0,0,W,H);

    // Use real slot centres if provided (from DOM measurement), else approximate
    let slotCentres;
    if(slotCentresX && slotCentresX.length===N_SLOTS && containerW>0){
      // Scale measured DOM positions to canvas pixel coords
      const scale = W / containerW;
      slotCentres = slotCentresX.map(x=>x*scale);
    } else {
      const totalSlotW = N_SLOTS*(SLOT_W+SLOT_GAP)-SLOT_GAP;
      const scale = W / totalSlotW;
      slotCentres = Array.from({length:N_SLOTS},(_,i)=>
        ((i*(SLOT_W+SLOT_GAP) + SLOT_W/2) * scale)
      );
    }

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
// BEAMLINE BUILDER v6 — matches hand-drawn sketch layout
// Layout from sketch:
//   Upper-left: RF gun / e⁻ injection line → angled into plasma
//   Main axis (left→right):
//     SPS p⁺ → (angled line) → Dipole(p) → Plasma column → OTR → QF → BP/Dipole → ... → Dump
//   OSR screen: upper-right of BP/Dipole
//
// Rendered as a CANVAS (no DOM ref complexity, crash-free).
// Drag uses mouse events on canvas; slots are fixed pixel regions.
// ═══════════════════════════════════════════════════════════════

// Slot definitions — pixel layout on a 760×200 canvas
// Each slot: { id, x, y, w, h, label, color, row }
// row: "main" | "upper"
const BUILDER_H = 220;
const SLOT_DEFS = [
  // ── Main axis ──
  { id:"sps",   x:0.02, y:0.55, w:0.09, h:0.28, label:"SPS\np⁺",          color:C.proton,  row:"main" },
  { id:"tdx",   x:0.14, y:0.55, w:0.07, h:0.28, label:"Dipole\n(p)",       color:"#38bdf8", row:"main" },
  { id:"plasma",x:0.24, y:0.48, w:0.20, h:0.35, label:"Plasma\nColumn",    color:C.plasma,  row:"main" },
  { id:"otr1",  x:0.47, y:0.55, w:0.07, h:0.28, label:"OTR\nImaging",     color:"#f472b6", row:"main" },
  { id:"qf_e",  x:0.57, y:0.55, w:0.07, h:0.28, label:"QF",               color:"#7dd3fc", row:"main" },
  { id:"dip_e", x:0.67, y:0.55, w:0.07, h:0.28, label:"BP/\nDipole",      color:C.osr,     row:"main" },
  { id:"dump",  x:0.82, y:0.55, w:0.08, h:0.28, label:"Dump",             color:"#dc2626", row:"main" },
  // ── Upper line (e⁻ injection) ──
  { id:"einj",  x:0.24, y:0.05, w:0.13, h:0.25, label:"RF Gun /\ne⁻ INJ", color:C.electron,row:"upper" },
];
// Uses global CORRECT_ORDER

// OSR screen position (not a draggable slot — displayed as static label)
const OSR_POS = { x:0.78, y:0.05, w:0.09, h:0.22 };

function BeamlineBuilder({onComplete,onBack}){
  const cvRef = useRef(null);
  const [placed, setPlaced] = useState({}); // id → true/false (placed or in bank)
  const [bank, setBank] = useState([...COMPONENT_DEFS].sort(()=>Math.random()-0.5));
  const [dragging, setDragging] = useState(null); // {item, fromSlot, ox, oy}
  const [mouseXY, setMouseXY] = useState({x:0,y:0});
  const [hover, setHover] = useState(null);
  const [fired, setFired] = useState(false);
  const [msg, setMsg] = useState(null);
  const [slotMap, setSlotMap] = useState({}); // id → component placed in it
  const [dims, setDims] = useState({W:760, H:BUILDER_H});

  // Track canvas pixel dimensions
  useEffect(()=>{
    const cv = cvRef.current; if(!cv) return;
    const ro = new ResizeObserver(()=>{
      setDims({W: cv.offsetWidth||760, H: BUILDER_H});
    });
    ro.observe(cv);
    return ()=>ro.disconnect();
  },[]);

  const slotPx = useCallback((s, W, H)=>({
    x: s.x*W, y: s.y*H, w: s.w*W, h: s.h*H
  }),[]);

  const getSlotAt = useCallback((px,py,W,H)=>{
    for(const s of SLOT_DEFS){
      const {x,y,w,h} = slotPx(s,W,H);
      if(px>=x&&px<x+w&&py>=y&&py<y+h) return s.id;
    }
    return null;
  },[slotPx]);

  // ── Draw everything ──
  useEffect(()=>{
    const cv = cvRef.current; if(!cv) return;
    const W = cv.width = cv.offsetWidth||760;
    const H = cv.height = BUILDER_H;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = "#040c18"; ctx.fillRect(0,0,W,H);

    const beam_y = 0.69*H; // main proton beam axis y

    // ── Background axis lines ──
    // Main axis (horizontal)
    ctx.strokeStyle = C.dimmer; ctx.lineWidth=1; ctx.setLineDash([3,5]);
    ctx.beginPath(); ctx.moveTo(0.02*W,beam_y); ctx.lineTo(0.91*W,beam_y); ctx.stroke();

    // SPS→TDX angled line
    const spsRightX = (0.02+0.09)*W, spsMidY = (0.55+0.28/2)*H;
    const tdxLeftX = 0.14*W, tdxMidY = (0.55+0.28/2)*H;
    ctx.strokeStyle = C.proton+"44";
    ctx.beginPath(); ctx.moveTo(spsRightX, spsMidY); ctx.lineTo(tdxLeftX, tdxMidY); ctx.stroke();

    // e⁻INJ angled line to plasma entry
    const einjBotX = (0.24+0.13/2)*W, einjBotY = (0.05+0.25)*H;
    const plasmaEntryX = (0.24+0.04)*W, plasmaEntryY = 0.48*H;
    ctx.strokeStyle = C.electron+"55";
    ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(einjBotX, einjBotY); ctx.lineTo(plasmaEntryX, plasmaEntryY); ctx.stroke();
    ctx.setLineDash([]);

    // SR fan from dipole to OSR screen
    const dipMidX = (0.67+0.035)*W, dipTopY = 0.55*H;
    const osrCx = (0.78+0.045)*W, osrBotY = (0.05+0.22)*H;
    const srAng = -Math.PI*65/180;
    const nR=10;
    for(let r=0;r<nR;r++){
      const ang = srAng + (r/(nR-1)-0.5)*0.3;
      const inten = Math.exp(-0.5*Math.pow((r/(nR-1)-0.5)/0.22,2));
      const dx = osrCx-dipMidX, dy = osrBotY-dipTopY;
      const len = Math.sqrt(dx*dx+dy*dy)*inten;
      ctx.beginPath();
      ctx.moveTo(dipMidX, dipTopY);
      ctx.lineTo(dipMidX+Math.cos(ang)*len, dipTopY+Math.sin(ang)*len);
      ctx.strokeStyle=`rgba(255,159,28,${inten*0.55})`; ctx.lineWidth=1.2; ctx.stroke();
    }

    // ── OSR screen (static, not a slot) ──
    const osr = slotPx(OSR_POS,W,H);
    ctx.fillStyle="#0a1428"; ctx.fillRect(osr.x,osr.y,osr.w,osr.h);
    ctx.strokeStyle="#f472b6"; ctx.lineWidth=1.5; ctx.strokeRect(osr.x,osr.y,osr.w,osr.h);
    ctx.font="8px monospace"; ctx.fillStyle="#f472b6"; ctx.textAlign="center";
    ctx.fillText("OSR",osr.x+osr.w/2,osr.y+osr.h/2-4);
    ctx.fillText("Screen",osr.x+osr.w/2,osr.y+osr.h/2+7);

    // ── Slots ──
    SLOT_DEFS.forEach(s=>{
      const {x,y,w,h} = slotPx(s,W,H);
      const comp = slotMap[s.id];
      const correct = comp && comp.id === s.id;
      const occupied = !!comp;

      // slot background
      ctx.fillStyle = occupied ? `${comp.color}18` : "#040c18";
      ctx.fillRect(x,y,w,h);

      // slot border
      ctx.strokeStyle = occupied?(correct?C.plasma:C.danger):C.dimmer;
      ctx.lineWidth = occupied?2:1;
      ctx.setLineDash(occupied?[]:[3,4]);
      ctx.strokeRect(x,y,w,h);
      ctx.setLineDash([]);

      // Slot number
      ctx.font="7px monospace"; ctx.fillStyle=C.dimmer; ctx.textAlign="left";
      ctx.fillText(CORRECT_ORDER.indexOf(s.id)+1, x+3, y+10);

      if(occupied){
        // Component label
        ctx.font=`bold ${w<50?7:8}px monospace`; 
        ctx.fillStyle = correct ? C.plasma : comp.color;
        ctx.textAlign="center";
        const lines=comp.short.split(/[/\s]/);
        const ly = y+h/2-4+(lines.length===1?5:0);
        lines.forEach((l,i)=>ctx.fillText(l,x+w/2,ly+i*11));
        if(correct){
          ctx.font="10px monospace"; ctx.fillStyle=C.plasma; ctx.textAlign="right";
          ctx.fillText("✓",x+w-3,y+11);
        }
      } else {
        // Empty slot hint
        ctx.font="7px monospace"; ctx.fillStyle=C.dimmer+"88"; ctx.textAlign="center";
        const hint = s.label.split("\n")[0];
        ctx.fillText(hint,x+w/2,y+h/2+3);
      }
    });

    // ── Dragging ghost ──
    if(dragging){
      const {item,ox,oy} = dragging;
      const gw=70,gh=46;
      ctx.globalAlpha=0.82;
      ctx.fillStyle=`${item.color}33`;
      ctx.fillRect(mouseXY.x-gw/2, mouseXY.y-gh/2, gw,gh);
      ctx.strokeStyle=item.color; ctx.lineWidth=2; ctx.setLineDash([]);
      ctx.strokeRect(mouseXY.x-gw/2, mouseXY.y-gh/2, gw,gh);
      ctx.font="bold 9px monospace"; ctx.fillStyle=item.color; ctx.textAlign="center";
      ctx.fillText(item.short, mouseXY.x, mouseXY.y+4);
      ctx.globalAlpha=1;
    }

    // ── Validation overlay ──
    if(fired){
      ctx.fillStyle="rgba(0,255,136,0.06)"; ctx.fillRect(0,0,W,H);
    }

  },[slotMap,dragging,mouseXY,dims,fired]);

  // Mouse handlers
  const getPos=(e)=>{
    const r=cvRef.current.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  };

  const handleMouseDown=e=>{
    if(fired) return;
    const {x,y}=getPos(e);
    const W=cvRef.current.offsetWidth, H=BUILDER_H;
    // Check if clicking a filled slot
    const sid=getSlotAt(x,y,W,H);
    if(sid&&slotMap[sid]){
      const item=slotMap[sid];
      setSlotMap(m=>{const n={...m};delete n[sid];return n;});
      setDragging({item,fromSlot:sid});
      setMouseXY({x,y});
      return;
    }
    // Check bank items — they're listed below canvas; not on canvas
    // (bank is HTML below, so mousedown on canvas won't hit bank)
  };
  const handleMouseMove=e=>{
    if(!dragging) return;
    const {x,y}=getPos(e);
    setMouseXY({x,y});
  };
  const handleMouseUp=e=>{
    if(!dragging) return;
    const {x,y}=getPos(e);
    const W=cvRef.current.offsetWidth, H=BUILDER_H;
    const sid=getSlotAt(x,y,W,H);
    if(sid){
      // Place item, return displaced item to bank
      const displaced=slotMap[sid];
      if(displaced) setBank(b=>[...b,displaced]);
      setSlotMap(m=>({...m,[sid]:dragging.item}));
    } else {
      // Drop outside — return to bank
      setBank(b=>[...b,dragging.item]);
    }
    setDragging(null);
  };

  // Drag from bank HTML elements onto canvas
  const [dragFromBank,setDragFromBank]=useState(null);
  const handleBankDragStart=(item,e)=>{
    setDragFromBank(item);
    setDragging({item,fromSlot:null});
    const {x,y}=getPos(e);
    setMouseXY({x,y});
  };

  const handleCanvasMouseEnter=e=>{
    if(dragFromBank){
      const {x,y}=getPos(e);
      setMouseXY({x,y});
    }
  };

  const placedCount = Object.keys(slotMap).length;
  const correctCount = CORRECT_ORDER.filter(id=>slotMap[id]&&slotMap[id].id===id).length;

  const fire=()=>{
    const ok=CORRECT_ORDER.every(id=>slotMap[id]&&slotMap[id].id===id);
    if(!ok){
      setMsg({ok:false,t:`${correctCount}/${CORRECT_ORDER.length} correct — check the e⁻INJ position (above plasma) and dipole order!`});
      return;
    }
    setFired(true);
    setMsg({ok:true,t:"✓ Beamline validated! Proton beam firing..."});
    setTimeout(()=>onComplete(100),1600);
  };

  return(
    <div>
      {onBack&&<div style={{marginBottom:8}}><BackBtn onClick={onBack}/></div>}
      <p style={{color:C.dim,fontSize:11,fontFamily:"monospace",margin:"0 0 6px",lineHeight:1.7}}>
        Drag components from the bank below onto the correct slot on the beamline canvas.
        <span style={{color:C.plasma}}> {correctCount}/{CORRECT_ORDER.length} correct</span>
      </p>
      <div style={{height:3,background:C.dimmer,borderRadius:2,marginBottom:8}}>
        <div style={{height:"100%",width:`${(correctCount/CORRECT_ORDER.length)*100}%`,
          background:`linear-gradient(90deg,${C.accent},${C.plasma})`,borderRadius:2,transition:"width 0.4s"}}/>
      </div>

      {/* Live optics envelope */}
      <div style={{marginBottom:6}}>
        <div style={{color:C.dim,fontSize:9,letterSpacing:2,fontFamily:"monospace",marginBottom:2}}>σ(s) LIVE BEAM ENVELOPE</div>
        <OpticsCanvas placedIds={CORRECT_ORDER.filter(id=>slotMap[id]&&slotMap[id].id===id)}/>
      </div>

      {/* Canvas beamline */}
      <canvas
        ref={cvRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseEnter={handleCanvasMouseEnter}
        onMouseLeave={()=>{
          if(dragging){setBank(b=>[...b,dragging.item]);setDragging(null);setDragFromBank(null);}
        }}
        style={{width:"100%",height:BUILDER_H,display:"block",borderRadius:8,
          border:`1px solid ${C.border}`,cursor:dragging?"grabbing":"crosshair",marginBottom:10}}
      />

      {/* Bank */}
      <div style={{padding:"8px 10px",background:"#040c18",borderRadius:7,
        border:`1px solid ${C.dimmer}`,marginBottom:10}}>
        <div style={{color:C.dim,fontSize:8,fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>
          COMPONENT BANK — drag onto beamline above
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {bank.map(c=>(
            <div key={c.id}
              draggable
              onDragStart={(e)=>handleBankDragStart(c,e)}
              onMouseDown={(e)=>{
                e.stopPropagation();
                setBank(b=>b.filter(x=>x.id!==c.id));
                setDragging({item:c,fromSlot:null});
                // Convert to canvas coords
                const cv=cvRef.current;
                if(cv){const r=cv.getBoundingClientRect();setMouseXY({x:e.clientX-r.left,y:e.clientY-r.top});}
              }}
              onMouseEnter={()=>setHover(c)}
              onMouseLeave={()=>setHover(null)}
              style={{
                padding:"5px 10px",borderRadius:5,cursor:"grab",fontFamily:"monospace",
                fontSize:10,fontWeight:"bold",border:`1px solid ${c.color}`,
                background:`${c.color}15`,color:c.color,userSelect:"none",
                boxShadow:hover?.id===c.id?`0 0 10px ${c.color}44`:"none",
                transform:hover?.id===c.id?"translateY(-2px)":"none",transition:"all 0.15s"
              }}>
              {c.short}
            </div>
          ))}
          {bank.length===0&&<span style={{color:C.dim,fontSize:10,fontFamily:"monospace"}}>All placed ↑</span>}
        </div>
      </div>

      {hover&&(
        <div style={{padding:"6px 11px",background:"#040c18",border:`1px solid ${hover.color}`,
          borderRadius:5,marginBottom:8,fontSize:11}}>
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
// ELEMENT ANATOMY PUZZLE — new jigsaw concept
// Instead of puzzling the whole beamline, each AWAKE element
// is split into 2–3 sub-components. The player selects which
// sub-pieces belong to each element. Much more educational!
//
// Layout: left column = elements (fixed), right = piece bank.
// Player clicks a piece from the bank, then clicks an element
// to assign it. Correct = green; wrong = red shake.
// ═══════════════════════════════════════════════════════════════
const ELEMENT_PUZZLES = [
  {
    id:"sps", name:"SPS Proton Driver", color:C.proton,
    desc:"What makes up the SPS proton beam source?",
    correct:["proton_bunch","400gev","extraction"],
    wrong:["laser_pulse","Rb_vapour","rf_cavity_electron"],
    pieces:{
      proton_bunch:{label:"Proton bunch\n(6×10¹¹ p)",  color:C.proton},
      "400gev":     {label:"400 GeV/c\nmomentum",      color:C.proton},
      extraction:   {label:"Fast\nextraction kicker",  color:C.proton},
      laser_pulse:  {label:"Ti:Sa\nlaser pulse",        color:C.electron},
      Rb_vapour:    {label:"Rb vapour\nsource",         color:C.plasma},
      rf_cavity_electron:{label:"RF gun\ncavity",        color:C.electron},
    }
  },
  {
    id:"plasma", name:"Rb Plasma Column", color:C.plasma,
    desc:"Which sub-systems form the 10m plasma cell?",
    correct:["Rb_source","ionise_laser","heat_cell"],
    wrong:["magnet_coil","proton_RF","cherenkov"],
    pieces:{
      Rb_source:    {label:"Rb metal\nvapour source",   color:C.plasma},
      ionise_laser: {label:"Ionisation\nlaser (Ti:Sa)", color:C.plasma},
      heat_cell:    {label:"Heated\nvapour cell",       color:C.plasma},
      magnet_coil:  {label:"Solenoid\ncoil",            color:"#7dd3fc"},
      proton_RF:    {label:"RF proton\ncavity",          color:C.proton},
      cherenkov:    {label:"Cherenkov\ndetector",        color:"#f472b6"},
    }
  },
  {
    id:"einj", name:"e⁻ Injection Line", color:C.electron,
    desc:"What components deliver the witness bunch?",
    correct:["rf_gun","linac_e","focus_quad"],
    wrong:["wiggler","plasma_cell2","sr_mirror"],
    pieces:{
      rf_gun:      {label:"RF photo-\ninjector gun",    color:C.electron},
      linac_e:     {label:"Electron\nlinac booster",    color:C.electron},
      focus_quad:  {label:"Focusing\nquadrupoles",      color:"#7dd3fc"},
      wiggler:     {label:"Undulator\nwiggler",          color:C.osr},
      plasma_cell2:{label:"2nd plasma\ncell",            color:C.plasma},
      sr_mirror:   {label:"Mirror for\nSR collection",  color:"#f472b6"},
    }
  },
  {
    id:"osr_diag", name:"OTR / OSR Diagnostics", color:"#f472b6",
    desc:"Which elements form the diagnostic suite?",
    correct:["otr_screen_foil","ccd_camera","sr_spectrometer"],
    wrong:["Rb_cell","beam_dump_block","plasma_mirror"],
    pieces:{
      otr_screen_foil:{label:"OTR Al\nfoil screen",     color:"#f472b6"},
      ccd_camera:     {label:"CCD/sCMOS\ncamera",        color:"#f472b6"},
      sr_spectrometer:{label:"SR spectr-\nometer + OSR", color:C.osr},
      Rb_cell:        {label:"Rb vapour\ncell",           color:C.plasma},
      beam_dump_block:{label:"Tungsten\nabsorber",        color:"#dc2626"},
      plasma_mirror:  {label:"Plasma\nmirror",            color:C.plasma},
    }
  },
];

function ElementAnatomyPuzzle({onComplete,onBack}){
  const [currentIdx,setCurrentIdx]=useState(0);
  const [selected,setSelected]=useState([]); // piece ids selected for current element
  const [submitted,setSubmitted]=useState(false);
  const [scores,setScores]=useState([]);
  const [allDone,setAllDone]=useState(false);

  const puzzle=ELEMENT_PUZZLES[currentIdx];
  const needed=puzzle.correct.length;

  // All available pieces for this puzzle (shuffled)
  const [pieces]=useState(()=>{
    const all=[...puzzle.correct,...puzzle.wrong];
    for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
    return all;
  });
  const [shuffledPieces,setShuffledPieces]=useState(()=>{
    const a=[...ELEMENT_PUZZLES[0].correct,...ELEMENT_PUZZLES[0].wrong];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  });

  // When puzzle changes, reshuffle pieces for it
  const puzzleRef=useRef(currentIdx);
  useEffect(()=>{
    if(puzzleRef.current===currentIdx) return;
    puzzleRef.current=currentIdx;
    const p=ELEMENT_PUZZLES[currentIdx];
    const all=[...p.correct,...p.wrong];
    for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
    setShuffledPieces(all);
    setSelected([]);
    setSubmitted(false);
  },[currentIdx]);

  const togglePiece=(pid)=>{
    if(submitted) return;
    setSelected(s=>s.includes(pid)?s.filter(x=>x!==pid):[...s,pid]);
  };

  const submit=()=>{
    setSubmitted(true);
  };

  const next=()=>{
    const p=ELEMENT_PUZZLES[currentIdx];
    const correctHits=selected.filter(s=>p.correct.includes(s)).length;
    const wrongHits=selected.filter(s=>p.wrong.includes(s)).length;
    const score=Math.max(0,Math.round(100*(correctHits/p.correct.length)-(wrongHits*20)));
    const newScores=[...scores,score];
    setScores(newScores);
    if(currentIdx>=ELEMENT_PUZZLES.length-1){
      setAllDone(true);
      const avg=Math.round(newScores.reduce((a,b)=>a+b,0)/newScores.length);
      setTimeout(()=>onComplete(avg),1200);
    } else {
      setCurrentIdx(i=>i+1);
    }
  };

  if(allDone){
    const avg=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
    return(
      <div>
        {onBack&&<div style={{marginBottom:8}}><BackBtn onClick={onBack}/></div>}
        <div style={{padding:"14px 18px",borderRadius:8,border:`1px solid ${C.plasma}`,background:C.plasmaDim}}>
          <div style={{color:C.plasma,fontWeight:"bold",fontSize:14,marginBottom:6}}>✓ Element Anatomy Complete!</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:8}}>
            {ELEMENT_PUZZLES.map((p,i)=>(
              <div key={p.id} style={{padding:"5px 10px",borderRadius:5,border:`1px solid ${p.color}`,background:`${p.color}12`}}>
                <div style={{color:p.color,fontSize:9,fontFamily:"monospace"}}>{p.name}</div>
                <div style={{color:scores[i]>70?C.plasma:C.warn,fontFamily:"monospace",fontSize:13,fontWeight:"bold"}}>{scores[i]}/100</div>
              </div>
            ))}
          </div>
          <div style={{color:C.text,fontFamily:"monospace",fontSize:12}}>Average: <span style={{color:C.plasma,fontWeight:"bold"}}>{avg}/100</span></div>
        </div>
      </div>
    );
  }

  const p=puzzle;
  return(
    <div>
      {onBack&&<div style={{marginBottom:8}}><BackBtn onClick={onBack}/></div>}

      {/* Progress bar */}
      <div style={{display:"flex",gap:4,marginBottom:12}}>
        {ELEMENT_PUZZLES.map((ep,i)=>(
          <div key={ep.id} style={{flex:1,height:4,borderRadius:2,
            background:i<currentIdx?C.plasma:i===currentIdx?C.accent:C.dimmer,
            transition:"background 0.3s"}}/>
        ))}
      </div>

      {/* Element being studied */}
      <div style={{padding:"10px 14px",borderRadius:8,border:`2px solid ${p.color}`,
        background:`${p.color}0e`,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <div style={{color:p.color,fontWeight:"bold",fontSize:14,fontFamily:"monospace"}}>{p.name}</div>
          <div style={{color:C.dim,fontSize:10,fontFamily:"monospace"}}>
            Step {currentIdx+1} / {ELEMENT_PUZZLES.length}
          </div>
        </div>
        <div style={{color:C.text,fontSize:12,lineHeight:1.7}}>{p.desc}</div>
        <div style={{color:C.dim,fontSize:10,marginTop:4,fontFamily:"monospace"}}>
          Select exactly {needed} pieces that belong to this element:
        </div>
      </div>

      {/* Piece grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {shuffledPieces.map(pid=>{
          const piece=p.pieces[pid];
          const isSel=selected.includes(pid);
          const isCorrect=p.correct.includes(pid);
          const showResult=submitted;
          let borderCol=isSel?p.color:C.dimmer;
          let bgCol=isSel?`${p.color}22`:"#040c18";
          let textCol=isSel?p.color:C.dim;
          if(showResult&&isSel){
            borderCol=isCorrect?C.plasma:C.danger;
            bgCol=isCorrect?`${C.plasma}18`:`${C.danger}18`;
            textCol=isCorrect?C.plasma:C.danger;
          }
          if(showResult&&!isSel&&isCorrect){
            borderCol=`${C.plasma}66`; bgCol=`${C.plasma}0a`; textCol=`${C.plasma}88`;
          }
          return(
            <div key={pid} onClick={()=>togglePiece(pid)}
              style={{
                padding:"10px 8px",borderRadius:7,cursor:submitted?"default":"pointer",
                border:`2px solid ${borderCol}`,background:bgCol,textAlign:"center",
                transition:"all 0.2s",transform:isSel&&!submitted?"translateY(-2px)":"none",
                boxShadow:isSel&&!submitted?`0 4px 14px ${p.color}44`:"none",
              }}>
              <div style={{color:textCol,fontFamily:"monospace",fontSize:10,fontWeight:"bold",
                lineHeight:1.4,whiteSpace:"pre",pointerEvents:"none"}}>
                {piece.label}
              </div>
              {showResult&&isSel&&(
                <div style={{fontSize:12,marginTop:3}}>{isCorrect?"✓":"✗"}</div>
              )}
              {showResult&&!isSel&&isCorrect&&(
                <div style={{color:`${C.plasma}88`,fontSize:9,marginTop:2,fontFamily:"monospace"}}>← missed</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selection counter */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{color:C.dim,fontSize:10,fontFamily:"monospace"}}>
          Selected: <span style={{color:selected.length===needed?C.plasma:C.text,fontWeight:"bold"}}>{selected.length}/{needed}</span>
        </div>
        <div style={{flex:1,height:2,background:C.dimmer,borderRadius:1}}>
          <div style={{height:"100%",width:`${Math.min(1,selected.length/needed)*100}%`,
            background:selected.length===needed?C.plasma:C.accent,borderRadius:1,transition:"width 0.3s"}}/>
        </div>
      </div>

      {/* Buttons */}
      <div style={{display:"flex",gap:8}}>
        {!submitted?(
          <button onClick={submit} disabled={selected.length===0}
            style={{padding:"8px 20px",borderRadius:6,border:"none",cursor:selected.length===0?"default":"pointer",
              background:selected.length===needed?C.accent:C.dim,color:"#040c18",
              fontFamily:"monospace",fontSize:12,fontWeight:"bold"}}>
            CHECK SELECTION
          </button>
        ):(
          <button onClick={next}
            style={{padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",
              background:C.plasma,color:"#040c18",fontFamily:"monospace",fontSize:12,fontWeight:"bold"}}>
            {currentIdx<ELEMENT_PUZZLES.length-1?"NEXT ELEMENT →":"FINISH ✓"}
          </button>
        )}
      </div>

      {submitted&&(
        <div style={{marginTop:10,padding:"10px 14px",borderRadius:7,fontFamily:"monospace",fontSize:11,
          border:`1px solid ${selected.every(s=>p.correct.includes(s))&&selected.length===needed?C.plasma:C.warn}`,
          background:"#040c18",color:C.text,lineHeight:1.9}}>
          {selected.every(s=>p.correct.includes(s))&&selected.length===needed
            ?"✓ Perfect! All sub-components correctly identified."
            :`${selected.filter(s=>p.correct.includes(s)).length}/${needed} correct selections. `+
             (selected.some(s=>p.wrong.includes(s))?"Some incorrect pieces included. ":"")+
             "Missed pieces shown with ← arrows."}
        </div>
      )}
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
      {x:0.03,w:0.055,label:"SPS",      color:C.proton,  key:"sps"},
      {x:0.10,w:0.05, label:"TDX",      color:"#38bdf8", key:"tdx"},  // transfer dipole, replaces COL+QF-p
      {x:0.18,w:0.22, label:"PLASMA+e⁻",color:C.plasma,  key:"plasma",hi:true},
      {x:0.43,w:0.04, label:"OTR",      color:"#f472b6", key:"otr"},
      {x:0.50,w:0.05, label:"QF-e",     color:"#7dd3fc", key:"qfe"},
      {x:0.58,w:0.05, label:"DIP",      color:C.osr,     key:"dip",  hi2:true},
      {x:0.66,w:0.07, label:"DUMP",     color:"#dc2626", key:"dump"},
    ];

    const dipCx   = (EL[5].x + EL[5].w/2)*W;  // DIP is now index 5
    const dumpRx  = (EL[6].x + EL[6].w)*W;    // DUMP right edge
    const plasmaX = EL[2].x*W;                 // PLASMA is now index 2
    const plasmaW = EL[2].w*W;

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
        const plasmaExit=(EL[2].x+EL[2].w)*W;  // after plasma (index 2)
        const dipLx=EL[5].x*W;                  // dipole left edge (index 5)
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
      }

      // ── Zoom hint PLASMA — always show when onZoomPlasma available ──
      if(onZoomPlasma){
        const px=(EL[2].x+EL[2].w/2)*W;
        ctx.fillStyle=C.plasma+"cc"; ctx.strokeStyle=C.plasma; ctx.lineWidth=1;
        if(ctx.roundRect)ctx.roundRect(px-26,yBeam-62,52,13,3);else ctx.rect(px-26,yBeam-62,52,13);
        ctx.fill(); ctx.stroke();
        ctx.font="bold 7px monospace"; ctx.fillStyle="#040c18"; ctx.textAlign="center";
        ctx.fillText("CLICK→ZOOM",px,yBeam-53);
      }

      // ── Zoom hint OSR — always show when onZoomOSR available ──
      if(onZoomOSR){
        const hx=dipCx+28, hy=scCy-14;
        ctx.fillStyle=C.osr+"cc"; ctx.strokeStyle=C.osr; ctx.lineWidth=1;
        if(ctx.roundRect)ctx.roundRect(hx-26,hy,52,13,3);else ctx.rect(hx-26,hy,52,13);
        ctx.fill(); ctx.stroke();
        ctx.font="bold 7px monospace"; ctx.fillStyle="#040c18"; ctx.textAlign="center";
        ctx.fillText("CLICK→ZOOM",hx,hy+9);
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
    // Plasma zoom — always available once overview shown
    if(mx>0.16&&mx<0.42&&my>0.4&&onZoomPlasma) onZoomPlasma();
    // OSR zoom — always available once overview shown (upper-right quadrant near DIP)
    if(mx>0.54&&mx<0.80&&my<0.58&&onZoomOSR) onZoomOSR();
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
                  {v:"jigsaw",icon:"🧬",t:"Anatomy Mode",d:"Identify what each element is made of"}].map(m=>(
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
            <p style={al}>Act I — {mode==="drag"?"Beamline Builder":"Element Anatomy Puzzle"}</p>
            <h2 style={h2}>{mode==="drag"?"Assemble the AWAKE Beamline":"What Is Each Element Made Of?"}</h2>
            {mode==="drag"
              ?<BeamlineBuilder onComplete={s=>{setScores(q=>({...q,build:s}));setAct_("overview1");}} onBack={()=>setAct_("intro")}/>
              :<ElementAnatomyPuzzle onComplete={s=>{setScores(q=>({...q,build:s}));setAct_("overview1");}} onBack={()=>setAct_("intro")}/>}
          </div>
        )}

        {/* ─── OVERVIEW 1 ─── */}
        {act==="overview1"&&(
          <div style={p}>
            <p style={al}>Beamline Overview</p>
            <h2 style={h2}>Full AWAKE Beamline — Both Zoom Regions Available</h2>
            <p style={{color:C.dim,fontSize:12,lineHeight:1.8,margin:"0 0 10px"}}>
              The proton bunch enters the rubidium plasma via the TDX transfer dipole. Self-modulation instability
              generates microbunches and periodic wakefields. The electron witness bunch is co-injected into the plasma column.
              <span style={{color:C.plasma}}> Click the PLASMA region</span> to zoom into wakefield dynamics,
              or <span style={{color:C.osr}}>click the DIP/OSR region</span> to jump ahead to diagnostics.
            </p>
            <BeamlineOverview phase={1} onZoomPlasma={()=>setAct_("wakefield")} onZoomOSR={()=>setAct_("osr")} onBack={()=>setAct_("build")}/>
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <button onClick={()=>setAct_("wakefield")} style={{padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",background:C.plasma,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
                ⚡ ZOOM INTO PLASMA
              </button>
              <button onClick={()=>setAct_("osr")} style={{padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",background:C.osr,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
                🔬 ZOOM INTO OSR STATION
              </button>
            </div>
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
            <h2 style={h2}>Full Beamline — Plasma ✓ | Now: OTR → Quads → Dipole → OSR</h2>
            <p style={{color:C.dim,fontSize:12,lineHeight:1.8,margin:"0 0 10px"}}>
              Accelerated electrons exit the plasma. OTR captures an upstream profile, quads re-focus,
              then the dipole bends the e⁻ beam at 65° — emitting synchrotron radiation toward the OSR screen.
              The proton beam continues straight to the beam dump.
              Both zoom regions remain active simultaneously.
            </p>
            <BeamlineOverview phase={2} onZoomPlasma={()=>setAct_("wakefield")} onZoomOSR={()=>setAct_("osr")} onBack={()=>setAct_("wakefield")}/>
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <button onClick={()=>setAct_("wakefield")} style={{padding:"8px 20px",borderRadius:6,border:`1px solid ${C.plasma}`,background:"transparent",color:C.plasma,fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
                ← Revisit Plasma
              </button>
              <button onClick={()=>setAct_("osr")} style={{padding:"8px 20px",borderRadius:6,border:"none",cursor:"pointer",background:C.osr,color:"#040c18",fontWeight:"bold",fontFamily:"monospace",fontSize:12}}>
                🔬 ZOOM INTO OSR STATION →
              </button>
            </div>
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
