import{j as a,B as l,u as v,b as p,F as $,a as d,s as u}from"./mui-IJmj765k.js";import{d as E,e as k}from"./index-Dpw4J4NZ.js";const B={name:"Copo de nieve"},z=`<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <g fill="none" stroke="#E8F4FC" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="32" y1="6" x2="32" y2="58"/>
    <line x1="6" y1="32" x2="58" y2="32"/>
    <line x1="12" y1="12" x2="52" y2="52"/>
    <line x1="52" y1="12" x2="12" y2="52"/>
    <!-- Ramitas -->
    <path d="M32 14 l-6 5 M32 14 l6 5"/>
    <path d="M32 50 l-6 -5 M32 50 l6 -5"/>
    <path d="M14 32 l5 -6 M14 32 l5 6"/>
    <path d="M50 32 l-5 -6 M50 32 l-5 6"/>
    <path d="M18 18 l7 2 M18 18 l2 7"/>
    <path d="M46 18 l-7 2 M46 18 l-2 7"/>
    <path d="M18 46 l7 -2 M18 46 l2 -7"/>
    <path d="M46 46 l-7 -2 M46 46 l-2 -7"/>
  </g>
  <circle cx="32" cy="32" r="3.2" fill="#F8FBFF"/>
</svg>`,L=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(z)}`;function A({sx:e={},titleAccess:i=B.name,...s}){const{fontSize:r,...t}=s,n=e.width??e.fontSize??32;return a(l,{component:"img",src:L,alt:i,draggable:!1,...t,sx:{display:"block",objectFit:"contain",userSelect:"none",pointerEvents:"none",flexShrink:0,...e,width:n,height:n}})}const m=E.color,f="#93C5FD",x=u`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`,I=u`
  0% {
    transform: translate3d(0, 0, 0) rotate(var(--rot-start));
    opacity: 0;
  }
  8% {
    opacity: var(--item-op);
  }
  88% {
    opacity: var(--item-op);
  }
  100% {
    transform: translate3d(var(--drift), 125vh, 0) rotate(var(--rot-end));
    opacity: 0;
  }
`;function g(e,i=0){const s=[];for(let r=0;r<e;r+=1){const t=r+i,n=t%3===0,o=-55+t*37%110,c=o+(t%2===0?70:-80)+t*13%40,h=2+(t*17+t%5*9)%92,M=n?30+t%4*5:22+t%5*6,y=n?42+t%4*7:30+t%5*8,b=9+t%7*1.4+t%3*.5,w=t*.85%11,F=(t%2===0?1:-1)*(18+t%5*10),S=n?.5+t%5*.08:.4+t%5*.1;s.push({id:t,kind:n?"bombillo":"snow",left:`${h}%`,size:{xs:M,md:y},duration:`${b.toFixed(1)}s`,delay:`${w.toFixed(1)}s`,rotStart:`${o}deg`,rotEnd:`${c}deg`,drift:`${F}px`,opacity:S})}return s}const _=g(18,0),O=g(14,7);function N({showRings:e=!0,variant:i="home",opacityScale:s=1}){const t=v().palette.customMode==="neon",n=i==="login"?O:_;return p(l,{"aria-hidden":!0,sx:{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0},children:[e?p($,{children:[a(l,{sx:{position:"absolute",top:"50%",left:"50%",width:{xs:420,md:640},height:{xs:420,md:640},ml:{xs:-210,md:-320},mt:{xs:-210,md:-320},borderRadius:"50%",border:`1px solid ${d(f,.2)}`,animation:`${x} 48s linear infinite`}}),a(l,{sx:{position:"absolute",top:"50%",left:"50%",width:{xs:300,md:460},height:{xs:300,md:460},ml:{xs:-150,md:-230},mt:{xs:-150,md:-230},borderRadius:"50%",border:`1px dashed ${d(m,.2)}`,animation:`${x} 64s linear infinite reverse`}})]}):null,n.map(o=>{const c=o.kind==="bombillo"?m:f,h=Math.min(1,o.opacity*s);return a(l,{sx:{position:"absolute",top:"-12%",left:o.left,width:o.size,height:o.size,"--rot-start":o.rotStart,"--rot-end":o.rotEnd,"--drift":o.drift,"--item-op":h,animation:`${I} ${o.duration} linear infinite`,animationDelay:o.delay,willChange:"transform, opacity",filter:t?`drop-shadow(0 0 10px ${d(c,.45)})`:`drop-shadow(0 6px 12px ${d("#000",.14)})`},children:o.kind==="bombillo"?a(k,{titleAccess:"",sx:{width:"100%",height:"100%",fontSize:"100%"}}):a(A,{titleAccess:"",sx:{width:"100%",height:"100%",fontSize:"100%"}})},`rain-${i}-${o.id}`)})]})}export{N as F};
