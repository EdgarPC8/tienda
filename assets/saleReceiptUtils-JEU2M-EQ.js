import{b9 as G,b1 as j,ba as J,bb as Z,bc as K,bd as F,be as S,bf as tt,b8 as W,bg as Q,bh as et,bi as nt,bj as ot,bk as it,bl as at,bm as st}from"./index-5nwenL_A.js";import{f as dt}from"./functions-sXVH_Tp6.js";import{p as rt}from"./printHtmlDocument-CRf3TxfT.js";import{c as lt}from"./code128Barcode-D2KDP90S.js";const M="[CAJA_POS]",ut="[CONTADO]",Y="[CREDITO]";function Nt({baseNote:t,saleType:e}){const o=e==="credito"?Y:ut,r=String(t||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").replace(/\s+/g," ").trim();return`${M} ${o} ${r}`.trim()}function ct(t){if(!t)return"—";const e=String(t.notes||""),o=t.customer,r=String((o==null?void 0:o.name)||"").trim();if(!e.includes(M))return r||"—";const l=e.toLowerCase();return l.includes("mostrador")||l.includes("consumidor final")||l.includes("sin datos de cliente")?"Consumidor Final":r||"—"}function mt(t){const e=String((t==null?void 0:t.notes)||"");return!(!e.includes(M)||e.includes(Y)||String((t==null?void 0:t.paymentMethod)||"").toLowerCase()==="credito")}function At(t){return!mt(t)}function wt(t){return t.find(e=>{const o=String(e.name||"").toLowerCase();return o.includes("consumidor")||o.includes("final")})??null}function y(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function p(t,e,o=!1){return`<div style="margin:0 0 3px;line-height:1.3">
    <strong>${y(t)}</strong>
    <span style="font-weight:${o?800:600};word-break:break-all">${y(e||"—")}</span>
  </div>`}function H(t,{isTicket:e,ivaRate:o}){var f;const r=Number(t.discount||0),l=Number(t.ice||0),a=Number(t.tip||0),n=[["Total Sin Impuestos",S(t.subtotal)],["Descuento",S(r)],["Valor ICE",S(l)],[o>0?`Valor IVA ${o}%`:"Valor IVA",S(t.iva)]];e||n.push(["Propina",S(a)]),n.push(["Valor Total",S(t.total)]);const d=n.map(([v,$],i)=>`<div style="display:flex;justify-content:space-between;gap:8px;${i===n.length-1?"border-top:1px solid #000;margin-top:4px;padding-top:4px;font-weight:900":"font-weight:700"}">
        <span>${y(v)}</span><span>${y($)}</span>
      </div>`).join(""),m=(f=t.fiscal)!=null&&f.fromSettingsPreview?'<div style="margin-top:6px;font-size:10px;font-weight:700;color:#444">Sin factura SRI vinculada: el Nº se asigna al emitir/autorizar.</div>':"";return`${d}${m}`}function U(t,e){const o=it(t.paymentMethod);return`<div style="font-size:0.9em">
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
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">${y(o)}</td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:700">${y(S(t.total))}</td>
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
  </div>`}function B(t,e,o,r){const l=t.logoUrl?`<img src="${y(t.logoUrl)}" alt="" style="max-width:${o?120:160}px;max-height:${o?70:90}px;object-fit:contain;margin:0 ${o?"auto":0} 6px;display:block" />`:"",a=et(e,r),n=nt(r),d=ot(r);return`<div style="text-align:${o?"center":"left"}">
    ${l}
    <div style="font-weight:900;font-size:${o?"0.95em":"1.05em"};line-height:1.25">${y(e.legalName||t.businessName)}</div>
    ${e.tradeName||t.businessDescription?`<div style="font-weight:700;font-size:${o?"0.85em":"0.95em"};margin-top:2px">${y(e.tradeName||t.businessDescription)}</div>`:""}
    ${e.matrixAddress?`<div style="font-weight:600;font-size:0.82em;margin-top:4px"><strong>Matriz: </strong>${y(e.matrixAddress)}</div>`:""}
    ${e.establishmentAddress?`<div style="font-weight:600;font-size:0.82em"><strong>Sucursal: </strong>${y(e.establishmentAddress)}</div>`:""}
    ${n?`<div style="font-weight:600;font-size:0.82em;margin-top:3px"><strong>Obligado a llevar Contabilidad: </strong>${e.accountingRequired?"SI":"NO"}</div>`:""}
    ${a?`<div style="font-weight:700;font-size:0.82em;margin-top:2px">${y(a)}</div>`:""}
    ${d&&e.specialTaxpayerResolution?`<div style="font-weight:600;font-size:0.82em"><strong>Contribuyente Especial: </strong>${y(e.specialTaxpayerResolution)}</div>`:""}
    ${e.phone?`<div style="font-weight:600;font-size:0.82em">${y(e.phone)}</div>`:""}
    ${e.email?`<div style="font-weight:600;font-size:0.82em">${y(e.email)}</div>`:""}
  </div>`}function pt(t,e="a4",o={}){var T,P;if(!t)return"";const r=W(e),l=r.isTicket,a=G(o.detailSettings??((T=j())==null?void 0:T.receiptDetailSettings));t=J(t,a);const n=t.fiscal||{},d=t.items||[],m=t.documentType||"factura",f=Z(d),v=n.emissionDate||t.date&&((P=String(t.date).match(/\d{4}-\d{2}-\d{2}/))==null?void 0:P[0])||"",$=n.authorizationNumber||n.accessKey||"",i=$?lt($,{height:l?36:52,maxWidth:l?240:420}):"",g="100%",x=l?r.narrow?"11px":"12.5px":"12pt",s="0",h=l?`<div style="text-align:center">
        <div style="font-weight:900;font-size:1.15em;letter-spacing:0.5px;margin-bottom:6px">FACTURA</div>
        ${p("Ruc:",n.ruc,!0)}
      </div>`:`<div>
        <div style="font-weight:900;font-size:1.35em;letter-spacing:0.5px;margin-bottom:8px;text-align:center">FACTURA</div>
        ${p("RUC:",n.ruc,!0)}
        ${p("No.",n.invoiceNumber,!0)}
        ${p("Ambiente",n.environmentLabel,!0)}
        ${p("Autorización",n.authorizationNumber||"Pendiente de autorización SRI")}
        ${n.authorizedAt?p("Fecha y Hora Autorización",n.authorizedAt):""}
        ${i?`<div style="margin-top:8px">${i}</div>`:""}
      </div>`,D=`<div style="text-align:center;margin-top:6px">
    ${p("Fecha Emisión:",v,!0)}
    ${p("No.",n.invoiceNumber,!0)}
    ${p("Ambiente",n.environmentLabel,!0)}
    ${p("Autorización",n.authorizationNumber||"Pendiente SRI")}
    ${n.authorizedAt?p("Fecha y Hora Autorización",n.authorizedAt):""}
    ${n.accessKey?p("Clave acceso",n.accessKey):""}
  </div>`,N=K(a,m,e),z={money:S,unitPrice:tt,description:(c,R)=>Q(c,a,R,m)},C=N.map(c=>`${Math.max(.4,c.widthPct/12)}fr`).join(" "),u=l?`<div style="margin-bottom:8px">
        <div style="display:grid;grid-template-columns:${C};gap:2px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;font-weight:800;font-size:0.85em">
          ${N.map(c=>`<span style="text-align:${c.align}">${y(c.header)}</span>`).join("")}
        </div>
        ${d.map((c,R)=>`<div style="display:grid;grid-template-columns:${C};gap:2px;padding:3px 0;border-bottom:1px dotted #999;font-weight:600;font-size:0.9em;align-items:start">
              ${N.map(w=>{const E=y(F(w.id,c,R,z));return`<span style="${[`text-align:${w.align}`,w.breakWords?"word-break:break-word;overflow-wrap:anywhere":""].filter(Boolean).join(";")}">${E}</span>`}).join("")}
            </div>`).join("")}
      </div>`:`<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:0.95em;table-layout:fixed">
        <colgroup>
          ${N.map(c=>`<col style="width:${c.width}" />`).join("")}
        </colgroup>
        <thead>
          <tr>
            ${N.map(c=>`<th style="border:1px solid #000;padding:5px 4px;font-weight:800;text-align:${c.align};background:#f3f3f3;overflow:hidden">${y(c.header)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${d.map((c,R)=>`<tr>
                ${N.map(w=>{const E=y(F(w.id,c,R,z)),q=w.id==="code"?"font-size:0.88em;word-break:break-all;overflow-wrap:anywhere;line-height:1.25":w.breakWords?"word-break:break-word;overflow-wrap:anywhere;line-height:1.3":"";return`<td style="border:1px solid #000;padding:3px 4px;font-weight:${w.align==="right"?700:600};text-align:${w.align};overflow:hidden;vertical-align:top;${q}">${E}</td>`}).join("")}
              </tr>`).join("")}
        </tbody>
      </table>`;return l?`<div style="width:${g};max-width:${g};margin:0 auto;padding:${s};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
      ${h}
      <div style="margin:8px 0">${B(t,n,!0,a)}</div>
      ${D}
      <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0"></div>
      ${V(t,v,!0)}
      ${u}
      ${H(t,{isTicket:!0,ivaRate:f})}
      <div style="margin-top:10px">${U(t,!0)}</div>
    </div>`:`<div style="width:${g};max-width:${g};margin:0 auto;padding:${s};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #000;padding:10px">${B(t,n,!1,a)}</div>
      <div style="border:1px solid #000;padding:10px">${h}</div>
    </div>
    ${V(t,v,!1)}
    ${u}
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;align-items:start">
      <div style="border:1px solid #000;padding:8px">${U(t,!1)}</div>
      <div style="border:1px solid #000;padding:8px">${H(t,{isTicket:!1,ivaRate:f})}</div>
    </div>
  </div>`}const b=t=>Number(Number(t||0).toFixed(2)),O=t=>Number(Number(t||0).toFixed(3)),gt={factura:"Factura",nota_venta:"Nota de venta",documento:"Comprobante",consumidor_final:"Consumidor final"},Ct=[{value:"factura",label:"Factura"},{value:"nota_venta",label:"Nota de venta"},{value:"documento",label:"Comprobante"},{value:"consumidor_final",label:"Consumidor final"}];function L(t){return gt[t]||t||"—"}function k(t){switch(t){case"factura":return"FACTURA";case"nota_venta":return"NOTA DE VENTA";case"consumidor_final":return"CONSUMIDOR FINAL";default:return"COMPROBANTE DE VENTA"}}function Rt(t,e){if(!t)return null;const o=e||t.documentType||"documento",r=t._customerRaw||{};if(o==="consumidor_final")return{...t,documentType:o,documentTypeLabel:L(o),documentTitle:k(o),customerName:"Consumidor Final",customerPhone:"",customerAddress:"",customerEmail:"",customerCedula:""};const l=String(r.name||"").trim()||(t.customerName&&t.customerName!=="Consumidor Final"?t.customerName:"")||"—";return{...t,documentType:o,documentTypeLabel:L(o),documentTitle:k(o),customerName:l,customerPhone:r.phone||t.customerPhone||"",customerAddress:r.address||t.customerAddress||"",customerEmail:r.email||t.customerEmail||"",customerCedula:r.cedula||t.customerCedula||""}}function zt(t,e){return t==="factura"?"factura":t==="nota_venta"?"nota_venta":e?"documento":"consumidor_final"}function _(t){return`$${b(t).toFixed(2)}`}function bt(t){const e=O(t),o=Math.round(e*100)===e*100?2:3;return`$${e.toFixed(o)}`}function ft(t){return dt(t)}const I={name:"Nom:",cedula:"CI:",phone:"Tel:",address:"Dir:",payment:"Pag:"};function xt(t){const e=String(t||"").toLowerCase();return e==="efectivo"?"Efectivo":e==="transferencia"?"Transferencia":e==="tarjeta"?"Tarjeta":e==="credito"?"Crédito":t||"—"}function X(t){if(!t)return null;const e=(t.items||[]).map(i=>({name:i.name||i.productName||"Producto",code:i.code||i.sku||i.barcode||"",barcode:i.barcode||i.code||i.sku||"",unitLabel:i.unitLabel||i.unit||"",productId:i.productId||i.id||null,quantity:Number(i.quantity||0),price:O(i.price),discount:b(i.discount||0),lineTotal:b(i.lineTotal??Number(i.quantity)*Number(i.price)),taxRate:Number(i.taxRate||0),subtotal:b(i.subtotal??i.lineTotal),iva:b(i.iva||0)})),o=b(t.subtotal??e.reduce((i,g)=>i+g.subtotal,0)),r=b(t.iva??e.reduce((i,g)=>i+g.iva,0)),l=b(t.total??e.reduce((i,g)=>i+g.lineTotal,0)),a=b(t.discount??e.reduce((i,g)=>i+Number(g.discount||0),0)),n=t.customer||{},d=t.documentType||"documento",m=ct({notes:t.notes||"",customer:n}),f=String(n.name||"").trim()||(m&&m!=="Consumidor Final"?m:""),v=d==="consumidor_final"?"Consumidor Final":f||m||n.name||"—",$=j();return{id:t.id,businessName:$.alias||"App",businessDescription:$.description||"",logoUrl:$.logoUrl||"",documentTitle:k(d),documentType:d,documentTypeLabel:L(d),date:ft(t.date||t.paidAt),dateIso:t.date||t.paidAt||null,customerName:v,customerPhone:n.phone||"",customerAddress:n.address||"",customerEmail:n.email||"",customerCedula:n.cedula||"",_customerRaw:{name:f,phone:n.phone||"",address:n.address||"",email:n.email||"",cedula:n.cedula||""},paymentMethod:xt(t.paymentMethod),items:e,subtotal:o,iva:r,total:l,discount:a,ticketDiscountPercent:Number(t.ticketDiscountPercent||0),notes:String(t.notes||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").trim()}}function St(t){if(!t)return null;const o=(t.ERP_order_items||t.items||[]).map(d=>{var s;const m=Number(d.quantity||0),f=O(d.price),v=b(m*f),$=Number(((s=d.ERP_inventory_product)==null?void 0:s.taxRate)||d.taxRate||0);let i=v,g=0;$>0&&(i=b(v/(1+$/100)),g=b(v-i));const x=d.ERP_inventory_product||{};return{name:x.name||d.name||"Producto",code:x.sku||x.barcode||d.code||"",barcode:x.barcode||x.sku||d.code||"",unitLabel:x.unitLabel||x.unit||d.unitLabel||"",productId:d.productId||x.id||null,quantity:m,price:f,discount:0,taxRate:$,subtotal:i,iva:g,lineTotal:v}}),r=o.reduce((d,m)=>d+m.subtotal,0),l=o.reduce((d,m)=>d+m.iva,0),a=o.reduce((d,m)=>d+m.lineTotal,0),n=t.ERP_customer||t.customer||{};return X({id:t.id,date:t.date,paidAt:t.paidAt,paymentMethod:t.paymentMethod||"credito",documentType:t.documentType||"nota_venta",notes:t.notes,customer:n,items:o,subtotal:r,iva:l,total:a})}function Pt({orderId:t,cart:e,customer:o,documentType:r,paymentMethod:l,saleType:a,notes:n,ticketDiscountPercent:d=0,discountTotal:m=0}){const f=e.map(s=>{const h=Number(s.quantity||0),D=O(s.price),N=s.lineTotal!=null&&Number.isFinite(Number(s.lineTotal))?b(s.lineTotal):b(h*D),z=Number(s.taxRate||0);let C=s.subtotal!=null&&Number.isFinite(Number(s.subtotal))?b(s.subtotal):N,u=s.iva!=null&&Number.isFinite(Number(s.iva))?b(s.iva):0;return s.subtotal==null&&z>0&&(C=b(N/(1+z/100)),u=b(N-C)),{name:s.name,code:s.sku||s.barcode||s.code||"",barcode:s.barcode||s.sku||s.code||"",unitLabel:s.unitLabel||s.unit||"",productId:s.productId||s.id||null,quantity:h,price:D,discount:b(s.discount||0),discountPercent:Number(s.discountPercent||0),taxRate:z,subtotal:C,iva:u,lineTotal:N}}),v=f.reduce((s,h)=>s+h.subtotal,0),$=f.reduce((s,h)=>s+h.iva,0),i=f.reduce((s,h)=>s+h.lineTotal,0),g=m>0?b(m):b(f.reduce((s,h)=>s+Number(h.discount||0),0)),x=r;return X({id:t,date:new Date().toISOString(),paidAt:a==="credito"?null:new Date().toISOString(),paymentMethod:a==="credito"?"credito":l,documentType:x,notes:n,customer:o,items:f,subtotal:v,iva:$,total:i,discount:g,ticketDiscountPercent:Number(d||0)})}function Dt(t,e,o={}){const r=at(t)?pt(t,e,o):yt(t,e,o);rt(r,{format:e})}function yt(t,e,o={}){var C;const{showNotes:r=!0}=o,l=W(e),a=l.isTicket,n=l.print,d=a?"100%":"210mm",m=a?n.fs:"14px",f=a?"0":"24px",v=(u,T,P=!1)=>{const c=P?"font-weight:800;":"font-weight:700;",R=P?a?`font-size:${n.totalBold}px;`:"font-size:17px;":"";return`<div style="display:table;width:100%;${c}${R}">
      <span style="display:table-cell;padding:0 1px">${u}</span>
      <span style="display:table-cell;text-align:right;white-space:nowrap;padding:0 1px">${T}</span>
    </div>`},$=a?`<div style="margin-top:10px">
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${n.signature}px">Entrega</div>
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${n.signature}px">Recibe</div>
      </div>`:`<div style="display:flex;justify-content:space-between;gap:32px;margin-top:36px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Entrega</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Recibe</div>
        </div>
      </div>`,i=G(o.detailSettings??((C=j())==null?void 0:C.receiptDetailSettings));t=J(t,i);const g=t.documentType||"nota_venta",x=K(i,g,e),s={money:_,unitPrice:bt,description:(u,T)=>Q(u,i,T,g)},h=x.findIndex(u=>u.id==="qty"),D=(t.items||[]).map((u,T)=>`<tr>${x.map(c=>{const R=A(F(c.id,u,T,s));return`<td style="${[`text-align:${c.id==="qty"?"center":c.align==="right"?"right":"left"}`,"padding:2px 1px","vertical-align:top",`font-weight:${c.align==="right"||c.id==="qty"?700:600}`,c.breakWords?"word-wrap:break-word;overflow-wrap:anywhere;white-space:normal":"white-space:nowrap",a&&c.align==="right"?`font-size:${n.num}px`:""].filter(Boolean).join(";")}">${R}</td>`}).join("")}</tr>`).join(""),N=(t.items||[]).reduce((u,T)=>u+Number(T.quantity||0),0),z=x.map((u,T)=>u.id==="qty"?`<td style="text-align:center;padding:3px 1px;font-weight:800;color:#000">${A(st(N))}</td>`:(h>0?T===h-1:T===0&&u.id==="description")?'<td style="text-align:right;padding:3px 1px;font-weight:800;color:#000">Total Cant</td>':'<td style="padding:3px 1px"></td>').join("");return`<div style="width:${d};max-width:${d};margin:0 auto;padding:${f};box-sizing:border-box;font-family:Arial,sans-serif;font-size:${m};font-weight:600;color:#000;line-height:1.35;overflow:hidden">
    <div style="text-align:center;margin-bottom:${a?6:16}px">
      <div style="font-weight:800;font-size:${a?n.title:22}px;color:#000">${A(t.businessName)}</div>
      ${t.businessDescription?`<div style="font-weight:800;font-size:${a?n.desc:13}px;color:#000;margin-top:2px">${A(t.businessDescription)}</div>`:""}
      <div style="font-weight:800;margin-top:${a?5:12}px;font-size:${a?n.docTitle:17}px;color:#000">${A(t.documentTitle)}</div>
      <div style="font-weight:800;font-size:${a?n.meta:13}px;color:#000;margin-top:2px">N° ${t.id||"—"}</div>
      <div style="font-weight:900;font-size:${a?n.date:18}px;color:#000;margin-top:3px">${A(t.date)}</div>
    </div>
    <div style="margin-bottom:${a?6:12}px;font-size:${a?n.customer:16}px;font-weight:700;color:#000;line-height:1.4">
      <div style="margin-bottom:${a?2:3}px"><strong>${I.name}</strong> ${A(t.customerName)}</div>
      ${t.customerCedula?`<div style="margin-bottom:${a?2:3}px"><strong>${I.cedula}</strong> ${A(t.customerCedula)}</div>`:""}
      ${t.customerPhone?`<div style="margin-bottom:${a?2:3}px"><strong>${I.phone}</strong> ${A(t.customerPhone)}</div>`:""}
      ${t.customerAddress?`<div style="margin-bottom:${a?2:3}px"><strong>${I.address}</strong> ${A(t.customerAddress)}</div>`:""}
      <div><strong>${I.payment}</strong> ${A(t.paymentMethod)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${a?6:12}px;color:#000;table-layout:fixed">
      <colgroup>
        ${x.map(u=>`<col style="width:${u.width}" />`).join("")}
      </colgroup>
      <thead>
        <tr style="border-bottom:1px solid #ccc">
          ${x.map(u=>`<th style="text-align:${u.id==="qty"?"center":u.align==="right"?"right":"left"};padding:2px 1px;font-weight:800;color:#000;width:${u.width}">${A(u.header)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${D}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #ccc">${z}</tr>
      </tfoot>
    </table>
    <div style="border-top:1px dashed #999;padding-top:${a?3:10}px;color:#000">
      ${v("Subtotal",_(t.subtotal))}
      ${t.iva>0?v("IVA",_(t.iva)):""}
      ${v("TOTAL",_(t.total),!0)}
    </div>
    ${r&&t.notes?`<div style="margin-top:${a?4:10}px;font-size:${a?n.notes:12}px;font-weight:700;color:#000;word-wrap:break-word">${A(t.notes)}</div>`:""}
    <div style="text-align:center;margin-top:${a?6:16}px;margin-bottom:0;font-size:${a?n.footer:12}px;font-weight:800;color:#000">Gracias por su compra</div>
    ${$}
  </div>`}function A(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{Ct as D,I as R,Rt as a,St as b,Dt as c,bt as d,wt as e,_ as f,Nt as g,Pt as h,At as i,L as j,ft as k,X as n,xt as p,zt as r};
