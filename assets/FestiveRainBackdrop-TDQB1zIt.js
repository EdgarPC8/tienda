import{u as v,b as m,B as a,F as E,j as e,a as l,s as g}from"./mui-TM5RGOHe.js";import{P as I}from"./index-DfvOl1VJ.js";const u=[1,2,3,4].map(s=>`/tienda/brand/guagua-pan-${s}.png`),h="#C47A3A",f="#F97316",x=g`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`,z=g`
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
`;function $(s,i=0){const r=[];for(let d=0;d<s;d+=1){const t=d+i,n=t%3===0,o=t%u.length,c=-55+t*37%110,p=c+(t%2===0?70:-80)+t*13%40,b=2+(t*17+t%5*9)%92,y=n?34+t%4*6:38+t%5*8,k=n?48+t%4*8:52+t%5*12,w=9+t%7*1.4+t%3*.5,A=t*.85%11,F=(t%2===0?1:-1)*(18+t%5*10),S=.45+t%5*.08;r.push({id:t,kind:n?"pumpkin":"guagua",src:n?null:u[o],left:`${b}%`,size:{xs:y,md:k},duration:`${w.toFixed(1)}s`,delay:`${A.toFixed(1)}s`,rotStart:`${c}deg`,rotEnd:`${p}deg`,drift:`${F}px`,opacity:S})}return r}const G=$(18,0),M=$(14,7);function C({showRings:s=!0,variant:i="home",opacityScale:r=1}){const t=v().palette.customMode==="neon",n=i==="login"?M:G;return m(a,{"aria-hidden":!0,sx:{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0},children:[s?m(E,{children:[e(a,{sx:{position:"absolute",top:"50%",left:"50%",width:{xs:420,md:640},height:{xs:420,md:640},ml:{xs:-210,md:-320},mt:{xs:-210,md:-320},borderRadius:"50%",border:`1px solid ${l(h,.14)}`,animation:`${x} 48s linear infinite`}}),e(a,{sx:{position:"absolute",top:"50%",left:"50%",width:{xs:300,md:460},height:{xs:300,md:460},ml:{xs:-150,md:-230},mt:{xs:-150,md:-230},borderRadius:"50%",border:`1px dashed ${l(f,.18)}`,animation:`${x} 64s linear infinite reverse`}})]}):null,n.map(o=>{const c=o.kind==="pumpkin"?f:h,p=Math.min(1,o.opacity*r);return e(a,{sx:{position:"absolute",top:"-12%",left:o.left,width:o.size,height:o.size,"--rot-start":o.rotStart,"--rot-end":o.rotEnd,"--drift":o.drift,"--item-op":p,animation:`${z} ${o.duration} linear infinite`,animationDelay:o.delay,willChange:"transform, opacity",filter:t?`drop-shadow(0 0 10px ${l(c,.45)})`:`drop-shadow(0 6px 12px ${l("#000",.14)})`},children:o.kind==="pumpkin"?e(I,{titleAccess:"",sx:{width:"100%",height:"100%",fontSize:"100%"}}):e(a,{component:"img",src:o.src,alt:"",draggable:!1,sx:{width:"100%",height:"100%",objectFit:"contain",display:"block",userSelect:"none"}})},`rain-${i}-${o.id}`)})]})}export{C as F};
