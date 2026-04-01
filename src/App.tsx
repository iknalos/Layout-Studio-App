// @ts-nocheck
import{useState,useRef,useEffect,useCallback,useMemo}from"react";

function LandingPage({onEnter}){
  return(
    <div style={{background:'#080c14',color:'#f0f4ff',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',minHeight:'100vh',overflowX:'hidden'}}>
      <style>{`
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--accent:#00d4aa;--accent2:#0ea5e9;--muted:#8892a4;--border:#1e2d3d;--card:#0f1825;--bg2:#0d1220}
        .hex-grid{position:absolute;inset:0;opacity:.06;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50V16L28 0l28 16v34z' fill='none' stroke='%2300d4aa' stroke-width='1'/%3E%3Cpath d='M28 100L0 84V50l28-16 28 16v34z' fill='none' stroke='%2300d4aa' stroke-width='1'/%3E%3C/svg%3E");background-size:56px 100px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes floatup{0%{opacity:0;transform:translateY(30px)}100%{opacity:1;transform:translateY(0)}}
        .fade-in{animation:floatup .7s ease forwards}
        .fade-in-2{animation:floatup .7s .15s ease both}
        .fade-in-3{animation:floatup .7s .3s ease both}
        .btn-primary{background:#00d4aa;color:#000;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;border:none;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px}
        .btn-primary:hover{background:#00eec0;transform:translateY(-2px)}
        .btn-secondary{background:transparent;color:#f0f4ff;border:1px solid #1e2d3d;padding:13px 26px;border-radius:10px;font-size:15px;cursor:pointer;transition:all .2s}
        .btn-secondary:hover{border-color:#00d4aa;color:#00d4aa}
        .feat-card{background:#0f1825;border:1px solid #1e2d3d;border-radius:14px;padding:24px;transition:all .25s}
        .feat-card:hover{border-color:rgba(0,212,170,.35);transform:translateY(-3px)}
        .use-tag{background:rgba(255,255,255,.05);color:#8892a4;font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #1e2d3d;display:inline-block;margin:3px}
        .step-num{width:56px;height:56px;border-radius:50%;background:#0f1825;border:2px solid #00d4aa;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#00d4aa;margin:0 auto 16px}
      `}</style>

      {/* NAV */}
      <nav style={{position:'sticky',top:0,zIndex:100,background:'rgba(8,12,20,0.9)',backdropFilter:'blur(12px)',borderBottom:'1px solid #1e2d3d',padding:'0 5%',height:58,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,fontWeight:700,fontSize:17}}>
          <div style={{width:30,height:30,background:'linear-gradient(135deg,#00d4aa,#0ea5e9)',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>⬡</div>
          Layout Studio
        </div>
        <div style={{display:'flex',gap:28}}>
          {['Features','Formats','How it works'].map(l=><a key={l} href={`#${l.toLowerCase().replace(/ /g,'-')}`} style={{color:'#8892a4',textDecoration:'none',fontSize:14}}>{l}</a>)}
        </div>
        <button className="btn-primary" style={{padding:'8px 18px',fontSize:13}} onClick={onEnter}>Open App →</button>
      </nav>

      {/* HERO */}
      <section style={{minHeight:'92vh',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',padding:'80px 5% 60px',position:'relative',overflow:'hidden'}}>
        <div className="hex-grid"/>
        <div style={{position:'absolute',width:500,height:500,background:'rgba(0,212,170,.1)',borderRadius:'50%',filter:'blur(80px)',top:-100,left:-100,pointerEvents:'none'}}/>
        <div style={{position:'absolute',width:400,height:400,background:'rgba(14,165,233,.08)',borderRadius:'50%',filter:'blur(80px)',bottom:-50,right:-50,pointerEvents:'none'}}/>
        <div style={{position:'relative',zIndex:1,maxWidth:780}}>
          <div className="fade-in" style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(0,212,170,.1)',border:'1px solid rgba(0,212,170,.3)',color:'#00d4aa',padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:600,marginBottom:24,letterSpacing:'.05em'}}>
            <span style={{width:6,height:6,background:'#00d4aa',borderRadius:'50%',animation:'pulse 2s infinite',display:'inline-block'}}/>
            Free forever · No sign-up required
          </div>
          <h1 className="fade-in-2" style={{fontSize:'clamp(32px,5.5vw,64px)',fontWeight:800,lineHeight:1.1,marginBottom:20,letterSpacing:'-.02em'}}>
            Design GDS Layouts<br/>
            <span style={{background:'linear-gradient(135deg,#00d4aa,#0ea5e9)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>Without the Downloads</span>
          </h1>
          <p className="fade-in-3" style={{fontSize:'clamp(15px,2vw,19px)',color:'#8892a4',maxWidth:580,margin:'0 auto 36px',lineHeight:1.65}}>
            The free, browser-based GDS and OASIS editor with built-in AI. No installation, no license fees — the modern alternative to KLayout and CleWin.
          </p>
          <div className="fade-in-3" style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginBottom:22}}>
            <button className="btn-primary" onClick={onEnter}>⬡ Open Layout Studio — Free</button>
            <a href="#features" className="btn-secondary" style={{display:'inline-block',textDecoration:'none'}}>See features</a>
          </div>
          <div style={{display:'flex',gap:18,justifyContent:'center',flexWrap:'wrap',color:'#8892a4',fontSize:13}}>
            {['Free forever','No installation','AI-powered','GDS + OASIS','Works on any OS'].map(t=>(
              <span key={t} style={{display:'flex',alignItems:'center',gap:4}}><span style={{color:'#00d4aa',fontWeight:700}}>✓</span>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARE BANNER */}
      <div style={{background:'#0d1220',borderTop:'1px solid #1e2d3d',borderBottom:'1px solid #1e2d3d',padding:'16px 5%',display:'flex',justifyContent:'center',alignItems:'center',gap:14,flexWrap:'wrap',fontSize:13,color:'#8892a4'}}>
        <span><span style={{color:'#ef4444',fontWeight:600}}>KLayout</span> — 200MB install required</span>
        <span style={{color:'#1e2d3d'}}>·</span>
        <span><span style={{color:'#ef4444',fontWeight:600}}>CleWin</span> — €1,295 license fee, Windows only</span>
        <span style={{color:'#1e2d3d'}}>·</span>
        <span><span style={{color:'#00d4aa',fontWeight:600}}>Layout Studio</span> — Free, instant, any browser</span>
      </div>

      {/* FEATURES */}
      <section id="features" style={{padding:'80px 5%',background:'#080c14'}}>
        <div style={{textAlign:'center',marginBottom:48}}>
          <p style={{fontSize:12,fontWeight:600,color:'#00d4aa',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>Features</p>
          <h2 style={{fontSize:'clamp(24px,3vw,36px)',fontWeight:700,marginBottom:12,letterSpacing:'-.02em'}}>Everything you need. Nothing to install.</h2>
          <p style={{color:'#8892a4',fontSize:16,maxWidth:540,margin:'0 auto',lineHeight:1.6}}>A complete GDS layout environment that runs entirely in your browser — with AI that understands what you want to build.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))',gap:18}}>
          {[
            {icon:'🤖',bg:'rgba(0,212,170,.1)',title:'AI-Powered Design',desc:'Describe shapes in plain English — "create a 5×5 array of 3μm circles on layer 0" — and the AI generates perfect GDS geometry instantly.'},
            {icon:'⬡',bg:'rgba(14,165,233,.1)',title:'GDS & OASIS Support',desc:'Open, edit and export .gds, .gds2 and .oas files. Full support for boundaries, paths, cell arrays (AREF), references (SREF) and text.'},
            {icon:'✏️',bg:'rgba(124,58,237,.1)',title:'Draw Tools',desc:'Rectangle, circle, polygon and path tools with snap-to-grid, real-time preview and precise coordinate display in nm and μm.'},
            {icon:'◎',bg:'rgba(234,179,8,.1)',title:'Measure & Inspect',desc:'Click any shape to measure diameter and pitch. Save measurements as persistent rulers. Inspect element properties in detail.'},
            {icon:'🔍',bg:'rgba(239,68,68,.1)',title:'DRC Checks',desc:'Run design rule checks for minimum spacing and feature size violations directly in the browser. Results shown instantly.'},
            {icon:'⌀',bg:'rgba(16,185,129,.1)',title:'Wafer Template',desc:'Overlay a wafer outline at any diameter. Toggle dark-field / light-field polarity for mask ordering specifications.'},
            {icon:'↩',bg:'rgba(0,212,170,.1)',title:'Undo / Redo',desc:'30-step history. Select, move, rotate, mirror, copy, delete elements. Arrow-key nudging with shift for coarse steps.'},
            {icon:'📷',bg:'rgba(14,165,233,.1)',title:'PNG Export',desc:'Export a screenshot of your canvas — perfect for papers, presentations, and fabrication documentation.'},
            {icon:'✛',bg:'rgba(124,58,237,.1)',title:'Alignment Marks',desc:'Insert standard cruciform alignment marks at the origin with one click — essential for multi-layer mask sets.'},
          ].map(f=>(
            <div key={f.title} className="feat-card">
              <div style={{width:42,height:42,borderRadius:10,background:f.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,marginBottom:14}}>{f.icon}</div>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:8}}>{f.title}</h3>
              <p style={{color:'#8892a4',fontSize:13,lineHeight:1.6}}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FORMATS */}
      <section id="formats" style={{padding:'80px 5%',background:'#0d1220'}}>
        <div style={{textAlign:'center',marginBottom:48}}>
          <p style={{fontSize:12,fontWeight:600,color:'#00d4aa',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>File Formats</p>
          <h2 style={{fontSize:'clamp(24px,3vw,36px)',fontWeight:700,marginBottom:12,letterSpacing:'-.02em'}}>Import & export industry standards</h2>
          <p style={{color:'#8892a4',fontSize:16,maxWidth:520,margin:'0 auto',lineHeight:1.6}}>Full read and write support for both major layout formats used in semiconductor and MEMS fabrication.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:20,maxWidth:720,margin:'0 auto'}}>
          {[
            {badge:'GDS / GDSII',badgeBg:'rgba(0,212,170,.1)',badgeColor:'#00d4aa',badgeBorder:'rgba(0,212,170,.3)',title:'GDSII Stream Format',desc:'The industry-standard format for IC and mask layout. Supports hierarchical cell arrays, paths, boundaries and text labels.',tags:['IC design','Photonics','E-beam lithography','Foundry submission']},
            {badge:'OAS / OASIS',badgeBg:'rgba(14,165,233,.1)',badgeColor:'#0ea5e9',badgeBorder:'rgba(14,165,233,.3)',title:'OASIS Format',desc:'The modern successor to GDSII. Smaller files, native circle support and efficient array encoding. Compatible with advanced fabs.',tags:['Advanced nodes','Large layouts','MEMS','Microfluidics']},
          ].map(f=>(
            <div key={f.badge} style={{background:'#0f1825',border:'1px solid #1e2d3d',borderRadius:14,padding:30,textAlign:'center'}}>
              <div style={{display:'inline-block',fontSize:26,fontWeight:900,padding:'10px 20px',borderRadius:10,marginBottom:16,background:f.badgeBg,color:f.badgeColor,border:`1px solid ${f.badgeBorder}`,letterSpacing:'.05em'}}>{f.badge}</div>
              <h3 style={{fontSize:17,fontWeight:700,marginBottom:8}}>{f.title}</h3>
              <p style={{color:'#8892a4',fontSize:13,lineHeight:1.6,marginBottom:14}}>{f.desc}</p>
              <div>{f.tags.map(t=><span key={t} className="use-tag">{t}</span>)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{padding:'80px 5%',background:'#080c14'}}>
        <div style={{textAlign:'center',marginBottom:48}}>
          <p style={{fontSize:12,fontWeight:600,color:'#00d4aa',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>How it works</p>
          <h2 style={{fontSize:'clamp(24px,3vw,36px)',fontWeight:700,marginBottom:12,letterSpacing:'-.02em'}}>Up and running in seconds</h2>
          <p style={{color:'#8892a4',fontSize:16,maxWidth:480,margin:'0 auto',lineHeight:1.6}}>No downloads, no account, no credit card. Open your browser and start designing.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:0,maxWidth:800,margin:'0 auto',position:'relative'}}>
          <div style={{position:'absolute',top:27,left:'12%',right:'12%',height:1,background:'linear-gradient(90deg,transparent,#1e2d3d,#1e2d3d,transparent)'}}/>
          {[
            {n:'1',title:'Open in browser',desc:'Click "Open App". Works on Chrome, Firefox, Safari — Mac, Windows, Linux, iPad.'},
            {n:'2',title:'Load or create',desc:'Drag a .gds or .oas file, or ask the AI to generate shapes from a text description.'},
            {n:'3',title:'Edit & inspect',desc:'Draw, measure, run DRC checks, adjust layers, navigate cell hierarchy.'},
            {n:'4',title:'Export',desc:'Download your design as .gds, .oas, or .png — ready for your fab.'},
          ].map(s=>(
            <div key={s.n} style={{textAlign:'center',padding:'0 16px',position:'relative',zIndex:1}}>
              <div className="step-num">{s.n}</div>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:7}}>{s.title}</h3>
              <p style={{color:'#8892a4',fontSize:13,lineHeight:1.6}}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{padding:'90px 5%',background:'#080c14',textAlign:'center'}}>
        <div style={{background:'linear-gradient(135deg,rgba(0,212,170,.07),rgba(14,165,233,.07))',border:'1px solid rgba(0,212,170,.2)',borderRadius:20,padding:'60px 40px',maxWidth:680,margin:'0 auto'}}>
          <h2 style={{fontSize:'clamp(22px,3vw,36px)',fontWeight:700,marginBottom:14,letterSpacing:'-.02em'}}>Start designing in 10 seconds</h2>
          <p style={{color:'#8892a4',marginBottom:34,fontSize:16,lineHeight:1.6}}>No installation. No account. No license fee. Just open the app and build your layout — free, forever.</p>
          <button className="btn-primary" style={{fontSize:16,padding:'15px 36px'}} onClick={onEnter}>⬡ Open Layout Studio — Free</button>
          <div style={{display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap',marginTop:20,color:'#8892a4',fontSize:13}}>
            {['Free forever','No sign-up','GDS + OASIS','AI-powered'].map(t=>(
              <span key={t} style={{display:'flex',alignItems:'center',gap:4}}><span style={{color:'#00d4aa',fontWeight:700}}>✓</span>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{background:'#0d1220',borderTop:'1px solid #1e2d3d',padding:'32px 5%',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16,fontSize:13,color:'#8892a4'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:700,fontSize:15,color:'#f0f4ff'}}>
          <div style={{width:24,height:24,background:'linear-gradient(135deg,#00d4aa,#0ea5e9)',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>⬡</div>
          Layout Studio
        </div>
        <div style={{display:'flex',gap:22}}>
          {[['Open App',onEnter],['Features','#features'],['Formats','#formats'],['How it works','#how-it-works']].map(([l,t])=>(
            typeof t==='function'
              ? <button key={l} onClick={t} style={{background:'none',border:'none',color:'#8892a4',cursor:'pointer',fontSize:13}}>{l}</button>
              : <a key={l} href={t} style={{color:'#8892a4',textDecoration:'none'}}>{l}</a>
          ))}
        </div>
        <span>© 2026 Layout Studio · Free for everyone</span>
      </footer>
    </div>
  );
}

export default function App(){
  const[showApp,setShowApp]=useState(
    typeof window!=='undefined'&&
    (window.location.search.includes('app=1')||window.location.pathname.startsWith('/app'))
  );
  if(showApp)return<GDSStudio/>;
  return<LandingPage onEnter={()=>{window.history.pushState({},'','/?app=1');setShowApp(true);}}/>;
}

const LCOLS=['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#bfef45','#fabed4','#469990'];
const fmtNm=v=>(!Number.isFinite(v)||isNaN(v))?'?':v>=1000?`${(v/1000).toFixed(3)} μm`:`${v.toFixed(0)} nm`;
const lCol=(lc,l)=>lc[l]||LCOLS[l%LCOLS.length];
const hexA=(h,a)=>{try{const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;}catch{return`rgba(100,100,200,${a})`;}}
const tb=(on=true,hi=false,danger=false)=>({padding:'4px 10px',background:danger?'#ffe0e0':hi?'#e8ffe8':on?'#e0e8ff':'#f0f0f0',border:`1px solid ${danger?'#f88':hi?'#4a4':on?'#88a':'#ccc'}`,borderRadius:4,color:danger?'#a00':hi?'#040':on?'#226':'#999',cursor:on?'pointer':'not-allowed',fontSize:12,whiteSpace:'nowrap'});
const actBtn=(bg,col)=>({padding:'4px 6px',background:bg,border:`1px solid ${col}44`,borderRadius:4,color:col,cursor:'pointer',fontSize:10,fontWeight:'bold',width:'100%'});

// ── GDS PARSER ────────────────────────────────────────────
const ibmD=(v,o)=>{const sg=(v.getUint8(o)&0x80)?-1:1,ex=(v.getUint8(o)&0x7F)-64;let m=0;for(let i=1;i<8;i++)m=m*256+v.getUint8(o+i);m/=Math.pow(256,7);return m?sg*m*Math.pow(16,ex):0;};
const gStr=(v,o,l)=>{let s='';for(let i=0;i<l;i++){const c=v.getUint8(o+i);if(!c)break;s+=String.fromCharCode(c);}return s;};
function parseGDSAsync(buf,onPct,cancelRef){
  return new Promise((resolve,reject)=>{
    const v=new DataView(buf),lib={name:'untitled',userUnit:1e-3,dbUnit:1e-9,cells:[],cellMap:{}};
    let off=0,cell=null,el=null;
    function chunk(){
      if(cancelRef.current){reject(new Error('Cancelled'));return;}
      let n=0;
      while(off+4<=v.byteLength&&n++<3000){
        const len=v.getUint16(off);if(len<4)break;
        const type=v.getUint8(off+2),doff=off+4,dlen=len-4;off+=len;
        switch(type){
          case 0x02:lib.name=gStr(v,doff,dlen);break;
          case 0x03:lib.userUnit=ibmD(v,doff);lib.dbUnit=ibmD(v,doff+8);break;
          case 0x05:cell={name:'',elements:[]};break;
          case 0x06:if(cell){cell.name=gStr(v,doff,dlen);lib.cells.push(cell);lib.cellMap[cell.name]=cell;}break;
          case 0x07:cell=null;break;
          case 0x08:el={type:'boundary',layer:0,datatype:0,xy:[]};if(cell)cell.elements.push(el);break;
          case 0x09:el={type:'path',layer:0,datatype:0,width:0,xy:[]};if(cell)cell.elements.push(el);break;
          case 0x0A:el={type:'sref',sname:'',xy:[0,0],mag:1};if(cell)cell.elements.push(el);break;
          case 0x0B:el={type:'aref',sname:'',xy:[],colrow:[1,1]};if(cell)cell.elements.push(el);break;
          case 0x0C:el={type:'text',layer:0,xy:[],string:'',mag:1};if(cell)cell.elements.push(el);break;
          case 0x0D:if(el)el.layer=v.getInt16(doff);break;
          case 0x0E:if(el)el.datatype=v.getInt16(doff);break;
          case 0x0F:if(el)el.width=v.getInt32(doff);break;
          case 0x10:{if(!el)break;const p=[];for(let i=0;i<dlen;i+=8)p.push([v.getInt32(doff+i),v.getInt32(doff+i+4)]);el.xy=(el.type==='sref')?p[0]||[0,0]:p;break;}
          case 0x11:el=null;break;
          case 0x12:if(el)el.sname=gStr(v,doff,dlen);break;
          case 0x13:if(el)el.colrow=[v.getInt16(doff),v.getInt16(doff+2)];break;
          case 0x19:if(el)el.string=gStr(v,doff,dlen);break;
          case 0x1B:if(el)el.mag=ibmD(v,doff);break;
          case 0x1C:if(el)el.angle=ibmD(v,doff);break;
        }
      }
      onPct(Math.round(off/v.byteLength*100));
      if(off+4<=v.byteLength)setTimeout(chunk,0);else resolve(lib);
    }
    setTimeout(chunk,0);
  });
}

// ── GDS WRITER ────────────────────────────────────────────
const ibmE=val=>{const r=new Uint8Array(8);if(!val)return r;let v=val<0?(r[0]|=0x80,-val):val,e=Math.floor(Math.log(v)/Math.log(16))+1,m=v/Math.pow(16,e);while(m<1/16&&m>0){m*=16;e--;}while(m>=1){m/=16;e++;}r[0]=(r[0]&0x80)|((e+64)&0x7F);for(let i=1;i<8;i++){m*=256;r[i]=m|0;m-=r[i];}return r;};
const cat=(...a)=>{const t=a.reduce((s,x)=>s+x.length,0),r=new Uint8Array(t);let o=0;a.forEach(x=>{r.set(x,o);o+=x.length;});return r;};
const rec=(t,dt,d)=>{const l=4+(d?d.length:0),b=new Uint8Array(l),v=new DataView(b.buffer);v.setUint16(0,l);b[2]=t;b[3]=dt;if(d)b.set(d,4);return b;};
const rE=t=>rec(t,0,null),rS16=(t,n)=>{const d=new Uint8Array(2);new DataView(d.buffer).setInt16(0,n);return rec(t,2,d);};
const rI32=(t,n)=>{const d=new Uint8Array(4);new DataView(d.buffer).setInt32(0,n);return rec(t,3,d);};
const rDbl=(t,n)=>rec(t,5,ibmE(n));
const rStr=(t,s)=>{let x=s;if(x.length%2)x+='\0';return rec(t,6,new Uint8Array([...x].map(c=>c.charCodeAt(0))));};
const rXY=pts=>{const d=new Uint8Array(pts.length*8),v=new DataView(d.buffer);pts.forEach(([x,y],i)=>{v.setInt32(i*8,Math.round(x));v.setInt32(i*8+4,Math.round(y));});return rec(0x10,3,d);};
function writeGDS(lib){
  const now=new Date(),td=()=>[now.getFullYear(),now.getMonth()+1,now.getDate(),now.getHours(),now.getMinutes(),now.getSeconds()];
  const ts=()=>{const d=new Uint8Array(24),v=new DataView(d.buffer);[...td(),...td()].forEach((x,i)=>v.setInt16(i*2,x));return d;};
  const ps=[rS16(0x00,600),rec(0x01,2,ts()),rStr(0x02,lib.name||'out'),rec(0x03,5,cat(ibmE(lib.userUnit||1e-3),ibmE(lib.dbUnit||1e-9)))];
  for(const c of lib.cells){
    ps.push(rec(0x05,2,ts()),rStr(0x06,c.name));
    for(const e of c.elements){
      if(e.type==='boundary'){const p=[...e.xy];if(p.length){const f=p[0],l=p[p.length-1];if(f[0]!==l[0]||f[1]!==l[1])p.push(p[0]);}ps.push(rE(0x08),rS16(0x0D,e.layer),rS16(0x0E,e.datatype||0),rXY(p),rE(0x11));}
      else if(e.type==='path'){ps.push(rE(0x09),rS16(0x0D,e.layer),rS16(0x0E,0));if(e.width)ps.push(rI32(0x0F,e.width));ps.push(rXY(e.xy),rE(0x11));}
      else if(e.type==='text'){ps.push(rE(0x0C),rS16(0x0D,e.layer),rS16(0x15,0));if(e.mag&&e.mag!==1)ps.push(rDbl(0x1B,e.mag));ps.push(rXY(e.xy.length?e.xy:[[0,0]]),rStr(0x19,e.string||''),rE(0x11));}
      else if(e.type==='sref'){ps.push(rE(0x0A),rStr(0x12,e.sname));if(e.angle)ps.push(rDbl(0x1C,e.angle));if(e.mag&&e.mag!==1)ps.push(rDbl(0x1B,e.mag));ps.push(rXY([Array.isArray(e.xy[0])?e.xy[0]:e.xy]),rE(0x11));}
      else if(e.type==='aref'&&e.xy.length>=3){ps.push(rE(0x0B),rStr(0x12,e.sname),rS16(0x13,(e.colrow||[1,1])[0]),rS16(0x14,(e.colrow||[1,1])[1]),rXY(e.xy.map(p=>Array.isArray(p)?p:[p,0])),rE(0x11));}
    }
    ps.push(rE(0x07));
  }
  ps.push(rE(0x04));return cat(...ps);
}

// ── OASIS PARSER ──────────────────────────────────────────
const readOU=(b,p)=>{let r=0,sh=0;for(;;){const v=b[p++];r|=(v&0x7F)<<sh;sh+=7;if(!(v&0x80))break;}return[r,p];};
const readOS=(b,p)=>{const[n,p2]=readOU(b,p);return[(n&1)?-(n>>1)-1:(n>>1),p2];};
const readOStr=(b,p)=>{const[l,p2]=readOU(b,p);let s='';for(let i=0;i<l;i++)s+=String.fromCharCode(b[p2+i]);return[s,p2+l];};
const readOReal=(b,p)=>{const t=b[p++];switch(t){case 0:return readOU(b,p);case 1:{const[n,q]=readOU(b,p);return[1/n,q];}case 2:{const[n,q]=readOU(b,p);return[-1/n,q];}case 3:{const[n,q]=readOU(b,p);const[d,q2]=readOU(b,q);return[n/d,q2];}case 4:{const[n,q]=readOU(b,p);const[d,q2]=readOU(b,q);return[-n/d,q2];}case 5:{const[n,q]=readOU(b,p);return[-n,q];}case 6:return[new DataView(b.buffer,b.byteOffset+p,4).getFloat32(0,true),p+4];case 7:return[new DataView(b.buffer,b.byteOffset+p,8).getFloat64(0,true),p+8];default:return[1,p];}};
function readPtList(b,p){const[,p2]=readOU(b,p);const[count,p3]=readOU(b,p2);const dl=[];let pos=p3;for(let i=0;i<count;i++){const[v,np]=readOS(b,pos);pos=np;dl.push(i%2===0?[v,0]:[0,v]);}return[dl,pos];}
function readRep(b,p){const[type,p2]=readOU(b,p);if(type===1){const[xc,p3]=readOU(b,p2);const[yc,p4]=readOU(b,p3);const[xs,p5]=readOU(b,p4);const[ys,p6]=readOU(b,p5);return[{type:1,xCount:xc+2,yCount:yc+2,xStep:xs,yStep:ys},p6];}return[{type:0},p2];}
const circPts=(cx,cy,r,n=128)=>{
  const p=[],seen=new Set();
  for(let i=0;i<n;i++){
    const a=2*Math.PI*i/n;
    const x=Math.round(cx+r*Math.cos(a)),y=Math.round(cy+r*Math.sin(a));
    const k=`${x},${y}`;if(!seen.has(k)){seen.add(k);p.push([x,y]);}
  }
  return p;
};
function parseOASIS(buf){
  const b=new Uint8Array(buf),mg='%SEMI-OASIS\r\n';
  for(let i=0;i<mg.length;i++)if(b[i]!==mg.charCodeAt(i))throw new Error('Not a valid OASIS file');
  const lib={name:'oasis',userUnit:1e-3,dbUnit:1e-9,cells:[],cellMap:{}};
  let pos=mg.length,cell=null;
  const cn=[],m={layer:0,datatype:0,x:0,y:0,width:0,height:0,radius:0,xyMode:0};
  while(pos<b.length-1){
    const rt=b[pos++];
    try{switch(rt){
      case 0:break;
      case 1:{const[,p2]=readOStr(b,pos);const[unit,p3]=readOReal(b,p2);if(unit>0)lib.dbUnit=1e-6/unit;pos=p3;break;}
      case 2:pos=b.length;break;
      case 3:{const[,p2]=readOStr(b,pos);pos=p2;break;}
      case 4:{const[n,p2]=readOStr(b,pos);const[ref,p3]=readOU(b,p2);cn[ref]=n;pos=p3;break;}
      case 13:{const[ref,p2]=readOU(b,pos);pos=p2;const name=cn[ref]||`CELL_${ref}`;cell={name,elements:[]};lib.cells.push(cell);lib.cellMap[name]=cell;m.x=0;m.y=0;break;}
      case 14:{const[name,p2]=readOStr(b,pos);pos=p2;cell={name,elements:[]};lib.cells.push(cell);lib.cellMap[name]=cell;m.x=0;m.y=0;break;}
      case 15:m.xyMode=0;break;case 16:m.xyMode=1;break;
      case 17:case 18:{const info=b[pos++];let cRef=null;
        if(info&0x80){if(info&0x40){const[n,p2]=readOStr(b,pos);pos=p2;cRef=n;}else{const[ref,p2]=readOU(b,pos);pos=p2;cRef=cn[ref]||`CELL_${ref}`;}}
        if(info&0x20){const[v,p2]=readOS(b,pos);pos=p2;m.x=m.xyMode?m.x+v:v;}
        if(info&0x10){const[v,p2]=readOS(b,pos);pos=p2;m.y=m.xyMode?m.y+v:v;}
        let rep=null;if(info&0x08){const[r,p2]=readRep(b,pos);pos=p2;rep=r;}
        if(cell&&cRef){if(rep&&rep.type===1){const{xCount:nc,yCount:nr,xStep:xs,yStep:ys}=rep;cell.elements.push({type:'aref',sname:cRef,colrow:[nc,nr],xy:[[m.x,m.y],[m.x+nc*xs,m.y],[m.x,m.y+nr*ys]]});}else cell.elements.push({type:'sref',sname:cRef,xy:[m.x,m.y]});}
        break;}
      case 20:{const info=b[pos++];
        if(info&0x80){const[l,p2]=readOU(b,pos);const[d,p3]=readOU(b,p2);m.layer=l;m.datatype=d;pos=p3;}
        if(info&0x40){const[v,p2]=readOU(b,pos);m.width=v;pos=p2;}
        if(info&0x20){const[v,p2]=readOU(b,pos);m.height=v;pos=p2;}else if(info&0x40)m.height=m.width;
        if(info&0x10){const[v,p2]=readOS(b,pos);pos=p2;m.x=m.xyMode?m.x+v:v;}
        if(info&0x08){const[v,p2]=readOS(b,pos);pos=p2;m.y=m.xyMode?m.y+v:v;}
        if(info&0x04){const[,p2]=readRep(b,pos);pos=p2;}
        if(cell){const{x,y,width:w,height:h,layer,datatype}=m;cell.elements.push({type:'boundary',layer,datatype,xy:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]});}break;}
      case 23:{const info=b[pos++];
        if(info&0x80){const[l,p2]=readOU(b,pos);const[d,p3]=readOU(b,p2);m.layer=l;m.datatype=d;pos=p3;}
        if(info&0x20){const[v,p2]=readOU(b,pos);m.radius=v;pos=p2;}
        if(info&0x10){const[v,p2]=readOS(b,pos);pos=p2;m.x=m.xyMode?m.x+v:v;}
        if(info&0x08){const[v,p2]=readOS(b,pos);pos=p2;m.y=m.xyMode?m.y+v:v;}
        if(cell)cell.elements.push({type:'boundary',layer:m.layer,datatype:m.datatype,xy:circPts(m.x,m.y,m.radius)});break;}
      case 25:{const info=b[pos++];
        if(info&0x80){const[l,p2]=readOU(b,pos);const[d,p3]=readOU(b,p2);m.layer=l;m.datatype=d;pos=p3;}
        let ptList=null;if(info&0x40){const[dl,p2]=readPtList(b,pos);pos=p2;ptList=dl;}
        if(info&0x20){const[v,p2]=readOS(b,pos);pos=p2;m.x=m.xyMode?m.x+v:v;}
        if(info&0x10){const[v,p2]=readOS(b,pos);pos=p2;m.y=m.xyMode?m.y+v:v;}
        if(info&0x08){const[,p2]=readRep(b,pos);pos=p2;}
        if(cell&&ptList){const pts=[[m.x,m.y]];let cx=m.x,cy=m.y;for(const[dx,dy]of ptList){cx+=dx;cy+=dy;pts.push([cx,cy]);}cell.elements.push({type:'boundary',layer:m.layer,datatype:m.datatype,xy:pts});}break;}
      default:break;
    }}catch(_e){pos=Math.min(pos+1,b.length);}
  }
  return lib;
}

// ── OASIS WRITER ──────────────────────────────────────────
const writeOU=v=>{v=Math.max(0,Math.round(v));const b=[];do{let x=v&0x7F;v>>>=7;if(v)x|=0x80;b.push(x);}while(v);if(!b.length)b.push(0);return new Uint8Array(b);};
const writeOS=v=>writeOU(v>=0?v*2:(-v)*2-1);
const writeOStr=s=>cat(writeOU(s.length),new Uint8Array([...s].map(c=>c.charCodeAt(0))));
const writeOReal=v=>{if(Number.isInteger(v)&&v>=0)return cat(new Uint8Array([0]),writeOU(v));const buf=new ArrayBuffer(8);new DataView(buf).setFloat64(0,v,true);return cat(new Uint8Array([7]),new Uint8Array(buf));};
const writeGD=(dx,dy)=>{const adx=Math.abs(dx),ady=Math.abs(dy);if(adx===0||ady===0||adx===ady){const dir=ady===0?(dx>0?0:2):(adx===0?(dy>0?1:3):(dx>0?(dy>0?4:7):(dy>0?5:6)));return writeOU((Math.max(adx,ady)<<4)|(dir<<1));}return cat(writeOU(1),writeOS(dx),writeOS(dy));};
const writePtList=pts=>cat(writeOU(4),writeOU(pts.length),...pts.map(([dx,dy])=>writeGD(dx,dy)));
const isRectO=pts=>{const n=pts.length;if(n!==4&&n!==5)return false;return true;};
function writeOASIS(lib){
  const dbUnit=lib.dbUnit||1e-9,upm=Math.round(1e-6/dbUnit);
  const mg='%SEMI-OASIS\r\n';
  const parts=[new Uint8Array([...mg].map(c=>c.charCodeAt(0)))];
  parts.push(writeOU(1),writeOStr('1.0'),writeOReal(upm),writeOU(0));
  lib.cells.forEach((c,i)=>parts.push(writeOU(4),writeOStr(c.name),writeOU(i)));
  lib.cells.forEach((c,ci)=>{
    parts.push(writeOU(13),writeOU(ci));
    for(const e of c.elements){
      if(e.type==='boundary'){
        if(isRectO(e.xy)){
          let x0=1e15,x1=-1e15,y0=1e15,y1=-1e15;
          for(const p of e.xy){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}
          const w=x1-x0,h=y1-y0,sq=w===h;
          parts.push(writeOU(20),new Uint8Array([0x80|0x40|(sq?0:0x20)|0x10|0x08]),writeOU(e.layer),writeOU(e.datatype||0),writeOU(w));
          if(!sq)parts.push(writeOU(h));parts.push(writeOS(x0),writeOS(y0));
        } else {
          const cp=e.xy,n=cp.length;
          const pp=(n>1&&cp[n-1][0]===cp[0][0]&&cp[n-1][1]===cp[0][1])?cp.slice(0,-1):[...cp];
          if(pp.length<3)continue;
          const dl=[];for(let i=1;i<pp.length;i++)dl.push([pp[i][0]-pp[i-1][0],pp[i][1]-pp[i-1][1]]);
          parts.push(writeOU(25),new Uint8Array([0xB0]),writeOU(e.layer),writeOU(e.datatype||0),writePtList(dl),writeOS(pp[0][0]),writeOS(pp[0][1]));
        }
      } else if(e.type==='path'&&e.xy.length>=2){
        const dl=[];for(let i=1;i<e.xy.length;i++)dl.push([e.xy[i][0]-e.xy[i-1][0],e.xy[i][1]-e.xy[i-1][1]]);
        parts.push(writeOU(24),new Uint8Array([0xDC]),writeOU(e.layer),writeOU(e.datatype||0),writeOU(Math.round((e.width||0)/2)),writePtList(dl),writeOS(e.xy[0][0]),writeOS(e.xy[0][1]));
      } else if(e.type==='sref'){
        const x=typeof e.xy[0]==='number'?e.xy[0]:e.xy[0][0],y=typeof e.xy[0]==='number'?e.xy[1]:e.xy[0][1];
        const ci2=lib.cells.findIndex(c2=>c2.name===e.sname);
        if(ci2>=0)parts.push(writeOU(17),new Uint8Array([0xB0]),writeOU(ci2),writeOS(x),writeOS(y));
        else parts.push(writeOU(17),new Uint8Array([0xF0]),writeOStr(e.sname),writeOS(x),writeOS(y));
      } else if(e.type==='aref'&&e.xy.length>=3){
        const[ox,oy]=e.xy[0],nc=(e.colrow||[1,1])[0],nr=(e.colrow||[1,1])[1];
        const xs=Math.abs(Math.round((e.xy[1][0]-ox)/Math.max(1,nc)));
        const ys=Math.abs(Math.round((e.xy[2][1]-oy)/Math.max(1,nr)));
        const ci2=lib.cells.findIndex(c2=>c2.name===e.sname);
        const ib=0x80|(ci2<0?0x40:0)|0x20|0x10|0x08;
        parts.push(writeOU(17),new Uint8Array([ib]));
        if(ci2>=0)parts.push(writeOU(ci2));else parts.push(writeOStr(e.sname));
        parts.push(writeOS(ox),writeOS(oy),writeOU(1),writeOU(Math.max(0,nc-2)),writeOU(Math.max(0,nr-2)),writeOU(xs),writeOU(ys));
      }
    }
  });
  parts.push(writeOU(2),writeOU(0));return cat(...parts);
}

// ── BBOX ──────────────────────────────────────────────────
function cellBBox(cell,map,depth){
  if(!cell||depth<0)return null;
  let x0=1e15,y0=1e15,x1=-1e15,y1=-1e15;
  for(const e of cell.elements){
    let pts=[];
    if(e.type==='boundary'||e.type==='path')pts=e.xy;
    else if(e.type==='text'&&e.xy.length)pts=Array.isArray(e.xy[0])?e.xy:[e.xy];
    else if(e.type==='sref'){const rc=map[e.sname];if(!rc)continue;const rb=cellBBox(rc,map,depth-1);if(!rb)continue;const ox=typeof e.xy[0]==='number'?e.xy[0]:e.xy[0][0],oy=typeof e.xy[0]==='number'?e.xy[1]:e.xy[0][1];pts=[[rb.x0+ox,rb.y0+oy],[rb.x1+ox,rb.y1+oy]];}
    else if(e.type==='aref'&&e.xy.length>=3){const rc=map[e.sname];if(!rc)continue;const rb=cellBBox(rc,map,depth-1);if(!rb)continue;const ox=e.xy[0][0],oy=e.xy[0][1],nc=(e.colrow||[1,1])[0],nr=(e.colrow||[1,1])[1];const csx=(e.xy[1][0]-ox)/nc,csy=(e.xy[1][1]-oy)/nc,rsx=(e.xy[2][0]-ox)/nr,rsy=(e.xy[2][1]-oy)/nr;for(const row of[0,nr-1])for(const col of[0,nc-1]){const ix=ox+col*csx+row*rsx,iy=oy+col*csy+row*rsy;pts.push([rb.x0+ix,rb.y0+iy],[rb.x1+ix,rb.y1+iy]);}}
    for(const pt of pts){if(pt[0]<x0)x0=pt[0];if(pt[0]>x1)x1=pt[0];if(pt[1]<y0)y0=pt[1];if(pt[1]>y1)y1=pt[1];}
  }
  return x0===1e15?null:{x0,y0,x1,y1};
}
let _cLib=null;const _bbc=new Map();
function cachedBBox(cell,map,lib){if(lib!==_cLib){_bbc.clear();_cLib=lib;}if(!_bbc.has(cell.name))_bbc.set(cell.name,cellBBox(cell,map,4));return _bbc.get(cell.name);}
function elemBBox(e){if(e.type==='boundary'||e.type==='path'){let x0=1e15,x1=-1e15,y0=1e15,y1=-1e15;for(const p of e.xy){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}return{x0,y0,x1,y1};}return null;}

// ── HIT TEST ──────────────────────────────────────────────
function selectElHit(gx,gy,cell,map){
  if(!cell)return null;let best=null,bestArea=Infinity;
  for(let i=0;i<cell.elements.length;i++){
    const e=cell.elements[i];let bb=null;
    if(e.type==='boundary'||e.type==='path'){bb=elemBBox(e);}
    else if(e.type==='sref'){const rc=map[e.sname];if(rc){const rb=cellBBox(rc,map,2);if(rb){const ox=typeof e.xy[0]==='number'?e.xy[0]:e.xy[0][0],oy=typeof e.xy[0]==='number'?e.xy[1]:e.xy[0][1];bb={x0:rb.x0+ox,y0:rb.y0+oy,x1:rb.x1+ox,y1:rb.y1+oy};}}}
    if(!bb)continue;
    if(gx>=bb.x0&&gx<=bb.x1&&gy>=bb.y0&&gy<=bb.y1){const area=(bb.x1-bb.x0)*(bb.y1-bb.y0);if(area<bestArea){bestArea=area;best={elIdx:i,bb,el:e};}}
  }
  return best;
}
function hitTest(gx,gy,cell,map,ox,oy,mag,depth){
  if(!cell||depth<0)return null;let best=null;
  for(const e of cell.elements){
    try{
      let h=null;
      if(e.type==='boundary'&&e.xy.length>2){let bx0=1e15,bx1=-1e15,by0=1e15,by1=-1e15;for(const p of e.xy){const wx=ox+p[0]*mag,wy=oy+p[1]*mag;if(wx<bx0)bx0=wx;if(wx>bx1)bx1=wx;if(wy<by0)by0=wy;if(wy>by1)by1=wy;}const cx=(bx0+bx1)/2,cy=(by0+by1)/2,diam=Math.max(bx1-bx0,by1-by0),dist=Math.hypot(gx-cx,gy-cy);if(diam>0&&dist<diam*0.65)h={wc:[cx,cy],diam,layer:e.layer,dist};}
      else if(e.type==='sref'){const rc=map[e.sname];if(!rc)continue;const ex=typeof e.xy[0]==='number'?e.xy[0]:e.xy[0][0],ey=typeof e.xy[0]==='number'?e.xy[1]:e.xy[0][1];h=hitTest(gx,gy,rc,map,ox+ex*mag,oy+ey*mag,mag*(e.mag||1),depth-1);}
      else if(e.type==='aref'&&e.xy.length>=3){const rc=map[e.sname];if(!rc)continue;const bx=e.xy[0][0],by=e.xy[0][1],nc=(e.colrow||[1,1])[0],nr=(e.colrow||[1,1])[1];const csx=(e.xy[1][0]-bx)/nc,csy=(e.xy[1][1]-by)/nc,rsx=(e.xy[2][0]-bx)/nr,rsy=(e.xy[2][1]-by)/nr,emag=e.mag||1;for(let row=0;row<=Math.min(nr-1,9);row++){for(let col=0;col<=Math.min(nc-1,9);col++){const ix=bx+col*csx+row*rsx,iy=by+col*csy+row*rsy;h=hitTest(gx,gy,rc,map,ox+ix*mag,oy+iy*mag,mag*emag,depth-1);if(h)break;}if(h)break;}}
      if(h&&(!best||h.dist<best.dist))best=h;
    }catch(_e){}
  }
  return best;
}

// ── RENDERER ──────────────────────────────────────────────
function drawCell(ctx,cell,map,lc,lv,tr,W,H,depth,lib){
  if(!cell||depth<0)return;
  const tx=tr.x,ty=tr.y,s=tr.s;
  for(const e of cell.elements){
    try{
      if((e.type==='boundary'||e.type==='path')&&lv[e.layer]===false)continue;
      const col=lCol(lc,e.layer);
      if(e.type==='boundary'&&e.xy.length>1){
        let sx0=1e9,sy0=1e9,sx1=-1e9,sy1=-1e9;
        for(const p of e.xy){const cx2=tx+p[0]*s,cy2=ty-p[1]*s;if(cx2<sx0)sx0=cx2;if(cx2>sx1)sx1=cx2;if(cy2<sy0)sy0=cy2;if(cy2>sy1)sy1=cy2;}
        if(sx1<-10||sx0>W+10||sy1<-10||sy0>H+10)continue;if(sx1-sx0<0.5&&sy1-sy0<0.5)continue;
        let isCircular=false,pcx=(sx0+sx1)/2,pcy=(sy0+sy1)/2,prad=(sx1-sx0+sy1-sy0)/4;
        if(e.xy.length>=8){
          const gcx=e.xy.reduce((s,p)=>s+p[0],0)/e.xy.length;
          const gcy=e.xy.reduce((s,p)=>s+p[1],0)/e.xy.length;
          const radii=e.xy.map(p=>Math.hypot(p[0]-gcx,p[1]-gcy));
          const avgR=radii.reduce((s,r)=>s+r,0)/radii.length;
          const maxErr=radii.reduce((m,r)=>Math.max(m,Math.abs(r-avgR)),0);
          if(avgR>0&&maxErr/avgR<0.12){
            isCircular=true;
            pcx=tx+gcx*s;pcy=ty-gcy*s;prad=avgR*s;
          }
        }
        ctx.beginPath();
        if(isCircular){
          ctx.arc(pcx,pcy,prad,0,Math.PI*2);
        } else {
          for(let i=0;i<e.xy.length;i++){const p=e.xy[i];i?ctx.lineTo(tx+p[0]*s,ty-p[1]*s):ctx.moveTo(tx+p[0]*s,ty-p[1]*s);}
          ctx.closePath();
        }
        ctx.fillStyle=hexA(col,0.25);ctx.strokeStyle=col;ctx.lineWidth=Math.max(0.5,s*0.0005);ctx.fill();ctx.stroke();
      } else if(e.type==='path'&&e.xy.length>1){
        ctx.beginPath();for(let i=0;i<e.xy.length;i++){const p=e.xy[i];i?ctx.lineTo(tx+p[0]*s,ty-p[1]*s):ctx.moveTo(tx+p[0]*s,ty-p[1]*s);}
        ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,Math.abs(e.width||0)*s);ctx.stroke();
      } else if(e.type==='text'&&e.xy.length&&s>0.001){
        const xy=Array.isArray(e.xy[0])?e.xy[0]:e.xy;ctx.fillStyle=col;ctx.font=`${Math.max(8,10*(e.mag||1))}px monospace`;ctx.fillText(e.string||'',tx+xy[0]*s,ty-xy[1]*s);
      } else if(e.type==='sref'){
        const rc=map[e.sname];if(!rc)continue;
        const ex=typeof e.xy[0]==='number'?e.xy[0]:e.xy[0][0],ey=typeof e.xy[0]==='number'?e.xy[1]:e.xy[0][1];
        const sc=s*(e.mag||1);const bb=cachedBBox(rc,map,lib);
        if(bb){const bw=Math.abs(bb.x1-bb.x0)*sc,bh=Math.abs(bb.y1-bb.y0)*sc;if(bw<1&&bh<1){const rx0=tx+(ex+bb.x0)*sc,rx1=tx+(ex+bb.x1)*sc,ry0=ty-(ey+bb.y1)*sc,ry1=ty-(ey+bb.y0)*sc;if(rx1>-10&&rx0<W+10&&ry1>-10&&ry0<H+10){ctx.fillStyle='rgba(0,0,0,0.12)';ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1;ctx.fillRect(rx0,ry0,rx1-rx0,ry1-ry0);ctx.strokeRect(rx0,ry0,rx1-rx0,ry1-ry0);}continue;}}
        drawCell(ctx,rc,map,lc,lv,{x:tx+ex*s,y:ty-ey*s,s:sc},W,H,depth-1,lib);
      } else if(e.type==='aref'&&e.xy.length>=3){
        const rc=map[e.sname];if(!rc)continue;
        const ox=e.xy[0][0],oy=e.xy[0][1],nc=(e.colrow||[1,1])[0],nr=(e.colrow||[1,1])[1];if(nc<1||nr<1)continue;
        const csx=(e.xy[1][0]-ox)/nc,csy=(e.xy[1][1]-oy)/nc,rsx=(e.xy[2][0]-ox)/nr,rsy=(e.xy[2][1]-oy)/nr;
        const sc=s*(e.mag||1);const bb=cachedBBox(rc,map,lib);
        const bx0=bb?bb.x0:0,bx1=bb?bb.x1:0,by0=bb?bb.y0:0,by1=bb?bb.y1:0;
        const bw=(bx1-bx0)*sc,bh=(by1-by0)*sc,ccx=(bx0+bx1)/2,ccy=(by0+by1)/2;
        if(bw<1&&bh<1){const cx=[ox,ox+(nc-1)*csx+(nr-1)*rsx],cy2=[oy,oy+(nc-1)*csy+(nr-1)*rsy];const ax0=Math.min(...cx)+bx0,ax1=Math.max(...cx)+bx1,ay0=Math.min(...cy2)+by0,ay1=Math.max(...cy2)+by1;const rx0=tx+ax0*sc,rx1=tx+ax1*sc,ry0=ty-ay1*sc,ry1=ty-ay0*sc;if(rx1>-10&&rx0<W+10&&ry1>-10&&ry0<H+10){ctx.fillStyle='rgba(0,0,0,0.12)';ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1;ctx.fillRect(rx0,ry0,rx1-rx0,ry1-ry0);ctx.strokeRect(rx0,ry0,rx1-rx0,ry1-ry0);}continue;}
        let c0=0,c1=nc-1,r0=0,r1=nr-1;
        const axial=Math.abs(csy)<0.5&&Math.abs(rsx)<0.5&&Math.abs(csx)>0&&Math.abs(rsy)>0;
        if(axial){const gx0=(-10-tx)/sc,gx1=(W+10-tx)/sc,gy0=(ty-(H+10))/sc,gy1=(ty+10)/sc;const vr=(o,p,bMin,bMax,n,g0,g1)=>{let a,b;if(p>0){a=Math.max(0,Math.ceil((g0-o-bMax)/p));b=Math.min(n-1,Math.floor((g1-o-bMin)/p));}else{a=Math.max(0,Math.ceil((g1-o-bMin)/p));b=Math.min(n-1,Math.floor((g0-o-bMax)/p));}return[a,b];};[c0,c1]=vr(ox,csx,bx0,bx1,nc,gx0,gx1);[r0,r1]=vr(oy,rsy,by0,by1,nr,gy0,gy1);if(c0>c1||r0>r1)continue;}
        if(bw<8&&bh<8){ctx.fillStyle=lCol(lc,0)+'cc';for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++){const ix=ox+col*csx+row*rsx,iy=oy+col*csy+row*rsy;const px=tx+(ix+ccx)*sc,py=ty-(iy+ccy)*sc;if(!axial&&(px<-4||px>W+4||py<-4||py>H+4))continue;ctx.fillRect(px-1.5,py-1.5,3,3);}continue;}
        for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++){const ix=ox+col*csx+row*rsx,iy=oy+col*csy+row*rsy;if(!axial&&bb){const sl=tx+(ix+bx0)*sc,sr=tx+(ix+bx1)*sc,st=ty-(iy+by1)*sc,sb=ty-(iy+by0)*sc;if(sr<-10||sl>W+10||sb<-10||st>H+10)continue;}drawCell(ctx,rc,map,lc,lv,{x:tx+ix*s,y:ty-iy*s,s:sc},W,H,depth-1,lib);}
      }
    }catch(_e){}
  }
}

// ── AI SUMMARY ────────────────────────────────────────────
function libSummary(lib){
  if(!lib)return'No library loaded.';
  const sc=lib.dbUnit*1e9,nm=v=>+(v*sc).toFixed(1);
  const lines=[`Library:"${lib.name}" scale=${sc}nm/unit cells=${lib.cells.length}`];
  for(const c of lib.cells){
    const parts=[],bounds=c.elements.filter(e=>e.type==='boundary'),arefs=c.elements.filter(e=>e.type==='aref');
    if(bounds.length){const info=bounds.slice(0,3).map(e=>{let bx0=1e15,bx1=-1e15,by0=1e15,by1=-1e15;for(const p of e.xy){if(p[0]<bx0)bx0=p[0];if(p[0]>bx1)bx1=p[0];if(p[1]<by0)by0=p[1];if(p[1]>by1)by1=p[1];}return`L${e.layer}:${nm(bx1-bx0)}×${nm(by1-by0)}nm`;});parts.push(`boundaries:[${info.join(',')}]`);}
    for(const e of arefs){if(e.xy.length<3)continue;const ox=e.xy[0][0],oy=e.xy[0][1],nc=(e.colrow||[1,1])[0],nr=(e.colrow||[1,1])[1];const csx=(e.xy[1][0]-ox)/nc,csy=(e.xy[1][1]-oy)/nc,rsx=(e.xy[2][0]-ox)/nr,rsy=(e.xy[2][1]-oy)/nr;parts.push(`aref:"${e.sname}" ${nc}×${nr} col_step=(${csx.toFixed(1)},${csy.toFixed(1)}) row_step=(${rsx.toFixed(1)},${rsy.toFixed(1)})`);}
    lines.push(`Cell"${c.name}":${parts.join(' | ')}`);
  }
  return lines.join('\n');
}

// ── SHAPE UTILS ───────────────────────────────────────────
const rPts=(x,y,w,h)=>[[Math.round(x),Math.round(y)],[Math.round(x+w),Math.round(y)],[Math.round(x+w),Math.round(y+h)],[Math.round(x),Math.round(y+h)]];
const snapPt=(gx,gy,snap,grid)=>snap&&grid?[Math.round(gx/grid)*grid,Math.round(gy/grid)*grid]:[gx,gy];
const c2g=(cx,cy,tr)=>[(cx-tr.x)/tr.s,-((cy-tr.y)/tr.s)];
const g2c=(gx,gy,tr)=>[tr.x+gx*tr.s,tr.y-gy*tr.s];
const crossEls=(cx,cy,arm,w,layer)=>[{type:'boundary',layer,datatype:0,xy:rPts(cx-arm,cy-w/2,arm*2,w)},{type:'boundary',layer,datatype:0,xy:rPts(cx-w/2,cy-arm,w,arm*2)}];
function translateEl(e,dx,dy){if(e.type==='boundary'||e.type==='path')return{...e,xy:e.xy.map(([x,y])=>[x+dx,y+dy])};if(e.type==='sref'){const ox=typeof e.xy[0]==='number'?e.xy[0]:e.xy[0][0],oy=typeof e.xy[0]==='number'?e.xy[1]:e.xy[0][1];return{...e,xy:[ox+dx,oy+dy]};}if(e.type==='aref')return{...e,xy:e.xy.map(([x,y])=>[x+dx,y+dy])};return e;}
function rotateEl90(e){if(e.type!=='boundary'&&e.type!=='path')return{...e,angle:((e.angle||0)+90)%360};const bb=elemBBox(e);if(!bb)return e;const ccx=(bb.x0+bb.x1)/2,ccy=(bb.y0+bb.y1)/2;return{...e,xy:e.xy.map(([x,y])=>[Math.round(-(y-ccy)+ccx),Math.round((x-ccx)+ccy)])};}
function mirrorEl(e,axis){if(e.type!=='boundary'&&e.type!=='path')return e;const bb=elemBBox(e);if(!bb)return e;const ccx=(bb.x0+bb.x1)/2,ccy=(bb.y0+bb.y1)/2;if(axis==='h')return{...e,xy:e.xy.map(([x,y])=>[Math.round(2*ccx-x),y])};return{...e,xy:e.xy.map(([x,y])=>[x,Math.round(2*ccy-y)])};}
function runDRC(cell,dbUnit,minSpNm,minFeatNm){
  if(!cell)return['No cell loaded'];
  const nmU=dbUnit*1e9,minSp=minSpNm/nmU,minFeat=minFeatNm/nmU;
  const bds=cell.elements.filter(e=>e.type==='boundary');const results=[];
  for(let i=0;i<Math.min(bds.length,300);i++){const b1=elemBBox(bds[i]);if(!b1)continue;const w=b1.x1-b1.x0,h=b1.y1-b1.y0;if(Math.min(w,h)<minFeat)results.push(`⚠ Min feature L${bds[i].layer}: ${fmtNm(Math.min(w,h)*nmU)} < ${fmtNm(minFeatNm)}`);for(let j=i+1;j<Math.min(bds.length,300);j++){if(bds[i].layer!==bds[j].layer)continue;const b2=elemBBox(bds[j]);if(!b2)continue;const dx=Math.max(0,Math.max(b1.x0,b2.x0)-Math.min(b1.x1,b2.x1)),dy=Math.max(0,Math.max(b1.y0,b2.y0)-Math.min(b1.y1,b2.y1));const dist=Math.sqrt(dx*dx+dy*dy);if(dist>0&&dist<minSp){results.push(`⚠ Spacing L${bds[i].layer}: ${fmtNm(dist*nmU)} < ${fmtNm(minSpNm)}`);if(results.length>=20)return results;}}}
  return results.length?results:['✅ No DRC violations found'];
}

// ── MAIN COMPONENT ────────────────────────────────────────
function GDSStudio(){
  const[lib,setLib]=useState(null);
  const[selCell,setSelCell]=useState(null);
  const[lc,setLc]=useState({});const[lv,setLv]=useState({});
  const[tr,setTr]=useState({x:400,y:300,s:1});
  const[msgs,setMsgs]=useState([{role:'assistant',content:'Hi! Drop a .gds or .oas file to open it, or ask me to create shapes.\n\nNew: ✏ Draw tools · ↩ Undo/Redo · ⌀ Wafer · ◐ Polarity · DRC · OASIS import/export!'}]);
  const[inp,setInp]=useState('');const[busy,setBusy]=useState(false);
  const[tab,setTab]=useState('ai');
  const[status,setStatus]=useState('Drop a .gds/.oas file or use AI');
  const[panning,setPanning]=useState(false);const[lastXY,setLastXY]=useState({x:0,y:0});
  const[csize,setCsize]=useState({w:0,h:0});
  const[pending,setPending]=useState(null);const[cursor,setCursor]=useState(null);
  const[over,setOver]=useState(false);const[loading,setLoading]=useState(false);
  const[sels,setSels]=useState([]);
  const[drawMode,setDrawMode]=useState('select');
  const[drawPts,setDrawPts]=useState([]);
  const[drawCur,setDrawCur]=useState(null);
  const[activeLayer,setActiveLayer]=useState(0);
  const[snapOn,setSnapOn]=useState(false);
  const[gridSize,setGridSize]=useState(1000);
  const[selEl,setSelEl]=useState(null);
  const[clipboard,setClipboard]=useState(null);
  const[waferOn,setWaferOn]=useState(false);
  const[waferDia,setWaferDia]=useState(100);
  const[polarInvert,setPolarInvert]=useState(false);
  const[drcMinSp,setDrcMinSp]=useState(500);
  const[drcMinFeat,setDrcMinFeat]=useState(200);
  const[showDrcPanel,setShowDrcPanel]=useState(false);
  const[mergeFrom,setMergeFrom]=useState(0);const[mergeTo,setMergeTo]=useState(1);
  const[rulers,setRulers]=useState([]);
  const[cForm,setCForm]=useState({name:'',email:'',msg:''});
  const[cStatus,setCStatus]=useState('');

  const cvRef=useRef(null),contRef=useRef(null),fileRef=useRef(null),msgEnd=useRef(null);
  const libRef=useRef(null),selRef=useRef(null),mdRef=useRef({x:0,y:0,gx:0,gy:0});
  const abortRef=useRef(null),cancelRef=useRef(false),rdrRef=useRef(null);
  const histRef=useRef({stack:[],idx:-1});
  const movingRef=useRef(null);
  const drawStartRef=useRef(null);
  libRef.current=lib;selRef.current=selCell;

  const pushHist=useCallback((newLib)=>{const h=histRef.current;const json=JSON.stringify(newLib);const newStack=[...h.stack.slice(0,h.idx+1),json].slice(-30);histRef.current={stack:newStack,idx:newStack.length-1};},[]);
  const applyLib=useCallback((newLib,msg)=>{const cm={};newLib.cells.forEach(c=>{cm[c.name]=c;});const updated={...newLib,cellMap:cm};pushHist(updated);libRef.current=updated;setLib(updated);if(selRef.current){const uc=cm[selRef.current.name];if(uc){selRef.current=uc;setSelCell(uc);}}if(msg)setStatus(msg);return updated;},[pushHist]);
  const undo=useCallback(()=>{const h=histRef.current;if(h.idx<=0)return;const newIdx=h.idx-1;const parsed=JSON.parse(h.stack[newIdx]);const cm={};parsed.cells.forEach(c=>{cm[c.name]=c;});const restored={...parsed,cellMap:cm};histRef.current={...h,idx:newIdx};libRef.current=restored;setLib(restored);if(selRef.current){const uc=cm[selRef.current.name];selRef.current=uc||null;setSelCell(uc||null);}setSelEl(null);setStatus('↩ Undo');},[]);
  const redo=useCallback(()=>{const h=histRef.current;if(h.idx>=h.stack.length-1)return;const newIdx=h.idx+1;const parsed=JSON.parse(h.stack[newIdx]);const cm={};parsed.cells.forEach(c=>{cm[c.name]=c;});const restored={...parsed,cellMap:cm};histRef.current={...h,idx:newIdx};libRef.current=restored;setLib(restored);if(selRef.current){const uc=cm[selRef.current.name];selRef.current=uc||null;setSelCell(uc||null);}setSelEl(null);setStatus('↪ Redo');},[]);
  const getActiveCell=useCallback(()=>selRef.current||(libRef.current?.cells?.length?libRef.current.cells[libRef.current.cells.length-1]:null),[]);
  const addElements=useCallback((els)=>{const cell=getActiveCell();const cl=libRef.current;if(!cell||!cl){setStatus('⚠ No cell. Load a file or use AI first.');return;}const newCell={...cell,elements:[...cell.elements,...els]};const newCells=cl.cells.map(c=>c.name===cell.name?newCell:c);applyLib({...cl,cells:newCells},`Added ${els.length} element(s)`);setSelEl(null);},[getActiveCell,applyLib]);
  const deleteSelEl=useCallback(()=>{if(!selEl)return;const cell=getActiveCell();const cl=libRef.current;if(!cell||!cl)return;const newCell={...cell,elements:cell.elements.filter((_,i)=>i!==selEl.elIdx)};const newCells=cl.cells.map(c=>c.name===cell.name?newCell:c);applyLib({...cl,cells:newCells},'Element deleted');setSelEl(null);},[selEl,getActiveCell,applyLib]);
  const updateSelEl=useCallback((newEl,push=true)=>{if(!selEl)return;const cell=getActiveCell();const cl=libRef.current;if(!cell||!cl)return;const newElements=cell.elements.map((e,i)=>i===selEl.elIdx?newEl:e);const newCell={...cell,elements:newElements};const newCells=cl.cells.map(c=>c.name===cell.name?newCell:c);const cm={};[...newCells].forEach(c=>{cm[c.name]=c;});const updated={...cl,cells:newCells,cellMap:cm};if(push)pushHist(updated);libRef.current=updated;setLib(updated);selRef.current=newCell;setSelCell(newCell);setSelEl({...selEl,bb:elemBBox(newEl)||selEl.bb,el:newEl});},[selEl,getActiveCell,pushHist]);
  const allLayers=useMemo(()=>{if(!lib)return[];const s=new Set();lib.cells.forEach(c=>c.elements.forEach(e=>{if(e.layer!=null)s.add(e.layer);}));return[...s].sort((a,b)=>a-b);},[lib]);
  useEffect(()=>{const nc={...lc},nv={...lv};let ch=false;allLayers.forEach(l=>{if(!nc[l]){nc[l]=LCOLS[l%LCOLS.length];ch=true;}if(nv[l]===undefined){nv[l]=true;ch=true;}});if(ch){setLc(nc);setLv(nv);}},[allLayers.join(',')]);
  const fitView=useCallback(()=>{const cv=cvRef.current,cl=libRef.current;if(!cv||!cl||cv.width===0)return;const cell=selRef.current||(cl.cells.length?cl.cells[cl.cells.length-1]:null);let bb=cell?cellBBox(cell,cl.cellMap,4):null;if(!bb){let x0=1e15,y0=1e15,x1=-1e15,y1=-1e15;for(const c of cl.cells){const b=cellBBox(c,cl.cellMap,4);if(b){if(b.x0<x0)x0=b.x0;if(b.y0<y0)y0=b.y0;if(b.x1>x1)x1=b.x1;if(b.y1>y1)y1=b.y1;}}if(x0<1e15)bb={x0,y0,x1,y1};}if(!bb)return;const W=cv.width,H=cv.height,m=0.1,s=Math.min((W*(1-2*m))/(bb.x1-bb.x0||1),(H*(1-2*m))/(bb.y1-bb.y0||1));setTr({s,x:W/2-(bb.x0+bb.x1)/2*s,y:H/2+(bb.y0+bb.y1)/2*s});},[]);
  useEffect(()=>{if(lib)setTimeout(fitView,80);},[lib,selCell]);
  useEffect(()=>{if(pending&&lib){const c=lib.cellMap[pending];if(c){setSelCell(c);setPending(null);setTimeout(fitView,80);}}},[pending,lib]);
  useEffect(()=>{const el=contRef.current;if(!el)return;const obs=new ResizeObserver(([en])=>{const{width:w,height:h}=en.contentRect;const cv=cvRef.current;if(cv){cv.width=Math.floor(w);cv.height=Math.floor(h);}setCsize({w:Math.floor(w),h:Math.floor(h)});});obs.observe(el);return()=>obs.disconnect();},[]);

  useEffect(()=>{
    const cv=cvRef.current;if(!cv||cv.width===0)return;
    const ctx=cv.getContext('2d');const W=cv.width,H=cv.height;
    ctx.clearRect(0,0,W,H);
    if(polarInvert){ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);}else{ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);}
    const gs=50*tr.s;
    if(gs>6&&!polarInvert){ctx.strokeStyle='#e8e8e8';ctx.lineWidth=0.5;for(let x=((tr.x%gs)+gs)%gs;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=((tr.y%gs)+gs)%gs;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}}
    if(snapOn&&gridSize>0){const gsd=gridSize*tr.s;if(gsd>8){ctx.fillStyle=polarInvert?'rgba(255,255,255,0.2)':'rgba(0,100,200,0.3)';const sx=((tr.x%gsd)+gsd)%gsd,sy=((tr.y%gsd)+gsd)%gsd;for(let x=sx;x<W;x+=gsd)for(let y=sy;y<H;y+=gsd)ctx.fillRect(x-1.5,y-1.5,3,3);}}
    const cell=selCell||(lib&&lib.cells.length?lib.cells[lib.cells.length-1]:null);
    if(cell&&lib){if(polarInvert){ctx.save();ctx.globalCompositeOperation='screen';}drawCell(ctx,cell,lib.cellMap,lc,lv,tr,W,H,12,lib);if(polarInvert)ctx.restore();}
    if(selEl&&selEl.bb){const bb=selEl.bb;const sx0=tr.x+bb.x0*tr.s-5,sy0=tr.y-bb.y1*tr.s-5,sw=(bb.x1-bb.x0)*tr.s+10,sh=(bb.y1-bb.y0)*tr.s+10;ctx.strokeStyle='#0066ff';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);ctx.strokeRect(sx0,sy0,sw,sh);ctx.setLineDash([]);if(lib){const nmU=lib.dbUnit*1e9;ctx.fillStyle='#0066ff';ctx.font='bold 10px monospace';ctx.fillText(`${fmtNm((bb.x1-bb.x0)*nmU)} × ${fmtNm((bb.y1-bb.y0)*nmU)}`,sx0+2,sy0-4);}}
    const dCol=lCol(lc,activeLayer);
    if(drawStartRef.current&&(drawMode==='rect'||drawMode==='circle')){
      const[s0x,s0y]=drawStartRef.current;const dc=drawCur||[s0x,s0y];
      if(drawMode==='rect'){const[px0,py0]=g2c(Math.min(s0x,dc[0]),Math.min(s0y,dc[1]),tr);const[px1,py1]=g2c(Math.max(s0x,dc[0]),Math.max(s0y,dc[1]),tr);ctx.fillStyle=hexA(dCol,0.15);ctx.strokeStyle=dCol;ctx.lineWidth=1.5;ctx.setLineDash([5,3]);ctx.fillRect(px0,py0,px1-px0,py1-py0);ctx.strokeRect(px0,py0,px1-px0,py1-py0);ctx.setLineDash([]);}
      else{const r=Math.hypot(dc[0]-s0x,dc[1]-s0y);const[pcx,pcy]=g2c(s0x,s0y,tr);const pr=r*tr.s;ctx.fillStyle=hexA(dCol,0.15);ctx.strokeStyle=dCol;ctx.lineWidth=1.5;ctx.setLineDash([5,3]);ctx.beginPath();ctx.arc(pcx,pcy,pr,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);}
    }
    if((drawMode==='polygon'||drawMode==='path')&&drawPts.length>0){
      const dc=drawCur;ctx.strokeStyle=dCol;ctx.lineWidth=1.5;ctx.setLineDash([4,2]);
      ctx.beginPath();const[p0x,p0y]=g2c(drawPts[0][0],drawPts[0][1],tr);ctx.moveTo(p0x,p0y);
      for(let i=1;i<drawPts.length;i++){const[px,py]=g2c(drawPts[i][0],drawPts[i][1],tr);ctx.lineTo(px,py);}
      if(dc){const[dcx,dcy]=g2c(dc[0],dc[1],tr);ctx.lineTo(dcx,dcy);if(drawMode==='polygon')ctx.closePath();}
      ctx.fillStyle=hexA(dCol,0.1);ctx.fill();ctx.stroke();ctx.setLineDash([]);
      drawPts.forEach(pt=>{const[px,py]=g2c(pt[0],pt[1],tr);ctx.fillStyle='#fff';ctx.fillRect(px-4,py-4,8,8);ctx.strokeStyle=dCol;ctx.lineWidth=1.5;ctx.strokeRect(px-4,py-4,8,8);});
      ctx.fillStyle='#333';ctx.font='10px monospace';ctx.fillText(`${drawPts.length} pts · Enter=finish · Esc=cancel`,8,H-28);
    }
    if(waferOn&&lib){const waferR=(waferDia*1e6)/(lib.dbUnit*1e9);const[wcx,wcy]=g2c(0,0,tr);const wr=waferR*tr.s;ctx.strokeStyle='rgba(220,50,50,0.5)';ctx.lineWidth=2;ctx.setLineDash([12,6]);ctx.beginPath();ctx.arc(wcx,wcy,wr,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(220,50,50,0.7)';ctx.font='11px monospace';ctx.fillText(`⌀ ${waferDia}mm`,wcx-20,wcy-wr-5);}
    if(sels.length>0&&lib){const nmU=lib.dbUnit*1e9;const SC=['#0066ff','#ff6600'];sels.forEach((s,i)=>{if(!s?.wc)return;const scx=tr.x+s.wc[0]*tr.s,scy=tr.y-s.wc[1]*tr.s,r=Math.max((s.diam||0)/2*tr.s,4);if(!Number.isFinite(scx+scy+r))return;ctx.beginPath();ctx.arc(scx,scy,r+3,0,Math.PI*2);ctx.strokeStyle=SC[i];ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=SC[i];ctx.font='bold 11px monospace';ctx.fillText(`${i+1}`,scx+r+5,scy-3);});if(sels.length===2&&sels[0].wc&&sels[1].wc){const ax=tr.x+sels[0].wc[0]*tr.s,ay=tr.y-sels[0].wc[1]*tr.s,bx=tr.x+sels[1].wc[0]*tr.s,by=tr.y-sels[1].wc[1]*tr.s;if(Number.isFinite(ax+ay+bx+by)){ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.strokeStyle='#333';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);const p=Math.hypot(sels[1].wc[0]-sels[0].wc[0],sels[1].wc[1]-sels[0].wc[1])*nmU;ctx.fillStyle='#000';ctx.font='bold 11px monospace';ctx.fillText(`⟷ ${fmtNm(p)}`,(ax+bx)/2+6,(ay+by)/2-5);}}}
    rulers.forEach(r=>{const[ax,ay]=g2c(r.p1[0],r.p1[1],tr),cb=g2c(r.p2[0],r.p2[1],tr);ctx.strokeStyle='#9932cc';ctx.lineWidth=1.5;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(...cb);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#9932cc';ctx.font='bold 10px monospace';ctx.fillText(r.label,(ax+cb[0])/2+3,(ay+cb[1])/2-4);});
    if(lib){const nmPx=tr.s/(lib.dbUnit*1e9);const targetPx=120;const nmRaw=targetPx/nmPx;const mag10=Math.pow(10,Math.floor(Math.log10(nmRaw)));const norm=nmRaw/mag10;const niceNm=norm<1.5?mag10:norm<3.5?2*mag10:norm<7.5?5*mag10:10*mag10;const barPx=niceNm*nmPx;const label=niceNm>=1e6?`${niceNm/1e6}mm`:niceNm>=1000?`${niceNm/1000}μm`:`${niceNm}nm`;const bx=16,by=H-16;ctx.fillStyle='rgba(255,255,255,0.85)';ctx.fillRect(bx-4,by-22,barPx+8,26);ctx.strokeStyle='#333';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+barPx,by);ctx.moveTo(bx,by-6);ctx.lineTo(bx,by+1);ctx.moveTo(bx+barPx,by-6);ctx.lineTo(bx+barPx,by+1);ctx.stroke();ctx.fillStyle='#333';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText(label,bx+barPx/2,by-9);ctx.textAlign='left';}
    const[ocx,ocy]=g2c(0,0,tr);if(ocx>0&&ocx<W&&ocy>0&&ocy<H){ctx.strokeStyle='rgba(100,100,200,0.4)';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(ocx,0);ctx.lineTo(ocx,H);ctx.stroke();ctx.beginPath();ctx.moveTo(0,ocy);ctx.lineTo(W,ocy);ctx.stroke();ctx.setLineDash([]);}
  },[lib,selCell,lc,lv,tr,csize,sels,selEl,drawMode,drawPts,drawCur,activeLayer,snapOn,gridSize,waferOn,waferDia,polarInvert,rulers]);

  useEffect(()=>{const cv=cvRef.current;if(!cv)return;const h=e=>{e.preventDefault();const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;const delta=e.deltaY;const f=Math.pow(1.001,Math.abs(delta))*(delta<0?1:-1);const zoom=Math.exp(f*Math.log(1.2)/3);setTr(t=>({s:t.s*zoom,x:mx+(t.x-mx)*zoom,y:my+(t.y-my)*zoom}));};cv.addEventListener('wheel',h,{passive:false});return()=>cv.removeEventListener('wheel',h);},[csize]);

  useEffect(()=>{
    const h=(e)=>{
      const tgt=e.target;if(tgt.tagName==='INPUT'||tgt.tagName==='TEXTAREA')return;
      if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();return;}
      if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='z'))){e.preventDefault();redo();return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='c'&&selEl){setClipboard(JSON.parse(JSON.stringify(getActiveCell()?.elements[selEl.elIdx])));setStatus('Copied');return;}
      if((e.ctrlKey||e.metaKey)&&e.key==='v'&&clipboard){addElements([translateEl(JSON.parse(JSON.stringify(clipboard)),500,500)]);return;}
      if((e.key==='Delete'||e.key==='Backspace')&&selEl){deleteSelEl();return;}
      if(e.key==='Escape'){setDrawPts([]);drawStartRef.current=null;if(drawMode!=='select')setDrawMode('select');setSelEl(null);}
      if(e.key==='Enter'&&(drawMode==='polygon'||drawMode==='path')&&drawPts.length>=2){if(drawMode==='polygon'&&drawPts.length>=3)addElements([{type:'boundary',layer:activeLayer,datatype:0,xy:[...drawPts]}]);else if(drawMode==='path'&&drawPts.length>=2)addElements([{type:'path',layer:activeLayer,datatype:0,width:1000,xy:[...drawPts]}]);setDrawPts([]);return;}
      if(!e.ctrlKey&&!e.metaKey){if(e.key==='s')setDrawMode('select');if(e.key==='r')setDrawMode('rect');if(e.key==='c')setDrawMode('circle');if(e.key==='g')setDrawMode('polygon');if(e.key==='p')setDrawMode('path');if(e.key==='m')setDrawMode('measure');}
      if(selEl&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const cell=getActiveCell();if(!cell)return;const step=e.shiftKey?10000:1000;const dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;const dy=e.key==='ArrowDown'?-step:e.key==='ArrowUp'?step:0;const el=cell.elements[selEl.elIdx];updateSelEl(translateEl(el,dx,dy),true);}
    };
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[undo,redo,selEl,deleteSelEl,drawMode,drawPts,activeLayer,clipboard,addElements,getActiveCell,updateSelEl]);

  useEffect(()=>{msgEnd.current&&msgEnd.current.scrollIntoView({behavior:'smooth'});},[msgs]);

  const stopAll=()=>{cancelRef.current=true;if(rdrRef.current){rdrRef.current.abort();rdrRef.current=null;}if(abortRef.current)abortRef.current.abort();setLoading(false);setBusy(false);setStatus('Stopped.');};
  const clearAll=()=>{stopAll();setLib(null);setSelCell(null);setSels([]);setLc({});setLv({});setSelEl(null);setDrawPts([]);libRef.current=null;selRef.current=null;histRef.current={stack:[],idx:-1};setStatus('Cleared.');};

  const loadFile=f=>{
    if(!f)return;
    const isOAS=/\.(oas|oasis)$/i.test(f.name);
    cancelRef.current=false;setLoading(true);setStatus(`Reading ${f.name}…`);
    const rdr=new FileReader();rdrRef.current=rdr;
    rdr.onload=e=>{
      if(cancelRef.current){setLoading(false);return;}
      const parsePromise=isOAS?new Promise((res,rej)=>{try{res(parseOASIS(e.target.result));}catch(err){rej(err);}}):parseGDSAsync(e.target.result,pct=>setStatus(`Parsing ${f.name}… ${pct}%`),cancelRef);
      parsePromise.then(p=>{
        if(cancelRef.current){setLoading(false);return;}
        const cm={};p.cells.forEach(c=>{cm[c.name]=c;});const lib2={...p,cellMap:cm};
        libRef.current=lib2;selRef.current=null;pushHist(lib2);setLib(lib2);setSelCell(null);setSels([]);setSelEl(null);setLoading(false);
        setStatus(`✔ ${f.name} — ${p.cells.length} cells${isOAS?' [OASIS]':''}`);setTimeout(fitView,50);
      }).catch(err=>{setLoading(false);setStatus(`⚠ ${err.message}`);});
    };
    rdr.onerror=()=>{setLoading(false);setStatus('⚠ File read error.');};
    rdr.readAsArrayBuffer(f);
  };

  const getCanvasGDS=(e)=>{const r=cvRef.current&&cvRef.current.getBoundingClientRect();if(!r)return{gx:0,gy:0};const[gx,gy]=c2g(e.clientX-r.left,e.clientY-r.top,tr);const[sgx,sgy]=snapPt(gx,gy,snapOn,gridSize);return{gx:sgx,gy:sgy};};

  const onMouseDown=e=>{
    const{gx,gy}=getCanvasGDS(e);mdRef.current={x:e.clientX,y:e.clientY,gx,gy};
    if(e.button===2){setPanning(true);setLastXY({x:e.clientX,y:e.clientY});return;}
    if(drawMode==='select'||drawMode==='measure'){setPanning(true);setLastXY({x:e.clientX,y:e.clientY});}
    else if(drawMode==='rect'||drawMode==='circle'){drawStartRef.current=[gx,gy];}
  };
  const onMouseMove=e=>{
    const{gx,gy}=getCanvasGDS(e);
    setCursor({gx,gy,x:Math.round(gx*(lib?.dbUnit||1e-9)*1e9),y:Math.round(gy*(lib?.dbUnit||1e-9)*1e9)});
    setDrawCur([gx,gy]);
    if(panning){setTr(t=>({...t,x:t.x+(e.clientX-lastXY.x),y:t.y+(e.clientY-lastXY.y)}));setLastXY({x:e.clientX,y:e.clientY});}
    if(movingRef.current&&selEl){const{startGx,startGy,origEl}=movingRef.current;updateSelEl(translateEl(origEl,gx-startGx,gy-startGy),false);}
  };
  const onMouseUp=e=>{
    const{gx,gy}=getCanvasGDS(e);
    const dx=Math.abs(e.clientX-mdRef.current.x),dy=Math.abs(e.clientY-mdRef.current.y);
    const isClick=dx<6&&dy<6;
    setPanning(false);
    if(movingRef.current){if(dx>3||dy>3)pushHist(libRef.current);movingRef.current=null;return;}
    if(e.button!==0)return;
    if(drawMode==='select'&&isClick){const cell=getActiveCell();if(cell&&lib){const hit=selectElHit(mdRef.current.gx,mdRef.current.gy,cell,lib.cellMap);if(hit){setSelEl(hit);setTab('props');movingRef.current={startGx:mdRef.current.gx,startGy:mdRef.current.gy,origEl:JSON.parse(JSON.stringify(hit.el)),armed:true};setTimeout(()=>{if(movingRef.current?.armed)movingRef.current=null;},200);}else setSelEl(null);}}
    else if(drawMode==='rect'&&drawStartRef.current&&(dx>5||dy>5)){const[sx,sy]=drawStartRef.current;const x0=Math.min(sx,gx),y0=Math.min(sy,gy),w=Math.abs(gx-sx),h=Math.abs(gy-sy);if(w>0&&h>0)addElements([{type:'boundary',layer:activeLayer,datatype:0,xy:rPts(x0,y0,w,h)}]);drawStartRef.current=null;}
    else if(drawMode==='circle'&&drawStartRef.current&&(dx>5||dy>5)){const[cx2,cy2]=drawStartRef.current;const r=Math.round(Math.hypot(gx-cx2,gy-cy2));if(r>0)addElements([{type:'boundary',layer:activeLayer,datatype:0,xy:circPts(cx2,cy2,r)}]);drawStartRef.current=null;}
    else if((drawMode==='polygon'||drawMode==='path')&&isClick){setDrawPts(pts=>[...pts,[gx,gy]]);}
    else if(drawMode==='measure'&&isClick&&lib){const cell=getActiveCell();const hit=cell?hitTest(mdRef.current.gx,mdRef.current.gy,cell,lib.cellMap,0,0,1,6):null;if(hit){setSels(prev=>{const next=prev.length>=2?[hit]:[...prev,hit];if(next.length===2&&next[0].wc&&next[1].wc){const nmU=lib.dbUnit*1e9;const p=Math.hypot(next[1].wc[0]-next[0].wc[0],next[1].wc[1]-next[0].wc[1])*nmU;setStatus(`⟷ Pitch: ${fmtNm(p)} · Ø1=${fmtNm(next[0].diam*nmU)} Ø2=${fmtNm(next[1].diam*nmU)}`);}return next;});}else setSels([]);}
  };

  const exportPNG=()=>{const cv=cvRef.current;if(!cv)return;Object.assign(document.createElement('a'),{href:cv.toDataURL('image/png'),download:'gds_export.png'}).click();};
  const exportGDS=()=>{if(!lib)return;const url=URL.createObjectURL(new Blob([writeGDS(lib)],{type:'application/octet-stream'}));Object.assign(document.createElement('a'),{href:url,download:'output.gds'}).click();URL.revokeObjectURL(url);};
  const exportOAS=()=>{if(!lib)return;try{const url=URL.createObjectURL(new Blob([writeOASIS(lib)],{type:'application/octet-stream'}));Object.assign(document.createElement('a'),{href:url,download:'output.oas'}).click();URL.revokeObjectURL(url);setStatus('✔ OASIS exported');}catch(err){setStatus(`⚠ OASIS: ${err.message}`);}};
  const insertAlignMark=()=>{const dbU=lib?.dbUnit||1e-9;const nmU=dbU*1e9;const arm=Math.round(200000/nmU),w=Math.round(10000/nmU);addElements(crossEls(0,0,arm,w,activeLayer));setStatus('Alignment cross added');};
  const mergeLayersOp=()=>{const cell=getActiveCell();const cl=libRef.current;if(!cell||!cl)return;const toAdd=cell.elements.filter(e=>e.type==='boundary'&&e.layer===mergeFrom).map(e=>({...e,layer:mergeTo}));if(!toAdd.length){setStatus(`No boundaries on layer ${mergeFrom}`);return;}applyLib({...cl,cells:cl.cells.map(c=>c.name===cell.name?{...cell,elements:[...cell.elements,...toAdd]}:c)},`Merged L${mergeFrom}→L${mergeTo}`);};
  const saveMeasurement=()=>{if(sels.length===2&&sels[0].wc&&sels[1].wc&&lib){const nmU=lib.dbUnit*1e9;const p=Math.hypot(sels[1].wc[0]-sels[0].wc[0],sels[1].wc[1]-sels[0].wc[1])*nmU;setRulers(r=>[...r,{p1:sels[0].wc,p2:sels[1].wc,label:fmtNm(p)}]);setStatus(`Ruler saved: ${fmtNm(p)}`);} };

  const submitContact=async()=>{
    if(!cForm.name.trim()||!cForm.email.trim()||!cForm.msg.trim()){setCStatus('⚠ Please fill all fields.');return;}
    setCStatus('Sending…');
    try{
      const res=await fetch('https://formspree.io/f/xdapzboj',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({name:cForm.name,email:cForm.email,message:cForm.msg})});
      if(res.ok){setCStatus('✅ Message sent! Thank you.');setCForm({name:'',email:'',msg:''});}
      else setCStatus('⚠ Send failed. Please try again.');
    }catch(err){setCStatus('⚠ Network error: '+err.message);}
  };

  const sendMsg=async()=>{
    if(!inp.trim()||busy)return;
    const msg=inp.trim();setInp('');setBusy(true);setMsgs(m=>[...m,{role:'user',content:msg}]);
    const sys=`You are a GDS layout assistant. Respond with ONLY a JSON object, no other text.

LOADED LIBRARY:
${libSummary(libRef.current)}

OUTPUT FORMAT:
{"message":"brief description","operations":[{"action":"add_cell","cellName":"CELL_1","elements":[...]}]}

ELEMENT TYPES — use exactly these formats:

CIRCLE: {"type":"circle","cx":0,"cy":0,"r":RADIUS,"layer":0}
- NEVER compute polygon points for circles. Always use type "circle" with cx,cy,r.
- r is radius in database units (1 unit = 1nm, so 1μm = 1000 units)
- Example 50nm diameter circle: {"type":"circle","cx":0,"cy":0,"r":25,"layer":0}
- Example 5μm radius circle: {"type":"circle","cx":0,"cy":0,"r":5000,"layer":0}

RECTANGLE: {"type":"boundary","layer":0,"datatype":0,"xy":[[x,y],[x+W,y],[x+W,y+H],[x,y+H]]}
- W and H in database units (1nm = 1 unit)

PATH/LINE: {"type":"path","layer":0,"datatype":0,"width":W,"xy":[[x1,y1],[x2,y2],...]}

ARRAY (repeat a cell): {"type":"aref","sname":"CELLNAME","colrow":[NC,NR],"xy":[[ox,oy],[ox+NC*xstep,oy],[ox,oy+NR*ystep]]}

RULES:
- Always place shapes near origin (0,0)
- For questions only (no shapes): {"message":"your answer","operations":[]}
- Output ONLY the JSON, nothing else, no markdown`;
    try{
      const ctrl=new AbortController();abortRef.current=ctrl;
      const timer=setTimeout(()=>ctrl.abort(),20000);
      const res=await fetch('/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        signal:ctrl.signal,
        body:JSON.stringify({
          model:'llama-3.3-70b-versatile',
          max_tokens:2000,
          temperature:0.1,
          messages:[
            {role:'system',content:sys},
            ...msgs.slice(-8).map(m=>({role:m.role,content:m.content})),
            {role:'user',content:msg}
          ]
        })
      });
      clearTimeout(timer);
      const data=await res.json();
      const text=data.choices?.[0]?.message?.content||'';
      if(!text){setMsgs(m=>[...m,{role:'assistant',content:'No response from AI.'}]);setBusy(false);return;}
      let parsed=null;
      const tryParse=s=>{try{return JSON.parse(s);}catch(_e){return null;}};
      const fm=text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if(fm)parsed=tryParse(fm[1]);
      if(!parsed){const m2=text.match(/\{[\s\S]*\}/);if(m2)parsed=tryParse(m2[0]);}
      if(!parsed)parsed=tryParse(text.trim());
      if(!parsed){setMsgs(m=>[...m,{role:'assistant',content:text}]);setBusy(false);return;}
      const safeXY=(e)=>{
        const raw=e.xy||e.points||e.coordinates||[];
        if(!Array.isArray(raw)||raw.length===0)return[];
        if(!Array.isArray(raw[0])){const pairs=[];for(let i=0;i+1<raw.length;i+=2)pairs.push([Math.round(+raw[i]||0),Math.round(+raw[i+1]||0)]);return pairs;}
        return raw.map(pt=>Array.isArray(pt)?[Math.round(+pt[0]||0),Math.round(+pt[1]||0)]:[0,0]);
      };
      const processEl=(e)=>{
        if(!e||!e.type)return null;
        try{
          if(e.type==='aref')return{type:'aref',sname:e.sname||'',colrow:e.colrow||[1,1],mag:e.mag||1,xy:(e.xy||[]).map(pt=>Array.isArray(pt)?[Math.round(+pt[0]||0),Math.round(+pt[1]||0)]:[0,0])};
          if(e.type==='sref'){const xy=Array.isArray(e.xy?.[0])?e.xy[0]:(e.xy||[0,0]);return{type:'sref',sname:e.sname||'',mag:e.mag||1,xy:[Math.round(+xy[0]||0),Math.round(+xy[1]||0)]};}
          if(e.type==='circle'){const cx=+e.cx||+e.x||0,cy=+e.cy||+e.y||0,r=+e.r||+e.radius||1000;return{type:'boundary',layer:+e.layer||0,datatype:0,xy:circPts(cx,cy,r)};}
          return{type:e.type||'boundary',layer:+e.layer||0,datatype:+e.datatype||0,width:+e.width||0,xy:safeXY(e)};
        }catch(_e){return null;}
      };
      if(parsed.operations&&parsed.operations.length){
        const cl=libRef.current||{name:'gds_studio',userUnit:1e-3,dbUnit:1e-9,cells:[],cellMap:{}};
        let newCells=[...cl.cells];let newName=null;
        for(const op of parsed.operations){if(op.action==='add_cell'){const nc={name:op.cellName||`CELL_${newCells.length+1}`,elements:(op.elements||[]).map(processEl).filter(Boolean)};const ei=newCells.findIndex(c=>c.name===nc.name);if(ei>=0)newCells[ei]=nc;else newCells.push(nc);newName=nc.name;}}
        applyLib({...cl,cells:newCells},'');if(newName)setPending(newName);
        const newL=new Set();(parsed.operations||[]).forEach(op=>(op.elements||[]).forEach(e=>{if(e.layer!=null)newL.add(+e.layer);}));
        setLc(p=>{const n={...p};newL.forEach(l=>{if(!n[l])n[l]=LCOLS[l%LCOLS.length];});return n;});
        setLv(p=>{const n={...p};newL.forEach(l=>{if(n[l]===undefined)n[l]=true;});return n;});
      }
      setMsgs(m=>[...m,{role:'assistant',content:parsed.message||'Done!'}]);
    }catch(err){setMsgs(m=>[...m,{role:'assistant',content:err.name==='AbortError'?'⚠ Timed out.':'Error: '+err.message}]);}
    setBusy(false);
  };

  const nmU=lib?lib.dbUnit*1e9:1;
  const mS0=sels[0]||null,mS1=sels[1]||null;
  const mD0=mS0&&Number.isFinite(mS0.diam)?fmtNm(mS0.diam*nmU):null;
  const mD1=mS1&&Number.isFinite(mS1.diam)?fmtNm(mS1.diam*nmU):null;
  const mP=mS0&&mS1&&mS0.wc&&mS1.wc?fmtNm(Math.hypot(mS1.wc[0]-mS0.wc[0],mS1.wc[1]-mS0.wc[1])*nmU):null;
  const selElem=selEl&&getActiveCell()?.elements[selEl.elIdx];
  const selBb=selEl?.bb;

  // ── UPDATED: bigger tool buttons
  const toolBtn=(mode,icon,tip)=>(<button title={tip} onClick={()=>{setDrawMode(mode);if(mode!=='polygon'&&mode!=='path')setDrawPts([]);drawStartRef.current=null;}} style={{width:38,height:38,display:'flex',alignItems:'center',justifyContent:'center',background:drawMode===mode?'#e0e8ff':'transparent',border:drawMode===mode?'1px solid #88a':'1px solid #eee',borderRadius:7,cursor:'pointer',fontSize:17,color:drawMode===mode?'#226':'#666',margin:'1px 0'}}>{icon}</button>);

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#f0f0f0',color:'#222',fontFamily:'monospace,sans-serif',fontSize:12}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}button:active{transform:scale(0.96)}`}</style>

      {/* ── TOOLBAR (bigger padding + title) ── */}
      <div style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'#fff',borderBottom:'1px solid #ddd',flexShrink:0,flexWrap:'wrap',minHeight:48}}>
        <span style={{fontWeight:'bold',color:'#226',marginRight:6,fontSize:14}}>⬡ GDS Studio</span>
        <button style={{...tb(),fontSize:11,padding:'2px 8px'}} onClick={()=>window.location.href='/'} title="Back to home">← Home</button>
        <button style={tb()} onClick={()=>fileRef.current&&fileRef.current.click()} disabled={loading}>📂 Open</button>
        <button style={tb(!!lib)} onClick={exportGDS} disabled={!lib||loading}>⬇ GDS</button>
        <button style={tb(!!lib)} onClick={exportOAS} disabled={!lib}>⬇ OAS</button>
        <button style={tb()} onClick={exportPNG} disabled={!lib}>📷 PNG</button>
        <button style={tb(histRef.current.idx>0)} onClick={undo} title="Ctrl+Z">↩</button>
        <button style={tb(histRef.current.idx<histRef.current.stack.length-1)} onClick={redo} title="Ctrl+Y">↪</button>
        {(loading||busy)?<button style={tb(true,false,true)} onClick={stopAll}>⏹</button>:lib&&<button style={tb(true,false,true)} onClick={clearAll}>🗑</button>}
        <button style={tb(!!lib,true)} onClick={fitView} disabled={!lib}>⌖ Fit</button>
        <button style={tb(true)} onClick={()=>setTr(t=>({...t,s:t.s*1.5}))}>＋</button>
        <button style={tb(true)} onClick={()=>setTr(t=>({...t,s:t.s/1.5}))}>－</button>
        <div style={{width:1,height:18,background:'#ddd',margin:'0 2px'}}/>
        <label style={{fontSize:11,color:'#888',display:'flex',alignItems:'center',gap:3,cursor:'pointer'}}><input type="checkbox" checked={snapOn} onChange={e=>setSnapOn(e.target.checked)}/>Snap</label>
        {snapOn&&<input type="number" value={Math.round(gridSize*nmU)} onChange={e=>setGridSize(Math.max(1,+e.target.value)/nmU)} style={{width:55,padding:'2px 4px',fontSize:11,border:'1px solid #ddd',borderRadius:3}}/>}
        <select value={activeLayer} onChange={e=>setActiveLayer(+e.target.value)} style={{padding:'2px 4px',fontSize:11,border:'1px solid #ddd',borderRadius:3}}>
          {[...Array(10).keys()].map(l=><option key={l} value={l}>L{l}</option>)}
        </select>
        <div style={{width:1,height:18,background:'#ddd',margin:'0 2px'}}/>
        <button style={tb(true,waferOn)} onClick={()=>setWaferOn(v=>!v)}>⌀ Wfr</button>
        {waferOn&&<input type="number" value={waferDia} onChange={e=>setWaferDia(+e.target.value)} style={{width:40,padding:'2px 4px',fontSize:11,border:'1px solid #ddd',borderRadius:3}}/>}
        <button style={tb(true,polarInvert)} onClick={()=>setPolarInvert(v=>!v)}>◐ Pol</button>
        <button style={tb(true)} onClick={insertAlignMark} disabled={!lib}>✛ Mark</button>
        <button style={tb(true,showDrcPanel)} onClick={()=>setShowDrcPanel(v=>!v)}>DRC</button>
        <button style={{...tb(true,tab==='contact'),background:tab==='contact'?'#e0e8ff':'#226',color:tab==='contact'?'#226':'#fff',border:'1px solid #226'}} onClick={()=>setTab('contact')}>💬 Contact</button>
        <div style={{flex:1}}/>
        {cursor&&<span style={{color:'#aaa',fontSize:11}}>{cursor.x},{cursor.y} nm</span>}
        {!loading&&<span style={{color:'#888',fontSize:11,maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{status}</span>}
        {loading&&<span style={{color:'#a60',fontSize:12,display:'flex',gap:3,alignItems:'center'}}><span style={{display:'inline-block',animation:'spin 1s linear infinite'}}>⟳</span>{status}</span>}
        <input ref={fileRef} type="file" accept=".gds,.gds2,.oas,.oasis" style={{display:'none'}} onChange={e=>loadFile(e.target.files[0])}/>
      </div>

      {/* DRC PANEL */}
      {showDrcPanel&&<div style={{background:'#fffbf0',borderBottom:'1px solid #e8d',padding:'6px 12px',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12}}>
        <span style={{fontWeight:'bold',color:'#664'}}>DRC</span>
        <label>Min spacing (nm):<input type="number" value={drcMinSp} onChange={e=>setDrcMinSp(+e.target.value)} style={{width:60,marginLeft:4,padding:'2px 4px',fontSize:11,border:'1px solid #ccc',borderRadius:3}}/></label>
        <label>Min feature (nm):<input type="number" value={drcMinFeat} onChange={e=>setDrcMinFeat(+e.target.value)} style={{width:60,marginLeft:4,padding:'2px 4px',fontSize:11,border:'1px solid #ccc',borderRadius:3}}/></label>
        <button onClick={()=>{const cell=getActiveCell();if(!cell||!lib){setStatus('No cell');return;}const res=runDRC(cell,lib.dbUnit,drcMinSp,drcMinFeat);setMsgs(m=>[...m,{role:'assistant',content:'DRC Results:\n'+res.join('\n')}]);setTab('ai');}} style={tb(true)}>Run DRC</button>
        <div style={{width:1,height:16,background:'#ddd'}}/>
        <span style={{fontWeight:'bold',color:'#446'}}>Merge</span>
        <label>From L:<input type="number" value={mergeFrom} onChange={e=>setMergeFrom(+e.target.value)} style={{width:36,marginLeft:4,padding:'2px 4px',fontSize:11,border:'1px solid #ccc',borderRadius:3}}/></label>
        <label>To L:<input type="number" value={mergeTo} onChange={e=>setMergeTo(+e.target.value)} style={{width:36,marginLeft:4,padding:'2px 4px',fontSize:11,border:'1px solid #ccc',borderRadius:3}}/></label>
        <button onClick={mergeLayersOp} style={tb(true)}>Merge</button>
      </div>}

      {/* MAIN */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* ── TOOL COLUMN (wider + bigger buttons) ── */}
        <div style={{width:46,background:'#fafafa',borderRight:'1px solid #ddd',display:'flex',flexDirection:'column',alignItems:'center',padding:'8px 4px',gap:4,flexShrink:0}}>
          {toolBtn('select','↖','Select (S)')}
          {toolBtn('rect','□','Rectangle (R)')}
          {toolBtn('circle','○','Circle (C)')}
          {toolBtn('polygon','⬠','Polygon (G)')}
          {toolBtn('path','✏','Path (P)')}
          {toolBtn('measure','◎','Measure (M)')}
        </div>

        {/* ── SIDEBAR (wider + bigger tabs) ── */}
        <div style={{width:270,background:'#fff',borderRight:'1px solid #ddd',display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{display:'flex',borderBottom:'1px solid #ddd'}}>
            {[['ai','🤖'],['layers','≡'],['cells','⊞'],['props','◈'],['contact','✉']].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'10px 0',background:tab===k?'#f0f4ff':'transparent',border:'none',color:tab===k?'#226':'#888',cursor:'pointer',fontSize:k==='contact'?11:13,fontWeight:tab===k?'600':'normal',borderBottom:tab===k?'2px solid #226':'2px solid transparent'}} title={k}>{k==='contact'?'✉':l}</button>
            ))}
          </div>
          <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>

            {/* AI TAB */}
            {tab==='ai'&&<>
              <div style={{flex:1,overflowY:'auto',padding:8,display:'flex',flexDirection:'column',gap:5,minHeight:0}}>
                {msgs.map((m,i)=><div key={i} style={{padding:'6px 8px',borderRadius:6,fontSize:11,maxWidth:'95%',lineHeight:1.55,background:m.role==='user'?'#e0e8ff':'#f0f8f0',color:m.role==='user'?'#226':'#040',alignSelf:m.role==='user'?'flex-end':'flex-start',whiteSpace:'pre-wrap',border:'1px solid '+(m.role==='user'?'#aac':'#aca')}}>{m.content}</div>)}
                {busy&&<div style={{padding:'6px 8px',borderRadius:6,fontSize:11,background:'#f0f8f0',color:'#040',alignSelf:'flex-start',border:'1px solid #aca'}}>✦ thinking…</div>}
                <div ref={msgEnd}/>
              </div>
              <div style={{padding:'4px 6px',borderTop:'1px solid #eee'}}>
                <div style={{fontSize:9,color:'#aaa',marginBottom:3,fontWeight:'600',letterSpacing:'.05em'}}>QUICK PROMPTS</div>
                {['Create a circle radius 5μm on layer 0','Add a 20×10μm rectangle on layer 1','Make a grating 8 lines 1μm wide 2μm pitch','Create 5×5 array of 3μm circles pitch 8μm'].map((p,i)=><div key={i} onClick={()=>setInp(p)} style={{padding:'3px 5px',marginBottom:2,background:'#f8f8f8',border:'1px solid #eee',borderRadius:3,fontSize:10,color:'#449',cursor:'pointer'}}>{p}</div>)}
              </div>
              <div style={{padding:6,borderTop:'1px solid #eee',display:'flex',gap:3}}>
                <input style={{flex:1,padding:'4px 7px',background:'#fafafa',border:'1px solid #ddd',borderRadius:4,color:'#222',fontSize:11,outline:'none'}} value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMsg()} placeholder="Describe a shape…"/>
                {busy?<button onClick={()=>{abortRef.current&&abortRef.current.abort();setBusy(false);}} style={tb(true,false,true)}>✕</button>:<button onClick={sendMsg} style={tb(true)}>➤</button>}
              </div>
            </>}

            {/* LAYERS TAB */}
            {tab==='layers'&&<div style={{padding:8}}>
              {allLayers.length===0&&<div style={{color:'#aaa',textAlign:'center',marginTop:16,fontSize:12}}>No layers loaded</div>}
              {allLayers.map(l=><div key={l} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,padding:'4px 6px',background:'#f8f8f8',borderRadius:5,border:'1px solid #eee'}}>
                <input type="color" value={lc[l]||'#888'} onChange={e=>setLc(p=>({...p,[l]:e.target.value}))} style={{width:18,height:18,border:'none',cursor:'pointer',padding:0}}/>
                <span style={{flex:1,fontSize:12}}>Layer {l}</span>
                <input type="checkbox" checked={lv[l]!==false} onChange={e=>setLv(p=>({...p,[l]:e.target.checked}))}/>
              </div>)}
            </div>}

            {/* CELLS TAB */}
            {tab==='cells'&&<div style={{padding:6}}>
              {!lib&&<div style={{color:'#aaa',textAlign:'center',marginTop:16,fontSize:12}}>No file loaded</div>}
              {lib&&lib.cells.map(c=><div key={c.name} onClick={()=>{const ns=selCell&&selCell.name===c.name?null:c;setSelCell(ns);selRef.current=ns;setSelEl(null);}} style={{padding:'5px 7px',marginBottom:3,borderRadius:5,cursor:'pointer',background:selCell&&selCell.name===c.name?'#e0e8ff':'#f8f8f8',border:`1px solid ${selCell&&selCell.name===c.name?'#aac':'#eee'}`}}>
                <div style={{color:selCell&&selCell.name===c.name?'#226':'#333',fontWeight:'bold',fontSize:11}}>{c.name}</div>
                <div style={{color:'#aaa',fontSize:10}}>{c.elements.length} elements</div>
              </div>)}
            </div>}

            {/* PROPS TAB */}
            {tab==='props'&&<div style={{padding:8}}>
              {!selElem&&<div style={{color:'#aaa',fontSize:12,textAlign:'center',marginTop:20}}>↖ Click an element<br/>to inspect it</div>}
              {selElem&&<>
                <div style={{background:'#f0f4ff',borderRadius:6,padding:8,marginBottom:8,border:'1px solid #aac'}}>
                  <div style={{fontWeight:'bold',color:'#226',fontSize:13,marginBottom:6}}>{selElem.type.toUpperCase()}</div>
                  <div style={{fontSize:11,color:'#555',lineHeight:1.9}}>
                    Layer: <b>{selElem.layer}</b><br/>
                    {selBb&&<>Size: <b>{fmtNm((selBb.x1-selBb.x0)*nmU)} × {fmtNm((selBb.y1-selBb.y0)*nmU)}</b><br/>Center: <b>({fmtNm(((selBb.x0+selBb.x1)/2)*nmU)}, {fmtNm(((selBb.y0+selBb.y1)/2)*nmU)})</b><br/></>}
                    {(selElem.type==='boundary'||selElem.type==='path')&&<>Vertices: <b>{selElem.xy.length}</b><br/></>}
                    {(selElem.type==='sref'||selElem.type==='aref')&&<>Ref: <b>{selElem.sname}</b><br/></>}
                  </div>
                  <label style={{fontSize:11}}>Layer: <input type="number" defaultValue={selElem.layer} onBlur={e=>{const nl=+e.target.value;if(!isNaN(nl))updateSelEl({...selElem,layer:nl},true);}} style={{width:44,marginLeft:4,padding:'2px 4px',fontSize:11,border:'1px solid #ccc',borderRadius:3}}/></label>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                  <button onClick={deleteSelEl} style={actBtn('#ffe0e0','#a00')}>🗑 Del</button>
                  <button onClick={()=>{setClipboard(JSON.parse(JSON.stringify(selElem)));setStatus('Copied');}} style={actBtn('#f0f8ff','#226')}>📋 Copy</button>
                  <button onClick={()=>updateSelEl(rotateEl90(selElem),true)} style={actBtn('#f0fff0','#040')}>↻ Rot90</button>
                  <button onClick={()=>updateSelEl(mirrorEl(selElem,'h'),true)} style={actBtn('#f8f0ff','#606')}>↔ FlipH</button>
                  <button onClick={()=>updateSelEl(mirrorEl(selElem,'v'),true)} style={actBtn('#fff8f0','#840')}>↕ FlipV</button>
                  <button onClick={()=>{if(selElem)addElements([translateEl(JSON.parse(JSON.stringify(selElem)),500,500)]);}} style={actBtn('#f0f4ff','#226')}>⊕ Dup</button>
                </div>
                <div style={{marginTop:8,fontSize:10,color:'#aaa'}}>Arrow keys nudge · Del to delete</div>
              </>}
              {rulers.length>0&&<div style={{marginTop:12}}>
                <div style={{fontSize:11,fontWeight:'bold',color:'#666',marginBottom:5}}>Saved Rulers</div>
                {rulers.map((r,i)=><div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'3px 6px',background:'#f8f0ff',borderRadius:4,marginBottom:2,fontSize:11}}>
                  <span style={{color:'#9932cc'}}>{r.label}</span>
                  <button onClick={()=>setRulers(rs=>rs.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'#999',fontSize:11}}>✕</button>
                </div>)}
              </div>}
            </div>}

            {/* CONTACT TAB */}
            {tab==='contact'&&<div style={{padding:12,display:'flex',flexDirection:'column',gap:9}}>
              <div style={{fontSize:13,fontWeight:'bold',color:'#226'}}>💬 Suggestions & Contact</div>
              <div style={{fontSize:11,color:'#888',lineHeight:1.6}}>Have a feature request, bug report, or just want to say hi? Drop a message!</div>
              <div>
                <div style={{fontSize:10,color:'#aaa',marginBottom:3}}>Your name</div>
                <input type="text" placeholder="Your name" value={cForm.name} onChange={e=>setCForm(f=>({...f,name:e.target.value}))} style={{width:'100%',padding:'7px 9px',border:'1px solid #ddd',borderRadius:5,fontSize:12,fontFamily:'monospace',outline:'none',boxSizing:'border-box'}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:'#aaa',marginBottom:3}}>Email address</div>
                <input type="email" placeholder="you@example.com" value={cForm.email} onChange={e=>setCForm(f=>({...f,email:e.target.value}))} style={{width:'100%',padding:'7px 9px',border:'1px solid #ddd',borderRadius:5,fontSize:12,fontFamily:'monospace',outline:'none',boxSizing:'border-box'}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:'#aaa',marginBottom:3}}>Message / suggestion</div>
                <textarea placeholder="Tell me what you'd like to see, or report a bug…" value={cForm.msg} onChange={e=>setCForm(f=>({...f,msg:e.target.value}))} rows={5} style={{width:'100%',padding:'7px 9px',border:'1px solid #ddd',borderRadius:5,fontSize:12,fontFamily:'monospace',resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
              </div>
              {cStatus&&<div style={{fontSize:11,padding:'6px 9px',borderRadius:5,background:cStatus.startsWith('✅')?'#f0fff0':cStatus.startsWith('⚠')?'#fff0f0':'#f0f4ff',color:cStatus.startsWith('✅')?'#060':cStatus.startsWith('⚠')?'#a00':'#226'}}>{cStatus}</div>}
              <button onClick={submitContact} style={{padding:'8px 0',background:'#226',border:'none',borderRadius:5,color:'#fff',fontSize:12,cursor:'pointer',fontWeight:'bold'}}>Send message →</button>
            </div>}
          </div>
        </div>

        {/* CANVAS */}
        <div ref={contRef} style={{flex:1,position:'relative',overflow:'hidden'}} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const f=e.dataTransfer.files[0];if(f)loadFile(f);}}>
          <canvas ref={cvRef} style={{position:'absolute',top:0,left:0,cursor:drawMode==='select'?'default':'crosshair'}}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            onContextMenu={e=>{e.preventDefault();setPanning(true);setLastXY({x:e.clientX,y:e.clientY});}}
            onMouseLeave={()=>{setPanning(false);setCursor(null);movingRef.current=null;}}/>
          {over&&<div style={{position:'absolute',inset:0,background:'rgba(0,100,255,0.08)',border:'3px dashed #88f',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',zIndex:10}}><div style={{textAlign:'center',color:'#66a',fontSize:18,fontWeight:'bold'}}><div style={{fontSize:48}}>📂</div>Drop .gds or .oas to open</div></div>}
          {!lib&&!over&&<div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',color:'#ccc',pointerEvents:'none',userSelect:'none'}}>
            <div style={{fontSize:56}}>⬡</div>
            <div style={{fontSize:16,fontWeight:'bold',color:'#bbb',margin:'8px 0'}}>GDS Studio v2</div>
            <div style={{fontSize:11,color:'#ccc',lineHeight:1.8}}>Drop a .gds or .oas file here<br/>or use 🤖 AI to create shapes<br/><br/><span style={{fontSize:9}}>S=select · R=rect · C=circle · G=polygon · P=path · M=measure<br/>Ctrl+Z undo · Del delete · Arrow keys nudge</span></div>
          </div>}
          {drawMode==='measure'&&<div style={{position:'absolute',bottom:10,left:'50%',transform:'translateX(-50%)',background:'#ffffffee',border:'1px solid #ddd',borderRadius:6,padding:'5px 14px',display:'flex',gap:12,alignItems:'center',fontSize:11,pointerEvents:'none',whiteSpace:'nowrap',zIndex:5}}>
            {!mD0&&<span style={{color:'#aaa'}}>◎ Click a circle to measure</span>}
            {mD0&&<span style={{color:'#0066ff'}}>● Ø {mD0} · L{mS0.layer}</span>}
            {mD0&&!mD1&&<span style={{color:'#aaa'}}>← click 2nd</span>}
            {mD1&&<span style={{color:'#ff6600'}}>● Ø {mD1} · L{mS1.layer}</span>}
            {mP&&<span style={{color:'#000',borderLeft:'1px solid #ddd',paddingLeft:12}}>⟷ {mP}</span>}
            {mP&&<span style={{color:'#9932cc',cursor:'pointer',pointerEvents:'all'}} onClick={saveMeasurement} title="Save ruler">💾</span>}
            {mD0&&<span style={{color:'#aaa',cursor:'pointer',pointerEvents:'all'}} onClick={()=>setSels([])}>✕</span>}
          </div>}
        </div>
      </div>
    </div>
  );
}
