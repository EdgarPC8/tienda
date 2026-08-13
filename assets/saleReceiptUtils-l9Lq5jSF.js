import{B as Y,D as Z,E as Q,F as V,y as L,G as P,H as K}from"./index-Ck3pc8CH.js";import{f as X}from"./functions-DeCccbNr.js";const M="[CAJA_POS]",tt="[CONTADO]",I="[CREDITO]";function At({baseNote:t,saleType:e}){const o=e==="credito"?I:tt,a=String(t).replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").replace(/\s+/g," ").trim();return`${M} ${o} ${a}`.trim()}function et(t){if(!t)return"—";const e=String(t.notes||""),o=t.customer,a=String((o==null?void 0:o.name)||"").trim();if(!e.includes(M))return a||"—";const d=e.toLowerCase();return d.includes("mostrador")||d.includes("consumidor final")||d.includes("sin datos de cliente")?"Consumidor Final":a||"—"}function ot(t){const e=String((t==null?void 0:t.notes)||"");return!(!e.includes(M)||e.includes(I)||String((t==null?void 0:t.paymentMethod)||"").toLowerCase()==="credito")}function Nt(t){return!ot(t)}function Ct(t){return t.find(e=>{const o=String(e.name||"").toLowerCase();return o.includes("consumidor")||o.includes("final")})??null}function nt(t,{format:e="a4"}={}){if(!t)return;const o=Q(e),a=Y(e)??80,d=Z(e),n=o?`
    @page { size: ${a}mm 200mm portrait; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0 auto;
      padding: 0;
      width: ${a}mm;
      max-width: ${a}mm;
      min-width: ${a}mm;
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
      padding: 2mm ${d}mm 1.5mm ${d}mm;
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
        width: ${a}mm !important;
        max-width: ${a}mm !important;
        min-width: ${a}mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .receipt-print-root {
        width: 100% !important;
        max-width: 100% !important;
        padding: 2mm ${d}mm 1.5mm ${d}mm !important;
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
  `,r=o?`<div class="receipt-print-root">${t}</div>`:t,i=`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Imprimir</title>
  <style>${n}</style>
</head>
<body>${r}</body>
</html>`,u=document.createElement("iframe");u.setAttribute("aria-hidden","true"),u.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;",document.body.appendChild(u);const p=u.contentWindow,m=p==null?void 0:p.document;if(!p||!m){u.remove();return}m.open(),m.write(i),m.close();const l=()=>{try{if(o){const s=m.querySelector(".receipt-print-root")||m.body,h=Math.max(s.scrollHeight,s.offsetHeight,s.clientHeight),x=Math.max(a+20,Math.ceil(h*.264583)+4),b=m.createElement("style");b.textContent=`
          @page { size: ${a}mm ${x}mm portrait !important; margin: 0 !important; }
          html, body {
            width: ${a}mm !important;
            max-width: ${a}mm !important;
            min-width: ${a}mm !important;
          }
        `,m.head.appendChild(b)}p.focus(),p.print()}finally{window.setTimeout(()=>u.remove(),1500)}};window.setTimeout(l,350)}const at=t=>Number(Number(t||0).toFixed(2));function it(t,e=9){const o=Math.max(0,Math.floor(Number(t)||0));return String(o).padStart(e,"0")}function dt(t,e,o){const a=String(t||"001").padStart(3,"0").slice(0,3),d=String(e||"001").padStart(3,"0").slice(0,3);return`${a}-${d}-${it(o)}`}function $(t,e=2){return at(t).toFixed(e)}function k(t){const e=Number(t||0);if(!Number.isFinite(e))return"0.00";const o=Number(e.toFixed(4));return Math.round(o*100)===o*100?o.toFixed(2):String(o)}function S(t,e=""){const o=t==null?"":String(t).trim();if(/^\d{40,}$/.test(o))return o;const a=e==null?"":String(e).trim();return/^\d{40,}$/.test(a)?a:o&&!/e[+-]?\d+$/i.test(o)?o:a||""}function rt(t){return String(t||"").toLowerCase()==="produccion"?"PRODUCCIÓN":"PRUEBAS"}function lt(t){const e=String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");return e.includes("efectivo")||e==="01"?"SIN UTILIZACION DEL SISTEMA FINANCIERO":e.includes("tarjeta")||e==="16"?"TARJETA DE CREDITO":e.includes("transfer")||e.includes("deposito")||e==="20"?"TRANSFERENCIA / DEPOSITO BANCARIO":(e.includes("credito"),"OTROS CON UTILIZACION DEL SISTEMA FINANCIERO")}function st(t=[]){const e=(t||[]).map(n=>Number(n.taxRate||0)).filter(n=>n>0);if(!e.length)return 0;const o=new Map;e.forEach(n=>o.set(n,(o.get(n)||0)+1));let a=e[0],d=0;return o.forEach((n,r)=>{n>d&&(d=n,a=r)}),a}function zt(t,e,o=null,a={}){if(!t)return null;const d=(o==null?void 0:o.establishmentCode)||(e==null?void 0:e.establishmentCode)||"001",n=(o==null?void 0:o.emissionPointCode)||(e==null?void 0:e.emissionPointCode)||"001",r=(o==null?void 0:o.sequential)!=null?Number(o.sequential):null,i=S((o==null?void 0:o.accessKey)||(o==null?void 0:o.authorizationNumber)||""),u=S((o==null?void 0:o.authorizationNumber)||(o==null?void 0:o.accessKey)||i,i),p=(o==null?void 0:o.authorizedAt)||null;return{...t,logoUrl:a.logoUrl||t.logoUrl||"",fiscal:{ruc:(e==null?void 0:e.ruc)||"",legalName:(e==null?void 0:e.legalName)||t.businessName||"",tradeName:(e==null?void 0:e.tradeName)||t.businessDescription||"",matrixAddress:(e==null?void 0:e.matrixAddress)||"",establishmentAddress:(e==null?void 0:e.establishmentAddress)||(e==null?void 0:e.matrixAddress)||"",phone:(e==null?void 0:e.phone)||"",email:(e==null?void 0:e.email)||"",accountingRequired:!!(e!=null&&e.accountingRequired),environment:(e==null?void 0:e.environment)||(o==null?void 0:o.environment)||"pruebas",environmentLabel:rt((o==null?void 0:o.environment)||(e==null?void 0:e.environment)),establishmentCode:String(d).padStart(3,"0").slice(0,3),emissionPointCode:String(n).padStart(3,"0").slice(0,3),sequential:r,invoiceNumber:r!=null?dt(d,n,r):"",accessKey:i,authorizationNumber:u,authorizedAt:p,emissionDate:p&&String(p).slice(0,10)||t.dateIso&&String(t.dateIso).slice(0,10)||"",status:(o==null?void 0:o.status)||null,fromSettingsPreview:!(o!=null&&o.sequential)}}}function ut(t){return String((t==null?void 0:t.documentType)||"")==="factura"}const mt=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","212113","212311","232111","111213","131113","131311","111133","111331","113131","113113","133111","313111","211331","131131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"],q=104,ct=106;function pt(t){const e=[q];let o=q,a=1;for(let d=0;d<t.length;d+=1){const n=t.charCodeAt(d)-32;n<0||n>95||(e.push(n),o+=n*a,a+=1)}return e.push(o%103),e.push(ct),e}function gt(t){const e=String(t||"").trim();if(!e)return null;const o=pt(e);let a=0;const d=[];return o.forEach(n=>{const r=mt[n];if(r)for(let i=0;i<r.length;i+=1){const u=Number(r[i]);i%2===0&&d.push({x:a,w:u}),a+=u}}),{width:a,rects:d}}function ft(t,{height:e=42,maxWidth:o=280}={}){const a=gt(t);if(!a)return"";const d=o/a.width,n=e,r=a.rects.map(i=>`<rect x="${(i.x*d).toFixed(2)}" y="0" width="${(i.w*d).toFixed(2)}" height="${n}" fill="#000"/>`).join("");return`<svg xmlns="http://www.w3.org/2000/svg" width="${o}" height="${n}" viewBox="0 0 ${o} ${n}" preserveAspectRatio="none" aria-hidden="true">${r}</svg>`}function g(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function f(t,e,o=!1){return`<div style="margin:0 0 3px;line-height:1.3">
    <strong>${g(t)}</strong>
    <span style="font-weight:${o?800:600};word-break:break-all">${g(e||"—")}</span>
  </div>`}function U(t,{isTicket:e,ivaRate:o}){var p;const a=Number(t.discount||0),d=Number(t.ice||0),n=Number(t.tip||0),r=[["Total Sin Impuestos",$(t.subtotal)],["Descuento",$(a)],["Valor ICE",$(d)],[o>0?`Valor IVA ${o}%`:"Valor IVA",$(t.iva)]];e||r.push(["Propina",$(n)]),r.push(["Valor Total",$(t.total)]);const i=r.map(([m,l],s)=>`<div style="display:flex;justify-content:space-between;gap:8px;${s===r.length-1?"border-top:1px solid #000;margin-top:4px;padding-top:4px;font-weight:900":"font-weight:700"}">
        <span>${g(m)}</span><span>${g(l)}</span>
      </div>`).join(""),u=(p=t.fiscal)!=null&&p.fromSettingsPreview?'<div style="margin-top:6px;font-size:10px;font-weight:700;color:#444">Sin factura SRI vinculada: el Nº se asigna al emitir/autorizar.</div>':"";return`${i}${u}`}function j(t,e){const o=lt(t.paymentMethod);return`<div style="font-size:0.9em">
    <div style="font-weight:800;margin-bottom:4px">Información Adicional</div>
    ${e?"":'<div style="font-weight:600;margin-bottom:6px">Sucursal: Matriz</div>'}
    <table style="width:100%;border-collapse:collapse;font-size:0.85em">
      <thead>
        <tr>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Forma de Pago</th>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Valor</th>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Plazo</th>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Tiempo</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">${g(o)}</td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:700">${g($(t.total))}</td>
          <td style="border:1px solid #000;padding:3px 4px"></td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">ninguno</td>
        </tr>
      </tbody>
    </table>
  </div>`}function H(t,e,o){return`<div style="border:1px solid #000;padding:${o?6:8}px;margin-bottom:${o?8:10}px;line-height:1.35">
    ${f("Razón Social/ Nombres:",t.customerName)}
    ${o?`${f("Identificación:",t.customerCedula)}
           ${f("Dirección:",t.customerAddress)}
           ${f("Teléfono:",t.customerPhone)}
           ${f("Correo:",t.customerEmail)}`:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${f("Identificación:",t.customerCedula)}
            ${f("Fecha Emisión:",e)}
            ${f("Dirección:",t.customerAddress)}
            ${f("Guía de Remisión:","")}
            ${f("Teléfono:",t.customerPhone)}
            ${f("Correo:",t.customerEmail)}
          </div>`}
  </div>`}function B(t,e,o){const a=t.logoUrl?`<img src="${g(t.logoUrl)}" alt="" style="max-width:${o?120:160}px;max-height:${o?70:90}px;object-fit:contain;margin:0 ${o?"auto":0} 6px;display:block" />`:"";return`<div style="text-align:${o?"center":"left"}">
    ${a}
    <div style="font-weight:900;font-size:${o?"0.95em":"1.05em"};line-height:1.25">${g(e.legalName||t.businessName)}</div>
    ${e.tradeName||t.businessDescription?`<div style="font-weight:700;font-size:${o?"0.85em":"0.95em"};margin-top:2px">${g(e.tradeName||t.businessDescription)}</div>`:""}
    ${e.matrixAddress?`<div style="font-weight:600;font-size:0.82em;margin-top:4px"><strong>Matriz: </strong>${g(e.matrixAddress)}</div>`:""}
    ${e.establishmentAddress?`<div style="font-weight:600;font-size:0.82em"><strong>Sucursal: </strong>${g(e.establishmentAddress)}</div>`:""}
    <div style="font-weight:600;font-size:0.82em;margin-top:3px"><strong>Obligado a llevar Contabilidad: </strong>${e.accountingRequired?"SI":"NO"}</div>
    ${e.phone?`<div style="font-weight:600;font-size:0.82em">${g(e.phone)}</div>`:""}
    ${e.email?`<div style="font-weight:600;font-size:0.82em">${g(e.email)}</div>`:""}
  </div>`}function ht(t,e="a4",o={}){var R,C;if(!t)return"";const a=K(e),d=a.isTicket,n=t.fiscal||{},r=t.items||[],i=V(o.detailSettings??((R=L())==null?void 0:R.receiptDetailSettings)),u=t.documentType||"factura",p=st(r),m=n.emissionDate||t.date&&((C=String(t.date).match(/\d{4}-\d{2}-\d{2}/))==null?void 0:C[0])||"",l=n.authorizationNumber||n.accessKey||"",s=l?ft(l,{height:d?36:52,maxWidth:d?240:420}):"",h="100%",x=d?a.narrow?"11px":"12.5px":"12pt",b="0",T=d?`<div style="text-align:center">
        <div style="font-weight:900;font-size:1.15em;letter-spacing:0.5px;margin-bottom:6px">FACTURA</div>
        ${f("Ruc:",n.ruc,!0)}
      </div>`:`<div>
        <div style="font-weight:900;font-size:1.35em;letter-spacing:0.5px;margin-bottom:8px;text-align:center">FACTURA</div>
        ${f("RUC:",n.ruc,!0)}
        ${f("No.",n.invoiceNumber,!0)}
        ${f("Ambiente",n.environmentLabel,!0)}
        ${f("Autorización",n.authorizationNumber||"Pendiente de autorización SRI")}
        ${n.authorizedAt?f("Fecha y Hora Autorización",n.authorizedAt):""}
        ${s?`<div style="margin-top:8px">${s}</div>`:""}
      </div>`,A=`<div style="text-align:center;margin-top:6px">
    ${f("Fecha Emisión:",m,!0)}
    ${f("No.",n.invoiceNumber,!0)}
    ${f("Ambiente",n.environmentLabel,!0)}
    ${f("Autorización",n.authorizationNumber||"Pendiente SRI")}
    ${n.authorizedAt?f("Fecha y Hora Autorización",n.authorizedAt):""}
    ${n.accessKey?f("Clave acceso",n.accessKey):""}
  </div>`,N=d?`<div style="margin-bottom:8px">
        <div style="display:grid;grid-template-columns:0.7fr 2.2fr 0.9fr 0.7fr 0.9fr;gap:2px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;font-weight:800;font-size:0.85em">
          <span>Cant</span><span>Descripción</span><span style="text-align:right">P.V.P</span><span style="text-align:right">Descto</span><span style="text-align:right">Subtotal</span>
        </div>
        ${r.map((c,v)=>`<div style="display:grid;grid-template-columns:0.7fr 2.2fr 0.9fr 0.7fr 0.9fr;gap:2px;padding:3px 0;border-bottom:1px dotted #999;font-weight:600;font-size:0.9em;align-items:start">
              <span>${g($(c.quantity))}</span>
              <span style="word-break:break-word">${g(P(c,i,v,u))}</span>
              <span style="text-align:right">${g(k(c.price))}</span>
              <span style="text-align:right">${g($(c.discount||0))}</span>
              <span style="text-align:right">${g($(c.subtotal??c.lineTotal))}</span>
            </div>`).join("")}
      </div>`:`<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:0.95em;table-layout:fixed">
        <colgroup>
          <col style="width:12%" />
          <col style="width:38%" />
          <col style="width:10%" />
          <col style="width:15%" />
          <col style="width:10%" />
          <col style="width:15%" />
        </colgroup>
        <thead>
          <tr>
            ${["Codigo","Descripción","Cant","Precio Unitario","Descto","Subtotal"].map((c,v)=>`<th style="border:1px solid #000;padding:5px 6px;font-weight:800;text-align:${v>=2?"right":"left"};background:#f3f3f3">${c}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${r.map((c,v)=>`<tr>
                <td style="border:1px solid #000;padding:3px 5px;font-weight:600">${g(c.code||c.productId||v+1)}</td>
                <td style="border:1px solid #000;padding:3px 5px;font-weight:600">${g(P(c,i,v,u))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${g($(c.quantity))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${g(k(c.price))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${g($(c.discount||0))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${g($(c.subtotal??c.lineTotal))}</td>
              </tr>`).join("")}
        </tbody>
      </table>`;return d?`<div style="width:${h};max-width:${h};margin:0 auto;padding:${b};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
      ${T}
      <div style="margin:8px 0">${B(t,n,!0)}</div>
      ${A}
      <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0"></div>
      ${H(t,m,!0)}
      ${N}
      ${U(t,{isTicket:!0,ivaRate:p})}
      <div style="margin-top:10px">${j(t,!0)}</div>
    </div>`:`<div style="width:${h};max-width:${h};margin:0 auto;padding:${b};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #000;padding:10px">${B(t,n,!1)}</div>
      <div style="border:1px solid #000;padding:10px">${T}</div>
    </div>
    ${H(t,m,!1)}
    ${N}
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;align-items:start">
      <div style="border:1px solid #000;padding:8px">${j(t,!1)}</div>
      <div style="border:1px solid #000;padding:8px">${U(t,{isTicket:!1,ivaRate:p})}</div>
    </div>
  </div>`}const y=t=>Number(Number(t||0).toFixed(2)),D=t=>Number(Number(t||0).toFixed(3)),xt={factura:"Factura",nota_venta:"Nota de venta",documento:"Comprobante",consumidor_final:"Consumidor final"},Rt=[{value:"factura",label:"Factura"},{value:"nota_venta",label:"Nota de venta"},{value:"documento",label:"Comprobante"},{value:"consumidor_final",label:"Consumidor final"}];function O(t){return xt[t]||t||"—"}function F(t){switch(t){case"factura":return"FACTURA";case"nota_venta":return"NOTA DE VENTA";case"consumidor_final":return"CONSUMIDOR FINAL";default:return"COMPROBANTE DE VENTA"}}function Et(t,e){if(!t)return null;const o=e||t.documentType||"documento",a=t._customerRaw||{};if(o==="consumidor_final")return{...t,documentType:o,documentTypeLabel:O(o),documentTitle:F(o),customerName:"Consumidor Final",customerPhone:"",customerAddress:"",customerEmail:"",customerCedula:""};const d=String(a.name||"").trim()||(t.customerName&&t.customerName!=="Consumidor Final"?t.customerName:"")||"—";return{...t,documentType:o,documentTypeLabel:O(o),documentTitle:F(o),customerName:d,customerPhone:a.phone||t.customerPhone||"",customerAddress:a.address||t.customerAddress||"",customerEmail:a.email||t.customerEmail||"",customerCedula:a.cedula||t.customerCedula||""}}function Dt(t,e){return t==="factura"?"factura":t==="nota_venta"?"nota_venta":e?"documento":"consumidor_final"}function E(t){return`$${y(t).toFixed(2)}`}function bt(t){const e=D(t),o=Math.round(e*100)===e*100?2:3;return`$${e.toFixed(o)}`}function yt(t){return X(t)}const z={name:"Nom:",cedula:"CI:",phone:"Tel:",address:"Dir:",payment:"Pag:"};function $t(t){const e=String(t||"").toLowerCase();return e==="efectivo"?"Efectivo":e==="transferencia"?"Transferencia":e==="tarjeta"?"Tarjeta":e==="credito"?"Crédito":t||"—"}function G(t){if(!t)return null;const e=(t.items||[]).map(l=>({name:l.name||l.productName||"Producto",code:l.code||l.sku||l.barcode||"",barcode:l.barcode||l.code||l.sku||"",unitLabel:l.unitLabel||l.unit||"",productId:l.productId||l.id||null,quantity:Number(l.quantity||0),price:D(l.price),discount:y(l.discount||0),lineTotal:y(l.lineTotal??Number(l.quantity)*Number(l.price)),taxRate:Number(l.taxRate||0),subtotal:y(l.subtotal??l.lineTotal),iva:y(l.iva||0)})),o=y(t.subtotal??e.reduce((l,s)=>l+s.subtotal,0)),a=y(t.iva??e.reduce((l,s)=>l+s.iva,0)),d=y(t.total??e.reduce((l,s)=>l+s.lineTotal,0)),n=t.customer||{},r=t.documentType||"documento",i=et({notes:t.notes||"",customer:n}),u=String(n.name||"").trim()||(i&&i!=="Consumidor Final"?i:""),p=r==="consumidor_final"?"Consumidor Final":u||i||n.name||"—",m=L();return{id:t.id,businessName:m.alias||"App",businessDescription:m.description||"",logoUrl:m.logoUrl||"",documentTitle:F(r),documentType:r,documentTypeLabel:O(r),date:yt(t.date||t.paidAt),dateIso:t.date||t.paidAt||null,customerName:p,customerPhone:n.phone||"",customerAddress:n.address||"",customerEmail:n.email||"",customerCedula:n.cedula||"",_customerRaw:{name:u,phone:n.phone||"",address:n.address||"",email:n.email||"",cedula:n.cedula||""},paymentMethod:$t(t.paymentMethod),items:e,subtotal:o,iva:a,total:d,notes:String(t.notes||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").trim()}}function Pt(t){if(!t)return null;const o=(t.ERP_order_items||t.items||[]).map(i=>{var b;const u=Number(i.quantity||0),p=D(i.price),m=y(u*p),l=Number(((b=i.ERP_inventory_product)==null?void 0:b.taxRate)||i.taxRate||0);let s=m,h=0;l>0&&(s=y(m/(1+l/100)),h=y(m-s));const x=i.ERP_inventory_product||{};return{name:x.name||i.name||"Producto",code:x.sku||x.barcode||i.code||"",barcode:x.barcode||x.sku||i.code||"",unitLabel:x.unitLabel||x.unit||i.unitLabel||"",productId:i.productId||x.id||null,quantity:u,price:p,discount:0,taxRate:l,subtotal:s,iva:h,lineTotal:m}}),a=o.reduce((i,u)=>i+u.subtotal,0),d=o.reduce((i,u)=>i+u.iva,0),n=o.reduce((i,u)=>i+u.lineTotal,0),r=t.ERP_customer||t.customer||{};return G({id:t.id,date:t.date,paidAt:t.paidAt,paymentMethod:t.paymentMethod||"credito",documentType:t.documentType||"nota_venta",notes:t.notes,customer:r,items:o,subtotal:a,iva:d,total:n})}function Ot({orderId:t,cart:e,customer:o,documentType:a,paymentMethod:d,saleType:n,notes:r}){const i=e.map(s=>{const h=Number(s.quantity||0),x=D(s.price),b=y(h*x),T=Number(s.taxRate||0);let A=b,N=0;return T>0&&(A=y(b/(1+T/100)),N=y(b-A)),{name:s.name,code:s.sku||s.barcode||s.code||"",barcode:s.barcode||s.sku||s.code||"",unitLabel:s.unitLabel||s.unit||"",productId:s.productId||s.id||null,quantity:h,price:x,discount:0,taxRate:T,subtotal:A,iva:N,lineTotal:b}}),u=i.reduce((s,h)=>s+h.subtotal,0),p=i.reduce((s,h)=>s+h.iva,0),m=i.reduce((s,h)=>s+h.lineTotal,0),l=a;return G({id:t,date:new Date().toISOString(),paidAt:n==="credito"?null:new Date().toISOString(),paymentMethod:n==="credito"?"credito":d,documentType:l,notes:r,customer:o,items:i,subtotal:u,iva:p,total:m})}function Ft(t,e,o={}){const a=ut(t)?ht(t,e,o):vt(t,e,o);nt(a,{format:e})}function vt(t,e,o={}){var C;const{showNotes:a=!0}=o,d=K(e),n=d.isTicket,r=d.print,i=d.productColPct,u=n?"100%":"210mm",p=n?r.fs:"14px",m=n?"0":"24px",l=n?"padding:2px 1px;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;vertical-align:top;line-height:1.35;font-weight:600":"padding:2px 0;font-weight:600",s=n?`text-align:center;padding:2px 1px;vertical-align:top;font-size:${r.num}px;font-weight:700`:"text-align:center;padding:2px 4px;font-weight:700",h=n?`text-align:right;padding:2px 1px;vertical-align:top;font-size:${r.num}px;font-weight:700;word-wrap:break-word;overflow-wrap:break-word`:"text-align:right;padding:2px 0;font-weight:700",x=(c,v,_=!1)=>{const J=_?"font-weight:800;":"font-weight:700;",W=_?n?`font-size:${r.totalBold}px;`:"font-size:17px;":"";return`<div style="display:table;width:100%;${J}${W}">
      <span style="display:table-cell;padding:0 1px">${c}</span>
      <span style="display:table-cell;text-align:right;white-space:nowrap;padding:0 1px">${v}</span>
    </div>`},b=n?`<div style="margin-top:10px">
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${r.signature}px">Entrega</div>
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${r.signature}px">Recibe</div>
      </div>`:`<div style="display:flex;justify-content:space-between;gap:32px;margin-top:36px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Entrega</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Recibe</div>
        </div>
      </div>`,T=V(o.detailSettings??((C=L())==null?void 0:C.receiptDetailSettings)),A=t.documentType||"nota_venta",N=(t.items||[]).map((c,v)=>`<tr>
          <td style="${l}">${w(P(c,T,v,A))}</td>
          <td style="${s}">${c.quantity}</td>
          <td style="${h}">${bt(c.price)}</td>
          <td style="${h}">${E(c.lineTotal)}</td>
        </tr>`).join(""),R=(t.items||[]).reduce((c,v)=>c+Number(v.quantity||0),0);return`<div style="width:${u};max-width:${u};margin:0 auto;padding:${m};box-sizing:border-box;font-family:Arial,sans-serif;font-size:${p};font-weight:600;color:#000;line-height:1.35;overflow:hidden">
    <div style="text-align:center;margin-bottom:${n?6:16}px">
      <div style="font-weight:800;font-size:${n?r.title:22}px;color:#000">${w(t.businessName)}</div>
      ${t.businessDescription?`<div style="font-weight:800;font-size:${n?r.desc:13}px;color:#000;margin-top:2px">${w(t.businessDescription)}</div>`:""}
      <div style="font-weight:800;margin-top:${n?5:12}px;font-size:${n?r.docTitle:17}px;color:#000">${w(t.documentTitle)}</div>
      <div style="font-weight:800;font-size:${n?r.meta:13}px;color:#000;margin-top:2px">N° ${t.id||"—"}</div>
      <div style="font-weight:900;font-size:${n?r.date:18}px;color:#000;margin-top:3px">${w(t.date)}</div>
    </div>
    <div style="margin-bottom:${n?6:12}px;font-size:${n?r.customer:16}px;font-weight:700;color:#000;line-height:1.4">
      <div style="margin-bottom:${n?2:3}px"><strong>${z.name}</strong> ${w(t.customerName)}</div>
      ${t.customerCedula?`<div style="margin-bottom:${n?2:3}px"><strong>${z.cedula}</strong> ${w(t.customerCedula)}</div>`:""}
      ${t.customerPhone?`<div style="margin-bottom:${n?2:3}px"><strong>${z.phone}</strong> ${w(t.customerPhone)}</div>`:""}
      ${t.customerAddress?`<div style="margin-bottom:${n?2:3}px"><strong>${z.address}</strong> ${w(t.customerAddress)}</div>`:""}
      <div><strong>${z.payment}</strong> ${w(t.paymentMethod)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${n?6:12}px;color:#000;table-layout:fixed">
      <thead>
        <tr style="border-bottom:1px solid #ccc">
          <th style="text-align:left;padding:2px 1px;font-weight:800;color:#000;width:${n?i.product:"auto"}">Producto</th>
          <th style="text-align:center;padding:2px 1px;font-weight:800;color:#000;width:${n?i.cant:"auto"}">Cant</th>
          <th style="text-align:right;padding:2px 1px;font-weight:800;color:#000;width:${n?i.pu:"auto"}">P.U.</th>
          <th style="text-align:right;padding:2px 1px;font-weight:800;color:#000;width:${n?i.total:"auto"}">Total</th>
        </tr>
      </thead>
      <tbody>${N}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #ccc">
          <td style="text-align:right;padding:3px 1px;font-weight:800;color:#000">Total Cant</td>
          <td style="text-align:center;padding:3px 1px;font-weight:800;color:#000">${R}</td>
          <td style="padding:3px 1px"></td>
          <td style="padding:3px 1px"></td>
        </tr>
      </tfoot>
    </table>
    <div style="border-top:1px dashed #999;padding-top:${n?3:10}px;color:#000">
      ${x("Subtotal",E(t.subtotal))}
      ${t.iva>0?x("IVA",E(t.iva)):""}
      ${x("TOTAL",E(t.total),!0)}
    </div>
    ${a&&t.notes?`<div style="margin-top:${n?4:10}px;font-size:${n?r.notes:12}px;font-weight:700;color:#000;word-wrap:break-word">${w(t.notes)}</div>`:""}
    <div style="text-align:center;margin-top:${n?6:16}px;margin-bottom:0;font-size:${n?r.footer:12}px;font-weight:800;color:#000">Gracias por su compra</div>
    ${b}
  </div>`}function w(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{Rt as D,z as R,Et as a,Pt as b,Ft as c,ft as d,zt as e,st as f,$ as g,k as h,Nt as i,ut as j,bt as k,E as l,Ct as m,At as n,Ot as o,nt as p,O as q,Dt as r,lt as s,$t as t,yt as u,G as v};
