import{w as b,x as f,y as x}from"./index-9k97BN4W.js";function y(m,{format:a="a4"}={}){if(!m)return;const n=x(a),t=b(a)??80,r=f(a),h=n?`
    @page { size: ${t}mm 200mm portrait; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0 auto;
      padding: 0;
      width: ${t}mm;
      max-width: ${t}mm;
      min-width: ${t}mm;
      height: auto;
      background: #fff;
      color: #000;
      writing-mode: horizontal-tb;
      overflow-x: hidden;
    }
    body { font-family: Arial, sans-serif; }
    .receipt-print-root {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 2mm ${r}mm 1.5mm ${r}mm;
      box-sizing: border-box;
      overflow: hidden;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .receipt-print-root table {
      width: 100%;
      max-width: 100%;
      table-layout: fixed;
    }
    .receipt-print-root th,
    .receipt-print-root td {
      overflow: hidden;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    @media print {
      html, body {
        width: ${t}mm !important;
        max-width: ${t}mm !important;
        min-width: ${t}mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .receipt-print-root {
        width: 100% !important;
        max-width: 100% !important;
        padding: 2mm ${r}mm 1.5mm ${r}mm !important;
      }
    }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `:`
    @page { size: A4 portrait; margin: 8mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100%;
      background: #fff;
      color: #000;
    }
    body { font-family: Arial, Helvetica, sans-serif; }
    body > div {
      width: 100% !important;
      max-width: 100% !important;
    }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `,c=n?`<div class="receipt-print-root">${m}</div>`:m,s=`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Imprimir</title>
  <style>${h}</style>
</head>
<body>${c}</body>
</html>`,e=document.createElement("iframe");e.setAttribute("aria-hidden","true"),e.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;",document.body.appendChild(e);const o=e.contentWindow,i=o==null?void 0:o.document;if(!o||!i){e.remove();return}i.open(),i.write(s),i.close();const l=()=>{try{if(n){const d=i.querySelector(".receipt-print-root")||i.body,w=Math.max(d.scrollHeight,d.offsetHeight,d.clientHeight),g=Math.max(t+20,Math.ceil(w*.264583)+4),p=i.createElement("style");p.textContent=`
          @page { size: ${t}mm ${g}mm portrait !important; margin: 0 !important; }
          html, body {
            width: ${t}mm !important;
            max-width: ${t}mm !important;
            min-width: ${t}mm !important;
          }
        `,i.head.appendChild(p)}o.focus(),o.print()}finally{window.setTimeout(()=>e.remove(),1500)}};window.setTimeout(l,350)}export{y as p};
