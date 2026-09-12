import{G,z as j,H as X,I as J,J as F,K as S,N as Z,F as K,O as W,Q as tt,R as et,T as nt,U as ot,V as it,W as at}from"./index-Ugi3OSc1.js";import{f as st}from"./functions-DLgzC0Ru.js";import{p as dt}from"./printHtmlDocument-BPV2Y5H7.js";import{c as rt}from"./code128Barcode-D2KDP90S.js";const M="[CAJA_POS]",lt="[CONTADO]",Q="[CREDITO]";function Tt({baseNote:t,saleType:e}){const o=e==="credito"?Q:lt,r=String(t||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").replace(/\s+/g," ").trim();return`${M} ${o} ${r}`.trim()}function ut(t){if(!t)return"—";const e=String(t.notes||""),o=t.customer,r=String((o==null?void 0:o.name)||"").trim();if(!e.includes(M))return r||"—";const l=e.toLowerCase();return l.includes("mostrador")||l.includes("consumidor final")||l.includes("sin datos de cliente")?"Consumidor Final":r||"—"}function ct(t){const e=String((t==null?void 0:t.notes)||"");return!(!e.includes(M)||e.includes(Q)||String((t==null?void 0:t.paymentMethod)||"").toLowerCase()==="credito")}function Nt(t){return!ct(t)}function At(t){return t.find(e=>{const o=String(e.name||"").toLowerCase();return o.includes("consumidor")||o.includes("final")})??null}function y(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function p(t,e,o=!1){return`<div style="margin:0 0 3px;line-height:1.3">
    <strong>${y(t)}</strong>
    <span style="font-weight:${o?800:600};word-break:break-all">${y(e||"—")}</span>
  </div>`}function H(t,{isTicket:e,ivaRate:o}){var b;const r=Number(t.discount||0),l=Number(t.ice||0),n=Number(t.tip||0),s=[["Total Sin Impuestos",S(t.subtotal)],["Descuento",S(r)],["Valor ICE",S(l)],[o>0?`Valor IVA ${o}%`:"Valor IVA",S(t.iva)]];e||s.push(["Propina",S(n)]),s.push(["Valor Total",S(t.total)]);const d=s.map(([v,$],i)=>`<div style="display:flex;justify-content:space-between;gap:8px;${i===s.length-1?"border-top:1px solid #000;margin-top:4px;padding-top:4px;font-weight:900":"font-weight:700"}">
        <span>${y(v)}</span><span>${y($)}</span>
      </div>`).join(""),m=(b=t.fiscal)!=null&&b.fromSettingsPreview?'<div style="margin-top:6px;font-size:10px;font-weight:700;color:#444">Sin factura SRI vinculada: el Nº se asigna al emitir/autorizar.</div>':"";return`${d}${m}`}function U(t,e){const o=ot(t.paymentMethod);return`<div style="font-size:0.9em">
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
  </div>`}function B(t,e,o,r){const l=t.logoUrl?`<img src="${y(t.logoUrl)}" alt="" style="max-width:${o?120:160}px;max-height:${o?70:90}px;object-fit:contain;margin:0 ${o?"auto":0} 6px;display:block" />`:"",n=tt(e,r),s=et(r),d=nt(r);return`<div style="text-align:${o?"center":"left"}">
    ${l}
    <div style="font-weight:900;font-size:${o?"0.95em":"1.05em"};line-height:1.25">${y(e.legalName||t.businessName)}</div>
    ${e.tradeName||t.businessDescription?`<div style="font-weight:700;font-size:${o?"0.85em":"0.95em"};margin-top:2px">${y(e.tradeName||t.businessDescription)}</div>`:""}
    ${e.matrixAddress?`<div style="font-weight:600;font-size:0.82em;margin-top:4px"><strong>Matriz: </strong>${y(e.matrixAddress)}</div>`:""}
    ${e.establishmentAddress?`<div style="font-weight:600;font-size:0.82em"><strong>Sucursal: </strong>${y(e.establishmentAddress)}</div>`:""}
    ${s?`<div style="font-weight:600;font-size:0.82em;margin-top:3px"><strong>Obligado a llevar Contabilidad: </strong>${e.accountingRequired?"SI":"NO"}</div>`:""}
    ${n?`<div style="font-weight:700;font-size:0.82em;margin-top:2px">${y(n)}</div>`:""}
    ${d&&e.specialTaxpayerResolution?`<div style="font-weight:600;font-size:0.82em"><strong>Contribuyente Especial: </strong>${y(e.specialTaxpayerResolution)}</div>`:""}
    ${e.phone?`<div style="font-weight:600;font-size:0.82em">${y(e.phone)}</div>`:""}
    ${e.email?`<div style="font-weight:600;font-size:0.82em">${y(e.email)}</div>`:""}
  </div>`}function mt(t,e="a4",o={}){var T,P;if(!t)return"";const r=K(e),l=r.isTicket,n=t.fiscal||{},s=t.items||[],d=G(o.detailSettings??((T=j())==null?void 0:T.receiptDetailSettings)),m=t.documentType||"factura",b=X(s),v=n.emissionDate||t.date&&((P=String(t.date).match(/\d{4}-\d{2}-\d{2}/))==null?void 0:P[0])||"",$=n.authorizationNumber||n.accessKey||"",i=$?rt($,{height:l?36:52,maxWidth:l?240:420}):"",g="100%",x=l?r.narrow?"11px":"12.5px":"12pt",a="0",h=l?`<div style="text-align:center">
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
  </div>`,N=J(d,m,e),R={money:S,unitPrice:Z,description:(c,z)=>W(c,d,z,m)},C=N.map(c=>`${Math.max(.4,c.widthPct/12)}fr`).join(" "),u=l?`<div style="margin-bottom:8px">
        <div style="display:grid;grid-template-columns:${C};gap:2px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;font-weight:800;font-size:0.85em">
          ${N.map(c=>`<span style="text-align:${c.align}">${y(c.header)}</span>`).join("")}
        </div>
        ${s.map((c,z)=>`<div style="display:grid;grid-template-columns:${C};gap:2px;padding:3px 0;border-bottom:1px dotted #999;font-weight:600;font-size:0.9em;align-items:start">
              ${N.map(w=>{const E=y(F(w.id,c,z,R));return`<span style="${[`text-align:${w.align}`,w.breakWords?"word-break:break-word;overflow-wrap:anywhere":""].filter(Boolean).join(";")}">${E}</span>`}).join("")}
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
          ${s.map((c,z)=>`<tr>
                ${N.map(w=>{const E=y(F(w.id,c,z,R)),q=w.id==="code"?"font-size:0.88em;word-break:break-all;overflow-wrap:anywhere;line-height:1.25":w.breakWords?"word-break:break-word;overflow-wrap:anywhere;line-height:1.3":"";return`<td style="border:1px solid #000;padding:3px 4px;font-weight:${w.align==="right"?700:600};text-align:${w.align};overflow:hidden;vertical-align:top;${q}">${E}</td>`}).join("")}
              </tr>`).join("")}
        </tbody>
      </table>`;return l?`<div style="width:${g};max-width:${g};margin:0 auto;padding:${a};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
      ${h}
      <div style="margin:8px 0">${B(t,n,!0,d)}</div>
      ${D}
      <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0"></div>
      ${V(t,v,!0)}
      ${u}
      ${H(t,{isTicket:!0,ivaRate:b})}
      <div style="margin-top:10px">${U(t,!0)}</div>
    </div>`:`<div style="width:${g};max-width:${g};margin:0 auto;padding:${a};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #000;padding:10px">${B(t,n,!1,d)}</div>
      <div style="border:1px solid #000;padding:10px">${h}</div>
    </div>
    ${V(t,v,!1)}
    ${u}
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;align-items:start">
      <div style="border:1px solid #000;padding:8px">${U(t,!1)}</div>
      <div style="border:1px solid #000;padding:8px">${H(t,{isTicket:!1,ivaRate:b})}</div>
    </div>
  </div>`}const f=t=>Number(Number(t||0).toFixed(2)),_=t=>Number(Number(t||0).toFixed(3)),pt={factura:"Factura",nota_venta:"Nota de venta",documento:"Comprobante",consumidor_final:"Consumidor final"},wt=[{value:"factura",label:"Factura"},{value:"nota_venta",label:"Nota de venta"},{value:"documento",label:"Comprobante"},{value:"consumidor_final",label:"Consumidor final"}];function L(t){return pt[t]||t||"—"}function k(t){switch(t){case"factura":return"FACTURA";case"nota_venta":return"NOTA DE VENTA";case"consumidor_final":return"CONSUMIDOR FINAL";default:return"COMPROBANTE DE VENTA"}}function Ct(t,e){if(!t)return null;const o=e||t.documentType||"documento",r=t._customerRaw||{};if(o==="consumidor_final")return{...t,documentType:o,documentTypeLabel:L(o),documentTitle:k(o),customerName:"Consumidor Final",customerPhone:"",customerAddress:"",customerEmail:"",customerCedula:""};const l=String(r.name||"").trim()||(t.customerName&&t.customerName!=="Consumidor Final"?t.customerName:"")||"—";return{...t,documentType:o,documentTypeLabel:L(o),documentTitle:k(o),customerName:l,customerPhone:r.phone||t.customerPhone||"",customerAddress:r.address||t.customerAddress||"",customerEmail:r.email||t.customerEmail||"",customerCedula:r.cedula||t.customerCedula||""}}function zt(t,e){return t==="factura"?"factura":t==="nota_venta"?"nota_venta":e?"documento":"consumidor_final"}function O(t){return`$${f(t).toFixed(2)}`}function gt(t){const e=_(t),o=Math.round(e*100)===e*100?2:3;return`$${e.toFixed(o)}`}function ft(t){return st(t)}const I={name:"Nom:",cedula:"CI:",phone:"Tel:",address:"Dir:",payment:"Pag:"};function bt(t){const e=String(t||"").toLowerCase();return e==="efectivo"?"Efectivo":e==="transferencia"?"Transferencia":e==="tarjeta"?"Tarjeta":e==="credito"?"Crédito":t||"—"}function Y(t){if(!t)return null;const e=(t.items||[]).map(i=>({name:i.name||i.productName||"Producto",code:i.code||i.sku||i.barcode||"",barcode:i.barcode||i.code||i.sku||"",unitLabel:i.unitLabel||i.unit||"",productId:i.productId||i.id||null,quantity:Number(i.quantity||0),price:_(i.price),discount:f(i.discount||0),lineTotal:f(i.lineTotal??Number(i.quantity)*Number(i.price)),taxRate:Number(i.taxRate||0),subtotal:f(i.subtotal??i.lineTotal),iva:f(i.iva||0)})),o=f(t.subtotal??e.reduce((i,g)=>i+g.subtotal,0)),r=f(t.iva??e.reduce((i,g)=>i+g.iva,0)),l=f(t.total??e.reduce((i,g)=>i+g.lineTotal,0)),n=f(t.discount??e.reduce((i,g)=>i+Number(g.discount||0),0)),s=t.customer||{},d=t.documentType||"documento",m=ut({notes:t.notes||"",customer:s}),b=String(s.name||"").trim()||(m&&m!=="Consumidor Final"?m:""),v=d==="consumidor_final"?"Consumidor Final":b||m||s.name||"—",$=j();return{id:t.id,businessName:$.alias||"App",businessDescription:$.description||"",logoUrl:$.logoUrl||"",documentTitle:k(d),documentType:d,documentTypeLabel:L(d),date:ft(t.date||t.paidAt),dateIso:t.date||t.paidAt||null,customerName:v,customerPhone:s.phone||"",customerAddress:s.address||"",customerEmail:s.email||"",customerCedula:s.cedula||"",_customerRaw:{name:b,phone:s.phone||"",address:s.address||"",email:s.email||"",cedula:s.cedula||""},paymentMethod:bt(t.paymentMethod),items:e,subtotal:o,iva:r,total:l,discount:n,ticketDiscountPercent:Number(t.ticketDiscountPercent||0),notes:String(t.notes||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").trim()}}function Rt(t){if(!t)return null;const o=(t.ERP_order_items||t.items||[]).map(d=>{var a;const m=Number(d.quantity||0),b=_(d.price),v=f(m*b),$=Number(((a=d.ERP_inventory_product)==null?void 0:a.taxRate)||d.taxRate||0);let i=v,g=0;$>0&&(i=f(v/(1+$/100)),g=f(v-i));const x=d.ERP_inventory_product||{};return{name:x.name||d.name||"Producto",code:x.sku||x.barcode||d.code||"",barcode:x.barcode||x.sku||d.code||"",unitLabel:x.unitLabel||x.unit||d.unitLabel||"",productId:d.productId||x.id||null,quantity:m,price:b,discount:0,taxRate:$,subtotal:i,iva:g,lineTotal:v}}),r=o.reduce((d,m)=>d+m.subtotal,0),l=o.reduce((d,m)=>d+m.iva,0),n=o.reduce((d,m)=>d+m.lineTotal,0),s=t.ERP_customer||t.customer||{};return Y({id:t.id,date:t.date,paidAt:t.paidAt,paymentMethod:t.paymentMethod||"credito",documentType:t.documentType||"nota_venta",notes:t.notes,customer:s,items:o,subtotal:r,iva:l,total:n})}function St({orderId:t,cart:e,customer:o,documentType:r,paymentMethod:l,saleType:n,notes:s,ticketDiscountPercent:d=0,discountTotal:m=0}){const b=e.map(a=>{const h=Number(a.quantity||0),D=_(a.price),N=a.lineTotal!=null&&Number.isFinite(Number(a.lineTotal))?f(a.lineTotal):f(h*D),R=Number(a.taxRate||0);let C=a.subtotal!=null&&Number.isFinite(Number(a.subtotal))?f(a.subtotal):N,u=a.iva!=null&&Number.isFinite(Number(a.iva))?f(a.iva):0;return a.subtotal==null&&R>0&&(C=f(N/(1+R/100)),u=f(N-C)),{name:a.name,code:a.sku||a.barcode||a.code||"",barcode:a.barcode||a.sku||a.code||"",unitLabel:a.unitLabel||a.unit||"",productId:a.productId||a.id||null,quantity:h,price:D,discount:f(a.discount||0),discountPercent:Number(a.discountPercent||0),taxRate:R,subtotal:C,iva:u,lineTotal:N}}),v=b.reduce((a,h)=>a+h.subtotal,0),$=b.reduce((a,h)=>a+h.iva,0),i=b.reduce((a,h)=>a+h.lineTotal,0),g=m>0?f(m):f(b.reduce((a,h)=>a+Number(h.discount||0),0)),x=r;return Y({id:t,date:new Date().toISOString(),paidAt:n==="credito"?null:new Date().toISOString(),paymentMethod:n==="credito"?"credito":l,documentType:x,notes:s,customer:o,items:b,subtotal:v,iva:$,total:i,discount:g,ticketDiscountPercent:Number(d||0)})}function Pt(t,e,o={}){const r=it(t)?mt(t,e,o):xt(t,e,o);dt(r,{format:e})}function xt(t,e,o={}){var C;const{showNotes:r=!0}=o,l=K(e),n=l.isTicket,s=l.print,d=n?"100%":"210mm",m=n?s.fs:"14px",b=n?"0":"24px",v=(u,T,P=!1)=>{const c=P?"font-weight:800;":"font-weight:700;",z=P?n?`font-size:${s.totalBold}px;`:"font-size:17px;":"";return`<div style="display:table;width:100%;${c}${z}">
      <span style="display:table-cell;padding:0 1px">${u}</span>
      <span style="display:table-cell;text-align:right;white-space:nowrap;padding:0 1px">${T}</span>
    </div>`},$=n?`<div style="margin-top:10px">
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${s.signature}px">Entrega</div>
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${s.signature}px">Recibe</div>
      </div>`:`<div style="display:flex;justify-content:space-between;gap:32px;margin-top:36px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Entrega</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Recibe</div>
        </div>
      </div>`,i=G(o.detailSettings??((C=j())==null?void 0:C.receiptDetailSettings)),g=t.documentType||"nota_venta",x=J(i,g,e),a={money:O,unitPrice:gt,description:(u,T)=>W(u,i,T,g)},h=x.findIndex(u=>u.id==="qty"),D=(t.items||[]).map((u,T)=>`<tr>${x.map(c=>{const z=A(F(c.id,u,T,a));return`<td style="${[`text-align:${c.id==="qty"?"center":c.align==="right"?"right":"left"}`,"padding:2px 1px","vertical-align:top",`font-weight:${c.align==="right"||c.id==="qty"?700:600}`,c.breakWords?"word-wrap:break-word;overflow-wrap:anywhere;white-space:normal":"white-space:nowrap",n&&c.align==="right"?`font-size:${s.num}px`:""].filter(Boolean).join(";")}">${z}</td>`}).join("")}</tr>`).join(""),N=(t.items||[]).reduce((u,T)=>u+Number(T.quantity||0),0),R=x.map((u,T)=>u.id==="qty"?`<td style="text-align:center;padding:3px 1px;font-weight:800;color:#000">${A(at(N))}</td>`:(h>0?T===h-1:T===0&&u.id==="description")?'<td style="text-align:right;padding:3px 1px;font-weight:800;color:#000">Total Cant</td>':'<td style="padding:3px 1px"></td>').join("");return`<div style="width:${d};max-width:${d};margin:0 auto;padding:${b};box-sizing:border-box;font-family:Arial,sans-serif;font-size:${m};font-weight:600;color:#000;line-height:1.35;overflow:hidden">
    <div style="text-align:center;margin-bottom:${n?6:16}px">
      <div style="font-weight:800;font-size:${n?s.title:22}px;color:#000">${A(t.businessName)}</div>
      ${t.businessDescription?`<div style="font-weight:800;font-size:${n?s.desc:13}px;color:#000;margin-top:2px">${A(t.businessDescription)}</div>`:""}
      <div style="font-weight:800;margin-top:${n?5:12}px;font-size:${n?s.docTitle:17}px;color:#000">${A(t.documentTitle)}</div>
      <div style="font-weight:800;font-size:${n?s.meta:13}px;color:#000;margin-top:2px">N° ${t.id||"—"}</div>
      <div style="font-weight:900;font-size:${n?s.date:18}px;color:#000;margin-top:3px">${A(t.date)}</div>
    </div>
    <div style="margin-bottom:${n?6:12}px;font-size:${n?s.customer:16}px;font-weight:700;color:#000;line-height:1.4">
      <div style="margin-bottom:${n?2:3}px"><strong>${I.name}</strong> ${A(t.customerName)}</div>
      ${t.customerCedula?`<div style="margin-bottom:${n?2:3}px"><strong>${I.cedula}</strong> ${A(t.customerCedula)}</div>`:""}
      ${t.customerPhone?`<div style="margin-bottom:${n?2:3}px"><strong>${I.phone}</strong> ${A(t.customerPhone)}</div>`:""}
      ${t.customerAddress?`<div style="margin-bottom:${n?2:3}px"><strong>${I.address}</strong> ${A(t.customerAddress)}</div>`:""}
      <div><strong>${I.payment}</strong> ${A(t.paymentMethod)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${n?6:12}px;color:#000;table-layout:fixed">
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
        <tr style="border-top:1px solid #ccc">${R}</tr>
      </tfoot>
    </table>
    <div style="border-top:1px dashed #999;padding-top:${n?3:10}px;color:#000">
      ${v("Subtotal",O(t.subtotal))}
      ${t.iva>0?v("IVA",O(t.iva)):""}
      ${v("TOTAL",O(t.total),!0)}
    </div>
    ${r&&t.notes?`<div style="margin-top:${n?4:10}px;font-size:${n?s.notes:12}px;font-weight:700;color:#000;word-wrap:break-word">${A(t.notes)}</div>`:""}
    <div style="text-align:center;margin-top:${n?6:16}px;margin-bottom:0;font-size:${n?s.footer:12}px;font-weight:800;color:#000">Gracias por su compra</div>
    ${$}
  </div>`}function A(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{wt as D,I as R,Ct as a,Rt as b,Pt as c,gt as d,At as e,O as f,Tt as g,St as h,Nt as i,L as j,ft as k,Y as n,bt as p,zt as r};
