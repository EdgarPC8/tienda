import{bW as G,bJ as j,bX as J,bY as Z,bZ as W,b_ as F,b$ as D,c0 as tt,bV as K,c1 as Y,c2 as et,c3 as nt,c4 as ot,c5 as it,c6 as at,c7 as st}from"./index-n18qO7e6.js";import{f as dt}from"./functions-DTk1h1FH.js";import{p as rt}from"./printHtmlDocument-g0d8tf9l.js";import{c as lt}from"./code128Barcode-D2KDP90S.js";const M="[CAJA_POS]",ut="[CONTADO]",Q="[CREDITO]";function Nt({baseNote:t,saleType:e}){const o=e==="credito"?Q:ut,r=String(t||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").replace(/\s+/g," ").trim();return`${M} ${o} ${r}`.trim()}function ct(t){if(!t)return"—";const e=String(t.notes||""),o=t.customer,r=String((o==null?void 0:o.name)||"").trim();if(!e.includes(M))return r||"—";const l=e.toLowerCase();return l.includes("mostrador")||l.includes("consumidor final")||l.includes("sin datos de cliente")?"Consumidor Final":r||"—"}function mt(t){const e=String((t==null?void 0:t.notes)||"");return!(!e.includes(M)||e.includes(Q)||String((t==null?void 0:t.paymentMethod)||"").toLowerCase()==="credito")}function wt(t){return!mt(t)}function At(t){return t.find(e=>{const o=String(e.name||"").toLowerCase();return o.includes("consumidor")||o.includes("final")})??null}function x(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function p(t,e,o=!1){return`<div style="margin:0 0 3px;line-height:1.3">
    <strong>${x(t)}</strong>
    <span style="font-weight:${o?800:600};word-break:break-all">${x(e||"—")}</span>
  </div>`}function H(t,{isTicket:e,ivaRate:o}){var h;const r=Number(t.discount||0),l=Number(t.ice||0),a=Number(t.tip||0),n=[["Total Sin Impuestos",D(t.subtotal)],["Descuento",D(r)],["Valor ICE",D(l)],[o>0?`Valor IVA ${o}%`:"Valor IVA",D(t.iva)]];e||n.push(["Propina",D(a)]),n.push(["Valor Total",D(t.total)]);const d=n.map(([m,T],v)=>`<div style="display:flex;justify-content:space-between;gap:8px;${v===n.length-1?"border-top:1px solid #000;margin-top:4px;padding-top:4px;font-weight:900":"font-weight:700"}">
        <span>${x(m)}</span><span>${x(T)}</span>
      </div>`).join(""),f=(h=t.fiscal)!=null&&h.fromSettingsPreview?'<div style="margin-top:6px;font-size:10px;font-weight:700;color:#444">Sin factura SRI vinculada: el Nº se asigna al emitir/autorizar.</div>':"";return`${d}${f}`}function U(t,e){const o=it(t.paymentMethod);return`<div style="font-size:0.9em">
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
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">${x(o)}</td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:700">${x(D(t.total))}</td>
          <td style="border:1px solid #000;padding:3px 4px"></td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">ninguno</td>
        </tr>
      </tbody>
    </table>
  </div>`}function V(t,e,o){return`<div style="border:1px solid #000;padding:${o?6:8}px;margin-bottom:${o?8:10}px;line-height:1.35">
    ${p("Razón Social/ Nombres:",t.customerName)}
    ${o?`${p("Identificación:",t.customerCedula)}
           ${p("Dirección:",t.customerAddress)}
           ${p("Teléfono:",t.customerPhone)}
           ${p("Correo:",t.customerEmail)}`:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${p("Identificación:",t.customerCedula)}
            ${p("Fecha Emisión:",e)}
            ${p("Dirección:",t.customerAddress)}
            ${p("Guía de Remisión:","")}
            ${p("Teléfono:",t.customerPhone)}
            ${p("Correo:",t.customerEmail)}
          </div>`}
  </div>`}function B(t,e,o,r){const l=t.logoUrl?`<img src="${x(t.logoUrl)}" alt="" style="max-width:${o?120:160}px;max-height:${o?70:90}px;object-fit:contain;margin:0 ${o?"auto":0} 6px;display:block" />`:"",a=et(e,r),n=nt(r),d=ot(r);return`<div style="text-align:${o?"center":"left"}">
    ${l}
    <div style="font-weight:900;font-size:${o?"0.95em":"1.05em"};line-height:1.25">${x(e.legalName||t.businessName)}</div>
    ${e.tradeName||t.businessDescription?`<div style="font-weight:700;font-size:${o?"0.85em":"0.95em"};margin-top:2px">${x(e.tradeName||t.businessDescription)}</div>`:""}
    ${e.matrixAddress?`<div style="font-weight:600;font-size:0.82em;margin-top:4px"><strong>Matriz: </strong>${x(e.matrixAddress)}</div>`:""}
    ${e.establishmentAddress?`<div style="font-weight:600;font-size:0.82em"><strong>Sucursal: </strong>${x(e.establishmentAddress)}</div>`:""}
    ${n?`<div style="font-weight:600;font-size:0.82em;margin-top:3px"><strong>Obligado a llevar Contabilidad: </strong>${e.accountingRequired?"SI":"NO"}</div>`:""}
    ${a?`<div style="font-weight:700;font-size:0.82em;margin-top:2px">${x(a)}</div>`:""}
    ${d&&e.specialTaxpayerResolution?`<div style="font-weight:600;font-size:0.82em"><strong>Contribuyente Especial: </strong>${x(e.specialTaxpayerResolution)}</div>`:""}
    ${e.phone?`<div style="font-weight:600;font-size:0.82em">${x(e.phone)}</div>`:""}
    ${e.email?`<div style="font-weight:600;font-size:0.82em">${x(e.email)}</div>`:""}
  </div>`}function pt(t,e="a4",o={}){var $,P;if(!t)return"";const r=K(e),l=r.isTicket,a=G(o.detailSettings??(($=j())==null?void 0:$.receiptDetailSettings));t=J(t,a);const n=t.fiscal||{},d=t.items||[],f=t.documentType||"factura",h=Z(d),m=n.emissionDate||t.date&&((P=String(t.date).match(/\d{4}-\d{2}-\d{2}/))==null?void 0:P[0])||"",T=n.authorizationNumber||n.accessKey||"",v=T?lt(T,{height:l?36:52,maxWidth:l?240:420}):"",y="100%",b=l?r.narrow?"11px":"12.5px":"12pt",s="0",i=l?`<div style="text-align:center">
        <div style="font-weight:900;font-size:1.15em;letter-spacing:0.5px;margin-bottom:6px">FACTURA</div>
        ${p("Ruc:",n.ruc,!0)}
      </div>`:`<div>
        <div style="font-weight:900;font-size:1.35em;letter-spacing:0.5px;margin-bottom:8px;text-align:center">FACTURA</div>
        ${p("RUC:",n.ruc,!0)}
        ${p("No.",n.invoiceNumber,!0)}
        ${p("Ambiente",n.environmentLabel,!0)}
        ${p("Autorización",n.authorizationNumber||"Pendiente de autorización SRI")}
        ${n.authorizedAt?p("Fecha y Hora Autorización",n.authorizedAt):""}
        ${v?`<div style="margin-top:8px">${v}</div>`:""}
      </div>`,N=`<div style="text-align:center;margin-top:6px">
    ${p("Fecha Emisión:",m,!0)}
    ${p("No.",n.invoiceNumber,!0)}
    ${p("Ambiente",n.environmentLabel,!0)}
    ${p("Autorización",n.authorizationNumber||"Pendiente SRI")}
    ${n.authorizedAt?p("Fecha y Hora Autorización",n.authorizedAt):""}
    ${n.accessKey?p("Clave acceso",n.accessKey):""}
  </div>`,A=W(a,f,e),R={money:D,unitPrice:tt,description:(c,S)=>Y(c,a,S,f)},z=A.map(c=>`${Math.max(.4,c.widthPct/12)}fr`).join(" "),u=l?`<div style="margin-bottom:8px">
        <div style="display:grid;grid-template-columns:${z};gap:2px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;font-weight:800;font-size:0.85em">
          ${A.map(c=>`<span style="text-align:${c.align}">${x(c.header)}</span>`).join("")}
        </div>
        ${d.map((c,S)=>`<div style="display:grid;grid-template-columns:${z};gap:2px;padding:3px 0;border-bottom:1px dotted #999;font-weight:600;font-size:0.9em;align-items:start">
              ${A.map(C=>{const E=x(F(C.id,c,S,R));return`<span style="${[`text-align:${C.align}`,C.breakWords?"word-break:break-word;overflow-wrap:anywhere":""].filter(Boolean).join(";")}">${E}</span>`}).join("")}
            </div>`).join("")}
      </div>`:`<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:0.95em;table-layout:fixed">
        <colgroup>
          ${A.map(c=>`<col style="width:${c.width}" />`).join("")}
        </colgroup>
        <thead>
          <tr>
            ${A.map(c=>`<th style="border:1px solid #000;padding:5px 4px;font-weight:800;text-align:${c.align};background:#f3f3f3;overflow:hidden">${x(c.header)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${d.map((c,S)=>`<tr>
                ${A.map(C=>{const E=x(F(C.id,c,S,R)),q=C.id==="code"?"font-size:0.88em;word-break:break-all;overflow-wrap:anywhere;line-height:1.25":C.breakWords?"word-break:break-word;overflow-wrap:anywhere;line-height:1.3":"";return`<td style="border:1px solid #000;padding:3px 4px;font-weight:${C.align==="right"?700:600};text-align:${C.align};overflow:hidden;vertical-align:top;${q}">${E}</td>`}).join("")}
              </tr>`).join("")}
        </tbody>
      </table>`;return l?`<div style="width:${y};max-width:${y};margin:0 auto;padding:${s};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${b};color:#000;line-height:1.3">
      ${i}
      <div style="margin:8px 0">${B(t,n,!0,a)}</div>
      ${N}
      <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0"></div>
      ${V(t,m,!0)}
      ${u}
      ${H(t,{isTicket:!0,ivaRate:h})}
      <div style="margin-top:10px">${U(t,!0)}</div>
    </div>`:`<div style="width:${y};max-width:${y};margin:0 auto;padding:${s};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${b};color:#000;line-height:1.3">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #000;padding:10px">${B(t,n,!1,a)}</div>
      <div style="border:1px solid #000;padding:10px">${i}</div>
    </div>
    ${V(t,m,!1)}
    ${u}
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;align-items:start">
      <div style="border:1px solid #000;padding:8px">${U(t,!1)}</div>
      <div style="border:1px solid #000;padding:8px">${H(t,{isTicket:!1,ivaRate:h})}</div>
    </div>
  </div>`}const g=t=>Number(Number(t||0).toFixed(2)),O=t=>Number(Number(t||0).toFixed(3)),gt={factura:"Factura",nota_venta:"Nota de venta",documento:"Comprobante",consumidor_final:"Consumidor final"},Ct=[{value:"factura",label:"Factura"},{value:"nota_venta",label:"Nota de venta"},{value:"documento",label:"Comprobante"},{value:"consumidor_final",label:"Consumidor final"}];function L(t){return gt[t]||t||"—"}function k(t){switch(t){case"factura":return"FACTURA";case"nota_venta":return"NOTA DE VENTA";case"consumidor_final":return"CONSUMIDOR FINAL";default:return"COMPROBANTE DE VENTA"}}function Rt(t,e){if(!t)return null;const o=e||t.documentType||"documento",r=t._customerRaw||{};if(o==="consumidor_final")return{...t,documentType:o,documentTypeLabel:L(o),documentTitle:k(o),customerName:"Consumidor Final",customerPhone:"",customerAddress:"",customerEmail:"",customerCedula:""};const l=String(r.name||"").trim()||(t.customerName&&t.customerName!=="Consumidor Final"?t.customerName:"")||"—";return{...t,documentType:o,documentTypeLabel:L(o),documentTitle:k(o),customerName:l,customerPhone:r.phone||t.customerPhone||"",customerAddress:r.address||t.customerAddress||"",customerEmail:r.email||t.customerEmail||"",customerCedula:r.cedula||t.customerCedula||""}}function zt(t,e){return t==="factura"?"factura":t==="nota_venta"?"nota_venta":e?"documento":"consumidor_final"}function _(t){return`$${g(t).toFixed(2)}`}function ft(t){const e=O(t),o=Math.round(e*100)===e*100?2:3;return`$${e.toFixed(o)}`}function bt(t){return dt(t,{showSeconds:!0})}const I={name:"Nom:",cedula:"CI:",phone:"Tel:",address:"Dir:",payment:"Pag:",received:"Recibido:",change:"Vuelto:"};function xt(t){const e=String(t||"").toLowerCase();return e==="efectivo"?"Efectivo":e==="transferencia"?"Transferencia":e==="tarjeta"?"Tarjeta":e==="credito"?"Crédito":t||"—"}function X(t){if(!t)return null;const e=(t.items||[]).map(s=>({name:s.name||s.productName||"Producto",code:s.code||s.sku||s.barcode||"",barcode:s.barcode||s.code||s.sku||"",unitLabel:s.unitLabel||s.unit||"",productId:s.productId||s.id||null,quantity:Number(s.quantity||0),price:O(s.price),discount:g(s.discount||0),lineTotal:g(s.lineTotal??Number(s.quantity)*Number(s.price)),taxRate:Number(s.taxRate||0),subtotal:g(s.subtotal??s.lineTotal),iva:g(s.iva||0)})),o=g(t.subtotal??e.reduce((s,i)=>s+i.subtotal,0)),r=g(t.iva??e.reduce((s,i)=>s+i.iva,0)),l=g(t.total??e.reduce((s,i)=>s+i.lineTotal,0)),a=g(t.discount??e.reduce((s,i)=>s+Number(i.discount||0),0)),n=t.customer||{},d=t.documentType||"documento",f=ct({notes:t.notes||"",customer:n}),h=String(n.name||"").trim()||(f&&f!=="Consumidor Final"?f:""),m=d==="consumidor_final"?"Consumidor Final":h||f||n.name||"—",T=j(),v=t.amountReceived,y=v!=null&&v!==""?g(v):null,b=y!=null?g(Math.max(0,y-l)):null;return{id:t.id,businessName:T.alias||"App",businessDescription:T.description||"",logoUrl:T.logoUrl||"",documentTitle:k(d),documentType:d,documentTypeLabel:L(d),date:bt(t.date||t.paidAt),dateIso:t.date||t.paidAt||null,customerName:m,customerPhone:n.phone||"",customerAddress:n.address||"",customerEmail:n.email||"",customerCedula:n.cedula||"",_customerRaw:{name:h,phone:n.phone||"",address:n.address||"",email:n.email||"",cedula:n.cedula||""},paymentMethod:xt(t.paymentMethod),items:e,subtotal:o,iva:r,total:l,discount:a,amountReceived:y,changeDue:b,ticketDiscountPercent:Number(t.ticketDiscountPercent||0),notes:String(t.notes||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").trim()}}function St(t){if(!t)return null;const o=(t.ERP_order_items||t.items||[]).map(d=>{var s;const f=Number(d.quantity||0),h=O(d.price),m=g(f*h),T=Number(((s=d.ERP_inventory_product)==null?void 0:s.taxRate)||d.taxRate||0);let v=m,y=0;T>0&&(v=g(m/(1+T/100)),y=g(m-v));const b=d.ERP_inventory_product||{};return{name:b.name||d.name||"Producto",code:b.sku||b.barcode||d.code||"",barcode:b.barcode||b.sku||d.code||"",unitLabel:b.unitLabel||b.unit||d.unitLabel||"",productId:d.productId||b.id||null,quantity:f,price:h,discount:0,taxRate:T,subtotal:v,iva:y,lineTotal:m}}),r=o.reduce((d,f)=>d+f.subtotal,0),l=o.reduce((d,f)=>d+f.iva,0),a=o.reduce((d,f)=>d+f.lineTotal,0),n=t.ERP_customer||t.customer||{};return X({id:t.id,date:t.date,paidAt:t.paidAt,paymentMethod:t.paymentMethod||"credito",documentType:t.documentType||"nota_venta",notes:t.notes,amountReceived:t.amountReceived,customer:n,items:o,subtotal:r,iva:l,total:a})}function Dt({orderId:t,cart:e,customer:o,documentType:r,paymentMethod:l,saleType:a,notes:n,amountReceived:d=null,ticketDiscountPercent:f=0,discountTotal:h=0}){const m=e.map(i=>{const N=Number(i.quantity||0),A=O(i.price),R=i.lineTotal!=null&&Number.isFinite(Number(i.lineTotal))?g(i.lineTotal):g(N*A),z=Number(i.taxRate||0);let u=i.subtotal!=null&&Number.isFinite(Number(i.subtotal))?g(i.subtotal):R,$=i.iva!=null&&Number.isFinite(Number(i.iva))?g(i.iva):0;return i.subtotal==null&&z>0&&(u=g(R/(1+z/100)),$=g(R-u)),{name:i.name,code:i.sku||i.barcode||i.code||"",barcode:i.barcode||i.sku||i.code||"",unitLabel:i.unitLabel||i.unit||"",productId:i.productId||i.id||null,quantity:N,price:A,discount:g(i.discount||0),discountPercent:Number(i.discountPercent||0),taxRate:z,subtotal:u,iva:$,lineTotal:R}}),T=m.reduce((i,N)=>i+N.subtotal,0),v=m.reduce((i,N)=>i+N.iva,0),y=m.reduce((i,N)=>i+N.lineTotal,0),b=h>0?g(h):g(m.reduce((i,N)=>i+Number(N.discount||0),0)),s=r;return X({id:t,date:new Date().toISOString(),paidAt:a==="credito"?null:new Date().toISOString(),paymentMethod:a==="credito"?"credito":l,documentType:s,notes:n,amountReceived:d,customer:o,items:m,subtotal:T,iva:v,total:y,discount:b,ticketDiscountPercent:Number(f||0)})}function Pt(t,e,o={}){const r=at(t)?pt(t,e,o):vt(t,e,o);rt(r,{format:e})}function vt(t,e,o={}){var z;const{showNotes:r=!0}=o,l=K(e),a=l.isTicket,n=l.print,d=a?"100%":"210mm",f=a?n.fs:"14px",h=a?"0":"24px",m=(u,$,P=!1)=>{const c=P?"font-weight:800;":"font-weight:700;",S=P?a?`font-size:${n.totalBold}px;`:"font-size:17px;":"";return`<div style="display:table;width:100%;${c}${S}">
      <span style="display:table-cell;padding:0 1px">${u}</span>
      <span style="display:table-cell;text-align:right;white-space:nowrap;padding:0 1px">${$}</span>
    </div>`},T=a?`<div style="margin-top:10px">
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${n.signature}px">Entrega</div>
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${n.signature}px">Recibe</div>
      </div>`:`<div style="display:flex;justify-content:space-between;gap:32px;margin-top:36px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Entrega</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Recibe</div>
        </div>
      </div>`,v=G(o.detailSettings??((z=j())==null?void 0:z.receiptDetailSettings));t=J(t,v);const y=t.documentType||"nota_venta",b=W(v,y,e),s={money:_,unitPrice:ft,description:(u,$)=>Y(u,v,$,y)},i=b.findIndex(u=>u.id==="qty"),N=(t.items||[]).map((u,$)=>`<tr>${b.map(c=>{const S=w(F(c.id,u,$,s));return`<td style="${[`text-align:${c.id==="qty"?"center":c.align==="right"?"right":"left"}`,"padding:2px 1px","vertical-align:top",`font-weight:${c.align==="right"||c.id==="qty"?700:600}`,c.breakWords?"word-wrap:break-word;overflow-wrap:anywhere;white-space:normal":"white-space:nowrap",a&&c.align==="right"?`font-size:${n.num}px`:""].filter(Boolean).join(";")}">${S}</td>`}).join("")}</tr>`).join(""),A=(t.items||[]).reduce((u,$)=>u+Number($.quantity||0),0),R=b.map((u,$)=>u.id==="qty"?`<td style="text-align:center;padding:3px 1px;font-weight:800;color:#000">${w(st(A))}</td>`:(i>0?$===i-1:$===0&&u.id==="description")?'<td style="text-align:right;padding:3px 1px;font-weight:800;color:#000">Total Cant</td>':'<td style="padding:3px 1px"></td>').join("");return`<div style="width:${d};max-width:${d};margin:0 auto;padding:${h};box-sizing:border-box;font-family:Arial,sans-serif;font-size:${f};font-weight:600;color:#000;line-height:1.35;overflow:hidden">
    <div style="text-align:center;margin-bottom:${a?6:16}px">
      <div style="font-weight:800;font-size:${a?n.title:22}px;color:#000">${w(t.businessName)}</div>
      ${t.businessDescription?`<div style="font-weight:800;font-size:${a?n.desc:13}px;color:#000;margin-top:2px">${w(t.businessDescription)}</div>`:""}
      <div style="font-weight:800;margin-top:${a?5:12}px;font-size:${a?n.docTitle:17}px;color:#000">${w(t.documentTitle)}</div>
      <div style="font-weight:800;font-size:${a?n.meta:13}px;color:#000;margin-top:2px">N° ${t.id||"—"}</div>
      <div style="font-weight:900;font-size:${a?n.date:18}px;color:#000;margin-top:3px">${w(t.date)}</div>
    </div>
    <div style="margin-bottom:${a?6:12}px;font-size:${a?n.customer:16}px;font-weight:700;color:#000;line-height:1.4">
      <div style="margin-bottom:${a?2:3}px"><strong>${I.name}</strong> ${w(t.customerName)}</div>
      ${t.customerCedula?`<div style="margin-bottom:${a?2:3}px"><strong>${I.cedula}</strong> ${w(t.customerCedula)}</div>`:""}
      ${t.customerPhone?`<div style="margin-bottom:${a?2:3}px"><strong>${I.phone}</strong> ${w(t.customerPhone)}</div>`:""}
      ${t.customerAddress?`<div style="margin-bottom:${a?2:3}px"><strong>${I.address}</strong> ${w(t.customerAddress)}</div>`:""}
      <div><strong>${I.payment}</strong> ${w(t.paymentMethod)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${a?6:12}px;color:#000;table-layout:fixed">
      <colgroup>
        ${b.map(u=>`<col style="width:${u.width}" />`).join("")}
      </colgroup>
      <thead>
        <tr style="border-bottom:1px solid #ccc">
          ${b.map(u=>`<th style="text-align:${u.id==="qty"?"center":u.align==="right"?"right":"left"};padding:2px 1px;font-weight:800;color:#000;width:${u.width}">${w(u.header)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${N}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #ccc">${R}</tr>
      </tfoot>
    </table>
    <div style="border-top:1px dashed #999;padding-top:${a?3:10}px;color:#000">
      ${m("Subtotal",_(t.subtotal))}
      ${t.iva>0?m("IVA",_(t.iva)):""}
      ${m("TOTAL",_(t.total),!0)}
      ${t.amountReceived!=null?m(I.received,_(t.amountReceived)):""}
      ${t.amountReceived!=null&&t.changeDue!=null?m(I.change,_(t.changeDue)):""}
    </div>
    ${r&&t.notes?`<div style="margin-top:${a?4:10}px;font-size:${a?n.notes:12}px;font-weight:700;color:#000;word-wrap:break-word">${w(t.notes)}</div>`:""}
    <div style="text-align:center;margin-top:${a?6:16}px;margin-bottom:0;font-size:${a?n.footer:12}px;font-weight:800;color:#000">Gracias por su compra</div>
    ${T}
  </div>`}function w(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{Ct as D,I as R,Rt as a,St as b,Pt as c,ft as d,At as e,_ as f,Nt as g,Dt as h,wt as i,L as j,bt as k,X as n,xt as p,zt as r};
